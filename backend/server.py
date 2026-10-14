"""OneVoice API: private HR workspace plus isolated, editable recruiter demos."""

import csv
import hashlib
import io
import json
import logging
import os
import secrets
import threading
import time
import uuid
import zipfile
from datetime import date as CalendarDate, datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
from urllib.parse import urlencode

from dotenv import load_dotenv
from flask import (
    Flask,
    has_request_context,
    jsonify,
    redirect,
    request,
    send_file,
    send_from_directory,
    session,
)
from flask_cors import CORS
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy import create_engine, func, inspect, or_, text
from sqlalchemy.orm import sessionmaker
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.exceptions import RequestEntityTooLarge, TooManyRequests

from . import ai, gmail
from .config import validate_settings
from .migrations import migrate
from .models import (
    Base,
    User,
    Meeting,
    Action,
    Remark,
    Notification,
    DemoSession,
    ConversationMessage,
    GmailConnection,
    Activity,
    AIResult,
    AIUsage,
    utcnow,
)

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
DATABASE_URL = os.getenv("DATABASE_URL", "").replace(
    "postgres://", "postgresql+psycopg2://", 1
)
SECRET_KEY = os.getenv("SECRET_KEY")
ADMIN_EMAIL = "vihaan4263@gmail.com"
SHARED_TEAM_EMAIL = "shared-hr@onevoice.invalid"
DEMO_EMAIL = "demo@onevoice.invalid"
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")
HR_TEAM_PASSWORD = os.getenv("HR_TEAM_PASSWORD", secrets.token_urlsafe(32))
ALLOW_SHARED_HR_LOGIN = os.getenv("ALLOW_SHARED_HR_LOGIN", "0") == "1"
DEMO_ENABLED = os.getenv("DEMO_ENABLED", "1") == "1"
PUBLIC_DEPLOYMENT = (
    os.getenv("PUBLIC_DEPLOYMENT") == "1" or os.getenv("RENDER") == "true"
)
validate_settings(DATABASE_URL, SECRET_KEY, ADMIN_PASSWORD, PUBLIC_DEPLOYMENT, ALLOW_SHARED_HR_LOGIN)
FRONTEND_URL = (
    os.getenv("FRONTEND_URL")
    or os.getenv("RENDER_EXTERNAL_URL")
    or "http://localhost:5173"
).rstrip("/")
app = Flask(__name__)
app.config.update(
    SECRET_KEY=SECRET_KEY,
    MAX_CONTENT_LENGTH=1_000_000,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=FRONTEND_URL.startswith("https://"),
)
CORS(
    app,
    origins=os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(","),
    supports_credentials=True,
)
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
DB = sessionmaker(bind=engine, expire_on_commit=False)
signer = URLSafeTimedSerializer(SECRET_KEY, salt="onevoice")
logging.basicConfig(level=logging.INFO)
logging.getLogger("werkzeug").setLevel(logging.WARNING)


def iso(value):
    if isinstance(value, datetime) and value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat() if value else None


def aware(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def credential_version(user):
    return hashlib.sha256(user.password_hash.encode()).hexdigest()


def prototype_user(user):
    return bool(
        user
        and user.active
        and (
            (user.email == ADMIN_EMAIL and user.role == "hr_admin")
            or (
                ALLOW_SHARED_HR_LOGIN
                and user.email == SHARED_TEAM_EMAIL
                and user.role == "hr_team"
            )
            or (DEMO_ENABLED and user.email == DEMO_EMAIL and user.role == "demo")
        )
    )


def user_json(user, demo_id=None):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email if user.role == "hr_admin" else None,
        "role": user.role,
        "shared": user.role == "hr_team",
        "demo": user.role == "demo",
        "demo_session_id": demo_id,
    }


def audit(db, event, detail="", user=None, demo_id=None):
    if has_request_context():
        user = user or getattr(request, "user", None)
        demo_id = demo_id or getattr(request, "demo_id", None)
    db.add(
        Activity(
            actor_id=user.id if user else None,
            actor_role=user.role if user else "anonymous",
            event=event,
            detail=detail[:300],
            demo_session_id=demo_id,
        )
    )


def token_result(user, demo_id=None):
    payload = {
        "id": user.id,
        "credential_version": credential_version(user),
        "demo_session_id": demo_id,
    }
    return {"token": signer.dumps(payload), "user": user_json(user, demo_id)}


def require(*roles):
    def decorator(fn):
        @wraps(fn)
        def wrapped(*args, **kwargs):
            header = request.headers.get("Authorization", "")
            if not header.startswith("Bearer "):
                return jsonify(error="Authentication required"), 401
            try:
                payload = signer.loads(header[7:], max_age=43200)
            except (BadSignature, SignatureExpired):
                return jsonify(error="Session expired or invalid"), 401
            if not isinstance(payload, dict) or type(payload.get("id")) is not int:
                return jsonify(error="Session expired or invalid"), 401
            with DB() as db:
                user = db.get(User, payload["id"])
                if not prototype_user(user) or payload.get(
                    "credential_version"
                ) != credential_version(user):
                    return (
                        jsonify(
                            error="Account or session unavailable. Please sign in again."
                        ),
                        401,
                    )
                demo_id = payload.get("demo_session_id")
                if user.role == "demo":
                    demo = (
                        db.get(DemoSession, demo_id)
                        if isinstance(demo_id, str)
                        else None
                    )
                    if not demo or aware(demo.expires_at) <= utcnow():
                        return (
                            jsonify(error="Demo session expired. Start a fresh demo."),
                            401,
                        )
                elif demo_id is not None:
                    return jsonify(error="Invalid session"), 401
            if roles and user.role not in roles:
                return jsonify(error="Permission denied"), 403
            request.user = user
            request.demo_id = demo_id
            return fn(*args, **kwargs)

        return wrapped

    return decorator


def meeting_query(db):
    return db.query(Meeting).filter(Meeting.demo_session_id == request.demo_id)


def action_query(db):
    return (
        db.query(Action)
        .join(Meeting)
        .filter(Meeting.demo_session_id == request.demo_id)
    )


def find_action(db, action_id):
    return action_query(db).filter(Action.id == action_id).first()


def demo_write_guard(db):
    """Bound anonymous editing/storage; the audit entry reserves each write."""
    if not request.demo_id:
        return
    if (
        len(json.dumps(request.get_json() or {}, ensure_ascii=False).encode("utf-8"))
        > 12000
    ):
        raise RequestEntityTooLarge(
            "Demo edits are limited to 12 KB. Use a shorter fictional example."
        )
    if engine.dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(70106)"))
    events = (
        "Meeting recorded",
        "Action recorded",
        "Follow-up updated",
        "Email conversation updated",
    )
    query = db.query(Activity).filter(
        Activity.actor_role == "demo", Activity.event.in_(events)
    )
    if query.filter(Activity.demo_session_id == request.demo_id).count() >= int(
        os.getenv("DEMO_SESSION_WRITE_LIMIT", "100")
    ):
        raise TooManyRequests("This demo session has reached its editing allowance.")
    if query.filter(Activity.created_at >= utcnow() - timedelta(days=1)).count() >= int(
        os.getenv("DEMO_DAILY_WRITE_LIMIT", "1000")
    ):
        raise TooManyRequests(
            "The demo has reached its daily editing allowance. Please try tomorrow."
        )


def field(data, key, maximum=120, required=True):
    value = data.get(key, "")
    if (
        not isinstance(value, str)
        or len(value.strip()) > maximum
        or (required and not value.strip())
    ):
        raise ValueError(
            f"Enter a valid {key.replace('_',' ')} (up to {maximum} characters)"
        )
    return value.strip()


def parsed(value):
    if value in (None, ""):
        return None
    if not isinstance(value, str):
        raise ValueError("Dates must use YYYY-MM-DD")
    return CalendarDate.fromisoformat(value)


def email_value(value):
    import re

    if not value:
        return ""
    if (
        not isinstance(value, str)
        or len(value) > 255
        or not re.fullmatch(r"[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+", value)
    ):
        raise ValueError("Enter one valid contact email")
    return value.strip()


@app.before_request
def before_request():
    request.started_at = time.monotonic()
    if (
        request.method in ("POST", "PATCH")
        and request.is_json
        and not isinstance(request.get_json(silent=True), dict)
    ):
        return jsonify(error="Request body must be a JSON object"), 400


@app.after_request
def after_request(response):
    app.logger.info(
        "%s %s status=%s elapsed_ms=%.1f",
        request.method,
        request.path,
        response.status_code,
        (time.monotonic() - getattr(request, "started_at", time.monotonic())) * 1000,
    )
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


@app.errorhandler(ValueError)
def invalid_input(error):
    return jsonify(error=str(error)), 400


@app.errorhandler(TooManyRequests)
@app.errorhandler(RequestEntityTooLarge)
def bounded_request(error):
    return jsonify(error=error.description), error.code


@app.errorhandler(gmail.GmailUnavailable)
@app.errorhandler(ai.AIUnavailable)
def unavailable(error):
    return jsonify(error=str(error)), 503


def message_json(message):
    return {
        key: getattr(message, key)
        for key in ("id", "sender", "subject", "body", "direction", "source")
    } | {"sent_at": iso(message.sent_at), "recorded_at": iso(message.recorded_at)}


def action_json(action, meeting=False):
    result = {
        key: getattr(action, key)
        for key in (
            "id",
            "meeting_id",
            "discussion_point",
            "category",
            "priority",
            "action_description",
            "contact_person",
            "contact_email",
            "owner_id",
            "status",
            "gmail_thread_id",
        )
    }
    result.update(
        owner_name=action.owner_name or (action.owner.name if action.owner else ""),
        due_date=iso(action.due_date),
        created_at=iso(action.created_at),
        updated_at=iso(action.updated_at),
    )
    if meeting:
        result["meeting"] = {
            "id": action.meeting.id,
            "date": iso(action.meeting.date),
            "department": action.meeting.department,
            "forum_type": action.meeting.forum_type,
        }
    return result


def meeting_json(meeting, detail=False):
    result = {
        key: getattr(meeting, key)
        for key in ("id", "forum_type", "department", "facilitator", "num_participants")
    }
    result.update(
        date=iso(meeting.date),
        participants_list=json.loads(meeting.participants_list or "[]"),
        created_at=iso(meeting.created_at),
        updated_at=iso(meeting.updated_at),
    )
    if detail:
        result["logs"] = [action_json(action) for action in meeting.logs]
    return result


@app.post("/api/auth/login")
def login():
    data = request.get_json() or {}
    mode = data.get("mode", "admin")
    password = data.get("password")
    if (
        mode not in ("admin", "hr_team")
        or not isinstance(password, str)
        or not password
    ):
        return jsonify(error="Choose a valid login and enter a password"), 400
    if mode == "hr_team" and not ALLOW_SHARED_HR_LOGIN:
        return (
            jsonify(
                error="Shared login is disabled. Enter the password-free demo or use Admin."
            ),
            403,
        )
    email = (
        field(data, "email", 255, False).lower()
        if mode == "admin"
        else SHARED_TEAM_EMAIL
    )
    with DB.begin() as db:
        user = db.query(User).filter_by(email=email).first()
        if (
            (mode == "admin" and email != ADMIN_EMAIL)
            or not prototype_user(user)
            or not check_password_hash(user.password_hash, password)
        ):
            audit(db, "Sign-in failed")
            return jsonify(error="Invalid credentials"), 401
        audit(db, "Signed in", user=user)
        return token_result(user)


def seed_demo(db, demo_id):
    today = CalendarDate.today()
    fixtures = [
        (
            "Town Hall",
            "Operations",
            "Transport",
            "Review the shuttle timetable",
            "Jordan Lee",
        ),
        (
            "Batcheet",
            "Engineering",
            "Facilities",
            "Replace faulty desk equipment",
            "Sam Taylor",
        ),
        (
            "Voice of User",
            "Support",
            "Training",
            "Schedule an onboarding workshop",
            "Alex Morgan",
        ),
    ]
    for offset, (forum, department, category, description, owner) in enumerate(
        fixtures
    ):
        meeting = Meeting(
            forum_type=forum,
            date=today - timedelta(days=offset * 35),
            department=department,
            facilitator="Demo HR",
            num_participants=8,
            demo_session_id=demo_id,
        )
        db.add(meeting)
        db.flush()
        action = Action(
            meeting_id=meeting.id,
            discussion_point=f"Sample employee concern about {category.lower()}.",
            category=category,
            priority="Medium",
            action_description=description,
            contact_person=owner,
            owner_name=owner,
            contact_email=f"{owner.split()[0].lower()}@example.com",
            due_date=today + timedelta(days=7),
        )
        db.add(action)
        db.flush()
        db.add(
            ConversationMessage(
                action_id=action.id,
                sender="hr@example.com",
                subject=description,
                body=f"Please {description.lower()}. Can you confirm the next step?",
                direction="outgoing",
                source="demo",
                sent_at=utcnow() - timedelta(days=2),
            )
        )
        db.add(
            ConversationMessage(
                action_id=action.id,
                sender=action.contact_email,
                subject="Re: " + description,
                body="I have started reviewing this and will share an update next week.",
                direction="incoming",
                source="demo",
                sent_at=utcnow() - timedelta(days=1),
            )
        )
        db.add(
            Notification(
                action_id=action.id,
                demo_session_id=demo_id,
                title="Sample email reply",
                body=f"A fictional reply is available for {category.lower()}.",
            )
        )


@app.post("/api/auth/demo")
def demo_login():
    if not DEMO_ENABLED:
        return jsonify(error="Demo access is disabled"), 403
    with DB.begin() as db:
        if engine.dialect.name == "postgresql":
            db.execute(text("SELECT pg_advisory_xact_lock(70103)"))
        if db.query(DemoSession).filter(
            DemoSession.created_at >= utcnow() - timedelta(days=1)
        ).count() >= int(os.getenv("DEMO_DAILY_SESSION_LIMIT", "500")):
            return (
                jsonify(
                    error="The demo has reached its daily session limit. Please try tomorrow."
                ),
                429,
            )
        demo_id = str(uuid.uuid4())
        db.add(DemoSession(id=demo_id, expires_at=utcnow() + timedelta(hours=12)))
        db.flush()
        user = db.query(User).filter_by(email=DEMO_EMAIL).one()
        seed_demo(db, demo_id)
        audit(db, "Demo session started", user=user, demo_id=demo_id)
        return token_result(user, demo_id)


@app.get("/api/auth/me")
@require()
def me():
    return user_json(request.user, request.demo_id)


@app.get("/api/users")
@require("hr_admin", "hr_team")
def users():
    with DB() as db:
        return [
            user_json(user)
            for user in db.query(User)
            .filter(User.active == True, User.role != "demo")
            .order_by(User.name)
        ]


@app.post("/api/users")
@require("hr_admin")
def add_user():
    data = request.get_json() or {}
    name = field(data, "name")
    email = email_value(field(data, "email", 255)).lower()
    password = field(data, "password", 256)
    role = data.get("role")
    if role not in ("hr_admin", "hr_team", "action_owner", "viewer"):
        raise ValueError("Choose a valid role")
    with DB.begin() as db:
        if db.query(User).filter_by(email=email).first():
            return jsonify(error="Email already exists"), 409
        user = User(
            name=name,
            email=email,
            password_hash=generate_password_hash(password),
            role=role,
        )
        db.add(user)
        db.flush()
        audit(db, "Account created", role)
        return user_json(user), 201


@app.get("/api/meetings")
@require()
def meetings():
    with DB() as db:
        return [
            meeting_json(m)
            for m in meeting_query(db)
            .order_by(Meeting.date.desc(), Meeting.id.desc())
            .limit(500)
        ]


@app.post("/api/meetings")
@require()
def add_meeting():
    data = request.get_json() or {}
    fields = {
        key: field(data, key, 80 if key == "forum_type" else 120)
        for key in ("forum_type", "department", "facilitator")
    }
    when = parsed(data.get("date"))
    count = data.get("num_participants")
    participants = data.get("participants_list", [])
    if not when or type(count) is not int or not 1 <= count <= 10000:
        raise ValueError("Enter a meeting date and participant count from 1 to 10,000")
    if not isinstance(participants, list) or len(participants) > count:
        raise ValueError("Participant details must match the participant count")
    for participant in participants:
        if not isinstance(participant, dict) or not (
            field(participant, "name", 120, False)
            or field(participant, "empid", 80, False)
        ):
            raise ValueError("Each participant needs a name or employee ID")
    with DB.begin() as db:
        if request.demo_id and meeting_query(db).count() >= 50:
            return jsonify(error="Demo limit: 50 meetings per session"), 429
        demo_write_guard(db)
        meeting = Meeting(
            **fields,
            date=when,
            num_participants=count,
            participants_list=json.dumps(participants),
            demo_session_id=request.demo_id,
        )
        db.add(meeting)
        db.flush()
        audit(db, "Meeting recorded", f"Meeting #{meeting.id}")
        return meeting_json(meeting), 201


@app.get("/api/meetings/<int:meeting_id>")
@require()
def get_meeting(meeting_id):
    with DB() as db:
        meeting = meeting_query(db).filter(Meeting.id == meeting_id).first()
        return (
            meeting_json(meeting, True)
            if meeting
            else (jsonify(error="Meeting not found"), 404)
        )


@app.post("/api/meetings/<int:meeting_id>/logs")
@require()
def add_action(meeting_id):
    data = request.get_json() or {}
    values = {
        key: field(
            data,
            key,
            4000 if key in ("discussion_point", "action_description") else 120,
        )
        for key in (
            "discussion_point",
            "action_description",
            "category",
            "contact_person",
        )
    }
    priority = data.get("priority", "Medium")
    if priority not in ("High", "Medium", "Low"):
        raise ValueError("Choose High, Medium, or Low priority")
    with DB.begin() as db:
        meeting = meeting_query(db).filter(Meeting.id == meeting_id).first()
        if not meeting:
            return jsonify(error="Meeting not found"), 404
        if len(meeting.logs) >= 100:
            return jsonify(error="Maximum 100 actions per meeting"), 429
        demo_write_guard(db)
        action = Action(
            meeting_id=meeting_id,
            **values,
            priority=priority,
            owner_name=field(data, "owner_name", 120, False),
            contact_email=email_value(data.get("contact_email", "")),
            due_date=parsed(data.get("due_date")),
        )
        db.add(action)
        meeting.updated_at = utcnow()
        db.flush()
        audit(db, "Action recorded", f"Action #{action.id}")
        return action_json(action), 201


@app.get("/api/actions")
@require()
def actions():
    with DB() as db:
        return [
            action_json(a, True)
            for a in action_query(db).order_by(Action.id.desc()).limit(500)
        ]


@app.get("/api/logs/<int:action_id>")
@require()
def get_action(action_id):
    with DB() as db:
        action = find_action(db, action_id)
        if not action:
            return jsonify(error="Action not found"), 404
        result = action_json(action, True)
        result.update(
            forum_type=action.meeting.forum_type,
            meeting_date=iso(action.meeting.date),
            department=action.meeting.department,
            history=[
                {
                    "id": r.id,
                    "author_type": r.author,
                    "remark": r.remark,
                    "created_at": iso(r.created_at),
                }
                for r in action.history
            ],
            messages=[message_json(m) for m in action.messages],
            ai_results=[
                {
                    "id": r.id,
                    "task": r.task,
                    "content": r.content,
                    "provider": r.provider,
                    "model": r.model,
                    "created_at": iso(r.created_at),
                }
                for r in action.ai_results
            ],
        )
        return result


@app.patch("/api/logs/<int:action_id>")
@require()
def update_action(action_id):
    data = request.get_json() or {}
    with DB.begin() as db:
        action = find_action(db, action_id)
        if not action:
            return jsonify(error="Action not found"), 404
        demo_write_guard(db)
        if "status" in data:
            if data["status"] not in ("Open", "In Progress", "Completed"):
                raise ValueError("Choose a valid action status")
            action.status = data["status"]
        if "priority" in data:
            if data["priority"] not in ("High", "Medium", "Low"):
                raise ValueError("Choose a valid priority")
            action.priority = data["priority"]
        for key in ("contact_person", "owner_name"):
            if key in data:
                setattr(action, key, field(data, key, 120, key == "contact_person"))
        if "contact_email" in data:
            action.contact_email = email_value(data["contact_email"])
        if "due_date" in data:
            action.due_date = parsed(data["due_date"])
        remark = (
            data.get("remark") or data.get("owner_remarks") or data.get("hr_remarks")
        )
        if remark:
            if not isinstance(remark, str) or not remark.strip() or len(remark) > 12000:
                raise ValueError("Enter a remark up to 12,000 characters")
            db.add(
                Remark(
                    action_id=action.id,
                    author=(
                        "Demo visitor"
                        if request.demo_id
                        else ("HR Team" if request.user.role == "hr_team" else "Admin")
                    ),
                    remark=remark.strip(),
                )
            )
        action.updated_at = utcnow()
        action.meeting.updated_at = utcnow()
        audit(db, "Follow-up updated", f"Action #{action.id}")
        return action_json(action, True)


@app.post("/api/logs/<int:action_id>/messages")
@require()
def add_message(action_id):
    data = request.get_json() or {}
    body = field(data, "body", 20000)
    direction = data.get("direction", "incoming")
    if direction not in ("incoming", "outgoing", "note"):
        raise ValueError("Choose incoming, outgoing, or note")
    with DB.begin() as db:
        action = find_action(db, action_id)
        if not action:
            return jsonify(error="Action not found"), 404
        demo_write_guard(db)
        if len(action.messages) >= 100:
            return jsonify(error="Maximum 100 messages per action"), 429
        message = ConversationMessage(
            action_id=action.id,
            sender=field(data, "sender", 255, False),
            subject=field(data, "subject", 500, False),
            body=body,
            direction=direction,
            source="manual",
        )
        db.add(message)
        action.updated_at = utcnow()
        action.meeting.updated_at = utcnow()
        db.flush()
        if direction == "incoming":
            db.add(
                Notification(
                    action_id=action.id,
                    demo_session_id=request.demo_id,
                    title="Reply recorded",
                    body=f"A pasted reply was recorded for action #{action.id}.",
                )
            )
        audit(db, "Email conversation updated", f"Action #{action.id}")
        return message_json(message), 201


@app.post("/api/logs/<int:action_id>/ai")
@require()
def generate_ai(action_id):
    data = request.get_json() or {}
    task = data.get("task")
    if task not in ("summary", "draft"):
        raise ValueError("Choose summary or draft")
    instructions = field(data, "instructions", 1000, False)
    with DB() as db:
        action = find_action(db, action_id)
        if not action:
            return jsonify(error="Action not found"), 404
        context = {
            "discussion": action.discussion_point,
            "requested_action": action.action_description,
            "status": action.status,
            "owner": action.owner_name,
            "recipient": action.contact_person,
            "due_date": iso(action.due_date),
            "messages": [message_json(m) for m in action.messages],
            "remarks": [
                {
                    "id": r.id,
                    "author": r.author,
                    "text": r.remark,
                    "time": iso(r.created_at),
                }
                for r in action.history
            ],
        }
    if request.demo_id:
        if not os.getenv("OPENAI_API_KEY"):
            raise ai.AIUnavailable(
                "Live demo AI is not enabled yet. You can still explore the sample conversations and exports."
            )
        with DB.begin() as db:
            if engine.dialect.name == "postgresql":
                db.execute(text("SELECT pg_advisory_xact_lock(70104)"))
            if db.query(AIUsage).filter_by(
                demo_session_id=request.demo_id
            ).count() >= int(os.getenv("DEMO_AI_SESSION_LIMIT", "5")):
                return (
                    jsonify(error="This demo session has used its AI allowance."),
                    429,
                )
            if db.query(AIUsage).filter(
                AIUsage.created_at >= utcnow() - timedelta(days=1)
            ).count() >= int(os.getenv("DEMO_AI_DAILY_LIMIT", "50")):
                return jsonify(error="Demo AI has reached its daily allowance."), 429
            db.add(AIUsage(demo_session_id=request.demo_id))
    generated = ai.generate(
        task, context, demo=bool(request.demo_id), instructions=instructions
    )
    with DB.begin() as db:
        result = AIResult(action_id=action_id, task=task, **generated)
        db.add(result)
        db.flush()
        audit(db, "AI generated", f"{task} for action #{action_id} ({result.provider})")
        return (
            generated
            | {"id": result.id, "task": task, "created_at": iso(result.created_at)},
            201,
        )


@app.get("/api/calendar")
@require()
def calendar():
    start = parsed(request.args.get("start")) or CalendarDate.today().replace(day=1)
    end = parsed(request.args.get("end")) or start + timedelta(days=62)
    if end < start:
        raise ValueError("End date must follow the start date")
    with DB() as db:
        result = [
            {
                "id": f"meeting-{m.id}",
                "type": "meeting",
                "date": iso(m.date),
                "title": f"{m.forum_type}: {m.department}",
                "meeting_id": m.id,
            }
            for m in meeting_query(db).filter(Meeting.date.between(start, end))
        ]
        result += [
            {
                "id": f"action-{a.id}",
                "type": "action",
                "date": iso(a.due_date),
                "title": a.action_description,
                "action_id": a.id,
                "meeting_id": a.meeting_id,
                "status": a.status,
                "priority": a.priority,
            }
            for a in action_query(db).filter(Action.due_date.between(start, end))
        ]
        return result


@app.get("/api/notifications")
@require()
def notifications():
    with DB() as db:
        query = db.query(Notification).filter(
            Notification.demo_session_id == request.demo_id
        )
        if not request.demo_id:
            query = query.filter(
                or_(
                    Notification.user_id == request.user.id,
                    Notification.user_id.is_(None),
                )
            )
        return [
            {
                "id": n.id,
                "action_id": n.action_id,
                "meeting_id": (
                    db.get(Action, n.action_id).meeting_id
                    if n.action_id and db.get(Action, n.action_id)
                    else None
                ),
                "title": n.title,
                "body": n.body,
                "read": n.read,
                "created_at": iso(n.created_at),
            }
            for n in query.order_by(Notification.created_at.desc()).limit(100)
        ]


@app.post("/api/notifications/<int:notification_id>/read")
@require()
def read_notification(notification_id):
    with DB.begin() as db:
        item = db.get(Notification, notification_id)
        if (
            not item
            or item.demo_session_id != request.demo_id
            or (not request.demo_id and item.user_id not in (None, request.user.id))
        ):
            return jsonify(error="Notification not found"), 404
        item.read = True
        return {"ok": True}


def csv_cell(value):
    value = "" if value is None else str(value)
    # Avoid spreadsheet formula execution when exported user/email text is opened.
    return "'" + value if value.lstrip().startswith(("=", "+", "-", "@")) else value


def csv_bytes(fields, rows):
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=fields)
    writer.writeheader()
    for row in rows:
        writer.writerow({key: csv_cell(row.get(key)) for key in fields})
    return ("\ufeff" + stream.getvalue()).encode("utf-8")


def period_bounds(args):
    period = args.get("period", "all")
    if period == "all":
        return None, None, "all"
    try:
        year = int(args.get("year", ""))
    except ValueError:
        raise ValueError("Choose a year")
    if not 2000 <= year <= 2100:
        raise ValueError("Choose a year from 2000 to 2100")
    month = 1
    length = 12
    if period == "quarter":
        quarter = int(args.get("quarter", "0"))
        if not 1 <= quarter <= 4:
            raise ValueError("Choose quarter 1 to 4")
        month = (quarter - 1) * 3 + 1
        length = 3
    elif period == "month":
        month = int(args.get("month", "0"))
        length = 1
        if not 1 <= month <= 12:
            raise ValueError("Choose month 1 to 12")
    elif period != "year":
        raise ValueError("Choose all, year, quarter, or month")
    end_month = month + length
    end = (
        CalendarDate(year + 1, 1, 1)
        if end_month > 12
        else CalendarDate(year, end_month, 1)
    )
    return CalendarDate(year, month, 1), end, f"{period}-{year}-{month:02d}"


@app.get("/api/reports/export")
@require()
def export_records():
    start, end, label = period_bounds(request.args)
    with DB.begin() as db:
        query = meeting_query(db)
        if start:
            query = query.filter(Meeting.date >= start, Meeting.date < end)
        selected = query.order_by(Meeting.date, Meeting.id).all()
        meeting_rows = [meeting_json(m) for m in selected]
        actions = [a for m in selected for a in m.logs]
        tables = {
            "meetings.csv": (
                [
                    "id",
                    "forum_type",
                    "date",
                    "department",
                    "facilitator",
                    "num_participants",
                    "participants_list",
                    "created_at",
                    "updated_at",
                ],
                [
                    r
                    | {
                        "participants_list": json.dumps(
                            r["participants_list"], ensure_ascii=False
                        )
                    }
                    for r in meeting_rows
                ],
            ),
            "actions.csv": (
                [
                    "id",
                    "meeting_id",
                    "discussion_point",
                    "category",
                    "priority",
                    "action_description",
                    "owner_name",
                    "contact_person",
                    "contact_email",
                    "status",
                    "due_date",
                    "created_at",
                    "updated_at",
                ],
                [action_json(a) for a in actions],
            ),
            "followups.csv": (
                ["id", "action_id", "author", "remark", "created_at"],
                [
                    {
                        "id": r.id,
                        "action_id": a.id,
                        "author": r.author,
                        "remark": r.remark,
                        "created_at": iso(r.created_at),
                    }
                    for a in actions
                    for r in a.history
                ],
            ),
            "conversations.csv": (
                [
                    "id",
                    "action_id",
                    "sender",
                    "subject",
                    "body",
                    "direction",
                    "source",
                    "sent_at",
                    "recorded_at",
                ],
                [
                    message_json(m) | {"action_id": a.id}
                    for a in actions
                    for m in a.messages
                ],
            ),
            "ai_outputs.csv": (
                [
                    "id",
                    "action_id",
                    "task",
                    "content",
                    "provider",
                    "model",
                    "created_at",
                ],
                [
                    {
                        "id": r.id,
                        "action_id": a.id,
                        "task": r.task,
                        "content": r.content,
                        "provider": r.provider,
                        "model": r.model,
                        "created_at": iso(r.created_at),
                    }
                    for a in actions
                    for r in a.ai_results
                ],
            ),
        }
        action_ids = {a.id for a in actions}
        notice_rows = [
            {
                "id": n.id,
                "action_id": n.action_id,
                "title": n.title,
                "body": n.body,
                "read": n.read,
                "created_at": iso(n.created_at),
            }
            for n in db.query(Notification).filter(
                Notification.demo_session_id == request.demo_id
            )
            if n.action_id in action_ids
        ]
        tables["notifications.csv"] = (
            list(("id", "action_id", "title", "body", "read", "created_at")),
            notice_rows,
        )
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as output:
            for name, (fields, rows) in tables.items():
                output.writestr(name, csv_bytes(fields, rows))
        audit(db, "CSV exported", label)
    archive.seek(0)
    return send_file(
        archive,
        mimetype="application/zip",
        as_attachment=True,
        download_name=f"onevoice-{label}.zip",
    )


@app.get("/api/admin/activity")
@require("hr_admin")
def admin_activity():
    with DB() as db:
        return [
            {
                "id": a.id,
                "event": a.event,
                "detail": a.detail,
                "actor_role": a.actor_role,
                "demo_session_id": a.demo_session_id,
                "created_at": iso(a.created_at),
            }
            for a in db.query(Activity)
            .order_by(Activity.created_at.desc(), Activity.id.desc())
            .limit(100)
        ]


@app.get("/api/gmail/status")
@require()
def gmail_status():
    if request.user.role != "hr_admin":
        return {"available": False, "connected": False, "demo": bool(request.demo_id)}
    with DB() as db:
        connection = db.get(GmailConnection, request.user.id)
        return {
            "available": gmail.configured(),
            "connected": bool(connection),
            "mailbox": connection.mailbox if connection else None,
            "last_synced_at": iso(connection.last_synced_at) if connection else None,
            "last_error": connection.last_error if connection else None,
        }


@app.get("/api/gmail/start")
@require("hr_admin")
def gmail_start():
    oauth = gmail.flow()
    url, state = oauth.authorization_url(
        access_type="offline", prompt="consent", include_granted_scopes="true"
    )
    session["gmail_oauth"] = {
        "state": state,
        "code_verifier": oauth.code_verifier,
        "user_id": request.user.id,
        "version": credential_version(request.user),
        "created_at": time.time(),
        "return_origin": (
            request.headers.get("X-Frontend-Origin")
            if request.headers.get("X-Frontend-Origin")
            in {
                FRONTEND_URL,
                request.host_url.rstrip("/"),
                *os.getenv(
                    "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
                ).split(","),
            }
            else FRONTEND_URL
        ),
    }
    return {"url": url}


@app.get("/api/gmail/callback")
def gmail_callback():
    pending = session.pop("gmail_oauth", None)
    if (
        not pending
        or pending.get("state") != request.args.get("state")
        or time.time() - pending.get("created_at", 0) > 600
    ):
        return (
            jsonify(
                error="Gmail connection request expired or invalid. Start again from Admin."
            ),
            400,
        )
    with DB.begin() as db:
        user = db.get(User, pending["user_id"])
        if (
            not prototype_user(user)
            or user.role != "hr_admin"
            or pending.get("version") != credential_version(user)
        ):
            return jsonify(error="Admin session unavailable"), 401
        try:
            gmail.connect(
                db,
                user.id,
                gmail.flow(pending["state"], pending.get("code_verifier")),
                request.url,
            )
            audit(db, "Gmail connected", user=user)
        except Exception:
            app.logger.warning("Gmail authorization failed")
            return redirect(
                pending.get("return_origin", FRONTEND_URL) + "/gmail?gmail=failed"
            )
    return redirect(
        pending.get("return_origin", FRONTEND_URL) + "/gmail?gmail=connected"
    )


@app.delete("/api/gmail/connection")
@require("hr_admin")
def gmail_disconnect():
    with DB.begin() as db:
        connection = db.get(GmailConnection, request.user.id)
        if connection:
            db.delete(connection)
        audit(db, "Gmail disconnected")
    return {"ok": True}


@app.get("/api/gmail/threads")
@require("hr_admin")
def gmail_threads():
    query = request.args.get("q", "").strip()
    if not query or len(query) > 500:
        raise ValueError("Enter a Gmail search up to 500 characters")
    with DB.begin() as db:
        service, _ = gmail.service_for(db, request.user.id)
        try:
            return gmail.search_threads(service, query)
        except Exception as error:
            raise gmail.GmailUnavailable(
                "Gmail search failed. Check the connection and try again."
            ) from error


@app.post("/api/logs/<int:action_id>/gmail-link")
@require("hr_admin")
def gmail_link(action_id):
    thread_id = field(request.get_json() or {}, "thread_id", 255)
    with DB.begin() as db:
        action = find_action(db, action_id)
        if not action:
            return jsonify(error="Action not found"), 404
        service, connection = gmail.service_for(db, request.user.id)
        try:
            if action.gmail_thread_id and action.gmail_thread_id != thread_id:
                raise ValueError(
                    "This action already has a linked thread. Use a new action for a different conversation."
                )
            if action.gmail_mailbox and action.gmail_mailbox != connection.mailbox:
                raise ValueError(
                    "Reconnect the original mailbox for this linked conversation."
                )
            if (
                db.query(Action)
                .filter(
                    Action.gmail_thread_id == thread_id,
                    Action.gmail_mailbox == connection.mailbox,
                    Action.id != action_id,
                )
                .first()
            ):
                raise ValueError(
                    "This Gmail conversation is already linked to another action."
                )
            action.gmail_thread_id = thread_id
            action.gmail_mailbox = connection.mailbox
            gmail.sync_action(db, service, connection, action, initial=True)
            audit(db, "Gmail thread linked", f"Action #{action.id}")
        except ValueError:
            raise
        except Exception as error:
            raise gmail.GmailUnavailable(
                "Could not import this Gmail thread."
            ) from error
    return {"ok": True}


@app.post("/api/logs/<int:action_id>/gmail-draft")
@require("hr_admin")
def gmail_draft(action_id):
    data = request.get_json() or {}
    subject = field(data, "subject", 500)
    body = field(data, "body", 12000)
    with DB.begin() as db:
        action = find_action(db, action_id)
        if not action:
            return jsonify(error="Action not found"), 404
        if not action.contact_email:
            raise ValueError("Add a contact email before creating a Gmail draft")
        service, connection = gmail.service_for(db, request.user.id)
        if action.gmail_mailbox and action.gmail_mailbox != connection.mailbox:
            raise ValueError("Reconnect the original mailbox before drafting a reply.")
        try:
            result = gmail.create_draft(
                service, action, subject, body, connection.mailbox
            )
        except Exception as error:
            raise gmail.GmailUnavailable(
                "Could not create the Gmail draft. No email was sent."
            ) from error
        action.gmail_mailbox = connection.mailbox
        audit(db, "Gmail draft created", f"Action #{action.id}")
        return result, 201


def sync_gmail(user_id=None):
    total = 0
    with DB.begin() as db:
        if engine.dialect.name == "postgresql":
            db.execute(text("SELECT pg_advisory_xact_lock(70102)"))
        query = (
            db.query(GmailConnection)
            .join(User)
            .filter(
                User.active.is_(True),
                User.role == "hr_admin",
                User.email == ADMIN_EMAIL,
            )
        )
        if user_id:
            query = query.filter_by(user_id=user_id)
        for connection in query:
            try:
                service, connection = gmail.service_for(db, connection.user_id)
                for action in (
                    db.query(Action)
                    .join(Meeting)
                    .filter(
                        Meeting.demo_session_id.is_(None),
                        Action.gmail_thread_id.is_not(None),
                        Action.gmail_mailbox == connection.mailbox,
                    )
                ):
                    total += gmail.sync_action(db, service, connection, action)
                connection.last_error = None
            except Exception:
                message = (
                    "Gmail sync failed. Check the connection in Admin Gmail settings."
                )
                if connection.last_error != message:
                    db.add(
                        Notification(
                            user_id=connection.user_id,
                            title="Gmail needs attention",
                            body=message,
                        )
                    )
                connection.last_error = message
                app.logger.warning("Gmail sync failed for an authorized mailbox")
    return {"new_replies": total}


@app.post("/api/gmail/sync")
@require("hr_admin")
def gmail_sync():
    return sync_gmail(request.user.id)


@app.post("/api/jobs/gmail-sync")
def gmail_job():
    if not os.getenv("JOB_KEY") or request.headers.get("X-Job-Key") != os.getenv(
        "JOB_KEY"
    ):
        return jsonify(error="Unauthorized"), 401
    return sync_gmail()


@app.post("/api/jobs/reminders")
def reminders():
    if not os.getenv("JOB_KEY") or request.headers.get("X-Job-Key") != os.getenv(
        "JOB_KEY"
    ):
        return jsonify(error="Unauthorized"), 401
    count = 0
    with DB.begin() as db:
        for action in (
            db.query(Action)
            .join(Meeting)
            .filter(Meeting.demo_session_id.is_(None), Action.status != "Completed")
        ):
            if (
                action.due_date
                and action.due_date <= CalendarDate.today() + timedelta(days=7)
                and (
                    not action.last_reminded_at
                    or action.last_reminded_at.date() != CalendarDate.today()
                )
            ):
                db.add(
                    Notification(
                        action_id=action.id,
                        title="Action needs a follow-up",
                        body=f"Action #{action.id} is due {iso(action.due_date)}.",
                    )
                )
                action.last_reminded_at = utcnow()
                count += 1
    return {"created": count}


@app.get("/api/health")
def health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "postgresql"}
    except Exception:
        return {"status": "unhealthy", "database": "unavailable"}, 503


@app.get("/")
@app.get("/<path:path>")
def frontend(path=""):
    if path.startswith("api/"):
        return jsonify(error="Endpoint not found"), 404
    folder = ROOT / "frontend" / "dist"
    if path and (folder / path).is_file():
        return send_from_directory(folder, path)
    if (folder / "index.html").is_file():
        return send_from_directory(folder, "index.html")
    return {
        "status": "API running",
        "frontend": "Start npm run dev or build frontend/dist",
        "health": "/api/health",
    }


def bootstrap():
    migrate(engine, Base.metadata)
    with DB.begin() as db:
        if engine.dialect.name == "postgresql":
            db.execute(text("SELECT pg_advisory_xact_lock(70105)"))
        for email, name, role, password in (
            (ADMIN_EMAIL, "Vihaan", "hr_admin", ADMIN_PASSWORD),
            (SHARED_TEAM_EMAIL, "HR Team", "hr_team", HR_TEAM_PASSWORD),
        ):
            user = db.query(User).filter_by(email=email).first()
            if user is None:
                db.add(
                    User(
                        name=name,
                        email=email,
                        role=role,
                        password_hash=generate_password_hash(password),
                    )
                )
            else:
                user.name = name
                user.role = role
                if not check_password_hash(user.password_hash, password):
                    user.password_hash = generate_password_hash(password)
        if not db.query(User).filter_by(email=DEMO_EMAIL).first():
            db.add(
                User(
                    name="Demo visitor",
                    email=DEMO_EMAIL,
                    role="demo",
                    password_hash=generate_password_hash(secrets.token_urlsafe(32)),
                )
            )


def start_gmail_polling():
    interval = int(os.getenv("GMAIL_POLL_SECONDS", "60"))
    if interval <= 0 or not gmail.configured():
        return

    def loop():
        while True:
            time.sleep(max(interval, 30))
            try:
                sync_gmail()
            except Exception:
                app.logger.warning("Background Gmail sync temporarily unavailable")

    threading.Thread(target=loop, name="gmail-sync", daemon=True).start()


bootstrap()
