<script lang="ts">
  import type { HTMLInputAttributes, HTMLInputTypeAttribute } from 'svelte/elements';

  interface Props {
    value?: string | number;
    label?: string;
    /** Shown under the field. Suppressed while `error` is set. */
    hint?: string;
    error?: string;
    placeholder?: string;
    type?: HTMLInputTypeAttribute;
    disabled?: boolean;
    /** Machine text — IDs, tokens, env vars — sets JetBrains Mono. */
    mono?: boolean;
    id?: string;
    name?: string;
    min?: number | string;
    max?: number | string;
    step?: number | string;
    maxlength?: number;
    autocomplete?: HTMLInputAttributes['autocomplete'];
    inputmode?: HTMLInputAttributes['inputmode'];
    readonly?: boolean;
    /** Accessible name. Required when there is no visible label. */
    ariaLabel?: string;
    /** The input element, for callers that move focus to it. */
    ref?: HTMLInputElement | null;
    required?: boolean;
    class?: string;
    oninput?: (e: Event) => void;
    onchange?: (e: Event) => void;
    onkeydown?: (e: KeyboardEvent) => void;
  }

  let {
    value = $bindable(''),
    label,
    hint,
    error,
    placeholder,
    type = 'text',
    disabled = false,
    mono = false,
    id,
    name,
    min,
    max,
    step,
    maxlength,
    autocomplete,
    inputmode,
    readonly = false,
    ariaLabel,
    ref = $bindable(),
    required = false,
    class: className = '',
    oninput,
    onchange,
    onkeydown,
  }: Props = $props();

  // $props.id() gives a stable id across SSR and hydration, which crypto or a
  // counter would not.
  const uid = $props.id();
  const fieldId = $derived(id ?? uid);
  // Both the helper and the error are wired to the field.
  const describedBy = $derived(
    [hint ? `${fieldId}-hint` : null, error ? `${fieldId}-error` : null]
      .filter(Boolean)
      .join(' ') || undefined,
  );
</script>

<div class="flex flex-col gap-1.5 {className}">
  {#if label}
    <div class="flex items-center gap-2">
      <label for={fieldId} class="text-ink text-sm font-medium">
        {label}
        {#if required}<span class="text-ember" aria-hidden="true">*</span>{/if}
      </label>
      <!-- Outside the label, so it never joins the field's accessible name. -->
      {#if readonly}
        <span
          class="border-border text-muted rounded-sm border px-1.5 font-mono text-xs tracking-wide"
        >
          READ ONLY
        </span>
      {/if}
    </div>
  {/if}

  <!-- width:100% alongside its own padding: this relies on the global
       box-sizing: border-box in the base layer. Focus is the global 2px accent
       outline; the border does not change colour. -->
  <input
    bind:this={ref}
    id={fieldId}
    {type}
    {name}
    {placeholder}
    {disabled}
    {min}
    {max}
    {step}
    {maxlength}
    {autocomplete}
    {inputmode}
    {readonly}
    {required}
    bind:value
    {oninput}
    {onchange}
    {onkeydown}
    aria-label={ariaLabel}
    aria-invalid={error ? 'true' : undefined}
    aria-describedby={describedBy}
    class="placeholder:text-disabled disabled:text-disabled h-7 w-full rounded-md border px-2 text-base disabled:cursor-not-allowed disabled:bg-transparent {readonly
      ? 'bg-canvas text-ink-light'
      : 'bg-surface-raised text-ink'} {mono ? 'font-mono tabular-nums' : ''} {error
      ? 'border-ember'
      : 'border-border'}"
  />

  {#if hint}
    <p id="{fieldId}-hint" class="text-muted text-sm">{hint}</p>
  {/if}
  {#if error}
    <p id="{fieldId}-error" class="text-ember text-sm before:mr-1 before:content-['●']">
      {error}
    </p>
  {/if}
</div>
