import { getNotificationSettings } from '@paperless-dedupe/core';
import { apiSuccess } from '$lib/server/api';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) =>
  apiSuccess({
    configured: Boolean(locals.config.NOTIFY_URL),
    format: locals.config.NOTIFY_FORMAT,
    events: getNotificationSettings(locals.db),
  });
