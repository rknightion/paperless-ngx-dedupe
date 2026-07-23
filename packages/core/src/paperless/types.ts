export interface PaperlessConfig {
  url: string;
  token?: string;
  username?: string;
  password?: string;
  timeout?: number;
  maxRetries?: number;
}

export interface PaperlessDocument {
  id: number;
  title: string;
  content: string;
  tags: number[];
  correspondent: number | null;
  documentType: number | null;
  created: string;
  modified: string;
  added: string;
  originalFileName: string | null;
  archivedFileName: string | null;
  archiveSerialNumber: number | null;
  customFields: PaperlessCustomFieldInstance[];
}

export type PaperlessCustomFieldDataType =
  | 'string'
  | 'url'
  | 'date'
  | 'boolean'
  | 'integer'
  | 'float'
  | 'monetary'
  | 'documentlink'
  | 'select'
  | 'longtext';

export type PaperlessCustomFieldValue = string | number | boolean | number[] | null;

export interface PaperlessCustomFieldInstance {
  field: number;
  value: PaperlessCustomFieldValue;
}

export interface PaperlessCustomField {
  id: number;
  name: string;
  dataType: PaperlessCustomFieldDataType;
  extraData: {
    selectOptions: Array<{ id: string; label: string }>;
    defaultCurrency?: string | null;
  };
  documentCount: number;
}

export interface PaperlessTag {
  id: number;
  name: string;
  slug: string;
  color: string;
  textColor: string;
  isInboxTag: boolean;
  matchingAlgorithm: number;
  match: string;
  documentCount: number;
}

export interface PaperlessCorrespondent {
  id: number;
  name: string;
  slug: string;
  matchingAlgorithm: number;
  match: string;
  documentCount: number;
  lastCorrespondence: string | null;
}

export interface PaperlessDocumentType {
  id: number;
  name: string;
  slug: string;
  matchingAlgorithm: number;
  match: string;
  documentCount: number;
}

export interface PaperlessStatistics {
  documentsTotal: number;
  documentsInbox: number | null;
  inboxTag: number | null;
  documentFileTypeCount: Array<{ mimeType: string; count: number }>;
  characterCount: number;
  /** v3 entity counts — null when connected to a v2 instance */
  tagCount: number | null;
  correspondentCount: number | null;
  documentTypeCount: number | null;
  storagePathCount: number | null;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ConnectionTestResult {
  success: boolean;
  version?: string;
  documentCount?: number;
  error?: string;
}

export interface PaperlessStatus {
  pngxVersion: string | null;
  storageTotal: number;
  storageAvailable: number;
  databaseStatus: string;
  databaseUnappliedMigrations: number;
  redisStatus: string;
  celeryStatus: string;
  indexStatus: string;
  indexLastModified: string | null;
  classifierStatus: string;
  classifierLastTrained: string | null;
  sanityCheckStatus: string;
  sanityCheckLastRun: string | null;
}

export interface PaperlessStoragePath {
  id: number;
  name: string;
  slug: string;
  documentCount: number;
}

export interface PaperlessRemoteVersion {
  version: string;
  updateAvailable: boolean;
}

export interface DocumentUpdate {
  title?: string;
  correspondent?: number | null;
  documentType?: number | null;
  tags?: number[];
  customFields?: PaperlessCustomFieldInstance[];
}
