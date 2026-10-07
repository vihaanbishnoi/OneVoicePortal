"""Additive prototype migration; historical creation timestamps remain unknown."""

from sqlalchemy import inspect, text

ADDITIONS = {
    "meetings": {
        "demo_session_id": "VARCHAR(36) REFERENCES demo_sessions(id)",
        "created_at": "TIMESTAMP WITH TIME ZONE",
        "updated_at": "TIMESTAMP WITH TIME ZONE",
    },
    "actions": {
        "owner_name": "VARCHAR(120) NOT NULL DEFAULT ''",
        "gmail_thread_id": "VARCHAR(255)",
        "gmail_mailbox": "VARCHAR(255)",
    },
    "notifications": {"demo_session_id": "VARCHAR(36) REFERENCES demo_sessions(id)"},
}


def migrate(engine, metadata):
    metadata.create_all(engine)
    with engine.begin() as connection:
        # Prevent two production workers from concurrently adding the same column.
        if engine.dialect.name == "postgresql":
            connection.execute(text("SELECT pg_advisory_xact_lock(70101)"))
        for table, additions in ADDITIONS.items():
            existing = {
                column["name"] for column in inspect(connection).get_columns(table)
            }
            for name, definition in additions.items():
                if name not in existing:
                    connection.execute(
                        text(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")
                    )
        for table in ("meetings", "notifications"):
            connection.execute(
                text(
                    f"CREATE INDEX IF NOT EXISTS ix_{table}_demo_session_id ON {table} (demo_session_id)"
                )
            )
