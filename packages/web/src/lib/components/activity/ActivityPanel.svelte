<script lang="ts">
  import { activity } from '$lib/activity/ActivityStore.svelte';
  import type { ActivityJob } from '$lib/activity/types';
  import JobMeter from './JobMeter.svelte';
  import { jobProgressPercent, jobStatusWord } from './job-status';

  let { jobs }: { jobs: ActivityJob[] } = $props();

  function jobName(type: string): string {
    return type.replaceAll('_', ' ');
  }
</script>

{#if jobs.length > 0}
  <section
    class="border-border-hover bg-surface-raised rounded-overlay fixed right-3 bottom-3 z-50 w-[min(24rem,calc(100vw-1.5rem))] border shadow-lg md:right-6 md:bottom-6"
    aria-label="Activity"
  >
    <div class="border-border flex items-center justify-between border-b px-4 py-3">
      <h2 class="text-ink text-lg font-semibold">Activity</h2>
      <span class="text-muted font-mono text-xs">{jobs.length} active or recent</span>
    </div>
    <ul class="divide-border divide-y">
      {#each jobs as job (job.id)}
        {@const word = jobStatusWord(job)}
        {@const percent = jobProgressPercent(job.progress)}
        <li class="px-4 py-3" data-testid={`activity-job-${job.id}`} data-job-state={job.status}>
          <div class="flex items-baseline justify-between gap-3">
            <div class="flex min-w-0 flex-wrap items-baseline gap-x-3">
              <span class="status-word {word.tone} uppercase">{word.shape} {word.label}</span>
              <span class="text-ink text-base font-medium capitalize">{jobName(job.type)}</span>
            </div>
            <div class="flex shrink-0 items-baseline gap-3">
              <span
                class="font-mono text-sm tabular-nums {percent > 0 ? 'text-ink' : 'text-muted'}"
              >
                {percent}%
              </span>
              <button
                class="text-muted hover:text-ink text-xs underline"
                type="button"
                onclick={() => activity.dismiss(job.id)}
                aria-label={`Dismiss ${jobName(job.type)} activity`}
              >
                Dismiss
              </button>
            </div>
          </div>
          <div class="mt-2">
            <JobMeter progress={job.progress} status={job.status} />
          </div>
          {#if job.message}
            <p class="text-muted mt-2 truncate text-sm">{job.message}</p>
          {/if}
          {#if job.connection === 'degraded'}
            <p class="text-warn mt-2 text-sm">Live updates are delayed; status checks continue.</p>
          {/if}
          {#if job.diagnostics.length > 0}
            <div
              class="border-border mt-2 border-t pt-2 text-sm"
              role="status"
              aria-label="Activity diagnostics"
            >
              <p class="status-word text-warn uppercase">◆ Activity diagnostics</p>
              <ul class="text-ink-light mt-1 list-disc pl-4">
                {#each job.diagnostics as diagnostic (diagnostic.occurredAt + diagnostic.code)}
                  <li>{diagnostic.message}</li>
                {/each}
              </ul>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}
