import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    aiEnabled: locals.config.AI_ENABLED,
  };
};
