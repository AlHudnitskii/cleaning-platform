"""add checklist templates that managers reuse across tasks

Revision ID: a3c9e5b7d2f4
Revises: f2b8d4a6c1e3
Create Date: 2026-10-17 18:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a3c9e5b7d2f4"
down_revision: Union[str, Sequence[str], None] = "f2b8d4a6c1e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "checklist_templates",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("country", sa.String(length=2), nullable=False),
        sa.Column("items", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("jsonb_typeof(items) = 'array'", name="ck_checklist_templates_items_array"),
        sa.PrimaryKeyConstraint("id", name="checklist_templates_pkey"),
        sa.UniqueConstraint("country", "name", name="checklist_templates_country_name_key"),
    )


def downgrade() -> None:
    op.drop_table("checklist_templates")
