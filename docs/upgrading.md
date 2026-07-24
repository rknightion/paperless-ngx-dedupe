---
title: Upgrading Paperless NGX Dedupe
description: Safe upgrade steps for Paperless NGX Dedupe, including backups and post-upgrade checks
---

# Upgrading Paperless NGX Dedupe

Upgrade the application image, then let it apply its local SQLite migrations at startup. It does not
change Paperless documents during an upgrade.

## Before upgrading

1. Download a database backup from **Settings > Database backup** and store it somewhere protected.
2. Read the release notes for any configuration changes.
3. Keep the existing `.env` file. Connection credentials remain environment-owned and are not stored
   in the browser or the database backup.

## Docker Compose

```bash
docker compose pull
docker compose up -d
docker compose ps
```

The container starts as the configured `PUID` and `PGID` (both default to `1000`) and upgrades the
local schema before serving traffic. Do not run multiple application containers against the same
SQLite file.

## After upgrading

1. Open the dashboard and confirm **Paperless connected** in Readiness.
2. Check **Jobs** for a failed migration, sync, or analysis job.
3. Run a normal sync if the release notes call for one, then run duplicate analysis if it is marked
   stale.
4. Review suggestions and duplicate plans before any Paperless mutation. Scheduled AI remains off by
   default and AI output is always review-only.

## Rollback

Roll back the image tag first. If the older version cannot read the migrated database, stop the
application and restore the SQLite backup offline using the [backup and restore guide](database-backup-and-restore.md).
Restoring the Dedupe database does not revert Paperless documents; reviewed apply/revert records
remain the appropriate path for those changes.
