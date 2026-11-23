<script lang="ts">
  import { goto } from '$app/navigation';

  interface Preset {
    label: string;
    description: string;
    params: Record<string, string>;
  }

  interface Props {
    currentFilters: Record<string, string>;
  }

  let { currentFilters }: Props = $props();

  const presets: Preset[] = [
    {
      label: 'Fast Lane',
      description: 'High-confidence changed results',
      params: { status: 'pending_review', minConfidence: '0.8', changedOnly: 'true' },
    },
    {
      label: 'Needs Attention',
      description: 'Low-confidence results',
      params: { status: 'pending_review', maxConfidence: '0.5' },
    },
    {
      label: 'Failed',
      description: 'Failed results',
      params: { failed: 'true' },
    },
    {
      label: 'All Pending',
      description: 'All pending results',
      params: { status: 'pending_review' },
    },
  ];

  function isPresetActive(preset: Preset): boolean {
    const presetKeys = Object.keys(preset.params);
    const filterKeys = Object.keys(currentFilters).filter((k) => currentFilters[k] !== '');

    if (presetKeys.length !== filterKeys.length) return false;

    return presetKeys.every((key) => currentFilters[key] === preset.params[key]);
  }

  const activeIndex = $derived(presets.findIndex((p) => isPresetActive(p)));

  function applyPreset(preset: Preset) {
    const params = new URLSearchParams(preset.params);
    goto(`/ai-processing/review?${params.toString()}`);
  }
</script>

<div class="flex flex-wrap items-center gap-2">
  <span class="label-micro">Quick filters</span>
  {#each presets as preset, i (preset.label)}
    {@const active = activeIndex === i}
    <button
      onclick={() => applyPreset(preset)}
      title={preset.description}
      class="border-border h-[26px] rounded-sm border px-3 text-sm transition-colors {active
        ? 'bg-selected text-ink font-medium'
        : 'text-muted hover:bg-canvas-deep'}"
    >
      {preset.label}
    </button>
  {/each}
</div>
