"""harden schema: timezones, constraints, indexes, cascades, token version, outbox

Revision ID: 66ce672dc05f
Revises: e81cc694af5c
Create Date: 2026-10-15 21:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "66ce672dc05f"
down_revision: Union[str, Sequence[str], None] = "e81cc694af5c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TIMESTAMP_COLUMNS = [
    ("tasks", "created_at", True),
    ("tasks", "scheduled_for", False),
    ("tasks", "quality_reviewed_at", False),
    ("locations", "created_at", True),
    ("users", "created_at", True),
    ("task_photos", "uploaded_at", True),
    ("task_status_history", "changed_at", True),
    ("task_comments", "created_at", True),
    ("push_subscriptions", "created_at", True),
]

CASCADE_FOREIGN_KEYS = [
    ("task_photos", "task_id", "tasks"),
    ("task_status_history", "task_id", "tasks"),
    ("task_comments", "task_id", "tasks"),
    ("push_subscriptions", "user_id", "users"),
]

TASK_STATUSES = ("pending", "in_progress", "on_review", "completed", "on_hold", "cancelled")
TASK_PRIORITIES = ("low", "normal", "high", "urgent")

INDEXES = [
    ("ix_tasks_country_created_at", "tasks", ["country", "created_at"]),
    ("ix_tasks_assigned_to", "tasks", ["assigned_to"]),
    ("ix_tasks_status", "tasks", ["status"]),
    ("ix_tasks_created_at_id", "tasks", ["created_at", "id"]),
    ("ix_tasks_location_id", "tasks", ["location_id"]),
    ("ix_task_photos_task_id", "task_photos", ["task_id"]),
    ("ix_task_status_history_task_id_changed_at", "task_status_history", ["task_id", "changed_at"]),
    ("ix_task_comments_task_id_created_at", "task_comments", ["task_id", "created_at"]),
    ("ix_push_subscriptions_user_id", "push_subscriptions", ["user_id"]),
]


def _in_list(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def upgrade() -> None:
    for table, column, has_default in TIMESTAMP_COLUMNS:
        op.alter_column(
            table,
            column,
            type_=sa.DateTime(timezone=True),
            postgresql_using=f"{column} AT TIME ZONE 'UTC'",
        )
        if has_default:
            op.alter_column(table, column, server_default=sa.text("now()"))

    op.add_column("users", sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"))

    op.create_check_constraint("ck_tasks_status", "tasks", _in_list("status", TASK_STATUSES))
    op.create_check_constraint("ck_tasks_priority", "tasks", _in_list("priority", TASK_PRIORITIES))
    op.create_check_constraint("ck_tasks_quality_score", "tasks", "quality_score BETWEEN 1 AND 5")

    for name, table, columns in INDEXES:
        op.create_index(name, table, columns)

    for table, column, referred in CASCADE_FOREIGN_KEYS:
        name = f"{table}_{column}_fkey"
        op.drop_constraint(name, table, type_="foreignkey")
        op.create_foreign_key(name, table, referred, [column], ["id"], ondelete="CASCADE")

    op.execute(
        """
        DELETE FROM push_subscriptions p
        USING push_subscriptions newer
        WHERE p.endpoint = newer.endpoint
          AND (p.created_at, p.id) < (newer.created_at, newer.id)
        """
    )
    op.create_unique_constraint("push_subscriptions_endpoint_key", "push_subscriptions", ["endpoint"])

    op.create_table(
        "outbox_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name="outbox_messages_pkey"),
    )
    op.create_index(
        "ix_outbox_messages_unpublished",
        "outbox_messages",
        ["created_at"],
        postgresql_where=sa.text("published_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_outbox_messages_unpublished", table_name="outbox_messages")
    op.drop_table("outbox_messages")

    op.drop_constraint("push_subscriptions_endpoint_key", "push_subscriptions", type_="unique")

    for table, column, referred in CASCADE_FOREIGN_KEYS:
        name = f"{table}_{column}_fkey"
        op.drop_constraint(name, table, type_="foreignkey")
        op.create_foreign_key(name, table, referred, [column], ["id"])

    for name, table, _ in reversed(INDEXES):
        op.drop_index(name, table_name=table)

    op.drop_constraint("ck_tasks_quality_score", "tasks", type_="check")
    op.drop_constraint("ck_tasks_priority", "tasks", type_="check")
    op.drop_constraint("ck_tasks_status", "tasks", type_="check")

    op.drop_column("users", "token_version")

    for table, column, has_default in TIMESTAMP_COLUMNS:
        if has_default:
            op.alter_column(table, column, server_default=None)
        op.alter_column(
            table,
            column,
            type_=sa.DateTime(timezone=False),
            postgresql_using=f"{column} AT TIME ZONE 'UTC'",
        )
