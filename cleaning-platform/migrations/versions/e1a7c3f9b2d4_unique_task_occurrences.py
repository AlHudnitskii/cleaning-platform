"""allow one task per occurrence of a recurring series

Revision ID: e1a7c3f9b2d4
Revises: d7e3b5a1c8f2
Create Date: 2026-10-17 16:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e1a7c3f9b2d4"
down_revision: Union[str, Sequence[str], None] = "d7e3b5a1c8f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_tasks_parent_task_id_scheduled_for",
        "tasks",
        ["parent_task_id", "scheduled_for"],
        unique=True,
        postgresql_where=sa.text("parent_task_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_tasks_parent_task_id_scheduled_for", table_name="tasks")
