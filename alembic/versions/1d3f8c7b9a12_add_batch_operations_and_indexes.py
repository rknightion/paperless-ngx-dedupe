"""add batch operations and performance indexes

Revision ID: 1d3f8c7b9a12
Revises: b2c4f6f9c2a1
Create Date: 2026-01-13 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1d3f8c7b9a12"
down_revision: str | Sequence[str] | None = "b2c4f6f9c2a1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "batch_operations",
        sa.Column("id", sa.String(length=100), nullable=False),
        sa.Column("operation", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("total_items", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("processed_items", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_items", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("current_item", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("parameters", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("errors", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("task_id", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_batch_operations_status", "batch_operations", ["status"], unique=False
    )
    op.create_index(
        "ix_batch_operations_created_at",
        "batch_operations",
        ["created_at"],
        unique=False,
    )

    op.create_index(
        "ix_duplicate_groups_reviewed",
        "duplicate_groups",
        ["reviewed"],
        unique=False,
    )
    op.create_index(
        "ix_duplicate_groups_resolved",
        "duplicate_groups",
        ["resolved"],
        unique=False,
    )
    op.create_index(
        "ix_duplicate_members_group_id",
        "duplicate_members",
        ["group_id"],
        unique=False,
    )

    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_documents_tags_gin "
        "ON documents USING gin ((tags::jsonb))"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_document_content_full_text_tsv "
        "ON document_content USING gin (to_tsvector('english', coalesce(full_text, '')))"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP INDEX IF EXISTS ix_document_content_full_text_tsv")
    op.execute("DROP INDEX IF EXISTS ix_documents_tags_gin")

    op.drop_index("ix_duplicate_members_group_id", table_name="duplicate_members")
    op.drop_index("ix_duplicate_groups_resolved", table_name="duplicate_groups")
    op.drop_index("ix_duplicate_groups_reviewed", table_name="duplicate_groups")

    op.drop_index("ix_batch_operations_created_at", table_name="batch_operations")
    op.drop_index("ix_batch_operations_status", table_name="batch_operations")
    op.drop_table("batch_operations")
