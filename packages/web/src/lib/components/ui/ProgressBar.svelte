<script lang="ts">
  interface Props {
    progress: number;
    phaseProgress?: number;
    message?: string;
    animated?: boolean;
    paused?: boolean;
    /** Track height: cell is 4px (inside a table row), panel is 6px. */
    size?: 'cell' | 'panel';
  }

  let {
    progress,
    phaseProgress,
    message = '',
    animated = true,
    paused = false,
    size = 'panel',
  }: Props = $props();

  // Bar width uses overall progress (never jumps backward)
  let barPct = $derived(Math.round(Math.min(1, Math.max(0, progress)) * 100));

  // Displayed percentage uses phase progress when available
  let displayPct = $derived(
    phaseProgress != null ? Math.round(Math.min(1, Math.max(0, phaseProgress)) * 100) : barPct,
  );

  let isIndeterminate = $derived(barPct === 0 && animated);
  let barColor = $derived(barPct >= 100 ? 'bg-success' : paused ? 'bg-warn' : 'bg-accent');
  // A meter at zero is a dim 0 and no track at all, unless there is genuinely
  // no fraction to show, which is the shimmer below.
  let isZero = $derived(barPct === 0 && !isIndeterminate && displayPct === 0);

  // ETA calculation from phaseProgress rate
  let etaStartTime = $state<number | null>(null);
  let etaStartPhase = $state<number | null>(null);
  let etaText = $state('');

  // Reset ETA when paused so it recalculates fresh after resume
  $effect(() => {
    if (paused) {
      etaStartTime = null;
      etaStartPhase = null;
      etaText = '';
    }
  });

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
  <div class="mb-1 flex items-center justify-between gap-2 text-sm">
    <span class="text-muted truncate">{message}</span>
    <span
      class="shrink-0 font-mono text-xs font-medium tabular-nums {isZero
        ? 'text-muted'
        : 'text-ink'}"
    >
      {isZero ? '0' : `${displayPct}%`}
    </span>
  </div>
  {#if !isZero}
    <div class="{size === 'cell' ? 'h-1' : 'h-1.5'} w-full overflow-hidden bg-(--furniture)">
      {#if isIndeterminate}
        <div
          class="h-full w-full"
          style="background: linear-gradient(90deg, transparent 0%, color-mix(in oklab, var(--color-accent) 40%, transparent) 50%, transparent 100%); background-size: 200% 100%; animation: shimmer 1.5s ease-in-out infinite;"
        ></div>
      {:else}
        <div
          class="{barColor} h-full {animated ? 'transition-all duration-200 ease-out' : ''}"
          style="width: {barPct}%"
        ></div>
      {/if}
    </div>
  {/if}
  {#if etaText}
    <div class="text-muted mt-1 text-right text-xs">{etaText}</div>
  {/if}
</div>
