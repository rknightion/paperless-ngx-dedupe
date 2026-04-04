import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    aiEnabled: locals.config.AI_ENABLED,
    ragEnabled: locals.config.RAG_ENABLED,
    faroEnabled: locals.config.FARO_ENABLED,
    faroCollectorUrl: locals.config.FARO_COLLECTOR_URL ?? '',
    faroServiceNamespace: locals.config.OTEL_SERVICE_NAMESPACE,
  };
};
