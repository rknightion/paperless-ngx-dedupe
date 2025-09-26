"""Add timezone awareness to datetime fields

Revision ID: timezone_aware_datetimes
Revises: 84daede32136
Create Date: 2025-01-26 17:45:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'timezone_aware_datetimes'
down_revision = 'postgresql_opt_001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Update datetime fields to be timezone-aware.

    Note: The column type doesn't change in PostgreSQL (still TIMESTAMP),
    but this migration documents that the application layer now handles
    all datetimes as timezone-aware (UTC).

    This is a no-op migration for PostgreSQL but documents the change
    in datetime handling at the application level.
    """
    # PostgreSQL TIMESTAMP type can store both naive and aware datetimes
    # The change is in the application layer, not the database schema
    pass


def downgrade() -> None:
    """
    No database changes needed for downgrade.
    The application would need to be reverted to handle naive datetimes.
    """
    pass