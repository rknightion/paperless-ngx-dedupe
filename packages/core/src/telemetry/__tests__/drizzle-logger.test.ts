import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { context, trace, ROOT_CONTEXT } from '@opentelemetry/api';
import { createRequire } from 'node:module';
import {
  logs,
  SeverityNumber,
  type LoggerProvider as ApiLoggerProvider,
} from '@opentelemetry/api-logs';
import { NodeSDK, type NodeSDKConfiguration } from '@opentelemetry/sdk-node';
import { OtelDrizzleLogger } from '../drizzle-logger.js';

type LogRecord = Parameters<
  NonNullable<NodeSDKConfiguration['logRecordProcessors']>[number]['onEmit']
>[0];
const sdkRequire = createRequire(import.meta.resolve('@opentelemetry/sdk-node'));
// Exercise the SDK's installed LoggerProvider without adding production dependencies.
const { LoggerProvider } = sdkRequire('@opentelemetry/sdk-logs') as {
  LoggerProvider: new (options: {
    processors: NonNullable<NodeSDKConfiguration['logRecordProcessors']>;
  }) => ApiLoggerProvider & { shutdown(): Promise<void> };
};
let provider: ApiLoggerProvider & { shutdown(): Promise<void> };
let records: LogRecord[];
let sdk: NodeSDK;
beforeEach(() => {
  records = [];
  provider = new LoggerProvider({
    processors: [
      {
        onEmit: (record) => {
          records.push(record);
        },
        forceFlush: async () => {},
        shutdown: async () => {},
      },
    ],
  });
  logs.setGlobalLoggerProvider(provider);
  sdk = new NodeSDK({
    autoDetectResources: false,
    metricReaders: [],
    logRecordProcessors: [],
    spanProcessors: [
      { onStart: () => {}, onEnd: () => {}, forceFlush: async () => {}, shutdown: async () => {} },
    ],
  });
  sdk.start();
});
afterEach(async () => {
  await sdk.shutdown();
  await provider.shutdown();
  logs.disable();
  trace.disable();
  context.disable();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
function insideSpan(run: () => void) {
  const span = trace.getTracer('synthetic-test').startSpan('query-test');
  expect(span.isRecording()).toBe(true);
  try {
    context.with(trace.setSpan(ROOT_CONTEXT, span), run);
  } finally {
    span.end();
  }
}
it('emits nothing and does not inspect the active span when disabled', () => {
  const active = vi.spyOn(trace, 'getActiveSpan');
  insideSpan(() => new OtelDrizzleLogger(false).logQuery('select 1', []));
  expect(records).toEqual([]);
  expect(active).not.toHaveBeenCalled();
});
it('emits one correlated record with unchanged attributes and severity when enabled', () => {
  insideSpan(() => new OtelDrizzleLogger(true).logQuery('  select 1', ['synthetic-parameter']));
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    body: 'db.query',
    severityNumber: SeverityNumber.INFO,
    severityText: 'INFO',
    attributes: {
      'db.system.name': 'sqlite',
      'db.operation.name': 'SELECT',
      'db.query.text': '  select 1',
    },
  });
  expect(records[0].spanContext?.traceId).toMatch(/^[a-f0-9]{32}$/);
  expect(JSON.stringify(records[0].attributes)).not.toContain('synthetic-parameter');
});
it('retains statement truncation and ignores missing recording spans', () => {
  const logger = new OtelDrizzleLogger(true);
  logger.logQuery('select 1', []);
  expect(records).toEqual([]);
  const query = 'select ' + 'x'.repeat(220);
  insideSpan(() => logger.logQuery(query, []));
  expect(records[0].attributes['db.query.text']).toBe(query.slice(0, 200) + '...');
});
it.each([
  ['debug', true],
  ['TRACE', true],
  ['info', false],
  ['warn', false],
  ['', false],
] as const)(
  'enables the database logger only for diagnostic LOG_LEVEL %s',
  async (level, enabled) => {
    vi.stubEnv('LOG_LEVEL', level);
    vi.resetModules();
    const { createDatabaseWithHandle } = await import('../../db/client.js');
    const { db, sqlite } = createDatabaseWithHandle(':memory:');
    try {
      insideSpan(() => db.run('select 1'));
      expect(records).toHaveLength(enabled ? 1 : 0);
    } finally {
      sqlite.close();
    }
  },
);
