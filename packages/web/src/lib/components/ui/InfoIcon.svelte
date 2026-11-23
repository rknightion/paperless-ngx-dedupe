<script lang="ts">
  import InfoGlyph from 'phosphor-svelte/lib/InfoIcon';
  import Tooltip from './Tooltip.svelte';

  interface Props {
    text: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
  }

  let { text, position = 'top' }: Props = $props();
</script>

<Tooltip {text} {position}>
  <InfoGlyph
    size={13}
    class="text-muted hover:text-accent inline-block shrink-0 cursor-help transition-colors"
    aria-hidden="true"
  />
</Tooltip>
