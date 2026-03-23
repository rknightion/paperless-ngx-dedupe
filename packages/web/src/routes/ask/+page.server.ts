import { redirect } from '@sveltejs/kit';
import { getConversations, getRagStats } from '@paperless-dedupe/core';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.config.RAG_ENABLED) {
    redirect(302, '/');
  }

  const stats = getRagStats(locals.db);
  const { conversations } = getConversations(locals.db, { limit: 50, offset: 0 });

  return {
    stats,
    conversations,
  };
};
