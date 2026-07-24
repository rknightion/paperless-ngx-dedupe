<script lang="ts">
  import { DatabaseBackup, Download } from 'lucide-svelte';
</script>

<section class="panel" id="database-backup" aria-labelledby="database-backup-heading">
  <h2 id="database-backup-heading" class="text-ink flex items-center gap-2 text-lg font-semibold">
    <DatabaseBackup class="text-accent h-5 w-5" aria-hidden="true" />
    Database backup
  </h2>
  <p class="text-muted mt-2 text-sm">
    Download a consistent SQLite snapshot containing application settings, synced document metadata,
    duplicate analysis, job history, and AI review state.
  </p>
  <p class="text-muted mt-2 text-xs">
    Restore is intentionally an offline operation. Stop the application and follow the offline
    restore guide before replacing the database file.
  </p>
  <p class="text-ember mt-2 text-xs">
    The backup contains sensitive document metadata and AI review state. Protect it like the live
    database and securely delete copies when they are no longer needed.
  </p>
  <a
    href="https://github.com/rknightion/paperless-ngx-dedupe/blob/main/docs/database-backup-and-restore.md"
    class="text-accent hover:text-accent-hover mt-3 inline-block text-xs font-medium underline"
  >
    Read the offline restore guide
  </a>
  <a
    href="/api/v1/maintenance/backup"
    download
    class="border-soft text-ink hover:bg-canvas mt-4 flex w-fit items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
  >
    <Download class="h-4 w-4" aria-hidden="true" />
    Download database backup
  </a>
</section>
