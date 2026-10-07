"""Route/permission tests using an isolated database, never the user's data.

Production remains PostgreSQL-only. Injecting SQLite before app import lets
these tests check route logic and persistence without a running PostgreSQL
server. PostgreSQL driver, connection, and dialect behavior need a separate
runtime check.
"""

import importlib
import os
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker
from sqlalchemy.engine import make_url


class AuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        test_url = os.getenv("ONEVOICE_TEST_DATABASE_URL")
        if test_url and not (make_url(test_url).database or "").endswith("_codex_test"):
            raise RuntimeError(
                "Integration tests require a dedicated database ending in _codex_test"
            )
        cls.engine = (
            create_engine(test_url)
            if test_url
            else create_engine("sqlite://", poolclass=StaticPool)
        )
        settings = {
            "DATABASE_URL": "postgresql://test.invalid/unused",
            "SECRET_KEY": "test-signing-key-only",
            "ADMIN_PASSWORD": "test-admin-password",
            "HR_TEAM_PASSWORD": "test-team-password",
            "ALLOW_SHARED_HR_LOGIN": "1",
        }
        with patch.dict(os.environ, settings), patch(
            "sqlalchemy.create_engine", return_value=cls.engine
        ):
            cls.backend = importlib.import_module("backend.server")
        cls.backend.engine = cls.engine
        cls.backend.DB = sessionmaker(bind=cls.engine, expire_on_commit=False)
        cls.backend.app.config["TESTING"] = True
        cls.backend.app.logger.setLevel("ERROR")

    @classmethod
    def tearDownClass(cls):
        cls.engine.dispose()

    def setUp(self):
        self.backend.Base.metadata.drop_all(self.engine)
        self.backend.bootstrap()
        self.client = self.backend.app.test_client()

    def login(self, mode="hr_team", **extra):
        body = {"mode": mode, "password": "test-team-password"}
        if mode == "admin":
            body.update(email=self.backend.ADMIN_EMAIL, password="test-admin-password")
        body.update(extra)
        return self.client.post("/api/auth/login", json=body)

    def headers(self, mode="hr_team"):
        response = self.login(mode)
        self.assertEqual(response.status_code, 200)
        return {"Authorization": f"Bearer {response.json['token']}"}

    def test_admin_login_and_identity(self):
        response = self.login("admin", email="  VIHAAN4263@GMAIL.COM ")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["user"]["role"], "hr_admin")
        me = self.client.get("/api/auth/me", headers=self.headers("admin"))
        self.assertEqual(me.json["email"], self.backend.ADMIN_EMAIL)

    def test_team_needs_no_email(self):
        response = self.login()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["user"]["role"], "hr_team")
        self.assertIsNone(response.json["user"]["email"])
        self.assertTrue(response.json["user"]["shared"])

    def test_client_cannot_choose_admin_role(self):
        response = self.login(role="hr_admin", email=self.backend.ADMIN_EMAIL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["user"]["role"], "hr_team")
        headers = {"Authorization": f"Bearer {response.json['token']}"}
        self.assertEqual(
            self.client.post("/api/users", json={}, headers=headers).status_code, 403
        )

    def test_bad_credentials_are_rejected(self):
        cases = [
            ("admin", {"email": "other@example.com"}),
            ("admin", {"password": "test-team-password"}),
            ("hr_team", {"password": "test-admin-password"}),
            ("hr_team", {"password": "wrong"}),
            ("admin", {"email": ""}),
        ]
        for mode, extra in cases:
            with self.subTest(mode=mode, extra=extra):
                self.assertEqual(self.login(mode, **extra).status_code, 401)

    def test_invalid_json_and_fields_return_400(self):
        cases = [
            [],
            None,
            "text",
            {},
            {"mode": "google", "password": "x"},
            {"mode": "hr_team", "password": 42},
            {"mode": "admin", "email": [], "password": "x"},
        ]
        for body in cases:
            with self.subTest(body=body):
                result = self.client.post(
                    "/api/auth/login", json=body, content_type="application/json"
                )
                self.assertEqual(result.status_code, 400)
        result = self.client.post(
            "/api/auth/login", data="{", content_type="application/json"
        )
        self.assertEqual(result.status_code, 400)

    def test_missing_and_invalid_tokens_are_rejected(self):
        for path in (
            "/api/auth/me",
            "/api/meetings",
            "/api/calendar",
        ):
            self.assertEqual(self.client.get(path).status_code, 401)
            self.assertEqual(
                self.client.get(
                    path, headers={"Authorization": "Bearer invalid"}
                ).status_code,
                401,
            )

    def test_expired_token_is_rejected(self):
        with patch("itsdangerous.timed.time.time", return_value=1):
            token = self.login().json["token"]
        self.assertEqual(
            self.client.get(
                "/api/auth/me", headers={"Authorization": f"Bearer {token}"}
            ).status_code,
            401,
        )

    def test_malformed_and_old_signed_payloads_are_rejected(self):
        for payload in ([], None, {"id": []}, {"id": True}, {"id": 1}):
            token = self.backend.signer.dumps(payload)
            result = self.client.get(
                "/api/auth/me", headers={"Authorization": f"Bearer {token}"}
            )
            self.assertEqual(result.status_code, 401)

    def test_inactive_account_invalidates_session(self):
        headers = self.headers()
        with self.backend.DB.begin() as db:
            db.query(self.backend.User).filter_by(
                email=self.backend.SHARED_TEAM_EMAIL
            ).one().active = False
        self.assertEqual(
            self.client.get("/api/auth/me", headers=headers).status_code, 401
        )
        self.assertEqual(self.login().status_code, 401)

    def test_password_change_preserves_id_and_invalidates_session(self):
        headers = self.headers()
        old_id = self.client.get("/api/auth/me", headers=headers).json["id"]
        with patch.object(self.backend, "HR_TEAM_PASSWORD", "rotated-test-password"):
            self.backend.bootstrap()
            self.assertEqual(
                self.client.get("/api/auth/me", headers=headers).status_code, 401
            )
            self.assertEqual(self.login().status_code, 401)
            response = self.login(password="rotated-test-password")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json["user"]["id"], old_id)

    def test_bootstrap_does_not_duplicate_accounts_or_rehash_unchanged_passwords(self):
        with self.backend.DB() as db:
            before = {
                u.email: (u.id, u.password_hash) for u in db.query(self.backend.User)
            }
        self.backend.bootstrap()
        with self.backend.DB() as db:
            after = {
                u.email: (u.id, u.password_hash) for u in db.query(self.backend.User)
            }
        self.assertEqual(before, after)
        self.assertEqual(len(after), 3)
        for email, (_, stored_hash) in after.items():
            if email == self.backend.DEMO_EMAIL:
                continue
            password = (
                "test-admin-password"
                if email == self.backend.ADMIN_EMAIL
                else "test-team-password"
            )
            self.assertNotEqual(stored_hash, password)
            self.assertTrue(self.backend.check_password_hash(stored_hash, password))

    def test_another_preexisting_admin_cannot_access_prototype(self):
        with self.backend.DB.begin() as db:
            user = self.backend.User(
                name="Old admin",
                email="old@example.com",
                role="hr_admin",
                password_hash=self.backend.generate_password_hash("old-test-password"),
            )
            db.add(user)
        token = self.backend.signer.dumps(
            {"id": user.id, "credential_version": self.backend.credential_version(user)}
        )
        self.assertEqual(
            self.client.get(
                "/api/meetings", headers={"Authorization": f"Bearer {token}"}
            ).status_code,
            401,
        )

    def test_only_admin_can_create_accounts(self):
        body = {
            "name": "Future user",
            "email": "future@example.com",
            "password": "test-password",
            "role": "action_owner",
        }
        self.assertEqual(
            self.client.post(
                "/api/users", json=body, headers=self.headers()
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.post(
                "/api/users", json=body, headers=self.headers("admin")
            ).status_code,
            201,
        )

    def test_team_can_save_retrieve_and_record_follow_up(self):
        headers = self.headers()
        response = self.client.post(
            "/api/meetings",
            headers=headers,
            json={
                "forum_type": "Town Hall",
                "date": "2026-10-06",
                "department": "HR",
                "facilitator": "HR Team",
                "num_participants": 3,
                "participants_list": [],
            },
        )
        self.assertEqual(response.status_code, 201)
        meeting_id = response.json["id"]
        action = self.client.post(
            f"/api/meetings/{meeting_id}/logs",
            headers=headers,
            json={
                "discussion_point": "Transport delays",
                "category": "Transport",
                "priority": "Medium",
                "action_description": "Review bus schedule",
                "contact_person": "Coordinator",
            },
        )
        self.assertEqual(action.status_code, 201)
        action_id = action.json["id"]
        response = self.client.patch(
            f"/api/logs/{action_id}", headers=headers, json={"remark": "Review started"}
        )
        self.assertEqual(response.status_code, 200)
        detail = self.client.get(f"/api/logs/{action_id}", headers=headers)
        self.assertEqual(detail.json["history"][0]["author_type"], "HR Team")
        self.assertEqual(detail.json["history"][0]["remark"], "Review started")
        self.assertEqual(
            len(
                self.client.get(f"/api/meetings/{meeting_id}", headers=headers).json[
                    "logs"
                ]
            ),
            1,
        )
        self.assertEqual(
            self.client.get("/api/calendar", headers=headers).status_code, 200
        )

    def test_missing_job_key_cannot_trigger_reminders(self):
        with patch.dict(os.environ, {"JOB_KEY": ""}):
            self.assertEqual(self.client.post("/api/jobs/reminders").status_code, 401)


if __name__ == "__main__":
    unittest.main()
