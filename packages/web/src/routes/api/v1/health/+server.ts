import { apiSuccess } from '$lib/server/api';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return apiSuccess({ status: 'ok', timestamp: new Date().toISOString() });
};
