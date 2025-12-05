"""Add AI processing job and result tables."""

from datetime import datetime

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "b2c4f6f9c2a1"
down_revision = "3e36f7456b6e"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ai_extraction_jobs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=True, server_default="pending"),
        sa.Column("target_fields", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("tag_filter", sa.String(length=200), nullable=True),
        sa.Column("include_all", sa.Boolean(), nullable=True, server_default=sa.false()),
        sa.Column("model", sa.String(length=50), nullable=True),
        sa.Column("reasoning_level", sa.String(length=20), nullable=True),
        sa.Column("max_input_chars", sa.Integer(), nullable=True),
        sa.Column("prompt_version", sa.String(length=20), nullable=True, server_default="v1"),
        sa.Column("processed_count", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("total_count", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=True,
            default=datetime.utcnow,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_ai_extraction_jobs_id"), "ai_extraction_jobs", ["id"], unique=False
    )

    op.create_table(
        "ai_extraction_results",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("job_id", sa.Integer(), nullable=True),
        sa.Column("document_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=True, server_default="pending_review"),
        sa.Column("suggested_title", sa.String(length=500), nullable=True),
        sa.Column("title_confidence", sa.Float(), nullable=True),
        sa.Column("suggested_correspondent", sa.String(length=200), nullable=True),
        sa.Column("correspondent_confidence", sa.Float(), nullable=True),
        sa.Column("suggested_document_type", sa.String(length=200), nullable=True),
        sa.Column("document_type_confidence", sa.Float(), nullable=True),
        sa.Column("suggested_tags", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("tags_confidence", sa.Float(), nullable=True),
        sa.Column("suggested_date", sa.DateTime(), nullable=True),
        sa.Column("date_confidence", sa.Float(), nullable=True),
        sa.Column("raw_response", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("requested_fields", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=True,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("applied_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["documents.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["job_id"],
            ["ai_extraction_jobs.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_ai_extraction_results_id"),
        "ai_extraction_results",
        ["id"],
        unique=False,
    )
    op.create_index(
        "ix_ai_extraction_results_job_id", "ai_extraction_results", ["job_id"], unique=False
    )
    op.create_index(
        "ix_ai_extraction_results_document_id",
        "ai_extraction_results",
        ["document_id"],
        unique=False,
    )


def downgrade():
    op.drop_index("ix_ai_extraction_results_document_id", table_name="ai_extraction_results")
    op.drop_index("ix_ai_extraction_results_job_id", table_name="ai_extraction_results")
    op.drop_index(op.f("ix_ai_extraction_results_id"), table_name="ai_extraction_results")
    op.drop_table("ai_extraction_results")
    op.drop_index(op.f("ix_ai_extraction_jobs_id"), table_name="ai_extraction_jobs")
    op.drop_table("ai_extraction_jobs")
