"""Add AI result review fields."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "5d8c1e4b2a31"
down_revision = "1d3f8c7b9a12"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "ai_extraction_results",
        sa.Column(
            "field_decisions", postgresql.JSON(astext_type=sa.Text()), nullable=True
        ),
    )
    op.add_column(
        "ai_extraction_results",
        sa.Column(
            "field_overrides", postgresql.JSON(astext_type=sa.Text()), nullable=True
        ),
    )


def downgrade():
    op.drop_column("ai_extraction_results", "field_overrides")
    op.drop_column("ai_extraction_results", "field_decisions")
