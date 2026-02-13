import { getDuplicateStats } from '@paperless-dedupe/core';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const stats = getDuplicateStats(locals.db);
  return { stats };
};
