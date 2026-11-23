<script lang="ts">
  interface Props {
    status: string;
  }

  let { status }: Props = $props();

  /**
   * A status word: a shape, the word and a colour. Colour is the third
   * carrier, never the first. The shape is drawn by CSS with empty alt text, so
   * the DOM text stays the status as stored and is uppercased by CSS.
   * Static class strings so Tailwind sees every variant.
   */
  const STATUS: Record<string, { shape: string; text: string }> = {
    pending: { shape: '◇', text: 'text-muted' },
    running: { shape: '▸', text: 'text-ink' },
    paused: { shape: '◆', text: 'text-warn' },
    completed: { shape: '■', text: 'text-success' },
    failed: { shape: '●', text: 'text-ember' },
    cancelled: { shape: '○', text: 'text-muted' },
    false_positive: { shape: '○', text: 'text-muted' },
    ignored: { shape: '○', text: 'text-muted' },
    deleted: { shape: '■', text: 'text-success' },
  };

  const displayLabels: Record<string, string> = {
    false_positive: 'False Positive',
  };

  const meta = $derived(STATUS[status] ?? { shape: '○', text: 'text-muted' });
</script>

<span
  data-shape={meta.shape}
  class="status-word inline-flex items-baseline gap-1 before:content-[attr(data-shape)_/_''] {meta.text}"
>
  <span class="uppercase">{displayLabels[status] ?? status}</span>
</span>