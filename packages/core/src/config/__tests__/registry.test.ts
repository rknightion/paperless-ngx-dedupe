import { describe, expect, it } from 'vitest';

import {
  CONFIG_REGISTRY,
  ConfigValidationError,
  coerceConfigBatch,
  getConfigMetadata,
} from '../registry.js';
import { DEFAULT_AI_CONFIG } from '../../ai/types.js';
import { DEFAULT_DEDUP_CONFIG } from '../../dedup/types.js';

describe('typed configuration registry', () => {
  it('is deterministic and describes every mutable database key', () => {
    const keys = CONFIG_REGISTRY.map((entry) => entry.key);

    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(keys.length);
    expect(CONFIG_REGISTRY).toContainEqual(
      expect.objectContaining({
        key: 'ai.extractCustomFields',
        type: 'boolean',
        default: false,
        sensitive: false,
        section: 'ai',
        source: 'database',
        readOnly: false,
      }),
    );
    expect(CONFIG_REGISTRY).toContainEqual(
      expect.objectContaining({
        key: 'automation.aiMonthlyBudgetUsd',
        type: 'number',
        default: 0,
        section: 'automation',
        source: 'database',
        readOnly: false,
      }),
    );
    expect(CONFIG_REGISTRY).toContainEqual(
      expect.objectContaining({
        key: 'dedup.similarityThreshold',
        type: 'number',
        default: 0.75,
        section: 'deduplication',
        source: 'database',
        readOnly: false,
      }),
    );
  });

  it('covers every current AI and dedup configuration field', () => {
    const registered = new Set(CONFIG_REGISTRY.map((entry) => entry.key));

    expect(Object.keys(DEFAULT_AI_CONFIG).every((key) => registered.has(`ai.${key}`))).toBe(true);
    expect(Object.keys(DEFAULT_DEDUP_CONFIG).every((key) => registered.has(`dedup.${key}`))).toBe(
      true,
    );
  });

  it('coerces known values to their canonical storage representation', () => {
    expect(
      coerceConfigBatch({
        'ai.extractCustomFields': true,
        'ai.batchSize': '050',
        'dedup.similarityThreshold': '0.80',
        'ai.protectedTagNames': ['email', 'inbox'],
      }),
    ).toEqual({
      'ai.batchSize': '50',
      'ai.extractCustomFields': 'true',
      'ai.protectedTagNames': '["email","inbox"]',
      'dedup.similarityThreshold': '0.8',
    });
  });

  it.each([
    ['ai.extractCustomFields', 'yes'],
    ['ai.batchSize', '1e2'],
    ['dedup.similarityThreshold', 'NaN'],
    ['ai.protectedTagNames', ['email', 7]],
  ])('rejects invalid value for %s', (key, value) => {
    expect(() => coerceConfigBatch({ [key]: value })).toThrow(ConfigValidationError);
  });

  it.each([
    'unknown.setting',
    '__proto__',
    'constructor',
    'prototype',
    'ai.__proto__',
    'ai．batchSize',
    'аi.batchSize',
    'AI.batchSize',
  ])('rejects unknown, prototype-pollution, or confusable key %s', (key) => {
    const input = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(input, key, { value: '1', enumerable: true });

    expect(() => coerceConfigBatch(input)).toThrow(ConfigValidationError);
  });

  it('publishes deterministic read-only metadata for environment-owned settings', () => {
    const metadata = getConfigMetadata();
    const environment = metadata.filter((entry) => entry.source === 'environment');

    expect(environment).toContainEqual(
      expect.objectContaining({
        key: 'PAPERLESS_URL',
        type: 'string',
        source: 'environment',
        readOnly: true,
        sensitive: true,
      }),
    );
    expect(environment).toContainEqual(
      expect.objectContaining({
        key: 'AI_OPENAI_API_KEY',
        source: 'environment',
        readOnly: true,
        sensitive: true,
      }),
    );
    expect(metadata.map((entry) => entry.key)).toEqual(
      [...metadata].map((entry) => entry.key).sort(),
    );
    expect(() => coerceConfigBatch({ PAPERLESS_URL: 'https://example.test' })).toThrow(
      ConfigValidationError,
    );
  });

  it('represents every runtime-owned OpenTelemetry setting without values', () => {
    const metadata = getConfigMetadata();
    const otel = metadata.filter((entry) => entry.key.startsWith('OTEL_'));

    expect(otel.map((entry) => entry.key)).toEqual([
      'OTEL_DEPLOYMENT_ENVIRONMENT',
      'OTEL_ENABLED',
      'OTEL_EXPORTER_OTLP_COMPRESSION',
      'OTEL_EXPORTER_OTLP_ENDPOINT',
      'OTEL_EXPORTER_OTLP_HEADERS',
      'OTEL_EXPORTER_OTLP_LOGS_COMPRESSION',
      'OTEL_EXPORTER_OTLP_LOGS_ENDPOINT',
      'OTEL_EXPORTER_OTLP_LOGS_HEADERS',
      'OTEL_EXPORTER_OTLP_LOGS_PROTOCOL',
      'OTEL_EXPORTER_OTLP_METRICS_COMPRESSION',
      'OTEL_EXPORTER_OTLP_METRICS_ENDPOINT',
      'OTEL_EXPORTER_OTLP_METRICS_HEADERS',
      'OTEL_EXPORTER_OTLP_METRICS_PROTOCOL',
      'OTEL_EXPORTER_OTLP_PROTOCOL',
      'OTEL_EXPORTER_OTLP_TRACES_COMPRESSION',
      'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT',
      'OTEL_EXPORTER_OTLP_TRACES_HEADERS',
      'OTEL_EXPORTER_OTLP_TRACES_PROTOCOL',
      'OTEL_LOGS_EXPORTER',
      'OTEL_LOG_LEVEL',
      'OTEL_METRICS_EXPORTER',
      'OTEL_METRIC_EXPORT_INTERVAL',
      'OTEL_PROMETHEUS_ENABLED',
      'OTEL_PROPAGATORS',
      'OTEL_RESOURCE_ATTRIBUTES',
      'OTEL_SEMCONV_STABILITY_OPT_IN',
      'OTEL_SERVICE_INSTANCE_ID',
      'OTEL_SERVICE_NAME',
      'OTEL_SERVICE_NAMESPACE',
      'OTEL_TRACES_EXPORTER',
      'OTEL_TRACES_SAMPLER',
      'OTEL_TRACES_SAMPLER_ARG',
    ]);
    expect(otel).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'OTEL_ENABLED',
          type: 'boolean',
          source: 'environment',
          readOnly: true,
          default: false,
        }),
        expect.objectContaining({
          key: 'OTEL_PROMETHEUS_ENABLED',
          type: 'boolean',
          source: 'environment',
          readOnly: true,
          default: false,
        }),
        expect.objectContaining({
          key: 'OTEL_SERVICE_NAME',
          type: 'string',
          source: 'environment',
          readOnly: true,
          default: 'paperless-ngx-dedupe',
        }),
        expect.objectContaining({
          key: 'OTEL_SERVICE_INSTANCE_ID',
          source: 'environment',
          readOnly: true,
          sensitive: false,
        }),
      ]),
    );
    for (const key of [
      'OTEL_EXPORTER_OTLP_HEADERS',
      'OTEL_EXPORTER_OTLP_TRACES_HEADERS',
      'OTEL_EXPORTER_OTLP_METRICS_HEADERS',
      'OTEL_EXPORTER_OTLP_LOGS_HEADERS',
    ]) {
      expect(otel.find((entry) => entry.key === key)).toEqual(
        expect.objectContaining({ sensitive: true, readOnly: true }),
      );
    }
  });

  it.each([
    'not-a-map',
    '[]',
    '__proto__:\n  - unsafe',
    'constructor:\n  - unsafe',
    'prototype:\n  - unsafe',
  ])('rejects invalid or prototype-polluting tag alias YAML', (value) => {
    expect(() => coerceConfigBatch({ 'ai.tagAliasMap': value })).toThrow(ConfigValidationError);
  });

  it('does not expose sensitive environment defaults in metadata', () => {
    const serialized = JSON.stringify(getConfigMetadata());

    expect(serialized).not.toContain('sk-secret');
    expect(
      getConfigMetadata().find((entry) => entry.key === 'AI_OPENAI_API_KEY'),
    ).not.toHaveProperty('default');
  });
});
