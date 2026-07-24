import {
  collectDiagnostics,
  serializeDiagnostics,
} from '@paperless-dedupe/core/diagnostics/collect';
import packageMetadata from '../../../../../../../package.json';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const bundle = collectDiagnostics(locals.sqlite, {
    versions: {
      application: packageMetadata.version,
      node: process.versions.node,
    },
    featureFlags: {
      aiProcessing: locals.config.AI_ENABLED,
      paperlessMetrics: locals.config.PAPERLESS_METRICS_ENABLED,
      frontendTelemetry: locals.config.FARO_ENABLED,
      continuousProfiling: locals.config.PYROSCOPE_ENABLED,
    },
    readiness: {
      paperless: 'configured',
      ai: locals.config.AI_ENABLED ? 'configured' : 'disabled',
    },
  });

  return new Response(serializeDiagnostics(bundle), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="paperless-ngx-dedupe-diagnostics.json"',
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
