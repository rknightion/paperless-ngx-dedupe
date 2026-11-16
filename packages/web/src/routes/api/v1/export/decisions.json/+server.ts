import { exportDecisions } from '@paperless-dedupe/core/export/decisions';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const backup = exportDecisions(locals.db);
  const date = backup.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="paperless-ngx-dedupe-decisions-${date}.json"`,
      'Cache-Control': 'private, no-store',
    },
  });
};
