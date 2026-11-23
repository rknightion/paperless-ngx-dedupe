<script lang="ts">
  interface Props {
    checked?: boolean;
    disabled?: boolean;
    /** Rendered beside the switch and used as its accessible name. */
    label?: string;
    /** Set when the label is rendered elsewhere. */
    ariaLabel?: string;
    describedBy?: string;
    id?: string;
    class?: string;
    onchange?: (checked: boolean) => void;
  }

  let {
    checked = $bindable(false),
    disabled = false,
    label,
    ariaLabel,
    describedBy,
    id,
    class: className = '',
    onchange,
  }: Props = $props();

  function toggle() {
    if (disabled) return;
    checked = !checked;
    onchange?.(checked);
  }
</script>

<span class="inline-flex items-center gap-3 {className}">
  <button
    {id}
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label ?? ariaLabel}
    aria-describedby={describedBy}
    {disabled}
    onclick={toggle}
    class="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 {checked
      ? 'bg-accent'
      : 'bg-track'}"
  >
    <!-- A 28x16 track with a round thumb. The thumb takes the on-accent ink on
         the accent and the faint ink on the track, so it reads in both themes. -->
    <span
      class="inline-block h-3 w-3 rounded-full transition-transform {checked
        ? 'bg-on-accent translate-x-3.5'
        : 'bg-ink-faint translate-x-0.5'}"
    ></span>
  </button>
  {#if label}
    <span class="text-ink text-base">{label}</span>
  {/if}
</span>
