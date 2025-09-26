"""Database initialization for Celery workers"""
import logging
import time
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from paperless_dedupe.core.config import settings

logger = logging.getLogger(__name__)


def get_worker_db_engine():
    """Create PostgreSQL database engine for workers with retry logic"""
    max_retries = 10
    retry_count = 0

    while retry_count < max_retries:
        try:
            engine = create_engine(
                settings.database_url,
                pool_pre_ping=True,
                pool_size=5,  # Smaller pool for workers
                max_overflow=10,
                echo=False
            )

            # Test connection
            with engine.connect() as conn:
                # Check if tables exist in PostgreSQL
                result = conn.execute(text("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'app_config')"))

                if not result.fetchone()[0]:
                    logger.warning(f"app_config table not found, attempt {retry_count + 1}/{max_retries}")
                    raise Exception("Database not initialized yet")

            logger.info("Worker database connection established")
            return engine

        except Exception as e:
            retry_count += 1
            if retry_count >= max_retries:
                logger.error(f"Failed to connect to database after {max_retries} attempts")
                raise
            logger.info(f"Waiting for database... attempt {retry_count}/{max_retries}: {str(e)}")
            time.sleep(3)

    raise Exception("Could not establish database connection")


def get_worker_session():
    """Get a database session for workers"""
    engine = get_worker_db_engine()
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return SessionLocal()