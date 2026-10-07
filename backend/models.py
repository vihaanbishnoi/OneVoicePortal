"""Database records shared by the API and integrations."""

from datetime import date as CalendarDate, datetime, timezone
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow():
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(30), default="action_owner")
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class DemoSession(Base):
    __tablename__ = "demo_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Meeting(Base):
    __tablename__ = "meetings"
    id: Mapped[int] = mapped_column(primary_key=True)
    forum_type: Mapped[str] = mapped_column(String(80))
    date: Mapped[CalendarDate] = mapped_column(Date)
    department: Mapped[str] = mapped_column(String(120))
    facilitator: Mapped[str] = mapped_column(String(120))
    num_participants: Mapped[int] = mapped_column(Integer)
    participants_list: Mapped[str] = mapped_column(Text, default="[]")
    demo_session_id: Mapped[str | None] = mapped_column(
        ForeignKey("demo_sessions.id"), index=True
    )
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    logs: Mapped[list["Action"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan"
    )


class Action(Base):
    __tablename__ = "actions"
    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE")
    )
    discussion_point: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(120))
    priority: Mapped[str] = mapped_column(String(20), default="Medium")
    action_description: Mapped[str] = mapped_column(Text)
    contact_person: Mapped[str] = mapped_column(String(120))
    contact_email: Mapped[str] = mapped_column(String(255), default="")
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    owner_name: Mapped[str] = mapped_column(String(120), default="")
    gmail_thread_id: Mapped[str | None] = mapped_column(String(255))
    gmail_mailbox: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(30), default="Open")
    due_date: Mapped[CalendarDate | None] = mapped_column(Date)
    last_reminded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    meeting: Mapped[Meeting] = relationship(back_populates="logs")
    owner: Mapped[User | None] = relationship()
    history: Mapped[list["Remark"]] = relationship(
        cascade="all, delete-orphan", order_by="Remark.created_at, Remark.id"
    )
    messages: Mapped[list["ConversationMessage"]] = relationship(
        cascade="all, delete-orphan",
        order_by="ConversationMessage.sent_at, ConversationMessage.id",
    )
    ai_results: Mapped[list["AIResult"]] = relationship(
        cascade="all, delete-orphan", order_by="AIResult.created_at.desc()"
    )


class Remark(Base):
    __tablename__ = "remarks"
    id: Mapped[int] = mapped_column(primary_key=True)
    action_id: Mapped[int] = mapped_column(ForeignKey("actions.id", ondelete="CASCADE"))
    author: Mapped[str] = mapped_column(String(50))
    remark: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"
    __table_args__ = (UniqueConstraint("action_id", "source", "external_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    action_id: Mapped[int] = mapped_column(ForeignKey("actions.id", ondelete="CASCADE"))
    sender: Mapped[str] = mapped_column(String(255), default="")
    subject: Mapped[str] = mapped_column(String(500), default="")
    body: Mapped[str] = mapped_column(Text)
    direction: Mapped[str] = mapped_column(String(20), default="incoming")
    source: Mapped[str] = mapped_column(String(20), default="manual")
    external_id: Mapped[str | None] = mapped_column(String(255))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    action_id: Mapped[int | None] = mapped_column(
        ForeignKey("actions.id", ondelete="CASCADE")
    )
    demo_session_id: Mapped[str | None] = mapped_column(
        ForeignKey("demo_sessions.id"), index=True
    )
    title: Mapped[str] = mapped_column(String(180))
    body: Mapped[str] = mapped_column(Text)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class Activity(Base):
    __tablename__ = "activity"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    actor_role: Mapped[str] = mapped_column(String(30))
    event: Mapped[str] = mapped_column(String(80))
    detail: Mapped[str] = mapped_column(String(300), default="")
    demo_session_id: Mapped[str | None] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class GmailConnection(Base):
    __tablename__ = "gmail_connections"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    mailbox: Mapped[str] = mapped_column(String(255))
    encrypted_credentials: Mapped[str] = mapped_column(Text)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class AIResult(Base):
    __tablename__ = "ai_results"
    id: Mapped[int] = mapped_column(primary_key=True)
    action_id: Mapped[int] = mapped_column(ForeignKey("actions.id", ondelete="CASCADE"))
    task: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    provider: Mapped[str] = mapped_column(String(20))
    model: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class AIUsage(Base):
    __tablename__ = "ai_usage"
    id: Mapped[int] = mapped_column(primary_key=True)
    demo_session_id: Mapped[str] = mapped_column(String(36), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
