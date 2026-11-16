import { z } from 'zod';
import { PRIMARY_STRATEGIES } from '@paperless-dedupe/core/dedup/types';

export const primarySelectionSchema = z
  .object({
    strategy: z.enum(PRIMARY_STRATEGIES),
    minConfidence: z.number().min(0).max(1).optional(),
    includeManual: z.boolean().default(false),
  })
  .strict();
