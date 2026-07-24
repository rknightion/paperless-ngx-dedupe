<script lang="ts">
  import { Download } from 'lucide-svelte';
</script>

<section class="panel" id="support-diagnostics" aria-labelledby="support-diagnostics-heading">
  <h2
    id="support-diagnostics-heading"
    class="text-ink flex items-center gap-2 text-lg font-semibold"
  >
    <Download class="text-accent h-5 w-5" aria-hidden="true" />
    Support diagnostics
  </h2>
  <p class="text-muted mt-2 text-sm">
    Only aggregate operational information is included. Credentials, document content, titles,
    prompts, AI evidence, remote responses, endpoints, and local storage locations are excluded.
  </p>
  <a
    href="/api/v1/diagnostics"
    download="paperless-ngx-dedupe-diagnostics.json"
    class="border-soft text-ink hover:bg-canvas mt-4 inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
  >
    <Download class="h-4 w-4" aria-hidden="true" />
    Download diagnostics bundle
  </a>
</section>
