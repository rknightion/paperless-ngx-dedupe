import logging
import time
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from paperless_dedupe.core.config_utils import get_current_paperless_config
from paperless_dedupe.models.database import get_db
from paperless_dedupe.services.paperless_client import PaperlessClient
from paperless_dedupe.worker.celery_app import app as celery_app

logger = logging.getLogger(__name__)
router = APIRouter()


class ComponentHealth(BaseModel):
    status: str  # healthy, degraded, unhealthy
    latency_ms: float | None = None
    details: dict[str, Any] | None = None
    last_check: datetime | None = None
    message: str | None = None


class SystemHealth(BaseModel):
    overall_status: str  # healthy, degraded, unhealthy
    database: ComponentHealth
    paperless_api: ComponentHealth
    celery_worker: ComponentHealth | None = None
    redis: ComponentHealth | None = None
    timestamp: datetime
    uptime_seconds: float | None = None


# Track application start time
APP_START_TIME = time.time()


@router.get("/health", response_model=SystemHealth)
async def get_system_health(db: Session = Depends(get_db)):
    """Get comprehensive system health status"""

    health_status = {
        "timestamp": datetime.utcnow(),
        "uptime_seconds": time.time() - APP_START_TIME,
    }

    # Check database health
    db_health = await check_database_health(db)
    health_status["database"] = db_health

    # Check Paperless API health
    api_health = await check_paperless_api_health(db)
    health_status["paperless_api"] = api_health

    # Check Celery worker health
    celery_health = check_celery_health()
    health_status["celery_worker"] = celery_health

    # Check Redis health
    redis_health = check_redis_health()
    health_status["redis"] = redis_health

    # Determine overall status
    statuses = [
        db_health.status,
        api_health.status,
    ]
    if celery_health:
        statuses.append(celery_health.status)
    if redis_health:
        statuses.append(redis_health.status)

    if all(s == "healthy" for s in statuses):
        overall_status = "healthy"
    elif any(s == "unhealthy" for s in statuses):
        overall_status = "unhealthy"
    else:
        overall_status = "degraded"

    health_status["overall_status"] = overall_status

    return SystemHealth(**health_status)


@router.get("/health/quick")
async def get_quick_health(db: Session = Depends(get_db)):
    """Quick health check for uptime monitoring"""
    try:
        # Simple database connectivity check
        db.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "uptime_seconds": time.time() - APP_START_TIME,
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat(),
        }


async def check_database_health(db: Session) -> ComponentHealth:
    """Check database connectivity and performance"""
    try:
        start = time.time()

        # Test basic connectivity
        db.execute(text("SELECT 1"))

        # Get database statistics
        stats = {}
        try:
            # Get table sizes
            size_query = text("""
                SELECT
                    COUNT(*) as document_count
                FROM documents
            """)
            doc_count = db.execute(size_query).scalar()
            stats["document_count"] = doc_count

            # Get duplicate group count
            dup_query = text("""
                SELECT
                    COUNT(*) as group_count
                FROM duplicate_groups
            """)
            group_count = db.execute(dup_query).scalar()
            stats["duplicate_group_count"] = group_count

            # Check for active connections
            conn_query = text("""
                SELECT
                    COUNT(*) as active_connections
                FROM pg_stat_activity
                WHERE state = 'active'
            """)
            try:
                active_conns = db.execute(conn_query).scalar()
                stats["active_connections"] = active_conns
            except Exception:
                # May not have permission to query pg_stat_activity
                pass

        except Exception as e:
            logger.warning(f"Failed to get database statistics: {e}")

        latency = (time.time() - start) * 1000  # Convert to ms

        return ComponentHealth(
            status="healthy" if latency < 100 else "degraded",
            latency_ms=round(latency, 2),
            details=stats,
            last_check=datetime.utcnow(),
            message="Database is operational",
        )

    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return ComponentHealth(
            status="unhealthy",
            message=f"Database connection failed: {str(e)}",
            last_check=datetime.utcnow(),
        )


async def check_paperless_api_health(db: Session) -> ComponentHealth:
    """Check Paperless-NGX API connectivity"""
    try:
        start = time.time()

        # Get Paperless client configuration
        client_settings = get_current_paperless_config(db)

        if not client_settings.get("paperless_url"):
            return ComponentHealth(
                status="unhealthy",
                message="Paperless API not configured",
                last_check=datetime.utcnow(),
            )

        # Test API connectivity
        async with PaperlessClient(**client_settings) as client:
            # Test connection with a simple request
            test_result = await client.test_connection()

            if not test_result:
                return ComponentHealth(
                    status="unhealthy",
                    message="Failed to connect to Paperless API",
                    last_check=datetime.utcnow(),
                )

            # Try to get statistics if possible (fast count)
            stats = {}
            try:
                api_stats = await client.get_statistics()
                stats = {
                    "total_documents": api_stats.get("total_documents", 0),
                    "total_tags": api_stats.get("total_tags", 0),
                    "total_correspondents": api_stats.get("total_correspondents", 0),
                }
            except Exception as e:  # noqa: BLE001
                logger.debug(f"Paperless stats fetch skipped: {e}")

            latency = (time.time() - start) * 1000  # Convert to ms

            return ComponentHealth(
                status="healthy" if latency < 1500 else "degraded",
                latency_ms=round(latency, 2),
                details=stats,
                last_check=datetime.utcnow(),
                message=(
                    "Paperless API is operational"
                    if latency < 1500
                    else "Paperless API responses are slow"
                ),
            )

    except Exception as e:
        logger.error(f"Paperless API health check failed: {e}")
        return ComponentHealth(
            status="degraded",
            message=f"Paperless API connection failed: {str(e)}",
            last_check=datetime.utcnow(),
        )


def check_celery_health() -> ComponentHealth | None:
    """Check Celery worker status"""
    try:
        # Check if celery is configured
        if not celery_app:
            return None

        # Get worker stats
        inspector = celery_app.control.inspect(timeout=3.0)
        pings = celery_app.control.ping(timeout=3.0) or []
        stats = inspector.stats()
        active = inspector.active()

        worker_count = len(stats or pings)
        active_tasks = (
            sum(len(tasks) for tasks in (active or {}).values()) if active else 0
        )

        # Get queue lengths
        queue_lengths = {}
        try:
            # This requires redis backend
            from celery import current_app

            with current_app.connection_or_acquire() as conn:
                for queue_name in ["default", "high_priority", "low_priority"]:
                    queue_length = conn.default_channel.client.llen(queue_name)
                    queue_lengths[queue_name] = queue_length
        except Exception:
            pass

        details = {
            "worker_count": worker_count,
            "active_tasks": active_tasks,
            "queue_lengths": queue_lengths,
        }

        if worker_count == 0:
            return ComponentHealth(
                status="degraded",
                details=details,
                last_check=datetime.utcnow(),
                message="Celery broker reachable but no workers responded to ping; ensure workers allow remote control",
            )

        return ComponentHealth(
            status="healthy",
            details=details,
            last_check=datetime.utcnow(),
            message=f"{worker_count} worker(s) reachable, {active_tasks} tasks running",
        )

    except Exception as e:
        logger.warning(f"Celery health check failed: {e}")
        return ComponentHealth(
            status="degraded",
            message="Celery status unknown",
            last_check=datetime.utcnow(),
        )


def check_redis_health() -> ComponentHealth | None:
    """Check Redis connectivity"""
    try:
        # Try to import redis
        import redis

        from paperless_dedupe.core.config import settings

        # Parse redis URL from settings
        broker_url = settings.redis_url
        if not broker_url or not broker_url.startswith("redis://"):
            return None

        # Connect to Redis
        r = redis.from_url(broker_url, socket_connect_timeout=1)

        start = time.time()

        # Ping Redis
        r.ping()

        # Get Redis info
        info = r.info()

        latency = (time.time() - start) * 1000  # Convert to ms

        details = {
            "version": info.get("redis_version"),
            "connected_clients": info.get("connected_clients"),
            "used_memory_human": info.get("used_memory_human"),
            "uptime_days": info.get("uptime_in_days"),
        }

        return ComponentHealth(
            status="healthy" if latency < 50 else "degraded",
            latency_ms=round(latency, 2),
            details=details,
            last_check=datetime.utcnow(),
            message="Redis is operational",
        )

    except ImportError:
        return None
    except Exception as e:
        logger.warning(f"Redis health check failed: {e}")
        return ComponentHealth(
            status="unhealthy",
            message=f"Redis connection failed: {str(e)}",
            last_check=datetime.utcnow(),
        )


@router.get("/health/metrics")
async def get_health_metrics(db: Session = Depends(get_db)):
    """Get detailed metrics for monitoring"""

    metrics = {
        "timestamp": datetime.utcnow().isoformat(),
        "uptime_seconds": time.time() - APP_START_TIME,
    }

    # Database metrics
    try:
        db_metrics = {}

        # Document processing metrics
        result = db.execute(
            text("""
            SELECT
                processing_status,
                COUNT(*) as count
            FROM documents
            GROUP BY processing_status
        """)
        )

        status_counts = {row.processing_status: row.count for row in result}
        db_metrics["documents_by_status"] = status_counts

        # Duplicate metrics
        result = db.execute(
            text("""
            SELECT
                COUNT(*) as total_groups,
                COUNT(CASE WHEN reviewed = true THEN 1 END) as reviewed_groups,
                COUNT(CASE WHEN resolved = true THEN 1 END) as resolved_groups,
                AVG(confidence_score) as avg_confidence
            FROM duplicate_groups
        """)
        )
        row = result.first()
        if row:
            db_metrics["duplicate_groups"] = {
                "total": row.total_groups,
                "reviewed": row.reviewed_groups,
                "resolved": row.resolved_groups,
                "avg_confidence": float(row.avg_confidence)
                if row.avg_confidence
                else 0,
            }

        metrics["database"] = db_metrics

    except Exception as e:
        logger.error(f"Failed to get database metrics: {e}")
        metrics["database"] = {"error": str(e)}

    # Memory metrics
    try:
        import psutil

        process = psutil.Process()

        metrics["memory"] = {
            "rss_mb": process.memory_info().rss / 1024 / 1024,
            "percent": process.memory_percent(),
        }

        metrics["cpu"] = {
            "percent": process.cpu_percent(interval=0.1),
            "num_threads": process.num_threads(),
        }

    except ImportError:
        pass
    except Exception as e:
        logger.warning(f"Failed to get system metrics: {e}")

    return metrics
