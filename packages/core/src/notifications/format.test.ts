import { describe, expect, it } from 'vitest';
import { formatJson, formatNtfy, formatApprise, type NotificationEvent } from './format.js';

const event: NotificationEvent = {
  event: 'duplicates.new',
  occurredAt: '2026-07-24T12:00:00.000Z',
  data: {
    jobId: 'synthetic-job',
    jobType: 'analysis',
    newGroups: 3,
    pendingGroups: 7,
    highConfidencePending: 2,
    url: 'https://app.example.test/duplicates',
  },
};

describe('notification formats', () => {
  it('sends the documented JSON counts and link without document data', () => {
    const input = { ...event, data: { ...event.data, title: 'Private synthetic title' } };
    const request = formatJson(input);
    expect(request.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(request.body)).toEqual(event);
    expect(request.body).not.toContain('Private synthetic title');
  });

  it('formats ntfy counts with title, tags and an optional click link', () => {
    const request = formatNtfy(event);
    expect(request.headers).toEqual({
      'Content-Type': 'text/plain; charset=utf-8',
      Title: 'New duplicate groups',
      Tags: 'mag',
      Click: 'https://app.example.test/duplicates',
    });
    expect(request.body).toBe(
      '3 new duplicate groups. 7 pending groups, including 2 high-confidence groups.',
    );
    expect(
      formatNtfy({ ...event, data: { jobId: 'synthetic-job', jobType: 'analysis', newGroups: 1 } })
        .headers,
    ).not.toHaveProperty('Click');
  });

  it('formats an Apprise JSON message with counts and the application link', () => {
    const request = formatApprise(event);
    expect(request.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(request.body)).toEqual({
      title: 'New duplicate groups',
      body: '3 new duplicate groups. 7 pending groups, including 2 high-confidence groups.\nhttps://app.example.test/duplicates',
      type: 'info',
    });
  });

  it('formats a job failure without copying an error or document title into the message', () => {
    const failed: NotificationEvent = {
      event: 'job.failed',
      occurredAt: event.occurredAt,
      data: { jobId: 'synthetic-failed-job', jobType: 'sync' },
    };
    const input = {
      ...failed,
      data: { ...failed.data, error: 'Private synthetic error', title: 'Private synthetic title' },
    };
    expect(JSON.parse(formatJson(input).body)).toEqual(failed);
    expect(formatNtfy(input)).toEqual({
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        Title: 'Job failed',
        Tags: 'warning',
      },
      body: 'A background job failed. Open Activity for details.',
    });
    expect(JSON.parse(formatApprise(input).body)).toEqual({
      title: 'Job failed',
      body: 'A background job failed. Open Activity for details.',
      type: 'failure',
    });
  });
});
