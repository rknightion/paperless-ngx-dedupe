"""Add PostgreSQL-specific optimizations

Revision ID: postgresql_opt_001
Revises: 84daede32136
Create Date: 2025-09-26 15:00:00.000000

"""

from collections.abc import Sequence

from sqlalchemy.sql import text

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "postgresql_opt_001"
down_revision: str | Sequence[str] | None = "84daede32136"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add PostgreSQL optimizations."""
    # Skip GIN index for JSON tags field - would require JSONB type, not JSON
    # We're using JSON type for compatibility, so skip this optimization

    # Add GIN index for full-text search on document content
    op.execute(
        text("""
        CREATE INDEX IF NOT EXISTS ix_document_content_fulltext
        ON document_content
        USING GIN (to_tsvector('english', full_text))
    """)
    )

    # Add index for similarity searches on normalized text (if it exists)
    op.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))

    # Check if normalized_text column exists before creating index
    op.execute(
        text("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'document_content'
                AND column_name = 'normalized_text'
            ) THEN
                CREATE INDEX IF NOT EXISTS ix_document_content_normalized_trgm
                ON document_content
                USING GIN (normalized_text gin_trgm_ops);
            END IF;
        END $$;
    """)
    )

    # Add partial indexes for common queries
    op.create_index(
        "ix_documents_unprocessed",
        "documents",
        ["paperless_id"],
        unique=False,
        postgresql_where=text("processing_status = 'pending'"),
    )

    op.create_index(
        "ix_duplicate_groups_unreviewed",
        "duplicate_groups",
        ["confidence_score"],
        unique=False,
        postgresql_where=text("reviewed = false AND resolved = false"),
    )

    # Skip GIN index on app_config.value since it's now TEXT, not JSON
    # Regular btree index is sufficient for TEXT columns
    op.create_index("ix_app_config_value", "app_config", ["value"], unique=False)


def downgrade() -> None:
    """Remove PostgreSQL optimizations."""
    # Drop indexes in reverse order
    op.drop_index("ix_app_config_value", table_name="app_config")
    op.drop_index("ix_duplicate_groups_unreviewed", table_name="duplicate_groups")
    op.drop_index("ix_documents_unprocessed", table_name="documents")
    op.execute(text("DROP INDEX IF EXISTS ix_document_content_normalized_trgm"))
    op.execute(text("DROP INDEX IF EXISTS ix_document_content_fulltext"))
