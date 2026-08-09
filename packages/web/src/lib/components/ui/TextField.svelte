<script lang="ts">
  import type { HTMLInputTypeAttribute } from 'svelte/elements';

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
    required?: boolean;
    class?: string;
    oninput?: (e: Event) => void;
    onchange?: (e: Event) => void;
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
    required = false,
    class: className = '',
    oninput,
    onchange,
  }: Props = $props();

  // $props.id() gives a stable id across SSR and hydration, which crypto or a
  // counter would not.
  const uid = $props.id();
  const fieldId = $derived(id ?? uid);
  const describedBy = $derived(error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined);
</script>

<div class="flex flex-col gap-1.5 {className}">
  {#if label}
    <label for={fieldId} class="text-ink text-sm font-medium">
      {label}
      {#if required}<span class="text-ember" aria-hidden="true">*</span>{/if}
    </label>
  {/if}

  <!-- width:100% alongside its own padding — this relies on the global
       box-sizing: border-box in the base layer. -->
  <input
    id={fieldId}
    {type}
    {name}
    {placeholder}
    {disabled}
    {min}
    {max}
    {step}
    {required}
    bind:value
    {oninput}
    {onchange}
    aria-invalid={error ? 'true' : undefined}
    aria-describedby={describedBy}
    class="bg-surface text-ink w-full rounded-lg border px-3 py-2 text-sm transition-colors outline-none disabled:opacity-50 {mono
      ? 'font-mono'
      : ''} {error
      ? 'border-ember focus:border-ember'
      : 'border-border focus:border-accent focus:ring-accent focus:ring-1'}"
  />

  {#if error}
    <p id="{fieldId}-error" class="text-ember text-xs">{error}</p>
  {:else if hint}
    <p id="{fieldId}-hint" class="text-muted text-xs">{hint}</p>
  {/if}
</div>
