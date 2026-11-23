<script lang="ts">
  import Button from './Button.svelte';

  interface Props {
    onrunAnalysis?: () => void;
    showRunButton?: boolean;
    compact?: boolean;
  }

  let { onrunAnalysis, showRunButton = true, compact = false }: Props = $props();
</script>

<!-- A hairline row: warn status word, the sentence, the action. No tint, no
     icon tile. -->
{#if compact}
  <div class="border-border text-ink flex items-baseline gap-3 border-y px-1 py-2.5 text-base">
    <span class="status-word text-warn shrink-0"><span aria-hidden="true">◆</span> WARN</span>
    <span>
      Analysis settings have changed since the last run. Results may be incomplete.
      {#if showRunButton && onrunAnalysis}
        <!-- Inline text link inside a sentence: Button has no link variant and always
             renders as a padded block, so this stays a native button. -->
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
  <div class="border-border flex flex-wrap items-baseline gap-x-3 gap-y-2 border-y px-1 py-3">
    <span class="status-word text-warn shrink-0"><span aria-hidden="true">◆</span> WARN</span>
    <div class="min-w-0 flex-1">
      <p class="text-ink text-base font-semibold">Analysis results may be outdated</p>
      <p class="text-ink-light mt-1 text-base">
        Deduplication settings or the analysis algorithm have changed since the last run. A full
        rebuild is recommended to ensure accurate results.
      </p>
    </div>
    {#if showRunButton && onrunAnalysis}
      <Button variant="secondary" onclick={onrunAnalysis}>Run Full Analysis</Button>
    {/if}
  </div>
{/if}
