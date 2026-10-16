"""track failed sign-in attempts to throttle password guessing

Revision ID: c4d8a2f6e9b1
Revises: 9b1e6d4a7c2f
Create Date: 2026-10-16 18:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c4d8a2f6e9b1"
down_revision: Union[str, Sequence[str], None] = "9b1e6d4a7c2f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "login_failures",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("failed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="login_failures_pkey"),
    )
    op.create_index("ix_login_failures_email_failed_at", "login_failures", ["email", "failed_at"])


def downgrade() -> None:
    op.drop_index("ix_login_failures_email_failed_at", table_name="login_failures")
    op.drop_table("login_failures")
