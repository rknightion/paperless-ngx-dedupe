<script lang="ts">
  import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';

  interface Option {
    value: string;
    label: string;
    disabled?: boolean;
  }

  interface Props {
    value?: string;
    options: Option[];
    label?: string;
    hint?: string;
    error?: string;
    /** Accessible name when there is no visible label. */
    ariaLabel?: string;
    disabled?: boolean;
    /** Machine values (page sizes, counts) set mono; labels stay sans. */
    mono?: boolean;
    id?: string;
    name?: string;
    class?: string;
    onchange?: (value: string) => void;
  }

  let {
    value = $bindable(''),
    options,
    label,
    hint,
    error,
    ariaLabel,
    disabled = false,
    mono = false,
    id,
    name,
    class: className = '',
    onchange,
  }: Props = $props();

  const uid = $props.id();
  const fieldId = $derived(id ?? uid);
  const describedBy = $derived(
    [error ? `${fieldId}-error` : null, hint ? `${fieldId}-hint` : null]
      .filter(Boolean)
      .join(' ') || undefined,
  );
</script>

<div class="flex flex-col gap-1.5 {className}">
  {#if label}
    <label for={fieldId} class="text-ink text-sm font-medium">{label}</label>
  {/if}

  <div class="relative">
    <select
      id={fieldId}
      {name}
      {disabled}
      bind:value
      onchange={() => onchange?.(value)}
      aria-label={label ? undefined : ariaLabel}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={describedBy}
      class="bg-surface-raised text-ink disabled:text-disabled h-7 w-full appearance-none rounded-md border pr-8 pl-2 text-base disabled:cursor-not-allowed disabled:bg-transparent {mono
        ? 'font-mono tabular-nums'
        : ''} {error ? 'border-ember' : 'border-border'}"
    >
      {#each options as option (option.value)}
        <option value={option.value} disabled={option.disabled}>{option.label}</option>
      {/each}
    </select>
    <!-- appearance-none strips the native arrow, so it is redrawn here in the
         system's own chevron rather than left to the platform. -->
    <span class="text-muted pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">
      <CaretDownIcon size={14} aria-hidden="true" />
    </span>
  </div>

  {#if error}
    <p id="{fieldId}-error" class="text-ember text-sm before:mr-1 before:content-['●']">{error}</p>
  {/if}
  {#if hint}
    <p id="{fieldId}-hint" class="text-muted text-sm">{hint}</p>
  {/if}
</div>
