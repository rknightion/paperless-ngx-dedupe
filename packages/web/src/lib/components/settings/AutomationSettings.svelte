<script lang="ts">
  import type { AutomationSettings, ScheduleCadence, ScheduleTask } from '@paperless-dedupe/core';
  import { CalendarClock, Play } from 'lucide-svelte';
  import { untrack } from 'svelte';

  interface Props {
    settings: AutomationSettings;
  }

  type EditableSchedule = {
    enabled: boolean;
    cadenceKind: ScheduleCadence['kind'];
    intervalHours: 2 | 4 | 6 | 12;
    hour: number;
    minute: number;
    weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    timezone: string;
  };

  let { settings }: Props = $props();
  const initialSettings = untrack(() => settings);
  const tasks: ScheduleTask[] = ['sync', 'analysis', 'ai_processing'];
  const labels: Record<ScheduleTask, string> = {
    sync: 'Sync',
    analysis: 'Analysis',
    ai_processing: 'AI',
  };
  let schedules = $state(
    Object.fromEntries(
      tasks.map((task) => {
        const schedule = initialSettings.schedules[task];
        return [
          task,
          {
            enabled: schedule.enabled,
            cadenceKind: schedule.cadence.kind,
            intervalHours: schedule.cadence.kind === 'interval' ? schedule.cadence.hours : 4,
            hour:
              schedule.cadence.kind === 'daily' || schedule.cadence.kind === 'weekly'
                ? schedule.cadence.hour
                : 3,
            minute:
              schedule.cadence.kind === 'daily' || schedule.cadence.kind === 'weekly'
                ? schedule.cadence.minute
                : 0,
            weekday: schedule.cadence.kind === 'weekly' ? schedule.cadence.weekday : 1,
            timezone: schedule.timezone,
          },
        ];
      }),
    ) as Record<ScheduleTask, EditableSchedule>,
  );
  let monthlyBudgetUsd = $state(initialSettings.ai.monthlyBudgetUsd);
  let maxDocumentsPerRun = $state(initialSettings.ai.maxDocumentsPerRun);
  let busy = $state<ScheduleTask | null>(null);
  let statuses = $state<Partial<Record<ScheduleTask, { ok: boolean; message: string }>>>({});

  function cadence(task: ScheduleTask): ScheduleCadence {
    const value = schedules[task];
    switch (value.cadenceKind) {
      case 'manual':
        return { kind: 'manual' };
      case 'interval':
        return { kind: 'interval', hours: value.intervalHours };
      case 'daily':
        return { kind: 'daily', hour: Number(value.hour), minute: Number(value.minute) };
      case 'weekly':
        return {
          kind: 'weekly',
          weekday: Number(value.weekday) as 0 | 1 | 2 | 3 | 4 | 5 | 6,
          hour: Number(value.hour),
          minute: Number(value.minute),
        };
    }
  }

  async function save(task: ScheduleTask) {
    busy = task;
    statuses[task] = undefined;
    const value = schedules[task];
    try {
      const response = await fetch('/api/v1/automation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task,
          enabled: value.enabled,
          cadence: cadence(task),
          timezone: value.timezone,
          ...(task === 'ai_processing' ? { ai: { monthlyBudgetUsd, maxDocumentsPerRun } } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Schedule could not be saved');
      statuses[task] = { ok: true, message: `${labels[task]} schedule saved` };
    } catch (error) {
      statuses[task] = {
        ok: false,
        message: error instanceof Error ? error.message : 'Schedule could not be saved',
      };
    } finally {
      busy = null;
    }
  }

  async function runNow(task: ScheduleTask) {
    busy = task;
    statuses[task] = undefined;
    try {
      const response = await fetch('/api/v1/automation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Manual run could not start');
      statuses[task] = { ok: true, message: `${labels[task]} run started` };
    } catch (error) {
      statuses[task] = {
        ok: false,
        message: error instanceof Error ? error.message : 'Manual run could not start',
      };
    } finally {
      busy = null;
    }
  }
</script>

<section class="panel" id="automation" aria-label="Automation schedules">
  <div class="flex items-start gap-3">
    <CalendarClock class="text-accent mt-0.5 h-5 w-5 shrink-0" />
    <div>
      <h2 class="text-ink text-lg font-semibold">Safe automation</h2>
      <p class="text-muted mt-1 text-sm">
        Schedule safe local work. Manual runs do not alter these schedules.
      </p>
    </div>
  </div>

  <div class="mt-5 grid gap-4 lg:grid-cols-3">
    {#each tasks as task (task)}
      <fieldset class="panel-inset space-y-4" aria-describedby={`${task}-schedule-help`}>
        <legend class="text-ink px-1 text-sm font-semibold">{labels[task]} schedule</legend>
        <p id={`${task}-schedule-help`} class="text-muted text-xs">
          {#if task === 'sync'}
            Fetch new and changed Paperless documents.
          {:else if task === 'analysis'}
            Recalculate duplicate analysis safely.
          {:else}
            AI suggestions are review-only. Nothing is applied to Paperless automatically.
          {/if}
        </p>

        <label class="text-ink flex items-center gap-2 text-sm">
          <input type="checkbox" bind:checked={schedules[task].enabled} />
          Enable {labels[task].toLowerCase()} scheduling
        </label>

        <label class="text-ink block text-sm" for={`${task}-cadence`}>
          {labels[task]} cadence
        </label>
        <select
          id={`${task}-cadence`}
          bind:value={schedules[task].cadenceKind}
          class="border-soft bg-surface text-ink w-full rounded-lg border px-3 py-2 text-sm"
        >
          <option value="manual">Manual only</option>
          <option value="interval">Interval</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>

        {#if schedules[task].cadenceKind === 'interval'}
          <label class="text-ink block text-sm" for={`${task}-interval`}>Interval hours</label>
          <select
            id={`${task}-interval`}
            bind:value={schedules[task].intervalHours}
            class="border-soft bg-surface text-ink w-full rounded-lg border px-3 py-2 text-sm"
          >
            <option value={2}>2 hours</option>
            <option value={4}>4 hours</option>
            <option value={6}>6 hours</option>
            <option value={12}>12 hours</option>
          </select>
        {:else if schedules[task].cadenceKind === 'daily' || schedules[task].cadenceKind === 'weekly'}
          {#if schedules[task].cadenceKind === 'weekly'}
            <label class="text-ink block text-sm" for={`${task}-weekday`}>Weekday</label>
            <select
              id={`${task}-weekday`}
              bind:value={schedules[task].weekday}
              class="border-soft bg-surface text-ink w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value={0}>Sunday</option>
              <option value={1}>Monday</option>
              <option value={2}>Tuesday</option>
              <option value={3}>Wednesday</option>
              <option value={4}>Thursday</option>
              <option value={5}>Friday</option>
              <option value={6}>Saturday</option>
            </select>
          {/if}
          <div class="grid grid-cols-2 gap-3">
            <label class="text-ink text-sm" for={`${task}-hour`}>
              Hour
              <input
                id={`${task}-hour`}
                type="number"
                min="0"
                max="23"
                bind:value={schedules[task].hour}
                class="border-soft bg-surface text-ink mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
            <label class="text-ink text-sm" for={`${task}-minute`}>
              Minute
              <input
                id={`${task}-minute`}
                type="number"
                min="0"
                max="59"
                bind:value={schedules[task].minute}
                class="border-soft bg-surface text-ink mt-1 w-full rounded-lg border px-3 py-2"
              />
            </label>
          </div>
        {/if}

        <label class="text-ink block text-sm" for={`${task}-timezone`}>
          {labels[task]} timezone
        </label>
        <input
          id={`${task}-timezone`}
          bind:value={schedules[task].timezone}
          autocomplete="off"
          class="border-soft bg-surface text-ink w-full rounded-lg border px-3 py-2 text-sm"
        />

        {#if task === 'ai_processing'}
          <label class="text-ink block text-sm" for="ai-monthly-budget">
            AI monthly budget (USD)
          </label>
          <input
            id="ai-monthly-budget"
            type="number"
            min="0"
            step="0.01"
            bind:value={monthlyBudgetUsd}
            class="border-soft bg-surface text-ink w-full rounded-lg border px-3 py-2 text-sm"
          />
          <label class="text-ink block text-sm" for="ai-document-cap"
            >Maximum documents per run</label
          >
          <input
            id="ai-document-cap"
            type="number"
            min="1"
            max="10000"
            bind:value={maxDocumentsPerRun}
            class="border-soft bg-surface text-ink w-full rounded-lg border px-3 py-2 text-sm"
          />
        {/if}

        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            onclick={() => save(task)}
            disabled={busy !== null}
            class="bg-accent hover:bg-accent-hover rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Save {labels[task]} schedule
          </button>
          <button
            type="button"
            onclick={() => runNow(task)}
            disabled={busy !== null}
            class="border-soft text-ink inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            <Play class="h-4 w-4" /> Run now
          </button>
        </div>
        {#if statuses[task]}
          <p
            role={statuses[task]?.ok ? 'status' : 'alert'}
            aria-live="polite"
            class={statuses[task]?.ok ? 'text-success text-sm' : 'text-ember text-sm'}
          >
            {statuses[task]?.message}
          </p>
        {/if}
      </fieldset>
    {/each}
  </div>
</section>
