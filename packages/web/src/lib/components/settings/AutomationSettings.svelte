<script lang="ts">
  import {
    type AutomationSettings,
    type ScheduleCadence,
    type ScheduleTask,
    type getNotificationSettings,
    type AppConfig,
  } from '@paperless-dedupe/core';
  import PlayIcon from 'phosphor-svelte/lib/PlayIcon';
  import { Button, Checkbox, Select, TextField } from '$lib/components';
  import { onMount, untrack } from 'svelte';

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
  const statusClasses = {
    success: "border-success text-success before:content-['■_']",
    error: "border-ember text-ember before:content-['●_']",
  } as const;
  const tasks: ScheduleTask[] = ['sync', 'analysis', 'ai_processing'];
  const cadenceOptions = [
    { value: 'manual', label: 'Manual only' },
    { value: 'interval', label: 'Interval' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
  ];
  const intervalOptions = ['2', '4', '6', '12'].map((hours) => ({
    value: hours,
    label: `${hours} hours`,
  }));
  const weekdayOptions = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ].map((label, index) => ({ value: String(index), label }));
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

  let notifications = $state<{
    configured: boolean;
    format: AppConfig['NOTIFY_FORMAT'];
    events: ReturnType<typeof getNotificationSettings>;
  } | null>(null);
  let notificationLoadError = $state(false);
  let notificationBusy = $state<'save' | 'test' | null>(null);
  let notificationStatus = $state<{ ok: boolean; message: string } | null>(null);

  async function loadNotifications() {
    notificationLoadError = false;
    try {
      const response = await fetch('/api/v1/notifications');
      if (!response.ok) throw new Error('Unable to load notification preferences');
      notifications = (await response.json()).data;
    } catch {
      notificationLoadError = true;
    }
  }

  onMount(() => {
    void loadNotifications();
  });

  async function saveNotifications() {
    if (!notifications || notificationBusy) return;
    notificationBusy = 'save';
    notificationStatus = null;
    try {
      const response = await fetch('/api/v1/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: Object.fromEntries(
            Object.entries(notifications.events).map(([key, value]) => [
              `notifications.${key}`,
              value,
            ]),
          ),
        }),
      });
      if (!response.ok) throw new Error('Unable to save notification preferences');
      notificationStatus = { ok: true, message: 'Preferences saved' };
    } catch {
      notificationStatus = {
        ok: false,
        message: 'Unable to save notification preferences. Try again.',
      };
    } finally {
      notificationBusy = null;
    }
  }

  async function sendTestNotification() {
    if (!notifications?.configured || notificationBusy) return;
    notificationBusy = 'test';
    notificationStatus = null;
    try {
      const response = await fetch('/api/v1/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error('Unable to send test notification');
      const { data } = await response.json();
      notificationStatus = {
        ok: data.delivered,
        message: data.delivered
          ? 'Test notification delivered'
          : `Test notification not delivered${data.status === null ? '. No HTTP response received.' : ` (HTTP ${data.status}).`}`,
      };
    } catch {
      notificationStatus = { ok: false, message: 'Unable to send test notification. Try again.' };
    } finally {
      notificationBusy = null;
    }
  }

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
  <div>
    <h2 class="text-ink text-lg font-semibold">Safe automation</h2>
    <p class="text-muted mt-1 text-sm">
      Schedule safe local work. Manual runs do not alter these schedules.
    </p>
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

        <Checkbox
          bind:checked={schedules[task].enabled}
          label="Enable {labels[task].toLowerCase()} scheduling"
        />

        <Select
          id={`${task}-cadence`}
          label="{labels[task]} cadence"
          options={cadenceOptions}
          bind:value={
            () => schedules[task].cadenceKind,
            (value) => (schedules[task].cadenceKind = value as EditableSchedule['cadenceKind'])
          }
        />

        {#if schedules[task].cadenceKind === 'interval'}
          <Select
            id={`${task}-interval`}
            label="Interval hours"
            options={intervalOptions}
            bind:value={
              () => String(schedules[task].intervalHours),
              (value) => (schedules[task].intervalHours = Number(value) as 2 | 4 | 6 | 12)
            }
          />
        {:else if schedules[task].cadenceKind === 'daily' || schedules[task].cadenceKind === 'weekly'}
          {#if schedules[task].cadenceKind === 'weekly'}
            <Select
              id={`${task}-weekday`}
              label="Weekday"
              options={weekdayOptions}
              bind:value={
                () => String(schedules[task].weekday),
                (value) => (schedules[task].weekday = Number(value) as EditableSchedule['weekday'])
              }
            />
          {/if}
          <div class="grid grid-cols-2 gap-3">
            <TextField
              id={`${task}-hour`}
              label="Hour"
              type="number"
              min={0}
              max={23}
              bind:value={schedules[task].hour}
            />
            <TextField
              id={`${task}-minute`}
              label="Minute"
              type="number"
              min={0}
              max={59}
              bind:value={schedules[task].minute}
            />
          </div>
        {/if}

        <TextField
          id={`${task}-timezone`}
          label={`${labels[task]} timezone`}
          bind:value={schedules[task].timezone}
          autocomplete="off"
        />

        {#if task === 'ai_processing'}
          <TextField
            id="ai-monthly-budget"
            label="AI monthly budget (USD)"
            type="number"
            min={0}
            step={0.01}
            bind:value={monthlyBudgetUsd}
          />
          <TextField
            id="ai-document-cap"
            label="Maximum documents per run"
            type="number"
            min={1}
            max={10000}
            bind:value={maxDocumentsPerRun}
          />
        {/if}

        <div class="flex flex-wrap gap-2">
          <Button onclick={() => save(task)} disabled={busy !== null}>
            Save {labels[task]} schedule
          </Button>
          <Button
            variant="outline"
            icon={PlayIcon}
            onclick={() => runNow(task)}
            disabled={busy !== null}
          >
            Run now
          </Button>
        </div>
        {#if statuses[task]}
          <p
            role={statuses[task]?.ok ? 'status' : 'alert'}
            aria-live="polite"
            class="border-l-2 py-1 pl-3 text-sm {statuses[task]?.ok
              ? statusClasses.success
              : statusClasses.error}"
          >
            {statuses[task]?.message}
          </p>
        {/if}
      </fieldset>
    {/each}
  </div>
</section>

<section class="panel mt-6" aria-label="Notifications">
  <h2 class="text-ink text-lg font-semibold">Notifications</h2>
  <p class="text-muted mt-1 text-sm">
    Receive counts and a link after new duplicates or a failed job.
  </p>
  {#if notifications}
    <p class="text-muted mt-3 text-sm">
      {#if notifications.configured}
        Destination configured. Format: {notifications.format}.
      {:else}
        Set NOTIFY_URL in the deployment environment and restart to enable delivery.
      {/if}
    </p>
    <form
      class="mt-4 space-y-4"
      onsubmit={(event) => {
        event.preventDefault();
        void saveNotifications();
      }}
    >
      <fieldset disabled={notificationBusy !== null} class="space-y-4">
        <Checkbox
          bind:checked={notifications.events.onNewDuplicates}
          label="Notify when new duplicates are found"
        />
        <TextField
          id="notification-minimum"
          label="Minimum new groups"
          type="number"
          min={1}
          max={10000}
          step={1}
          required
          class="max-w-40"
          bind:value={notifications.events.minNewGroups}
        />
        <Checkbox
          bind:checked={notifications.events.onJobFailure}
          label="Notify when a job fails"
        />
        <Checkbox
          bind:checked={notifications.events.scheduledRunsOnly}
          label="Scheduled runs only"
        />
        <div class="flex flex-wrap gap-2">
          <Button type="submit">
            {notificationBusy === 'save' ? 'Saving…' : 'Save notification preferences'}
          </Button>
          <Button
            variant="outline"
            disabled={!notifications.configured}
            onclick={sendTestNotification}
          >
            {notificationBusy === 'test' ? 'Sending…' : 'Send test'}
          </Button>
        </div>
      </fieldset>
    </form>
    {#if notificationStatus}
      <p
        role={notificationStatus.ok ? 'status' : 'alert'}
        aria-live="polite"
        class="mt-3 border-l-2 py-1 pl-3 text-sm {notificationStatus.ok
          ? statusClasses.success
          : statusClasses.error}"
      >
        {notificationStatus.message}
      </p>
    {/if}
  {:else if notificationLoadError}
    <p role="alert" class="text-ember mt-3 text-sm">Unable to load notification preferences.</p>
    <Button variant="outline" class="mt-2" onclick={loadNotifications}>Retry</Button>
  {:else}
    <p role="status" class="text-muted mt-3 text-sm">Loading notification preferences…</p>
  {/if}
</section>
