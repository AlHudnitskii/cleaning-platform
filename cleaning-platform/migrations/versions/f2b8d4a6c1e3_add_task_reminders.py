"""record due date reminders so each one goes out once

Revision ID: f2b8d4a6c1e3
Revises: e1a7c3f9b2d4
Create Date: 2026-10-17 17:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f2b8d4a6c1e3"
down_revision: Union[str, Sequence[str], None] = "e1a7c3f9b2d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "task_reminders",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("kind IN ('due_soon', 'overdue')", name="ck_task_reminders_kind"),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], name="task_reminders_task_id_fkey", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="task_reminders_pkey"),
        sa.UniqueConstraint("task_id", "kind", "due_date", name="task_reminders_task_id_kind_due_date_key"),
    )


def downgrade() -> None:
    op.drop_table("task_reminders")
