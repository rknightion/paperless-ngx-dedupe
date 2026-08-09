<script lang="ts">
  import { activity } from '$lib/activity/ActivityStore.svelte';
  import type { ActivityJob } from '$lib/activity/types';

  let { jobs }: { jobs: ActivityJob[] } = $props();

  function jobName(type: string): string {
    return type.replaceAll('_', ' ');
  }

  function statusLabel(job: ActivityJob): string {
    if (job.connection === 'degraded') return 'Updates delayed';
    if (job.connection === 'reconnecting') return 'Reconnecting';
    return job.status;
  }
</script>

{#if jobs.length > 0}
  <section
    class="border-border bg-surface fixed right-4 bottom-4 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-xl border p-4 shadow-xl"
    aria-label="Activity"
  >
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-ink text-sm font-semibold">Activity</h2>
      <span class="text-muted text-xs">{jobs.length} active or recent</span>
    </div>
    <ul class="space-y-2">
      {#each jobs as job (job.id)}
        <li
          class="bg-canvas rounded-lg p-3"
          data-testid={`activity-job-${job.id}`}
          data-job-state={job.status}
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-ink text-sm font-medium capitalize">{jobName(job.type)}</p>
              <p class="text-muted text-xs">{statusLabel(job)}</p>
            </div>
            <button
              class="text-muted hover:text-ink text-xs underline"
              type="button"
              onclick={() => activity.dismiss(job.id)}
              aria-label={`Dismiss ${jobName(job.type)} activity`}
            >
              Dismiss
            </button>
          </div>
          <div class="bg-soft mt-2 h-1.5 overflow-hidden rounded-full" aria-hidden="true">
            <div
              class="bg-accent h-full transition-all"
              style={`width: ${Math.round(job.progress * 100)}%`}
            ></div>
          </div>
          {#if job.message}
            <p class="text-muted mt-2 truncate text-xs">{job.message}</p>
          {/if}
          {#if job.connection === 'degraded'}
            <p class="text-warn mt-2 text-xs">Live updates are delayed; status checks continue.</p>
          {/if}
          {#if job.diagnostics.length > 0}
            <div
              class="bg-warn-light text-warn mt-2 rounded p-2 text-xs"
              role="status"
              aria-label="Activity diagnostics"
            >
              <p class="font-medium">Activity diagnostics</p>
              <ul class="mt-1 list-disc pl-4">
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
