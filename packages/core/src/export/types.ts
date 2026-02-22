import type { DedupConfig } from '../dedup/types.js';

export interface DuplicateExportRow {
  groupId: string;
  confidenceScore: number;
  jaccardSimilarity: number | null;
  fuzzyTextRatio: number | null;
  groupStatus: string;
  isPrimary: boolean;
  paperlessId: number;
  title: string;
  correspondent: string | null;
  documentType: string | null;
  tags: string[];
  createdDate: string | null;
  wordCount: number | null;
  groupCreatedAt: string;
}

export interface ConfigBackup {
  version: string;
  exportedAt: string;
  appConfig: Record<string, string>;
  dedupConfig: DedupConfig;
}
