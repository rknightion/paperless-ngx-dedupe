<script lang="ts">
  import type { ActivityJob } from '$lib/activity/types';

  let { jobs }: { jobs: ActivityJob[] } = $props();
  let announcement = $state('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastAnnouncementAt = 0;
  const announced = new Set<string>();

  function announce(message: string): void {
    const delay = Math.max(0, 2_000 - (Date.now() - lastAnnouncementAt));
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      announcement = message;
      lastAnnouncementAt = Date.now();
      timer = undefined;
    }, delay);
  }

  $effect(() => {
    for (const job of jobs) {
      if (job.status === 'completed' && !announced.has(job.id)) {
        announced.add(job.id);
        announce(`${job.type.replaceAll('_', ' ')} completed.`);
      }
    }
  });

  $effect(() => {
    return () => {
      if (timer) clearTimeout(timer);
    };
  });
</script>

<p class="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
