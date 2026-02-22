import type { AppDatabase } from '../db/client.js';
import type { PaperlessClient } from '../paperless/client.js';

export type SyncProgressCallback = (
  progress: number,
  message?: string,
  phaseProgress?: number,
) => Promise<void>;

export interface SyncOptions {
  forceFullSync?: boolean;
  purgeBeforeSync?: boolean;
  maxOcrLength?: number;
  pageSize?: number;
  onProgress?: SyncProgressCallback;
  signal?: AbortSignal;
}

export interface SyncResult {
  totalFetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  durationMs: number;
  syncType: 'full' | 'incremental';
}

export interface SyncDependencies {
  db: AppDatabase;
  client: PaperlessClient;
}

export interface ReferenceMaps {
  tags: Map<number, string>;
  correspondents: Map<number, string>;
  documentTypes: Map<number, string>;
}
