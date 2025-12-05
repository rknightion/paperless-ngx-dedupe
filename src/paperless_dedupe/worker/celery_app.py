import os

from celery import Celery
from kombu import Exchange, Queue

# Get Redis URL from environment or use default
redis_url = os.getenv("PAPERLESS_DEDUPE_REDIS_URL", "redis://localhost:6379/0")

# Create Celery app
app = Celery(
    "paperless_dedupe",
    broker=redis_url,
    backend=redis_url,
    include=[
        "paperless_dedupe.worker.tasks.deduplication",
        "paperless_dedupe.worker.tasks.document_sync",
        "paperless_dedupe.worker.tasks.batch_operations",
    ],
)

# Celery configuration
app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,  # 1 hour hard limit
    task_soft_time_limit=3000,  # 50 minutes soft limit
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=1000,
    result_expires=86400,  # Results expire after 1 day
    broker_connection_retry_on_startup=True,
    task_default_retry_delay=60,
    task_max_retries=3,
    broker_transport_options={
        "visibility_timeout": 3600,
        # Ensure broadcast control commands (ping, stats) reach workers on Redis
        "fanout_prefix": True,
        "fanout_patterns": True,
    },
)

# Define queues with different priorities
app.conf.task_queues = (
    Queue("high_priority", Exchange("high_priority"), routing_key="high_priority"),
    Queue("default", Exchange("default"), routing_key="default"),
    Queue("low_priority", Exchange("low_priority"), routing_key="low_priority"),
    Queue("deduplication", Exchange("deduplication"), routing_key="deduplication"),
    Queue("sync", Exchange("sync"), routing_key="sync"),
)

# Task routing
app.conf.task_routes = {
    "paperless_dedupe.worker.tasks.deduplication.*": {"queue": "deduplication"},
    "paperless_dedupe.worker.tasks.document_sync.*": {"queue": "sync"},
    "paperless_dedupe.worker.tasks.batch_operations.*": {"queue": "default"},
}

# Beat schedule for periodic tasks (if needed)
app.conf.beat_schedule = {
    # Example: Run deduplication analysis daily at 2 AM
    # 'daily-deduplication': {
    #     'task': 'paperless_dedupe.worker.tasks.deduplication.analyze_all_documents',
    #     'schedule': crontab(hour=2, minute=0),
    # },
}
