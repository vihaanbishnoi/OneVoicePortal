"""Isolation, exports, Gmail deduplication, and AI routing tests."""

import base64
import csv
import io
import json
import os
import unittest
import zipfile
from urllib.parse import parse_qs, urlsplit, urlencode
from unittest.mock import MagicMock, patch
from cryptography.fernet import Fernet
from sqlalchemy import create_engine, inspect, text

import test_auth
from backend import ai, gmail
from backend.migrations import migrate
from backend.models import Base


class WorkspaceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_auth.AuthTests.setUpClass.__func__(cls)

    @classmethod
    def tearDownClass(cls):
        test_auth.AuthTests.tearDownClass.__func__(cls)

    setUp = test_auth.AuthTests.setUp
    login = test_auth.AuthTests.login
    headers = test_auth.AuthTests.headers

    def demo(self):
        result = self.client.post("/api/auth/demo", json={})
        self.assertEqual(result.status_code, 200)
        return {"Authorization": f"Bearer {result.json['token']}"}

    def private_action(self, date="2026-10-06"):
        headers = self.headers("admin")
        meeting = self.client.post(
            "/api/meetings",
            headers=headers,
            json={
                "forum_type": "Town Hall",
                "date": date,
                "department": "Private HR",
                "facilitator": "HR",
                "num_participants": 2,
            },
        )
        self.assertEqual(meeting.status_code, 201)
        action = self.client.post(
            f"/api/meetings/{meeting.json['id']}/logs",
            headers=headers,
            json={
                "discussion_point": "Private transport concern",
                "category": "Transport",
                "priority": "Medium",
                "action_description": "Review timetable",
                "contact_person": "Coordinator",
                "owner_name": "Taylor",
                "contact_email": "coordinator@example.com",
            },
        )
        self.assertEqual(action.status_code, 201)
        return headers, meeting.json, action.json

    def test_demo_is_password_free_editable_and_isolated(self):
        admin, private, action = self.private_action()
        first = self.demo()
        second = self.demo()
        first_meetings = self.client.get("/api/meetings", headers=first).json
        second_meetings = self.client.get("/api/meetings", headers=second).json
        self.assertEqual(len(first_meetings), 3)
        self.assertFalse(
            {m["id"] for m in first_meetings} & {m["id"] for m in second_meetings}
        )
        self.assertEqual(
            self.client.get(
                f"/api/meetings/{private['id']}", headers=first
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.get(f"/api/logs/{action['id']}", headers=first).status_code, 404
        )
        other_id = first_meetings[0]["id"]
        self.assertEqual(
            self.client.get(f"/api/meetings/{other_id}", headers=second).status_code,
            404,
        )
        first_action = self.client.get(f"/api/meetings/{other_id}", headers=first).json[
            "logs"
        ][0]["id"]
        self.assertEqual(
            self.client.patch(
                f"/api/logs/{first_action}",
                headers=first,
                json={"owner_name": "Demo editor"},
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.patch(
                f"/api/logs/{first_action}",
                headers=second,
                json={"owner_name": "Intruder"},
            ).status_code,
            404,
        )
        self.assertEqual(len(self.client.get("/api/meetings", headers=admin).json), 1)

    def test_demo_cannot_access_admin_or_gmail(self):
        headers = self.demo()
        for path in (
            "/api/admin/activity",
            "/api/gmail/start",
            "/api/gmail/threads?q=test",
        ):
            self.assertEqual(self.client.get(path, headers=headers).status_code, 403)
        self.assertEqual(
            self.client.post("/api/gmail/sync", headers=headers, json={}).status_code,
            403,
        )
        self.assertEqual(
            self.client.get("/api/gmail/status", headers=headers).json,
            {"available": False, "connected": False, "demo": True},
        )

    def test_demo_notification_cannot_be_read_by_another_session(self):
        first = self.demo()
        second = self.demo()
        notice = self.client.get("/api/notifications", headers=first).json[0]
        self.assertEqual(
            self.client.post(
                f"/api/notifications/{notice['id']}/read", headers=second, json={}
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.post(
                f"/api/notifications/{notice['id']}/read", headers=first, json={}
            ).status_code,
            200,
        )

    def test_shared_login_disabled_for_public_mode(self):
        with patch.object(self.backend, "ALLOW_SHARED_HR_LOGIN", False):
            self.assertEqual(self.login().status_code, 403)

    def test_recording_timestamps_and_text_owner(self):
        _, meeting, action = self.private_action()
        self.assertIn("+00:00", meeting["created_at"])
        self.assertEqual(meeting["date"], "2026-10-06")
        self.assertEqual(action["owner_name"], "Taylor")
        self.assertIsNone(action["owner_id"])

    def test_csv_archive_filters_by_calendar_quarter_and_excludes_private_data(self):
        admin, _, _ = self.private_action("2026-03-31")
        self.private_action("2026-04-01")
        demo = self.demo()
        response = self.client.get(
            "/api/reports/export?period=quarter&year=2026&quarter=1", headers=admin
        )
        self.assertEqual(response.status_code, 200)
        with zipfile.ZipFile(io.BytesIO(response.data)) as archive:
            self.assertEqual(
                set(archive.namelist()),
                {
                    "meetings.csv",
                    "actions.csv",
                    "followups.csv",
                    "conversations.csv",
                    "ai_outputs.csv",
                    "notifications.csv",
                },
            )
            rows = list(
                csv.DictReader(
                    io.StringIO(archive.read("meetings.csv").decode("utf-8-sig"))
                )
            )
            self.assertEqual([r["date"] for r in rows], ["2026-03-31"])
            self.assertNotIn("password_hash", archive.read("meetings.csv").decode())
        response = self.client.get("/api/reports/export?period=all", headers=demo)
        with zipfile.ZipFile(io.BytesIO(response.data)) as archive:
            self.assertNotIn("Private HR", archive.read("meetings.csv").decode())

    def test_bad_export_period_and_spreadsheet_formula_escape(self):
        headers = self.demo()
        self.assertEqual(
            self.client.get(
                "/api/reports/export?period=quarter&year=2026&quarter=0",
                headers=headers,
            ).status_code,
            400,
        )
        self.assertEqual(
            self.backend.csv_cell('=HYPERLINK("bad")'), '\'=HYPERLINK("bad")'
        )

    def test_manual_reply_creates_alert_and_preserves_unknown_email_time(self):
        headers, _, action = self.private_action()
        result = self.client.post(
            f"/api/logs/{action['id']}/messages",
            headers=headers,
            json={
                "body": "Review complete",
                "sender": "coordinator@example.com",
                "direction": "incoming",
            },
        )
        self.assertEqual(result.status_code, 201)
        self.assertIsNone(result.json["sent_at"])
        self.assertTrue(result.json["recorded_at"])
        self.assertEqual(
            self.client.get("/api/notifications", headers=headers).json[0]["title"],
            "Reply recorded",
        )

    def test_activity_has_signins_demo_visits_and_recordings_without_credentials(self):
        headers, _, _ = self.private_action()
        self.demo()
        rows = self.client.get("/api/admin/activity", headers=headers).json
        self.assertTrue(
            {"Signed in", "Demo session started", "Meeting recorded"}
            <= {r["event"] for r in rows}
        )
        self.assertNotIn("test-admin-password", json.dumps(rows))
        self.assertTrue(all(r["created_at"] for r in rows))

    def test_ai_routing_cannot_be_overridden_by_client(self):
        admin, _, action = self.private_action()
        result = {"content": "Summary", "provider": "ollama", "model": "test-model"}
        with patch.object(ai, "generate", return_value=result) as generate:
            response = self.client.post(
                f"/api/logs/{action['id']}/ai",
                headers=admin,
                json={"task": "summary", "provider": "openai"},
            )
            self.assertEqual(response.status_code, 201)
            self.assertFalse(generate.call_args.kwargs["demo"])
        demo = self.demo()
        meeting = self.client.get("/api/meetings", headers=demo).json[0]
        demo_action = self.client.get(
            f"/api/meetings/{meeting['id']}", headers=demo
        ).json["logs"][0]["id"]
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-only"}), patch.object(
            ai, "generate", return_value=result | {"provider": "openai"}
        ) as generate:
            self.assertEqual(
                self.client.post(
                    f"/api/logs/{demo_action}/ai",
                    headers=demo,
                    json={"task": "summary"},
                ).status_code,
                201,
            )
            self.assertTrue(generate.call_args.kwargs["demo"])

    def test_demo_ai_allowance_is_enforced_before_external_call(self):
        demo = self.demo()
        meeting = self.client.get("/api/meetings", headers=demo).json[0]
        action = self.client.get(f"/api/meetings/{meeting['id']}", headers=demo).json[
            "logs"
        ][0]["id"]
        with patch.dict(
            os.environ, {"OPENAI_API_KEY": "test-only", "DEMO_AI_SESSION_LIMIT": "1"}
        ), patch.object(
            ai,
            "generate",
            return_value={"content": "Draft", "provider": "openai", "model": "test"},
        ) as generate:
            self.assertEqual(
                self.client.post(
                    f"/api/logs/{action}/ai", headers=demo, json={"task": "draft"}
                ).status_code,
                201,
            )
            self.assertEqual(
                self.client.post(
                    f"/api/logs/{action}/ai", headers=demo, json={"task": "draft"}
                ).status_code,
                429,
            )
            self.assertEqual(generate.call_count, 1)

    def test_gmail_import_deduplicates_and_skips_drafts(self):
        _, _, row = self.private_action()
        message = {
            "id": "external-1",
            "internalDate": "1791244800000",
            "labelIds": ["INBOX"],
            "payload": {
                "mimeType": "text/plain",
                "headers": [
                    {"name": "From", "value": "coordinator@example.com"},
                    {"name": "Subject", "value": "Update"},
                ],
                "body": {"data": base64.urlsafe_b64encode(b"Review complete").decode()},
            },
        }
        service = MagicMock()
        service.users().threads().get().execute.return_value = {
            "messages": [message, message | {"id": "draft-1", "labelIds": ["DRAFT"]}]
        }
        with self.backend.DB.begin() as db:
            connection = self.backend.GmailConnection(
                user_id=db.query(self.backend.User)
                .filter_by(email=self.backend.ADMIN_EMAIL)
                .one()
                .id,
                mailbox=self.backend.ADMIN_EMAIL,
                encrypted_credentials="fake-not-used",
            )
            db.add(connection)
            action = db.get(self.backend.Action, row["id"])
            action.gmail_thread_id = "thread-1"
            self.assertEqual(gmail.sync_action(db, service, connection, action), 1)
            db.flush()
            self.assertEqual(gmail.sync_action(db, service, connection, action), 0)
            self.assertEqual(db.query(self.backend.ConversationMessage).count(), 1)
            self.assertEqual(db.query(self.backend.Notification).count(), 1)

    def test_oauth_callback_rejects_missing_state(self):
        self.assertEqual(
            self.client.get("/api/gmail/callback?state=forged&code=fake").status_code,
            400,
        )

    def test_oauth_pkce_verifier_survives_the_callback(self):
        settings = {
            "GMAIL_CLIENT_ID": "test-client",
            "GMAIL_CLIENT_SECRET": "test-secret",
            "GMAIL_TOKEN_ENCRYPTION_KEY": Fernet.generate_key().decode(),
        }
        with patch.dict(os.environ, settings):
            result = self.client.get("/api/gmail/start", headers=self.headers("admin"))
            self.assertEqual(result.status_code, 200)
            query = parse_qs(urlsplit(result.json["url"]).query)
            self.assertEqual(query["code_challenge_method"], ["S256"])
            with self.client.session_transaction() as state:
                pending = dict(state["gmail_oauth"])
            self.assertTrue(pending["code_verifier"])
            with patch.object(
                gmail, "connect", return_value="test@example.com"
            ) as connect:
                response = self.client.get(
                    "/api/gmail/callback?"
                    + urlencode({"state": pending["state"], "code": "fake-code"})
                )
                self.assertEqual(response.status_code, 302)
                self.assertEqual(
                    connect.call_args.args[2].code_verifier, pending["code_verifier"]
                )

    def test_gmail_connection_persists_only_encrypted_credentials(self):
        fake_flow = MagicMock()
        fake_flow.credentials.to_json.return_value = json.dumps(
            {"refresh_token": "test-refresh-token", "token": "test-access-token"}
        )
        fake_service = MagicMock()
        fake_service.users().getProfile().execute.return_value = {
            "emailAddress": "test@example.com"
        }
        with patch.dict(
            os.environ, {"GMAIL_TOKEN_ENCRYPTION_KEY": Fernet.generate_key().decode()}
        ), patch.object(gmail, "make_service", return_value=fake_service):
            with self.backend.DB.begin() as db:
                user = (
                    db.query(self.backend.User)
                    .filter_by(email=self.backend.ADMIN_EMAIL)
                    .one()
                )
                gmail.connect(
                    db, user.id, fake_flow, "http://localhost/callback?code=fake"
                )
                db.flush()
                stored = db.get(self.backend.GmailConnection, user.id)
                self.assertNotIn("test-refresh-token", stored.encrypted_credentials)
                decoded = json.loads(
                    gmail.cipher().decrypt(stored.encrypted_credentials.encode())
                )
                self.assertEqual(decoded["refresh_token"], "test-refresh-token")

    def test_oauth_returns_to_trusted_frontend_origin(self):
        fake_flow = MagicMock(code_verifier="test-verifier")
        fake_flow.authorization_url.return_value = (
            "https://accounts.google.com/test",
            "test-state",
        )
        headers = self.headers("admin") | {"X-Frontend-Origin": "http://localhost:5000"}
        with patch.object(gmail, "flow", return_value=fake_flow), patch.object(
            gmail, "connect", return_value="test@example.com"
        ):
            self.assertEqual(
                self.client.get(
                    "/api/gmail/start",
                    headers=headers,
                    base_url="http://localhost:5000",
                ).status_code,
                200,
            )
            response = self.client.get(
                "/api/gmail/callback?state=test-state&code=fake",
                base_url="http://localhost:5000",
            )
            self.assertEqual(
                response.location, "http://localhost:5000/gmail?gmail=connected"
            )
            headers["X-Frontend-Origin"] = "https://untrusted.example"
            self.client.get(
                "/api/gmail/start", headers=headers, base_url="http://localhost:5000"
            )
            with self.client.session_transaction() as state:
                self.assertEqual(
                    state["gmail_oauth"]["return_origin"], self.backend.FRONTEND_URL
                )

    def test_demo_edit_allowance_does_not_limit_private_admin(self):
        demo = self.demo()
        meeting = self.client.get("/api/meetings", headers=demo).json[0]
        action = self.client.get(f"/api/meetings/{meeting['id']}", headers=demo).json[
            "logs"
        ][0]["id"]
        with patch.dict(os.environ, {"DEMO_SESSION_WRITE_LIMIT": "1"}):
            self.assertEqual(
                self.client.patch(
                    f"/api/logs/{action}",
                    headers=demo,
                    json={"owner_name": "First editor"},
                ).status_code,
                200,
            )
            self.assertEqual(
                self.client.patch(
                    f"/api/logs/{action}",
                    headers=demo,
                    json={"owner_name": "Second editor"},
                ).status_code,
                429,
            )
            self.private_action()

    def test_large_demo_edit_is_rejected_before_storage(self):
        demo = self.demo()
        meeting = self.client.get("/api/meetings", headers=demo).json[0]
        action = self.client.get(f"/api/meetings/{meeting['id']}", headers=demo).json[
            "logs"
        ][0]["id"]
        response = self.client.post(
            f"/api/logs/{action}/messages", headers=demo, json={"body": "x" * 13000}
        )
        self.assertEqual(response.status_code, 413)
        self.assertEqual(
            len(self.client.get(f"/api/logs/{action}", headers=demo).json["messages"]),
            2,
        )

    def test_disabled_admin_mailbox_is_not_polled(self):
        with self.backend.DB.begin() as db:
            user = (
                db.query(self.backend.User)
                .filter_by(email=self.backend.ADMIN_EMAIL)
                .one()
            )
            user.active = False
            db.add(
                self.backend.GmailConnection(
                    user_id=user.id,
                    mailbox="test@example.com",
                    encrypted_credentials="unused",
                )
            )
        with patch.object(gmail, "service_for") as service:
            self.assertEqual(self.backend.sync_gmail(), {"new_replies": 0})
            service.assert_not_called()

    def test_tokens_are_encrypted_at_rest(self):
        key = Fernet.generate_key().decode()
        with patch.dict(os.environ, {"GMAIL_TOKEN_ENCRYPTION_KEY": key}):
            encrypted = gmail.cipher().encrypt(
                b'{"refresh_token":"test-refresh-token"}'
            )
            self.assertNotIn(b"test-refresh-token", encrypted)
            self.assertIn(b"test-refresh-token", gmail.cipher().decrypt(encrypted))

    def test_additive_migration_preserves_historical_unknown_timestamp(self):
        old_engine = create_engine("sqlite://")
        with old_engine.begin() as db:
            db.execute(
                text(
                    "CREATE TABLE meetings (id INTEGER PRIMARY KEY, forum_type TEXT, date DATE, department TEXT, facilitator TEXT, num_participants INTEGER, participants_list TEXT)"
                )
            )
            db.execute(
                text(
                    "INSERT INTO meetings VALUES (1,'Town Hall','2025-01-01','HR','HR',2,'[]')"
                )
            )
        migrate(old_engine, Base.metadata)
        self.assertIn(
            "created_at",
            {c["name"] for c in inspect(old_engine).get_columns("meetings")},
        )
        with old_engine.connect() as db:
            self.assertIsNone(
                db.execute(text("SELECT created_at FROM meetings WHERE id=1")).scalar()
            )
        old_engine.dispose()


class AIClientTests(unittest.TestCase):
    def test_openai_uses_responses_without_storage_or_tools(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-only"}), patch(
            "openai.OpenAI"
        ) as client:
            client.return_value.responses.create.return_value.output_text = "A summary"
            self.assertEqual(
                ai.generate("summary", {"messages": []}, demo=True)["provider"],
                "openai",
            )
            arguments = client.return_value.responses.create.call_args.kwargs
            self.assertFalse(arguments["store"])
            self.assertNotIn("tools", arguments)

    def test_private_ai_failure_does_not_fall_back_to_openai(self):
        import requests

        with patch("requests.post", side_effect=requests.ConnectionError), patch(
            "openai.OpenAI"
        ) as external:
            with self.assertRaises(ai.AIUnavailable):
                ai.generate("summary", {"messages": []}, demo=False)
            external.assert_not_called()


if __name__ == "__main__":
    unittest.main()
