<script lang="ts">
  import DesktopIcon from 'phosphor-svelte/lib/DesktopIcon';
  import MoonIcon from 'phosphor-svelte/lib/MoonIcon';
  import SunIcon from 'phosphor-svelte/lib/SunIcon';
  import { type IconComponent } from './icon-types';
  import { theme, type ThemePreference } from '$lib/theme/ThemeStore.svelte';

  /**
   * Three-way theme control. Sits in the sidebar footer, so it is styled
   * against the sidebar tokens, which follow the active theme.
   */
  const OPTIONS: { value: ThemePreference; label: string; icon: IconComponent }[] = [
    { value: 'light', label: 'Light', icon: SunIcon },
    { value: 'dark', label: 'Dark', icon: MoonIcon },
    { value: 'system', label: 'System', icon: DesktopIcon },
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
        ? 'bg-sidebar-hover text-sidebar-ink-active'
        : 'text-sidebar-ink hover:text-sidebar-ink-active'}"
      onclick={() => theme.set(option.value)}
    >
      <option.icon class="h-4 w-4" aria-hidden="true" />
    </button>
  {/each}
</div>
