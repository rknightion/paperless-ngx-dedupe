import { createDuplicateDeletionPlan, DuplicateDeletionPreviewError } from '@paperless-dedupe/core';
import { z } from 'zod';

import { apiError, apiSuccess, ErrorCode } from '$lib/server/api';
import { RuntimeUnavailableError } from '$lib/server/scheduler';
import { getServerRuntime } from '../../../../../../runtime.server';
import type { RequestHandler } from './$types';

const bodySchema = z.object({
  groupIds: z.array(z.string().min(1)).min(1).max(50000),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  const runtime = await getServerRuntime();
  try {
    runtime.acceptingGate.assertAccepting();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(ErrorCode.VALIDATION_FAILED, {
        operation: 'preview_duplicate_deletion',
        retryable: false,
      });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError(ErrorCode.VALIDATION_FAILED, {
        operation: 'preview_duplicate_deletion',
        retryable: false,
        validationIssues: parsed.error.issues,
      });
    }

    return runtime.acceptingGate.run(() => {
      const preview = createDuplicateDeletionPlan(locals.db, parsed.data.groupIds);
      return apiSuccess({
        planToken: preview.token,
        expiresAt: preview.expiresAt,
        groupCount: preview.groups.length,
        documentCount: preview.groups.reduce(
          (total, group) => total + group.nonPrimaryDocuments.length,
          0,
        ),
        groups: preview.groups,
      });
    });
  } catch (error) {
    if (error instanceof RuntimeUnavailableError) {
      return apiError(
        ErrorCode.SERVICE_UNAVAILABLE,
        { operation: 'preview_duplicate_deletion', retryable: true },
        503,
      );
    }
    if (error instanceof DuplicateDeletionPreviewError) {
      return apiError(ErrorCode.VALIDATION_FAILED, {
        operation: 'preview_duplicate_deletion',
        retryable: false,
      });
    }
    throw error;
  }
};
