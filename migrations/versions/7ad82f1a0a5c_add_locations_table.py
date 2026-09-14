"""add locations table

Revision ID: 7ad82f1a0a5c
Revises: db5bc9485029
Create Date: 2026-04-26 11:00:34.500164

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7ad82f1a0a5c'
down_revision: Union[str, Sequence[str], None] = 'db5bc9485029'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE locations (
            id UUID NOT NULL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            country VARCHAR(2) NOT NULL,
            path ltree NOT NULL,
            level VARCHAR(50) NOT NULL,
            parent_id UUID REFERENCES locations(id),
            created_at TIMESTAMP NOT NULL
        )
    """)
    op.execute("CREATE INDEX ix_locations_path ON locations USING gist (path)")
    op.execute("CREATE INDEX ix_locations_country ON locations (country)")
    op.add_column('tasks', sa.Column('location_id', sa.UUID(), nullable=True))
    op.create_foreign_key(None, 'tasks', 'locations', ['location_id'], ['id'])

def downgrade() -> None:
    op.drop_constraint(None, 'tasks', type_='foreignkey')
    op.drop_column('tasks', 'location_id')
    op.drop_table('locations')
