import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  collectDiagnostics: vi.fn(),
  serializeDiagnostics: vi.fn(),
}));

vi.mock('@paperless-dedupe/core/diagnostics/collect', () => ({
  collectDiagnostics: mocks.collectDiagnostics,
  serializeDiagnostics: mocks.serializeDiagnostics,
}));

import { GET } from './+server';

describe('diagnostics support bundle API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.collectDiagnostics.mockReturnValue({ formatVersion: 1 });
    mocks.serializeDiagnostics.mockReturnValue('{"formatVersion":1}\n');
  });

  it('downloads a deterministic no-store JSON attachment without passing secrets to the collector', async () => {
    const response = await GET({
      locals: {
        sqlite: { privatePath: '/srv/private/paperless.db' },
        config: {
          PAPERLESS_URL: 'http://paperless.internal:8000',
          PAPERLESS_API_TOKEN: 'paperless-token-secret',
          PAPERLESS_PASSWORD: 'paperless-password-secret',
          AI_OPENAI_API_KEY: 'openai-key-secret',
          AI_ENABLED: true,
          PAPERLESS_METRICS_ENABLED: true,
          FARO_ENABLED: false,
          PYROSCOPE_ENABLED: true,
        },
      },
    } as never);

    expect(mocks.collectDiagnostics).toHaveBeenCalledOnce();
    expect(mocks.collectDiagnostics).toHaveBeenCalledWith(
      { privatePath: '/srv/private/paperless.db' },
      {
        versions: {
          application: '0.15.0',
          node: expect.stringMatching(/^\d+\.\d+\.\d+/),
        },
        featureFlags: {
          aiProcessing: true,
          paperlessMetrics: true,
          frontendTelemetry: false,
          continuousProfiling: true,
        },
        readiness: {
          paperless: 'configured',
          ai: 'configured',
        },
      },
    );
    const collectorInput = JSON.stringify(mocks.collectDiagnostics.mock.calls[0]?.[1]);
    expect(collectorInput).not.toContain('paperless.internal');
    expect(collectorInput).not.toContain('paperless-token-secret');
    expect(collectorInput).not.toContain('paperless-password-secret');
    expect(collectorInput).not.toContain('openai-key-secret');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="paperless-ngx-dedupe-diagnostics.json"',
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    await expect(response.text()).resolves.toBe('{"formatVersion":1}\n');
  });

  it('reports disabled AI readiness without exposing why it is disabled', async () => {
    await GET({
      locals: {
        sqlite: {},
        config: {
          PAPERLESS_URL: 'http://private.example',
          PAPERLESS_API_TOKEN: 'secret',
          AI_ENABLED: false,
          PAPERLESS_METRICS_ENABLED: false,
          FARO_ENABLED: false,
          PYROSCOPE_ENABLED: false,
        },
      },
    } as never);

    expect(mocks.collectDiagnostics).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        readiness: {
          paperless: 'configured',
          ai: 'disabled',
        },
      }),
    );
  });
});
