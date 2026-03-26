<script lang="ts">
  import { AlertTriangle } from 'lucide-svelte';

  interface Props {
    onrunAnalysis?: () => void;
    showRunButton?: boolean;
    compact?: boolean;
  }

  let { onrunAnalysis, showRunButton = true, compact = false }: Props = $props();
</script>

{#if compact}
  <div class="bg-warn-light text-ink flex items-center gap-3 rounded-lg px-4 py-3 text-sm">
    <AlertTriangle class="text-warn h-5 w-5 shrink-0" />
    <span>
      Analysis settings have changed since the last run. Results may be incomplete.
      {#if showRunButton && onrunAnalysis}
        <button
          onclick={onrunAnalysis}
          class="text-accent hover:text-accent-hover ml-1 font-medium underline underline-offset-2"
        >
          Re-run analysis
        </button>
      {/if}
    </span>
  </div>
{:else}
  <div class="border-warn bg-warn-light rounded-lg border px-4 py-4">
    <div class="flex items-start gap-3">
      <AlertTriangle class="text-warn mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p class="text-ink text-sm font-semibold">Analysis results may be outdated</p>
        <p class="text-muted mt-1 text-sm">
          Deduplication settings or the analysis algorithm have changed since the last run. A full
          rebuild is recommended to ensure accurate results.
        </p>
        {#if showRunButton && onrunAnalysis}
          <button
            onclick={onrunAnalysis}
            class="bg-accent hover:bg-accent-hover mt-3 rounded-lg px-4 py-2 text-sm font-medium text-white"
          >
            Run Full Analysis
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
