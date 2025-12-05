import logging
import time
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from paperless_dedupe.api.v1 import (
    ai_processing,
    batch_operations,
    config,
    documents,
    duplicates,
    health,
    internal,
    processing,
    websocket,
)
from paperless_dedupe.core.config import settings
from paperless_dedupe.models.database import init_db
from paperless_dedupe.observability.tracing import (
    instrument_fastapi_app,
    setup_tracing,
)

# Configure logging with more detailed format
log_level = getattr(logging, settings.log_level.upper(), logging.WARNING)
logging.basicConfig(
    level=log_level,
    format="%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s",
    force=True,  # Force reconfiguration
)

# Set specific loggers - respect configured level but ensure minimum visibility for errors
# Don't override uvicorn loggers if user wants more verbose logging
if log_level > logging.INFO:
    # Only set minimums if user selected WARNING or ERROR
    logging.getLogger("uvicorn.error").setLevel(logging.ERROR)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
else:
    # For INFO and DEBUG, let uvicorn use the configured level
    logging.getLogger("uvicorn.error").setLevel(log_level)
    logging.getLogger("uvicorn.access").setLevel(log_level)
    # SQLAlchemy can be very verbose at INFO, keep it at WARNING
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

logging.getLogger("paperless_dedupe").setLevel(log_level)

logger = logging.getLogger(__name__)

# Always log startup info and errors regardless of level
logger.warning(f"Logging level set to: {settings.log_level}")
logger.warning("Error and exception logging is always enabled")
logger.info("This is an INFO log message - you should see this with INFO level")
logger.debug("This is a DEBUG log message - you should only see this with DEBUG level")

# Initialise tracing early so downstream components share the provider
tracer_provider = setup_tracing(component="api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    # Startup
    logger.info("Starting Paperless Dedupe application")

    # Wait for database to be ready
    from paperless_dedupe.models.database import engine

    max_retries = 30
    retry_count = 0
    while retry_count < max_retries:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("Database connection established")
            break
        except Exception:
            retry_count += 1
            if retry_count >= max_retries:
                logger.error(
                    f"Failed to connect to database after {max_retries} attempts"
                )
                raise
            logger.info(f"Waiting for database... attempt {retry_count}/{max_retries}")
            time.sleep(2)

    # Check if this is a fresh database (no alembic_version table)
    # If so, use Alembic migrations for clean schema creation
    # Otherwise, use init_db() for backward compatibility
    fresh_database = False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1 FROM alembic_version LIMIT 1"))
    except Exception:
        # alembic_version table doesn't exist = fresh database
        fresh_database = True
        logger.info(
            "Fresh database detected, will use Alembic migrations for clean setup"
        )

    # Run Alembic migrations first (works for both fresh and existing databases)
    try:
        import os

        from alembic.config import Config

        from alembic import command

        # Find the alembic.ini file
        alembic_ini = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "alembic.ini"
        )
        if os.path.exists(alembic_ini):
            logger.info("Running database migrations...")
            alembic_cfg = Config(alembic_ini)
            # Set the database URL for migrations
            alembic_cfg.set_main_option("sqlalchemy.url", settings.database_url)

            # Tell Alembic not to configure logging since we're running inside the app
            os.environ["ALEMBIC_SKIP_LOGGING_CONFIG"] = "1"

            # Run migrations to latest version
            command.upgrade(alembic_cfg, "head")

            # Clean up the environment variable
            os.environ.pop("ALEMBIC_SKIP_LOGGING_CONFIG", None)

            logger.info("Database migrations completed")
        else:
            logger.warning(
                f"Alembic config not found at {alembic_ini}, skipping migrations"
            )
            # Fallback to init_db if no Alembic config
            init_db()
            logger.info("Database initialized using fallback method")
    except Exception as e:
        logger.error(f"Error running migrations: {e}")
        # Fallback to init_db if migrations fail
        if not fresh_database:
            logger.info("Falling back to init_db() for database initialization")
            init_db()
            logger.info("Database initialized using fallback method")

    # Load saved configuration from database
    from paperless_dedupe.models.database import AppConfig, get_db

    db = next(get_db())
    try:
        config_items = db.query(AppConfig).all()
        for item in config_items:
            # Only override env/defaults when DB actually has a value
            if hasattr(settings, item.key) and item.value not in (None, ""):
                # Convert stored text values back to appropriate types
                value = item.value
                if value is not None and isinstance(value, str):
                    # Try to convert to appropriate type
                    if value.lower() in ("true", "false"):
                        value = value.lower() == "true"
                    elif value.replace(".", "", 1).replace("-", "", 1).isdigit():
                        # It's a number
                        if "." in value:
                            value = float(value)
                        else:
                            value = int(value)
                    # Otherwise keep as string

                setattr(settings, item.key, value)
                # Handle logging for different value types
                value_str = str(value)
                display_value = (
                    value_str[:50] + "..." if len(value_str) > 50 else value_str
                )
                logger.info(f"Loaded config from database: {item.key}={display_value}")
    except Exception as e:
        logger.warning(f"Could not load config from database: {e}")
    finally:
        db.close()

    # Automatic sync disabled - all sync operations should go through the worker
    # Check document count for logging purposes only
    try:
        from paperless_dedupe.models.database import Document

        db = next(get_db())
        document_count = db.query(Document).count()

        if document_count == 0:
            logger.info(
                "No documents found. Use the UI or API to trigger a sync from Paperless."
            )
        else:
            logger.info(f"Found {document_count} existing documents in the database.")

        db.close()
    except Exception as e:
        logger.error(f"Error checking document count: {e}")

    yield

    # Shutdown
    logger.info("Shutting down Paperless Dedupe application")


# Create FastAPI app
app = FastAPI(title=settings.app_name, version=settings.version, lifespan=lifespan)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Attach OTEL middleware after other middlewares are registered so it wraps them
instrument_fastapi_app(app, tracer_provider=tracer_provider)


# Add global exception handler middleware
@app.middleware("http")
async def catch_exceptions_middleware(request: Request, call_next):
    """Catch and log all exceptions"""
    try:
        return await call_next(request)
    except Exception as exc:
        # Log the full exception with traceback
        logger.error(
            f"Unhandled exception during {request.method} {request.url.path}: {str(exc)}"
        )
        logger.error(f"Full traceback:\n{traceback.format_exc()}")

        # Return a proper error response
        return JSONResponse(
            status_code=500, content={"detail": f"Internal server error: {str(exc)}"}
        )


# Add exception handler for unhandled exceptions
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Global exception handler for unhandled exceptions"""
    logger.error(f"Unhandled exception: {exc.__class__.__name__}: {str(exc)}")
    logger.error(f"Request: {request.method} {request.url}")
    logger.error(f"Traceback:\n{traceback.format_exc()}")

    return JSONResponse(
        status_code=500, content={"detail": f"An unexpected error occurred: {str(exc)}"}
    )


# Include API routers
app.include_router(documents.router, prefix="/api/v1/documents", tags=["documents"])
app.include_router(duplicates.router, prefix="/api/v1/duplicates", tags=["duplicates"])
app.include_router(processing.router, prefix="/api/v1/processing", tags=["processing"])
app.include_router(ai_processing.router, prefix="/api/v1/ai", tags=["ai"])
app.include_router(config.router, prefix="/api/v1/config", tags=["config"])
app.include_router(batch_operations.router, prefix="/api/v1/batch", tags=["batch"])
app.include_router(internal.router, prefix="/api/v1/internal", tags=["internal"])
app.include_router(health.router, prefix="/api/v1", tags=["health"])

# WebSocket endpoint
app.websocket("/ws")(websocket.websocket_endpoint)

# Frontend is now served by a separate nginx container


@app.get("/api")
async def api_root():
    """API Root endpoint"""
    return {"app": settings.app_name, "version": settings.version, "status": "running"}


@app.get("/api/health")
async def api_health():
    """API Health check endpoint"""
    return {"status": "healthy"}


@app.get("/health")
async def health():
    """Health check endpoint for Docker"""
    return {"status": "healthy"}
