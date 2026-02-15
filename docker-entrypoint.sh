#!/bin/sh
set -e

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

echo "Starting with UID=${PUID}, GID=${PGID}"

# Ensure data dir exists and is owned by the target user
mkdir -p /app/data
chown -R "${PUID}:${PGID}" /app/data

# Drop privileges and exec the main command
exec gosu "${PUID}:${PGID}" "$@"
