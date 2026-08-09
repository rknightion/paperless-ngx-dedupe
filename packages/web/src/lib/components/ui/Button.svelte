<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Icon as LucideIcon } from 'lucide-svelte';
  import Spinner from './Spinner.svelte';

  interface Props {
    /**
     * primary = the one committing action on screen. secondary/outline for
     * alternates, ghost for toolbar actions, destructive for deletes.
     *
     * There is deliberately no semantic-tint variant: state is a tinted pill,
     * the accent is a solid fill. Giving a button a success or warn tint
     * collapses that distinction.
     */
    variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'outline';
    /** sm in table rows and toolbars, md default, lg for stacked columns. */
    size?: 'sm' | 'md' | 'lg';
    icon?: typeof LucideIcon;
    iconRight?: typeof LucideIcon;
    loading?: boolean;
    disabled?: boolean;
    /** Renders an anchor instead of a button, with identical styling. */
    href?: string;
    /** Anchor only — marks the href as a download. */
    download?: boolean;
    type?: 'button' | 'submit' | 'reset';
    fullWidth?: boolean;
    title?: string;
    ariaLabel?: string;
    /** id of an element explaining the control, e.g. why it is disabled. */
    describedBy?: string;
    class?: string;
    onclick?: (e: MouseEvent) => void;
    children?: Snippet;
  }

  let {
    variant = 'primary',
    size = 'md',
    icon: IconLeft,
    iconRight: IconRight,
    loading = false,
    disabled = false,
    href,
    download = false,
    type = 'button',
    fullWidth = false,
    title,
    ariaLabel,
    describedBy,
    class: className = '',
    onclick,
    children,
  }: Props = $props();

  // text-on-accent rather than text-white: the dark scope brightens the accent
  // and ember, and white on either drops below AA there.
  const VARIANTS = {
    primary: 'bg-accent text-on-accent hover:bg-accent-hover shadow-sm',
    secondary:
      'bg-surface text-ink border-border hover:bg-canvas hover:border-border-hover border shadow-sm',
    ghost: 'text-ink hover:bg-canvas-deep border border-transparent',
    destructive: 'bg-ember text-on-accent border border-transparent shadow-sm hover:brightness-92',
    outline: 'text-ink border-border hover:bg-canvas hover:border-border-hover border',
  } as const;

  const SIZES = {
    sm: 'text-xs px-2.5 py-1.5 rounded-lg gap-1.5',
    md: 'text-sm px-4 py-2 rounded-lg gap-2',
    lg: 'text-sm px-6 py-2.5 rounded-xl gap-2',
  } as const;

  const ICON_SIZE = { sm: 14, md: 16, lg: 18 } as const;

  const inactive = $derived(disabled || loading);

  const classes = $derived(
    [
      fullWidth ? 'flex w-full' : 'inline-flex',
      'items-center justify-center font-medium whitespace-nowrap transition-colors',
      VARIANTS[variant],
      SIZES[size],
      inactive ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
      className,
    ].join(' '),
  );
</script>

{#snippet inner()}
  {#if loading}
    <Spinner size="sm" label={null} />
  {:else if IconLeft}
    <IconLeft size={ICON_SIZE[size]} aria-hidden="true" />
  {/if}
  {@render children?.()}
  {#if IconRight}
    <IconRight size={ICON_SIZE[size]} aria-hidden="true" />
  {/if}
{/snippet}

{#if href && !inactive}
  <a
    {href}
    class={classes}
    {title}
    aria-label={ariaLabel}
    aria-describedby={describedBy}
    download={download || undefined}
    {onclick}
  >
    {@render inner()}
  </a>
{:else}
  <button
    {type}
    class={classes}
    disabled={inactive}
    {title}
    aria-label={ariaLabel}
    aria-describedby={describedBy}
    aria-busy={loading ? 'true' : undefined}
    {onclick}
  >
    {@render inner()}
  </button>
{/if}
