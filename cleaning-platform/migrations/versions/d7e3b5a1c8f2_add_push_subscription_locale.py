"""remember the interface language of each push subscription

Revision ID: d7e3b5a1c8f2
Revises: c4d8a2f6e9b1
Create Date: 2026-10-16 20:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d7e3b5a1c8f2"
down_revision: Union[str, Sequence[str], None] = "c4d8a2f6e9b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("push_subscriptions", sa.Column("locale", sa.String(length=5), server_default="en", nullable=False))


def downgrade() -> None:
    op.drop_column("push_subscriptions", "locale")
