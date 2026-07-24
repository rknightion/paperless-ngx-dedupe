import { DEFAULT_AI_CONFIG } from '../ai/types.js';
import { validateTagAliasYaml } from '../ai/tag-alias-validation.js';
import { DEFAULT_DEDUP_CONFIG } from '../dedup/types.js';
import { DEFAULT_OTEL_SERVICE_NAME } from '../telemetry/constants.js';

export type ConfigValueType = 'boolean' | 'integer' | 'number' | 'string' | 'string-array';
export type ConfigSection =
  'advanced' | 'ai' | 'automation' | 'data' | 'deduplication' | 'observability' | 'paperless';
export type ConfigSource = 'database' | 'environment';

export interface ConfigRegistryEntry {
  key: string;
  type: ConfigValueType;
  default?: boolean | number | string | readonly string[];
  sensitive: boolean;
  section: ConfigSection;
  source: ConfigSource;
  readOnly: boolean;
  deprecated?: boolean;
}

type Validator = (value: unknown) => boolean;
type InternalRegistryEntry = ConfigRegistryEntry & { validate?: Validator };

export class ConfigValidationError extends Error {
  readonly key: string;
  readonly reason: 'invalid_key' | 'invalid_value' | 'read_only' | 'unknown_key';

  constructor(key: string, reason: ConfigValidationError['reason'], message: string) {
    super(message);
    this.name = 'ConfigValidationError';
    this.key = key;
    this.reason = reason;
  }
}

const finite =
  (minimum: number, maximum: number): Validator =>
  (value) =>
    typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
const integer =
  (minimum: number, maximum: number): Validator =>
  (value) =>
    finite(minimum, maximum)(value) && Number.isInteger(value);
const oneOf =
  (values: readonly string[]): Validator =>
  (value) =>
    typeof value === 'string' && values.includes(value);

function databaseEntry(
  key: string,
  type: ConfigValueType,
  defaultValue: ConfigRegistryEntry['default'],
  section: ConfigSection,
  validate?: Validator,
  options: { readOnly?: boolean; deprecated?: boolean } = {},
): InternalRegistryEntry {
  return {
    key,
    type,
    default: defaultValue,
    sensitive: false,
    section,
    source: 'database',
    readOnly: options.readOnly ?? false,
    ...(options.deprecated ? { deprecated: true } : {}),
    ...(validate ? { validate } : {}),
  };
}

function environmentEntry(
  key: string,
  type: ConfigValueType,
  section: ConfigSection,
  sensitive: boolean,
  defaultValue?: ConfigRegistryEntry['default'],
): InternalRegistryEntry {
  return {
    key,
    type,
    ...(sensitive || defaultValue === undefined ? {} : { default: defaultValue }),
    sensitive,
    section,
    source: 'environment',
    readOnly: true,
  };
}

const entries: InternalRegistryEntry[] = [
  databaseEntry('ai.addProcessedTag', 'boolean', DEFAULT_AI_CONFIG.addProcessedTag, 'ai'),
  databaseEntry(
    'ai.applyConcurrency',
    'integer',
    DEFAULT_AI_CONFIG.applyConcurrency,
    'ai',
    integer(1, 50),
  ),
  databaseEntry('ai.batchSize', 'integer', DEFAULT_AI_CONFIG.batchSize, 'ai', integer(1, 500)),
  databaseEntry(
    'ai.confidenceThresholdCorrespondent',
    'number',
    DEFAULT_AI_CONFIG.confidenceThresholdCorrespondent,
    'ai',
    finite(0, 1),
  ),
  databaseEntry(
    'ai.confidenceThresholdDocumentType',
    'number',
    DEFAULT_AI_CONFIG.confidenceThresholdDocumentType,
    'ai',
    finite(0, 1),
  ),
  databaseEntry(
    'ai.confidenceThresholdGlobal',
    'number',
    DEFAULT_AI_CONFIG.confidenceThresholdGlobal,
    'ai',
    finite(0, 1),
  ),
  databaseEntry(
    'ai.confidenceThresholdTags',
    'number',
    DEFAULT_AI_CONFIG.confidenceThresholdTags,
    'ai',
    finite(0, 1),
  ),
  databaseEntry(
    'ai.confidenceThresholdTitle',
    'number',
    DEFAULT_AI_CONFIG.confidenceThresholdTitle,
    'ai',
    finite(0, 1),
  ),
  databaseEntry('ai.extractCorrespondent', 'boolean', DEFAULT_AI_CONFIG.extractCorrespondent, 'ai'),
  databaseEntry('ai.extractCustomFields', 'boolean', DEFAULT_AI_CONFIG.extractCustomFields, 'ai'),
  databaseEntry('ai.extractDocumentType', 'boolean', DEFAULT_AI_CONFIG.extractDocumentType, 'ai'),
  databaseEntry('ai.extractTags', 'boolean', DEFAULT_AI_CONFIG.extractTags, 'ai'),
  databaseEntry('ai.extractTitle', 'boolean', DEFAULT_AI_CONFIG.extractTitle, 'ai'),
  databaseEntry('ai.flexProcessing', 'boolean', DEFAULT_AI_CONFIG.flexProcessing, 'ai'),
  databaseEntry(
    'ai.includeCorrespondents',
    'boolean',
    DEFAULT_AI_CONFIG.includeCorrespondents,
    'ai',
  ),
  databaseEntry('ai.includeDocumentTypes', 'boolean', DEFAULT_AI_CONFIG.includeDocumentTypes, 'ai'),
  databaseEntry('ai.includeTags', 'boolean', DEFAULT_AI_CONFIG.includeTags, 'ai'),
  databaseEntry(
    'ai.maxContentLength',
    'integer',
    DEFAULT_AI_CONFIG.maxContentLength,
    'ai',
    integer(500, 100_000),
  ),
  databaseEntry(
    'ai.maxOutputTokens',
    'integer',
    DEFAULT_AI_CONFIG.maxOutputTokens,
    'ai',
    integer(1, 100_000),
  ),
  databaseEntry('ai.maxRetries', 'integer', DEFAULT_AI_CONFIG.maxRetries, 'ai', integer(0, 20)),
  databaseEntry(
    'ai.model',
    'string',
    DEFAULT_AI_CONFIG.model,
    'ai',
    (value) => typeof value === 'string' && value.length > 0 && value.length <= 200,
  ),
  databaseEntry(
    'ai.processedTagName',
    'string',
    DEFAULT_AI_CONFIG.processedTagName,
    'ai',
    (value) => typeof value === 'string' && value.length > 0 && value.length <= 200,
  ),
  databaseEntry('ai.promptTemplate', 'string', DEFAULT_AI_CONFIG.promptTemplate, 'ai'),
  databaseEntry(
    'ai.protectedTagNames',
    'string-array',
    DEFAULT_AI_CONFIG.protectedTagNames,
    'ai',
    (value) =>
      Array.isArray(value) &&
      value.length <= 1_000 &&
      value.every((item) => typeof item === 'string' && item.length <= 200),
  ),
  databaseEntry('ai.protectedTagsEnabled', 'boolean', DEFAULT_AI_CONFIG.protectedTagsEnabled, 'ai'),
  databaseEntry('ai.provider', 'string', DEFAULT_AI_CONFIG.provider, 'ai', oneOf(['openai'])),
  databaseEntry(
    'ai.rateDelayMs',
    'integer',
    DEFAULT_AI_CONFIG.rateDelayMs,
    'ai',
    integer(0, 60_000),
  ),
  databaseEntry(
    'ai.reasoningEffort',
    'string',
    DEFAULT_AI_CONFIG.reasoningEffort,
    'ai',
    oneOf(['none', 'low', 'medium', 'high']),
  ),
  databaseEntry(
    'ai.tagAliasMap',
    'string',
    DEFAULT_AI_CONFIG.tagAliasMap,
    'ai',
    (value) => typeof value === 'string' && validateTagAliasYaml(value).valid,
  ),
  databaseEntry('ai.tagAliasesEnabled', 'boolean', DEFAULT_AI_CONFIG.tagAliasesEnabled, 'ai'),
  databaseEntry('automation.aiMaxDocumentsPerRun', 'integer', 25, 'automation', integer(1, 10_000)),
  databaseEntry('automation.aiMonthlyBudgetUsd', 'number', 0, 'automation', finite(0, 1_000_000)),
  databaseEntry('dedup.autoAnalyze', 'boolean', DEFAULT_DEDUP_CONFIG.autoAnalyze, 'deduplication'),
  databaseEntry(
    'dedup.confidenceWeightFuzzy',
    'integer',
    DEFAULT_DEDUP_CONFIG.confidenceWeightFuzzy,
    'deduplication',
    integer(0, 100),
  ),
  databaseEntry(
    'dedup.confidenceWeightJaccard',
    'integer',
    DEFAULT_DEDUP_CONFIG.confidenceWeightJaccard,
    'deduplication',
    integer(0, 100),
  ),
  databaseEntry(
    'dedup.discriminativePenaltyStrength',
    'integer',
    DEFAULT_DEDUP_CONFIG.discriminativePenaltyStrength,
    'deduplication',
    integer(0, 100),
  ),
  databaseEntry(
    'dedup.fuzzySampleSize',
    'integer',
    DEFAULT_DEDUP_CONFIG.fuzzySampleSize,
    'deduplication',
    integer(100, 100_000),
  ),
  databaseEntry(
    'dedup.minWords',
    'integer',
    DEFAULT_DEDUP_CONFIG.minWords,
    'deduplication',
    integer(1, 1_000),
  ),
  databaseEntry(
    'dedup.ngramSize',
    'integer',
    DEFAULT_DEDUP_CONFIG.ngramSize,
    'deduplication',
    integer(1, 10),
  ),
  databaseEntry(
    'dedup.numBands',
    'integer',
    DEFAULT_DEDUP_CONFIG.numBands,
    'deduplication',
    integer(1, 100),
  ),
  databaseEntry(
    'dedup.numPermutations',
    'integer',
    DEFAULT_DEDUP_CONFIG.numPermutations,
    'deduplication',
    integer(16, 1_024),
  ),
  databaseEntry(
    'dedup.similarityThreshold',
    'number',
    DEFAULT_DEDUP_CONFIG.similarityThreshold,
    'deduplication',
    finite(0, 1),
  ),
  environmentEntry('AI_BULK_ALL_ENABLED', 'boolean', 'ai', false, false),
  environmentEntry('AI_ENABLED', 'boolean', 'ai', false, false),
  environmentEntry('AI_OPENAI_API_KEY', 'string', 'ai', true),
  environmentEntry('AUTO_MIGRATE', 'boolean', 'advanced', false, true),
  environmentEntry('CORS_ALLOW_ORIGIN', 'string', 'advanced', false, ''),
  environmentEntry('DATABASE_URL', 'string', 'data', true),
  environmentEntry('FARO_COLLECTOR_URL', 'string', 'observability', true),
  environmentEntry('FARO_ENABLED', 'boolean', 'observability', false, false),
  environmentEntry('LOG_LEVEL', 'string', 'advanced', false, 'info'),
  environmentEntry('OTEL_DEPLOYMENT_ENVIRONMENT', 'string', 'observability', false),
  environmentEntry('OTEL_ENABLED', 'boolean', 'observability', false, false),
  environmentEntry('OTEL_EXPORTER_OTLP_COMPRESSION', 'string', 'observability', false),
  environmentEntry('OTEL_EXPORTER_OTLP_ENDPOINT', 'string', 'observability', false),
  environmentEntry('OTEL_EXPORTER_OTLP_HEADERS', 'string', 'observability', true),
  environmentEntry('OTEL_EXPORTER_OTLP_LOGS_COMPRESSION', 'string', 'observability', false),
  environmentEntry('OTEL_EXPORTER_OTLP_LOGS_ENDPOINT', 'string', 'observability', false),
  environmentEntry('OTEL_EXPORTER_OTLP_LOGS_HEADERS', 'string', 'observability', true),
  environmentEntry('OTEL_EXPORTER_OTLP_LOGS_PROTOCOL', 'string', 'observability', false),
  environmentEntry('OTEL_EXPORTER_OTLP_METRICS_COMPRESSION', 'string', 'observability', false),
  environmentEntry('OTEL_EXPORTER_OTLP_METRICS_ENDPOINT', 'string', 'observability', false),
  environmentEntry('OTEL_EXPORTER_OTLP_METRICS_HEADERS', 'string', 'observability', true),
  environmentEntry('OTEL_EXPORTER_OTLP_METRICS_PROTOCOL', 'string', 'observability', false),
  environmentEntry('OTEL_EXPORTER_OTLP_PROTOCOL', 'string', 'observability', false),
  environmentEntry('OTEL_EXPORTER_OTLP_TRACES_COMPRESSION', 'string', 'observability', false),
  environmentEntry('OTEL_EXPORTER_OTLP_TRACES_ENDPOINT', 'string', 'observability', false),
  environmentEntry('OTEL_EXPORTER_OTLP_TRACES_HEADERS', 'string', 'observability', true),
  environmentEntry('OTEL_EXPORTER_OTLP_TRACES_PROTOCOL', 'string', 'observability', false),
  environmentEntry('OTEL_LOGS_EXPORTER', 'string', 'observability', false),
  environmentEntry('OTEL_LOG_LEVEL', 'string', 'observability', false),
  environmentEntry('OTEL_METRICS_EXPORTER', 'string', 'observability', false),
  environmentEntry('OTEL_METRIC_EXPORT_INTERVAL', 'integer', 'observability', false),
  environmentEntry('OTEL_PROMETHEUS_ENABLED', 'boolean', 'observability', false, false),
  environmentEntry('OTEL_PROPAGATORS', 'string', 'observability', false),
  environmentEntry('OTEL_RESOURCE_ATTRIBUTES', 'string', 'observability', false),
  environmentEntry('OTEL_SEMCONV_STABILITY_OPT_IN', 'string', 'observability', false),
  environmentEntry('OTEL_SERVICE_INSTANCE_ID', 'string', 'observability', false),
  environmentEntry(
    'OTEL_SERVICE_NAME',
    'string',
    'observability',
    false,
    DEFAULT_OTEL_SERVICE_NAME,
  ),
  environmentEntry('OTEL_SERVICE_NAMESPACE', 'string', 'observability', false, 'paperless-dedupe'),
  environmentEntry('OTEL_TRACES_EXPORTER', 'string', 'observability', false),
  environmentEntry('OTEL_TRACES_SAMPLER', 'string', 'observability', false),
  environmentEntry('OTEL_TRACES_SAMPLER_ARG', 'string', 'observability', false),
  environmentEntry('PAPERLESS_API_TOKEN', 'string', 'paperless', true),
  environmentEntry('PAPERLESS_METRICS_COLLECTORS', 'string', 'observability', false),
  environmentEntry('PAPERLESS_METRICS_ENABLED', 'boolean', 'observability', false, false),
  environmentEntry('PAPERLESS_PASSWORD', 'string', 'paperless', true),
  environmentEntry('PAPERLESS_URL', 'string', 'paperless', true),
  environmentEntry('PAPERLESS_USERNAME', 'string', 'paperless', true),
  environmentEntry('PORT', 'integer', 'advanced', false, 3000),
  environmentEntry('PYROSCOPE_BASIC_AUTH_PASSWORD', 'string', 'observability', true),
  environmentEntry('PYROSCOPE_BASIC_AUTH_USER', 'string', 'observability', true),
  environmentEntry('PYROSCOPE_ENABLED', 'boolean', 'observability', false, false),
  environmentEntry('PYROSCOPE_SERVER_ADDRESS', 'string', 'observability', true),
].sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));

export const CONFIG_REGISTRY: readonly ConfigRegistryEntry[] = Object.freeze(
  entries.map(({ validate: _validate, ...entry }) =>
    Object.freeze({
      ...entry,
      ...(Array.isArray(entry.default) ? { default: Object.freeze([...entry.default]) } : {}),
    }),
  ),
);

const registryByKey = new Map(entries.map((entry) => [entry.key, entry]));
const SAFE_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:[._][A-Za-z][A-Za-z0-9]*)*$/;

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function parseNumber(value: unknown, requireInteger: boolean): number | undefined {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (requireInteger && !Number.isInteger(value))) return undefined;
    return value;
  }
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) return undefined;
  const pattern = requireInteger ? /^-?\d+$/ : /^-?\d+(?:\.\d+)?$/;
  if (!pattern.test(value)) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (requireInteger && !Number.isInteger(parsed))) return undefined;
  return parsed;
}

function parseStringArray(value: unknown): string[] | undefined {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
    return undefined;
  }
  return [...parsed];
}

function coerceValue(entry: InternalRegistryEntry, input: unknown): string {
  let parsed: unknown;
  switch (entry.type) {
    case 'boolean':
      parsed = parseBoolean(input);
      break;
    case 'integer':
      parsed = parseNumber(input, true);
      break;
    case 'number':
      parsed = parseNumber(input, false);
      break;
    case 'string':
      parsed = typeof input === 'string' ? input : undefined;
      break;
    case 'string-array':
      parsed = parseStringArray(input);
      break;
  }
  if (parsed === undefined || (entry.validate && !entry.validate(parsed))) {
    throw new ConfigValidationError(
      entry.key,
      'invalid_value',
      `Invalid value for configuration key "${entry.key}"`,
    );
  }
  if (entry.type === 'string-array') return JSON.stringify(parsed);
  return String(parsed);
}

export function coerceConfigBatch(input: Record<string, unknown>): Record<string, string> {
  const output: Record<string, string> = {};
  for (const key of Object.keys(input).sort()) {
    if (!SAFE_KEY_PATTERN.test(key)) {
      throw new ConfigValidationError(key, 'invalid_key', `Invalid configuration key "${key}"`);
    }
    const entry = registryByKey.get(key);
    if (!entry) {
      throw new ConfigValidationError(key, 'unknown_key', `Unknown configuration key "${key}"`);
    }
    if (entry.readOnly || entry.source !== 'database') {
      throw new ConfigValidationError(key, 'read_only', `Configuration key "${key}" is read-only`);
    }
    output[key] = coerceValue(entry, input[key]);
  }
  return output;
}

export function getConfigMetadata(): readonly ConfigRegistryEntry[] {
  return CONFIG_REGISTRY;
}

export function isRegisteredConfigKey(key: string): boolean {
  return registryByKey.has(key);
}
