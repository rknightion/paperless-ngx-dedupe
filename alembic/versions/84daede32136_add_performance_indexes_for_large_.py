"""Add performance indexes for large datasets

Revision ID: 84daede32136
Revises: cf393bce516c
Create Date: 2025-09-26 14:02:59.125205

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '84daede32136'
down_revision: Union[str, Sequence[str], None] = 'cf393bce516c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema with performance indexes for large datasets."""
    # Skip the unique constraint - it already exists in the base schema
    # SQLite doesn't support ALTER TABLE for constraints anyway

    # Add performance indexes for documents table
    op.create_index('ix_documents_processing_status_last_processed', 'documents',
                    ['processing_status', 'last_processed'], unique=False)
    op.create_index('ix_documents_created_date_paperless_id', 'documents',
                    ['created_date', 'paperless_id'], unique=False)

    # Add indexes for duplicate groups table
    op.create_index('ix_duplicate_groups_reviewed_resolved_confidence', 'duplicate_groups',
                    ['reviewed', 'resolved', 'confidence_score'], unique=False)
    op.create_index('ix_duplicate_groups_created_at', 'duplicate_groups',
                    ['created_at'], unique=False)

    # Add indexes for duplicate members table (foreign keys)
    op.create_index('ix_duplicate_members_group_id', 'duplicate_members',
                    ['group_id'], unique=False)
    op.create_index('ix_duplicate_members_document_id', 'duplicate_members',
                    ['document_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema - remove performance indexes."""
    # Drop performance indexes
    op.drop_index('ix_duplicate_members_document_id', table_name='duplicate_members')
    op.drop_index('ix_duplicate_members_group_id', table_name='duplicate_members')
    op.drop_index('ix_duplicate_groups_created_at', table_name='duplicate_groups')
    op.drop_index('ix_duplicate_groups_reviewed_resolved_confidence', table_name='duplicate_groups')
    op.drop_index('ix_documents_created_date_paperless_id', table_name='documents')
    op.drop_index('ix_documents_processing_status_last_processed', table_name='documents')
