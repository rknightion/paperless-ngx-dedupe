import type { Meter } from '@opentelemetry/api';
import type { PaperlessClient } from '../../paperless/client.js';
import type { PaperlessStatistics } from '../../paperless/types.js';
import type { Logger } from '../../logger.js';

export const METER_NAME = 'paperless-ngx';

export const COLLECTOR_IDS = [
  'status',
  'statistics',
  'document',
  'tag',
  'correspondent',
  'document_type',
  'storage_path',
  'group',
  'user',
  'remote_version',
] as const;

export type CollectorId = (typeof COLLECTOR_IDS)[number];

export interface CollectorContext {
  client: PaperlessClient;
  meter: Meter;
  logger: Logger;
  getStatistics(): Promise<PaperlessStatistics>;
}

export interface Collector {
  readonly id: CollectorId;
  register(ctx: CollectorContext): void;
  collect(ctx: CollectorContext): Promise<void>;
  shutdown?(): void;
}
