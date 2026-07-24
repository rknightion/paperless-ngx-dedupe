import { randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { AppDatabase } from '../db/client.js';
import {
  beginCustomFieldDiscoveryRun,
  completeCustomFieldDiscoveryRun,
  createCustomFieldDiscoverySource,
  failCustomFieldDiscoveryRun,
} from './custom-field-discovery-store.js';
import { scanCustomFieldCandidatesV2 } from './custom-field-discovery-v2.js';

const MAX_EXISTING_FIELDS = 100;
const MAX_FIELD_NAME_LENGTH = 100;

export interface CustomFieldDiscoveryTaskData {
  existingFieldNames: string[];
}

export interface RunCustomFieldDiscoveryOperationOptions {
  sqlite: Database.Database;
  db: AppDatabase;
  jobId: string;
  taskData: unknown;
  onProgress(progress: number, message: string): Promise<void> | void;
  now?: () => Date;
  opaqueToken?: string;
  signal?: AbortSignal;
}

export interface CustomFieldDiscoveryOperationSummary {
  discoveryKey: string;
  candidates: number;
  documentsScanned: number;
}

function parseTaskData(value: unknown): CustomFieldDiscoveryTaskData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid custom-field discovery task data');
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 1 ||
    !Array.isArray(record.existingFieldNames) ||
    record.existingFieldNames.length > MAX_EXISTING_FIELDS
  ) {
    throw new TypeError('Invalid custom-field discovery task data');
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const field of record.existingFieldNames) {
    if (typeof field !== 'string') {
      throw new TypeError('Invalid custom-field discovery task data');
    }
    const name = field.trim();
    const key = name.toLocaleLowerCase('en-US');
    if (!name || name.length > MAX_FIELD_NAME_LENGTH || seen.has(key)) {
      throw new TypeError('Invalid custom-field discovery task data');
    }
    seen.add(key);
    normalized.push(name);
  }
  return { existingFieldNames: normalized };
}

export async function runCustomFieldDiscoveryOperation(
  options: RunCustomFieldDiscoveryOperationOptions,
): Promise<CustomFieldDiscoveryOperationSummary> {
  const taskData = parseTaskData(options.taskData);
  const now = options.now ?? (() => new Date());
  const source = createCustomFieldDiscoverySource(
    options.sqlite,
    options.opaqueToken ?? randomBytes(32).toString('hex'),
  );
  const discoveryKey = beginCustomFieldDiscoveryRun(
    options.sqlite,
    options.jobId,
    source.snapshot.fingerprint,
    now().toISOString(),
  );

  try {
    await options.onProgress(0, 'Scanning local OCR for recurring fields');
    const result = await scanCustomFieldCandidatesV2(source, {
      existingFieldNames: taskData.existingFieldNames,
      signal: options.signal,
    });
    completeCustomFieldDiscoveryRun(options.sqlite, options.jobId, result, now().toISOString());
    await options.onProgress(1, 'Custom-field recommendations ready');
    return {
      discoveryKey,
      candidates: result.candidates.length,
      documentsScanned: result.documentsScanned,
    };
  } catch (error) {
    failCustomFieldDiscoveryRun(options.sqlite, options.jobId, now().toISOString());
    throw error;
  }
}
