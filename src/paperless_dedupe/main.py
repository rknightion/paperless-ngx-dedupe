from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
import time
from sqlalchemy import text
from paperless_dedupe.core.config import settings
from paperless_dedupe.api.v1 import documents, duplicates, config, processing, websocket
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
    
    # Connect to cache
    await cache_service.connect()
    
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