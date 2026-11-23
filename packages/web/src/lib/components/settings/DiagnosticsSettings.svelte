<script lang="ts">
  import DownloadSimpleIcon from 'phosphor-svelte/lib/DownloadSimpleIcon';
</script>

<section class="panel" id="support-diagnostics" aria-labelledby="support-diagnostics-heading">
  <h2 id="support-diagnostics-heading" class="text-ink text-lg font-semibold">
    Support diagnostics
  </h2>
  <p class="text-muted mt-2 text-sm">
    Only aggregate operational information is included. Credentials, document content, titles,
    prompts, AI evidence, remote responses, endpoints, and local storage locations are excluded.
  </p>
  <!-- Native anchor: Button's download prop cannot carry the suggested filename. -->
  <a
    href="/api/v1/diagnostics"
    download="paperless-ngx-dedupe-diagnostics.json"
    class="border-border-hover text-ink hover:bg-canvas-deep mt-4 inline-flex items-center gap-2 rounded-sm border px-3 py-1.5 text-sm font-medium"
  >
    <DownloadSimpleIcon size={14} aria-hidden="true" />
    Download diagnostics bundle
  </a>
</section>
