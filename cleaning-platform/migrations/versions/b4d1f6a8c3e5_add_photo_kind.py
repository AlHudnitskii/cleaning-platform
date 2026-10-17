"""tell photos of the starting state from photos of the result

Revision ID: b4d1f6a8c3e5
Revises: a3c9e5b7d2f4
Create Date: 2026-10-17 19:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b4d1f6a8c3e5"
down_revision: Union[str, Sequence[str], None] = "a3c9e5b7d2f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Existing photos showed the result, which the photo requirement already relied on.
    op.add_column("task_photos", sa.Column("kind", sa.String(length=10), server_default="after", nullable=False))
    op.create_check_constraint("ck_task_photos_kind", "task_photos", "kind IN ('before', 'after')")


def downgrade() -> None:
    op.drop_constraint("ck_task_photos_kind", "task_photos", type_="check")
    op.drop_column("task_photos", "kind")
