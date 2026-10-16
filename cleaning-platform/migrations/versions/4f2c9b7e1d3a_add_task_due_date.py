"""add task due date and detach occurrences when a parent task is deleted

Revision ID: 4f2c9b7e1d3a
Revises: 810c321495ea
Create Date: 2026-10-16 12:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "4f2c9b7e1d3a"
down_revision: Union[str, Sequence[str], None] = "810c321495ea"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("due_date", sa.Date(), nullable=True))
    op.create_index("ix_tasks_due_date", "tasks", ["due_date"])
    op.drop_constraint("tasks_parent_task_id_fkey", "tasks", type_="foreignkey")
    op.create_foreign_key(
        "tasks_parent_task_id_fkey", "tasks", "tasks", ["parent_task_id"], ["id"], ondelete="SET NULL"
    )


def downgrade() -> None:
    op.drop_constraint("tasks_parent_task_id_fkey", "tasks", type_="foreignkey")
    op.create_foreign_key("tasks_parent_task_id_fkey", "tasks", "tasks", ["parent_task_id"], ["id"])
    op.drop_index("ix_tasks_due_date", table_name="tasks")
    op.drop_column("tasks", "due_date")
