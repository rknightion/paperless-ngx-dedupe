# Database backup and offline restore

Paperless NGX Dedupe can download a consistent snapshot of its SQLite database
from **Settings > Database backup**. The application creates the snapshot with
SQLite's online backup API, so sync and analysis do not need to be stopped while
the download is produced.

The backup contains the application's local state. It does not back up
Paperless-NGX itself, and restoring it does not change any Paperless documents.
It does contain sensitive document metadata, duplicate decisions, operational
history, and AI review state. Store downloaded copies with access controls
appropriate for the live database and securely delete them when they are no
longer needed.

## Restore a backup

There is deliberately no restore API. Restore the database only while the
application is stopped:

1. Stop the Paperless NGX Dedupe container or process.
2. Keep a copy of the current database file in a separate location.
3. Verify the downloaded snapshot before using it:

   ```sh
   sqlite3 paperless-ngx-dedupe-backup-*.sqlite3 'PRAGMA integrity_check;'
   ```

   Continue only when the command prints `ok`.
4. Copy the verified snapshot over the database file configured by
   `DATABASE_URL`. Do not copy it through a symlink, and preserve the owner and
   permissions expected by the application process.
5. Start the application. It will apply any required forward-only schema
   migrations during startup.
6. Check the health endpoint and confirm the document, duplicate, job, and AI
   review counts look as expected.

If startup or verification fails, stop the application again and put the saved
original database back in place. Never replace a live SQLite database or copy
only its `-wal` or `-shm` sidecar files.
