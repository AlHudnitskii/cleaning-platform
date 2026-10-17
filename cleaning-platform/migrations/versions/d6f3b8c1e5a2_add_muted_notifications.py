"""let users turn off push topics they do not want

Revision ID: d6f3b8c1e5a2
Revises: c5e2a7b9d4f1
Create Date: 2026-10-17 21:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d6f3b8c1e5a2"
down_revision: Union[str, Sequence[str], None] = "c5e2a7b9d4f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TOPICS = "'assigned', 'task_created', 'status_changed', 'due_soon', 'overdue'"


def upgrade() -> None:
    op.create_table(
        "muted_notifications",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("topic", sa.String(length=30), nullable=False),
        sa.CheckConstraint(f"topic IN ({TOPICS})", name="ck_muted_notifications_topic"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="muted_notifications_user_id_fkey", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "topic", name="muted_notifications_pkey"),
    )


def downgrade() -> None:
    op.drop_table("muted_notifications")
