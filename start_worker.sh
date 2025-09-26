#!/bin/bash
# Start Celery worker for paperless-dedupe

echo "Starting Celery worker..."

# Export environment variables if .env exists
if [ -f .env ]; then
    export $(cat .env | xargs)
fi

# Start Celery worker with all queues
celery -A paperless_dedupe.worker.celery_app worker \
    --loglevel=info \
    --concurrency=4 \
    --queues=high_priority,default,low_priority,deduplication,sync \
    --hostname=paperless-dedupe-worker@%h \
    --max-tasks-per-child=100 \
    --pool=prefork