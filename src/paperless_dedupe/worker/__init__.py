"""Worker initialization module."""

import logging
import time

from sqlalchemy import create_engine, text

from paperless_dedupe.core.config import settings
from paperless_dedupe.observability.tracing import setup_tracing
from paperless_dedupe.worker.celery_app import app

logger = logging.getLogger(__name__)

# Ensure tracing is active for worker processes
setup_tracing(component="worker")


@app.on_after_configure.connect
def setup_periodic_tasks(sender, **kwargs):
    """Setup periodic tasks if needed."""
    pass  # Add periodic tasks here if needed


@app.on_after_finalize.connect
def setup_worker(sender, **kwargs):
    """Initialize worker on startup."""
    logger.info("Initializing Paperless-NGX Dedupe worker...")

    # Test database connection
    max_retries = 10
    retry_count = 0

    while retry_count < max_retries:
        try:
            engine = create_engine(settings.database_url)
            with engine.connect() as conn:
                # Check if app_config table exists
                result = conn.execute(
                    text(
                        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'app_config')"
                    )
                )
                if not result.fetchone()[0]:
                    logger.warning(
                        "app_config table not found, waiting for migrations..."
                    )
                    raise Exception("Database not initialized yet")

                # Check if Paperless config exists
                result = conn.execute(
                    text("SELECT value FROM app_config WHERE key = 'paperless_url'")
                )
                row = result.fetchone()
                if row and row[0]:
                    logger.info(f"Paperless URL configured: {row[0]}")
                else:
                    logger.warning(
                        "Paperless URL not configured in database - sync tasks will fail until configured"
                    )

                logger.info("Worker initialization complete")
                break

        except Exception as e:
            retry_count += 1
            if retry_count >= max_retries:
                logger.error(
                    f"Failed to initialize worker after {max_retries} attempts"
                )
                raise
            logger.info(
                f"Waiting for database... attempt {retry_count}/{max_retries}: {str(e)}"
            )
            time.sleep(3)


# Import tasks to register them
from paperless_dedupe.worker.tasks import batch_operations, deduplication, document_sync

__all__ = ["app", "deduplication", "document_sync", "batch_operations"]
