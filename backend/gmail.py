"""Gmail OAuth, linked-thread sync, and reviewable drafts. No send endpoint."""

import base64
import json
import os
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import parseaddr
from html.parser import HTMLParser

from .models import ConversationMessage, GmailConnection, Notification, utcnow

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
]


class GmailUnavailable(Exception):
    pass


def configured():
    return all(
        os.getenv(key)
        for key in (
            "GMAIL_CLIENT_ID",
            "GMAIL_CLIENT_SECRET",
            "GMAIL_TOKEN_ENCRYPTION_KEY",
        )
    )


def cipher():
    from cryptography.fernet import Fernet

    try:
        return Fernet(os.environ["GMAIL_TOKEN_ENCRYPTION_KEY"].encode())
    except (KeyError, ValueError) as error:
        raise GmailUnavailable(
            "Configure a valid Gmail token encryption key."
        ) from error


def flow(state=None, code_verifier=None):
    if not configured():
        raise GmailUnavailable(
            "Gmail setup is incomplete. Follow docs/GMAIL_SETUP.md and configure the client credentials on the server."
        )
    from google_auth_oauthlib.flow import Flow

    redirect = os.getenv(
        "GMAIL_REDIRECT_URI", "http://localhost:5000/api/gmail/callback"
    )
    # OAuthlib's HTTP exception is limited to explicitly configured loopback development.
    if redirect.startswith(("http://localhost:", "http://127.0.0.1:")):
        os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"
    config = {
        "web": {
            "client_id": os.environ["GMAIL_CLIENT_ID"],
            "client_secret": os.environ["GMAIL_CLIENT_SECRET"],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }
    return Flow.from_client_config(
        config,
        scopes=SCOPES,
        state=state,
        redirect_uri=redirect,
        code_verifier=code_verifier,
        autogenerate_code_verifier=code_verifier is None,
    )


def make_service(credentials):
    import httplib2
    from google_auth_httplib2 import AuthorizedHttp
    from googleapiclient.discovery import build

    return build(
        "gmail",
        "v1",
        http=AuthorizedHttp(credentials, http=httplib2.Http(timeout=30)),
        cache_discovery=False,
    )


def connect(db, user_id, oauth_flow, callback_url):
    oauth_flow.fetch_token(authorization_response=callback_url)
    credentials = oauth_flow.credentials
    service = make_service(credentials)
    mailbox = service.users().getProfile(userId="me").execute()["emailAddress"]
    connection = db.get(GmailConnection, user_id)
    token_data = json.loads(credentials.to_json())
    if (
        not token_data.get("refresh_token")
        and connection
        and connection.mailbox == mailbox
    ):
        old = json.loads(cipher().decrypt(connection.encrypted_credentials.encode()))
        token_data["refresh_token"] = old.get("refresh_token")
    if not token_data.get("refresh_token"):
        raise GmailUnavailable(
            "Google did not provide offline access. Reconnect and approve the requested access."
        )
    encrypted = cipher().encrypt(json.dumps(token_data).encode()).decode()
    if connection:
        connection.mailbox = mailbox
        connection.encrypted_credentials = encrypted
        connection.last_error = None
    else:
        db.add(
            GmailConnection(
                user_id=user_id, mailbox=mailbox, encrypted_credentials=encrypted
            )
        )
    return mailbox


def service_for(db, user_id):
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request

    connection = db.get(GmailConnection, user_id)
    if not connection:
        raise GmailUnavailable("Connect Gmail in the Admin Gmail page first.")
    try:
        info = json.loads(cipher().decrypt(connection.encrypted_credentials.encode()))
        credentials = Credentials.from_authorized_user_info(info, SCOPES)
        if credentials.expired and credentials.refresh_token:
            credentials.refresh(Request())
            connection.encrypted_credentials = (
                cipher().encrypt(credentials.to_json().encode()).decode()
            )
        return make_service(credentials), connection
    except GmailUnavailable:
        raise
    except Exception as error:
        raise GmailUnavailable(
            "Gmail authorization is unavailable or expired. Reconnect Gmail."
        ) from error


class PlainHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def message_body(payload):
    def parts(part):
        yield part
        for child in part.get("parts", []):
            yield from parts(child)

    text_parts = []
    html_parts = []
    for part in parts(payload):
        data = part.get("body", {}).get("data")
        if not data or part.get("filename"):
            continue
        decoded = base64.urlsafe_b64decode(data + "=" * (-len(data) % 4)).decode(
            "utf-8", errors="replace"
        )
        if part.get("mimeType") == "text/plain":
            text_parts.append(decoded)
        elif part.get("mimeType") == "text/html":
            parser = PlainHTML()
            parser.feed(decoded)
            html_parts.append(" ".join(parser.parts))
    return "\n".join(text_parts or html_parts).strip()


def sync_action(db, service, connection, action, initial=False):
    thread = (
        service.users()
        .threads()
        .get(userId="me", id=action.gmail_thread_id, format="full")
        .execute()
    )
    count = 0
    for message in thread.get("messages", []):
        # Gmail also returns unsent drafts in threads; those are not sent messages.
        if "DRAFT" in message.get("labelIds", []):
            continue
        exists = (
            db.query(ConversationMessage.id)
            .filter_by(action_id=action.id, source="gmail", external_id=message["id"])
            .first()
        )
        if exists:
            continue
        payload = message.get("payload", {})
        headers = {h["name"].lower(): h["value"] for h in payload.get("headers", [])}
        sender = headers.get("from", "")[:255]
        incoming = parseaddr(sender)[1].lower() != connection.mailbox.lower()
        body = message_body(payload) or message.get("snippet", "")
        when = datetime.fromtimestamp(
            int(message.get("internalDate", "0")) / 1000, timezone.utc
        )
        db.add(
            ConversationMessage(
                action_id=action.id,
                sender=sender,
                subject=headers.get("subject", "")[:500],
                body=body,
                direction="incoming" if incoming else "outgoing",
                source="gmail",
                external_id=message["id"],
                sent_at=when,
            )
        )
        action.updated_at = utcnow()
        action.meeting.updated_at = utcnow()
        if incoming and not initial:
            db.add(
                Notification(
                    user_id=connection.user_id,
                    action_id=action.id,
                    title="New email reply",
                    body=f"A reply arrived for action #{action.id}: {action.category}.",
                )
            )
            count += 1
    connection.last_synced_at = utcnow()
    connection.last_error = None
    return count


def search_threads(service, query):
    result = (
        service.users().threads().list(userId="me", q=query, maxResults=10).execute()
    )
    rows = []
    for item in result.get("threads", []):
        thread = (
            service.users()
            .threads()
            .get(userId="me", id=item["id"], format="metadata")
            .execute()
        )
        messages = thread.get("messages", [])
        headers = (
            {
                h["name"].lower(): h["value"]
                for h in messages[0].get("payload", {}).get("headers", [])
            }
            if messages
            else {}
        )
        rows.append(
            {
                "id": item["id"],
                "subject": headers.get("subject", "(No subject)"),
                "sender": headers.get("from", ""),
                "message_count": len(messages),
            }
        )
    return rows


def create_draft(service, action, subject, body, mailbox):
    message = EmailMessage()
    message["To"] = action.contact_email
    message["From"] = mailbox
    payload = {}
    if action.gmail_thread_id:
        thread = (
            service.users()
            .threads()
            .get(userId="me", id=action.gmail_thread_id, format="metadata")
            .execute()
        )
        messages = [
            m
            for m in thread.get("messages", [])
            if "DRAFT" not in m.get("labelIds", [])
        ]
        if messages:
            headers = {
                h["name"].lower(): h["value"]
                for h in messages[-1].get("payload", {}).get("headers", [])
            }
            subject = headers.get("subject", subject)
            if headers.get("message-id"):
                message["In-Reply-To"] = headers["message-id"]
                message["References"] = (
                    headers.get("references", "") + " " + headers["message-id"]
                ).strip()
        payload["threadId"] = action.gmail_thread_id
    message["Subject"] = subject
    message.set_content(body)
    payload["raw"] = base64.urlsafe_b64encode(message.as_bytes()).decode()
    result = (
        service.users()
        .drafts()
        .create(userId="me", body={"message": payload})
        .execute()
    )
    action.gmail_thread_id = (
        result.get("message", {}).get("threadId") or action.gmail_thread_id
    )
    return {"draft_id": result["id"], "url": "https://mail.google.com/mail/u/0/#drafts"}
