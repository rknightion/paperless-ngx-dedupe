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
    class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 {checked
      ? 'bg-accent'
      : 'bg-soft'}"
  >
    <!-- The knob stays white in both themes: it sits on the accent or on the
         hairline grey, and reads on either. -->
    <span
      class="inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform {checked
        ? 'translate-x-6'
        : 'translate-x-1'}"
    ></span>
  </button>
  {#if label}
    <span class="text-ink text-sm">{label}</span>
  {/if}
</span>
