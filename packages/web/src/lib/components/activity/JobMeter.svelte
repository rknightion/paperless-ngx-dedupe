<script lang="ts">
  import type { ActivityJobStatus } from '$lib/activity/types';
  import { jobProgressPercent } from './job-status';

  interface Props {
    progress: number;
    status: ActivityJobStatus;
    /** 4px in a table cell or list row, 6px in a panel. */
    size?: 'cell' | 'panel';
  }

  let { progress, status, size = 'cell' }: Props = $props();

  const percent = $derived(jobProgressPercent(progress));
  const fill = $derived(
    status === 'completed' ? 'bg-success' : status === 'paused' ? 'bg-warn' : 'bg-accent',
  );
</script>

<!-- Decorative: the percentage beside it is the accessible value. Zero renders
     as nothing, never an empty track. -->
{#if percent > 0}
  <div
    class="w-full overflow-hidden {size === 'panel' ? 'h-1.5' : 'h-1'}"
    style="background: var(--furniture)"
    aria-hidden="true"
  >
    <div
      class="{fill} h-full transition-[width] duration-200 ease-out"
      style:width="{percent}%"
    ></div>
  </div>
{/if}
