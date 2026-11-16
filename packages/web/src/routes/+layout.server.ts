import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    aiEnabled: locals.config.AI_ENABLED,
    ...(locals.config.PAPERLESS_READ_ONLY ? { readOnly: true } : {}),
    faroEnabled: locals.config.FARO_ENABLED,
    faroCollectorUrl: locals.config.FARO_COLLECTOR_URL ?? '',
    faroServiceNamespace: locals.config.OTEL_SERVICE_NAMESPACE,
  };
};
