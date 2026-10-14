"""Deployment validation reports settings names without exposing credentials."""
import unittest

from sqlalchemy import create_engine

from backend.config import normalize_database_url, validate_settings


class ConfigTests(unittest.TestCase):
    def test_public_settings_are_accepted_at_minimum_lengths(self):
        validate_settings("postgresql://test.invalid/sample", "s" * 32, "p" * 12, True, False)

    def test_short_admin_password_identifies_the_setting(self):
        password = "sample12"
        with self.assertRaisesRegex(RuntimeError, "ADMIN_PASSWORD.*12 characters") as error:
            validate_settings("postgresql://test.invalid/sample", "s" * 32, password, True, False)
        self.assertNotIn(password, str(error.exception))

    def test_all_invalid_settings_are_reported_together(self):
        with self.assertRaises(RuntimeError) as error:
            validate_settings("sqlite://", None, None, True, True)
        for key in ("DATABASE_URL", "SECRET_KEY", "ADMIN_PASSWORD", "ALLOW_SHARED_HR_LOGIN"):
            self.assertIn(key, str(error.exception))

    def test_short_public_signing_key_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "SECRET_KEY.*32 characters"):
            validate_settings("postgresql://test.invalid/sample", "short", "p" * 12, True, False)

    def test_local_settings_keep_existing_behavior(self):
        validate_settings("postgresql+psycopg2://test.invalid/sample", "local", "sample", False, True)


class DatabaseDriverTests(unittest.TestCase):
    def test_provider_schemes_preserve_credentials_and_ssl_parameters(self):
        suffix = "sample:encoded%40password@sample.invalid/sample?sslmode=require&channel_binding=require"
        for scheme in ("postgres://", "postgresql://"):
            with self.subTest(scheme=scheme):
                self.assertEqual(
                    normalize_database_url("  " + scheme + suffix + "\n"),
                    "postgresql+psycopg2://" + suffix,
                )

    def test_explicit_psycopg2_url_is_unchanged(self):
        url = "postgresql+psycopg2://sample.invalid/sample?sslmode=require"
        self.assertEqual(normalize_database_url(url), url)

    def test_other_schemes_are_not_rewritten(self):
        for url in ("sqlite://", "postgresql+psycopg://sample.invalid/sample", ""):
            with self.subTest(url=url):
                self.assertEqual(normalize_database_url(url), url)

    def test_engine_loads_installed_driver_without_connecting(self):
        engine = create_engine(normalize_database_url(
            "postgresql://sample:encoded%40password@sample.invalid/sample?sslmode=require&channel_binding=require"
        ))
        try:
            self.assertEqual(engine.dialect.dbapi.__name__, "psycopg2")
            _, parameters = engine.dialect.create_connect_args(engine.url)
            self.assertEqual(parameters["password"], "encoded@password")
            self.assertEqual(parameters["sslmode"], "require")
            self.assertEqual(parameters["channel_binding"], "require")
        finally:
            engine.dispose()
