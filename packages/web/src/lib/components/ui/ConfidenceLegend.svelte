<script lang="ts">
  import { BAND_META, HIGH_MIN, MEDIUM_MIN } from './confidence';

  interface Props {
    class?: string;
  }

  let { class: className = '' }: Props = $props();

  const high = Math.round(HIGH_MIN * 100);
  const medium = Math.round(MEDIUM_MIN * 100);
</script>

<!-- The band legend. Print it once per screen, next to the headline score. -->
<p class="text-muted font-mono text-xs tabular-nums {className}">
  <span class={BAND_META.high.text}>{BAND_META.high.shape}</span> HIGH &gt;= {high}
  &middot;
  <span class={BAND_META.medium.text}>{BAND_META.medium.shape}</span> MEDIUM {medium}-{high}
  &middot;
  <span class={BAND_META.low.text}>{BAND_META.low.shape}</span> LOW &lt; {medium}
</p>
