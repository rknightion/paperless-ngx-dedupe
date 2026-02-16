import { sql } from 'drizzle-orm';
import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const checks: Record<string, { status: string; error?: string }> = {};

  // Check database
  try {
    locals.db.run(sql`SELECT 1`);
    checks.database = { status: 'ok' };
  } catch (err) {
    checks.database = {
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown database error',
    };
  }

  // Check Paperless reachability
  try {
    const paperlessUrl = locals.config.PAPERLESS_URL;
    await fetch(paperlessUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });
    checks.paperless = { status: 'ok' };
  } catch (err) {
    checks.paperless = {
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown paperless error',
    };
  }

  const allOk = Object.values(checks).every((c) => c.status === 'ok');

  if (allOk) {
    return apiSuccess({ status: 'ready', checks });
  }

  return apiError(ErrorCode.NOT_READY, 'One or more checks failed', [checks], 503);
};
