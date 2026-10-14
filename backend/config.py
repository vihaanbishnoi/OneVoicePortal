"""Validate startup settings without connecting to or modifying a database."""


def validate_settings(database_url, secret_key, admin_password, public, shared_login):
    errors = []
    if not database_url.startswith(("postgresql://", "postgresql+psycopg2://")):
        errors.append("DATABASE_URL must be a PostgreSQL connection URL")
    if not secret_key:
        errors.append("SECRET_KEY is required")
    elif public and len(secret_key) < 32:
        errors.append("SECRET_KEY must contain at least 32 characters on public deployments")
    if not admin_password:
        errors.append("ADMIN_PASSWORD is required")
    elif public and len(admin_password) < 12:
        errors.append("ADMIN_PASSWORD must contain at least 12 characters on public deployments")
    if public and shared_login:
        errors.append("ALLOW_SHARED_HR_LOGIN must be 0 on public deployments")
    if errors:
        raise RuntimeError("Invalid server configuration: " + "; ".join(errors))


if __name__ == "__main__":
    import argparse
    import os
    from pathlib import Path
    from dotenv import load_dotenv

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public", action="store_true", help="Check public deployment requirements")
    args = parser.parse_args()
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    try:
        validate_settings(
            os.getenv("DATABASE_URL", "").replace("postgres://", "postgresql+psycopg2://", 1),
            os.getenv("SECRET_KEY"),
            os.getenv("ADMIN_PASSWORD"),
            args.public or os.getenv("PUBLIC_DEPLOYMENT") == "1" or os.getenv("RENDER") == "true",
            os.getenv("ALLOW_SHARED_HR_LOGIN", "0") == "1",
        )
    except RuntimeError as error:
        parser.exit(1, str(error) + "\n")
    print("Startup settings are valid. Database connectivity has not been checked.")
