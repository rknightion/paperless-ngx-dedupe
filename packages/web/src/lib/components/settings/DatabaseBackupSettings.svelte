<script lang="ts">
  import DownloadSimpleIcon from 'phosphor-svelte/lib/DownloadSimpleIcon';
  import { Button } from '$lib/components';
</script>

<section class="panel" id="database-backup" aria-labelledby="database-backup-heading">
  <h2 id="database-backup-heading" class="text-ink text-lg font-semibold">Database backup</h2>
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
  <Button
    href="/api/v1/maintenance/backup"
    download
    variant="outline"
    icon={DownloadSimpleIcon}
    class="mt-4"
  >
    Download database backup
  </Button>
</section>
