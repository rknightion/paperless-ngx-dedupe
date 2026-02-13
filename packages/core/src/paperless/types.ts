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
}

export interface DocumentMetadata {
  originalChecksum: string;
  originalSize: number;
  originalMimeType: string;
  mediaFilename: string;
  hasArchiveVersion: boolean;
  archiveChecksum: string | null;
  archiveSize: number | null;
  archiveMediaFilename: string | null;
}

export interface PaperlessTag {
  id: number;
  name: string;
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
  matchingAlgorithm: number;
  match: string;
  documentCount: number;
}

export interface PaperlessDocumentType {
  id: number;
  name: string;
  matchingAlgorithm: number;
  match: string;
  documentCount: number;
}

export interface PaperlessStatistics {
  documentsTotal: number;
  documentsInbox: number;
  inboxTag: number | null;
  documentFileTypeCount: Array<{ mimeType: string; count: number }>;
  characterCount: number;
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
