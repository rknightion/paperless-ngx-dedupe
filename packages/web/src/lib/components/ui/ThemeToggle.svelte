<script lang="ts">
  import { Sun, Moon, Monitor } from 'lucide-svelte';
  import { theme, type ThemePreference } from '$lib/theme/ThemeStore.svelte';

  /**
   * Three-way theme control. Sits in the sidebar footer, so it is styled
   * against the dark rail rather than the canvas — the sidebar keeps its own
   * near-black ramp in both themes.
   */
  const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];
</script>

<div
  class="border-sidebar-border flex items-center gap-0.5 rounded-lg border p-0.5"
  role="radiogroup"
  aria-label="Colour theme"
>
  {#each OPTIONS as option (option.value)}
    {@const active = theme.preference === option.value}
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={option.label}
      title={option.label}
      class="flex flex-1 items-center justify-center rounded-md py-1.5 transition-colors {active
        ? 'bg-sidebar-hover text-white'
        : 'text-white/50 hover:text-white/80'}"
      onclick={() => theme.set(option.value)}
    >
      <option.icon class="h-4 w-4" aria-hidden="true" />
    </button>
  {/each}
</div>
