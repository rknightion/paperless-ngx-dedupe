#!/bin/sh
set -e

PUID="${PUID-1000}"
PGID="${PGID-1000}"

for id in "$PUID" "$PGID"; do
  case "$id" in
    ''|*[!0-9]*)
      echo "PUID and PGID must be numeric (got PUID=${PUID}, PGID=${PGID})" >&2
      exit 1
      ;;
  esac
done

if [ "$PUID" = 0 ] || [ "$PGID" = 0 ]; then
  echo "WARNING: running as root (PUID/PGID 0). Set PUID and PGID to an unprivileged user unless you know you need this." >&2
fi

echo "Starting with UID=${PUID}, GID=${PGID}"

# Ensure data dir exists and is owned by the target user
mkdir -p /app/data
if [ "$(stat -c '%u:%g' /app/data)" != "${PUID}:${PGID}" ]; then
  chown -R "${PUID}:${PGID}" /app/data
fi

# Drop privileges and exec the main command
exec gosu "${PUID}:${PGID}" "$@"
