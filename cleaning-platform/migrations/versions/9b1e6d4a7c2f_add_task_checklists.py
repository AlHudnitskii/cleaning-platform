"""add task checklists and the photo requirement for review

Revision ID: 9b1e6d4a7c2f
Revises: 4f2c9b7e1d3a
Create Date: 2026-10-16 15:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "9b1e6d4a7c2f"
down_revision: Union[str, Sequence[str], None] = "4f2c9b7e1d3a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("photo_required", sa.Boolean(), server_default="false", nullable=False))
    op.create_table(
        "task_checklist_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("text", sa.String(length=255), nullable=False),
        sa.Column("done", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("done_by", sa.Uuid(), nullable=True),
        sa.Column("done_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], name="task_checklist_items_task_id_fkey", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["done_by"], ["users.id"], name="task_checklist_items_done_by_fkey", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="task_checklist_items_pkey"),
    )
    op.create_index("ix_task_checklist_items_task_id_position", "task_checklist_items", ["task_id", "position"])


def downgrade() -> None:
    op.drop_index("ix_task_checklist_items_task_id_position", table_name="task_checklist_items")
    op.drop_table("task_checklist_items")
    op.drop_column("tasks", "photo_required")
