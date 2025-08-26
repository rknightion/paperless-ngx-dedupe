from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
import time
import asyncio
from sqlalchemy import text
from paperless_dedupe.core.config import settings
from paperless_dedupe.api.v1 import documents, duplicates, config, processing, websocket, batch_operations
from paperless_dedupe.models.database import init_db
from paperless_dedupe.services.cache_service import cache_service

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

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
        except Exception as e:
            retry_count += 1
            if retry_count >= max_retries:
                logger.error(f"Failed to connect to database after {max_retries} attempts")
                raise
            logger.info(f"Waiting for database... attempt {retry_count}/{max_retries}")
            time.sleep(2)
    
    # Initialize database
    init_db()
    logger.info("Database initialized")
    
    # Run Alembic migrations
    try:
        from alembic import command
        from alembic.config import Config
        import os
        
        # Find the alembic.ini file
        alembic_ini = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'alembic.ini')
        if os.path.exists(alembic_ini):
            logger.info("Running database migrations...")
            alembic_cfg = Config(alembic_ini)
            # Set the database URL for migrations
            alembic_cfg.set_main_option('sqlalchemy.url', settings.database_url)
            # Run migrations to latest version
            command.upgrade(alembic_cfg, "head")
            logger.info("Database migrations completed")
        else:
            logger.warning(f"Alembic config not found at {alembic_ini}, skipping migrations")
    except Exception as e:
        logger.error(f"Error running migrations: {e}")
    
    # Load saved configuration from database
    from paperless_dedupe.models.database import get_db, AppConfig
    db = next(get_db())
    try:
        config_items = db.query(AppConfig).all()
        for item in config_items:
            if hasattr(settings, item.key):
                setattr(settings, item.key, item.value)
                # Handle logging for different value types
                value_str = str(item.value)
                display_value = value_str[:50] + "..." if len(value_str) > 50 else value_str
                logger.info(f"Loaded config from database: {item.key}={display_value}")
    except Exception as e:
        logger.warning(f"Could not load config from database: {e}")
    finally:
        db.close()
    
    # Connect to cache
    await cache_service.connect()
    
    # Start automatic document sync if configured
    try:
        from paperless_dedupe.models.database import Document
        from paperless_dedupe.api.v1.documents import run_document_sync, sync_status
        
        # Check if this is the first run or we have no documents
        db = next(get_db())
        document_count = db.query(Document).count()
        
        # Check if Paperless is configured
        from paperless_dedupe.core.config_utils import get_current_paperless_config
        client_settings = get_current_paperless_config(db)
        
        if client_settings.get('paperless_url') and not sync_status["is_syncing"]:
            if document_count == 0:
                logger.info("No documents found. Starting initial sync from Paperless...")
                # Run sync in background
                asyncio.create_task(run_document_sync(db, force_refresh=False, limit=None))
            else:
                logger.info(f"Found {document_count} existing documents. Skipping automatic sync.")
                # Update sync status to reflect that documents exist from a previous sync
                most_recent = db.query(Document).order_by(Document.last_processed.desc()).first()
                if most_recent and most_recent.last_processed:
                    sync_status["completed_at"] = most_recent.last_processed
                    sync_status["documents_synced"] = document_count
        else:
            if not client_settings.get('paperless_url'):
                logger.info("Paperless URL not configured. Skipping automatic sync.")
        
        db.close()
    except Exception as e:
        logger.error(f"Error during startup sync check: {e}")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Paperless Dedupe application")
    await cache_service.disconnect()

# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(documents.router, prefix="/api/v1/documents", tags=["documents"])
app.include_router(duplicates.router, prefix="/api/v1/duplicates", tags=["duplicates"])
app.include_router(processing.router, prefix="/api/v1/processing", tags=["processing"])
app.include_router(config.router, prefix="/api/v1/config", tags=["config"])
app.include_router(batch_operations.router, prefix="/api/v1/batch", tags=["batch"])

# WebSocket endpoint
app.websocket("/ws")(websocket.websocket_endpoint)

# Frontend is now served by a separate nginx container

@app.get("/api")
async def api_root():
    """API Root endpoint"""
    return {
        "app": settings.app_name,
        "version": settings.version,
        "status": "running"
    }

@app.get("/api/health")
async def api_health():
    """API Health check endpoint"""
    return {"status": "healthy"}

@app.get("/health")
async def health():
    """Health check endpoint for Docker"""
    return {"status": "healthy"}