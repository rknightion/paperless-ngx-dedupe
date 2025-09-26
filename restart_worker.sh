#!/bin/bash

# Restart just the worker container to pick up code changes
echo "Restarting worker container..."
docker-compose -f docker-compose.dev.yml restart worker

echo "Worker restarted. Waiting for it to be ready..."
sleep 5

echo "Worker should now have the latest code changes."
