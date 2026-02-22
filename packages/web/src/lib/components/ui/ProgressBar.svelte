<script lang="ts">
  interface Props {
    progress: number;
    phaseProgress?: number;
    message?: string;
    animated?: boolean;
  }

  let { progress, phaseProgress, message = '', animated = true }: Props = $props();

  // Bar width uses overall progress (never jumps backward)
  let barPct = $derived(Math.round(Math.min(1, Math.max(0, progress)) * 100));

  // Displayed percentage uses phase progress when available
  let displayPct = $derived(
    phaseProgress != null ? Math.round(Math.min(1, Math.max(0, phaseProgress)) * 100) : barPct,
  );

  let isIndeterminate = $derived(barPct === 0 && animated);
  let barColor = $derived(barPct >= 100 ? 'bg-success' : 'bg-accent');

  // ETA calculation from phaseProgress rate
  let etaStartTime = $state<number | null>(null);
  let etaStartPhase = $state<number | null>(null);
  let etaText = $state('');

  $effect(() => {
    if (phaseProgress == null || phaseProgress <= 0 || phaseProgress >= 1) {
      // Reset when no phase progress, at start, or complete
      etaStartTime = null;
      etaStartPhase = null;
      etaText = '';
      return;
    }

    const now = Date.now();

    // Reset tracking when phase restarts (new phase detected)
    if (etaStartPhase != null && phaseProgress < etaStartPhase - 0.01) {
      etaStartTime = null;
      etaStartPhase = null;
      etaText = '';
      return;
    }

    // Start tracking
    if (etaStartTime == null || etaStartPhase == null) {
      etaStartTime = now;
      etaStartPhase = phaseProgress;
      etaText = '';
      return;
    }

    const elapsed = (now - etaStartTime) / 1000;
    const progressDelta = phaseProgress - etaStartPhase;

    // Need at least 3s of data and measurable progress
    if (elapsed < 3 || progressDelta < 0.005) {
      return;
    }

    const rate = progressDelta / elapsed;
    const remaining = (1 - phaseProgress) / rate;

    if (remaining < 1) {
      etaText = '~<1s remaining';
    } else if (remaining < 60) {
      etaText = `~${Math.round(remaining)}s remaining`;
    } else {
      const mins = Math.floor(remaining / 60);
      const secs = Math.round(remaining % 60);
      etaText = `~${mins}m ${secs}s remaining`;
    }
  });
</script>

<div class="w-full">
  <div class="mb-1 flex items-center justify-between text-sm">
    <span class="text-muted truncate">{message}</span>
    <span class="text-ink shrink-0 font-mono text-xs font-medium">{displayPct}%</span>
  </div>
  <div class="bg-soft h-3 w-full overflow-hidden rounded-full">
    {#if isIndeterminate}
      <div
        class="h-full w-full rounded-full"
        style="background: linear-gradient(90deg, transparent 0%, oklch(0.55 0.15 195 / 0.4) 50%, transparent 100%); background-size: 200% 100%; animation: shimmer 1.5s ease-in-out infinite;"
      ></div>
    {:else}
      <div
        class="{barColor} h-full rounded-full {animated
          ? 'transition-all duration-300 ease-out'
          : ''}"
        style="width: {barPct}%"
      ></div>
    {/if}
  </div>
  {#if etaText}
    <div class="text-muted mt-1 text-right text-xs">{etaText}</div>
  {/if}
</div>
