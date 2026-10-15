"""rebuild location paths from ids and clean NaN values left by imports

Revision ID: 810c321495ea
Revises: 66ce672dc05f
Create Date: 2026-10-15 21:05:00

"""
from typing import Sequence, Union

from alembic import op

revision: str = "810c321495ea"
down_revision: Union[str, Sequence[str], None] = "66ce672dc05f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        WITH RECURSIVE tree AS (
            SELECT id, text2ltree(replace(id::text, '-', '')) AS new_path
            FROM locations
            WHERE parent_id IS NULL
            UNION ALL
            SELECT child.id, tree.new_path || text2ltree(replace(child.id::text, '-', ''))
            FROM locations child
            JOIN tree ON child.parent_id = tree.id
        )
        UPDATE locations
        SET path = tree.new_path
        FROM tree
        WHERE locations.id = tree.id
        """
    )
    op.execute("UPDATE tasks SET rrule = NULL, is_recurring = false WHERE lower(rrule) = 'nan'")
    op.execute("UPDATE tasks SET description = NULL WHERE lower(description) = 'nan'")


def downgrade() -> None:
    pass
