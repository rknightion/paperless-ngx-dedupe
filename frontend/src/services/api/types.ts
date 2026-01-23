import type { components } from './generated';

// API Response Types
export interface ApiResponse<T = any> {
  data?: T;
  message?: string;
  status?: string;
}

// Document Types
export interface Document {
  id: number;
  paperless_id: number;
  title: string;
  content?: string;
  created_date?: string;
  last_processed?: string;
  file_type?: string;
  mime_type?: string;
  checksum?: string;
  archive_serial_number?: number;
  filename?: string;
  archive_filename?: string;
  processing_status?: 'pending' | 'processing' | 'completed' | 'error';
  fingerprint?: string;
  original_file_size?: number;
  archive_file_size?: number;
  has_duplicates?: boolean;
  word_count?: number;
  page_estimate?: number;
  // Additional metadata fields
  correspondent?: string;
  document_type?: string;
  tags?: string[];
  original_filename?: string;
  created?: string; // Alias for created_date
  is_primary?: boolean;
  // Similarity data for documents in duplicate groups
  similarity_to_primary?: {
    overall: number;
    jaccard_similarity: number;
    fuzzy_text_ratio: number;
    metadata_similarity: number;
  };
}

export interface DocumentContent {
  id: number;
  document_id: number;
  full_text: string;
  content?: string; // Legacy key from API
  language?: string;
  word_count?: number;
}

export interface DocumentPreview {
  preview: string;
  content_type?: string;
  paperless_id?: number;
}

export type DocumentListResponse = Omit<
  components['schemas']['DocumentListResponse'],
  'results'
> & {
  results: Document[];
};

export type DocumentStatsResponse =
  components['schemas']['DocumentStatsResponse'];

// Duplicate Types
export interface DuplicateGroup {
  id: string;
  documents: Document[];
  confidence: number;
  reviewed: boolean;
  created_at: string;
  updated_at: string;
  confidence_breakdown?: {
    jaccard_similarity: number;
    fuzzy_text_ratio: number;
    metadata_similarity: number;
  };
}

export interface DuplicateGroupsResponse {
  groups: DuplicateGroup[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface DuplicateStatistics {
  total_groups: number;
  total_duplicates: number;
  potential_deletions: number;
  reviewed_groups: number;
  unreviewed_groups: number;
  potential_space_savings: number;
}

// Processing Types
export interface ProcessingStatus {
  is_processing: boolean;
  current_step: string;
  progress: number;
  total: number;
  started_at?: string;
  completed_at?: string;
  error?: string;
  status?: string;
  task_id?: string;
  documents_processed?: number;
  groups_found?: number;
}

export type ProcessingHistoryResponse =
  components['schemas']['ProcessingHistoryResponse'];

export interface BatchOperationUpdate {
  operation_id?: string | null;
  task_id?: string | null;
  status: string;
  progress_percentage: number;
  current_item: number;
  total_items: number;
  message: string;
  errors?: string[];
  results?: {
    processed?: number;
    failed?: number;
    started_at?: string | null;
    completed_at?: string | null;
    error?: string | null;
  } | null;
}

export interface AnalyzeRequest {
  threshold?: number;
  force_rebuild?: boolean;
  limit?: number;
}

export interface AnalyzeResponse {
  status: string;
  message: string;
  document_count: number;
}

// Configuration Types
export type ConfigurationResponse = components['schemas']['ConfigResponse'];

export type Configuration = Omit<
  ConfigurationResponse,
  | 'status'
  | 'message'
  | 'updated_fields'
  | 'weights_changed'
  | 'reanalysis_triggered'
  | 'task_id'
> & {
  paperless_api_token?: string;
  paperless_password?: string;
  openai_api_key?: string;
};

export type TestConnectionResponse =
  components['schemas']['ConnectionTestResponse'];

export type ConfigValidationResponse =
  components['schemas']['ConfigValidationResponse'];

// WebSocket Types
export interface WebSocketMessage {
  type:
    | 'processing_update'
    | 'processing_completed'
    | 'sync_update'
    | 'sync_completed'
    | 'ai_job_update'
    | 'ai_job_completed'
    | 'batch_update'
    | 'batch_completed'
    | 'error';
  data: ProcessingStatus | AIJobUpdate | BatchOperationUpdate | string | any;
}

// API Error Types
export interface ApiError {
  code?: string;
  detail: string;
  field_errors?: Record<string, string[]> | null;
  status_code?: number;
}

// Request/Response wrapper types
export interface PaginatedResponse<T> {
  results: T[];
  count: number;
  next?: string;
  previous?: string;
}

// Query parameters
export interface DocumentQueryParams {
  cursor?: string;
  limit?: number;
  search?: string;
  order_by?: string;
  order_desc?: boolean;
  processing_status?: string;
}

export interface DuplicateGroupQueryParams {
  page?: number;
  page_size?: number;
  reviewed?: boolean;
  min_confidence?: number;
  sort_by?:
    | 'confidence'
    | 'created'
    | 'documents'
    | 'filename'
    | 'file_size'
    | 'page_count'
    | 'correspondent'
    | 'document_type';
  sort_order?: 'asc' | 'desc';
  tag?: string;
  tags?: string[];
  correspondent?: string;
  document_type?: string;
  min_file_size?: number;
  max_file_size?: number;
  // Dynamic confidence weight parameters
  use_jaccard?: boolean;
  use_fuzzy?: boolean;
  use_metadata?: boolean;
  min_fuzzy_ratio?: number;
}

// AI processing
export type AIField =
  | 'title'
  | 'correspondent'
  | 'document_type'
  | 'tags'
  | 'date'
  | 'all';

export type AIFieldName = Exclude<AIField, 'all'>;

export type AIFieldDecision = 'accept' | 'reject' | 'edit' | 'pending';

export type AIFieldOverride = string | string[] | null;

export interface AIJob {
  id: number;
  status: string;
  tag_filter?: string | null;
  include_all: boolean;
  target_fields: AIField[];
  processed_count: number;
  total_count: number;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  error?: string | null;
}

export interface AIResult {
  id: number;
  job_id: number;
  status: string;
  document_id: number;
  paperless_id: number;
  document_title?: string | null;
  document_correspondent?: string | null;
  document_type?: string | null;
  document_tags?: string[];
  suggested_title?: string | null;
  title_confidence?: number | null;
  suggested_correspondent?: string | null;
  correspondent_confidence?: number | null;
  suggested_document_type?: string | null;
  document_type_confidence?: number | null;
  suggested_tags?: Array<{ value?: string; confidence?: number } | string>;
  tags_confidence?: number | null;
  suggested_date?: string | null;
  date_confidence?: number | null;
  requested_fields?: AIField[];
  applied_at?: string | null;
  field_decisions?: Partial<Record<AIFieldName, AIFieldDecision>>;
  field_overrides?: Partial<Record<AIFieldName, AIFieldOverride>>;
  error?: string | null;
}

export interface AIHealth {
  healthy: boolean;
  message?: string | null;
  checked_at?: string;
}

export interface AIJobUpdate {
  job_id?: number | null;
  task_id?: string | null;
  status: string;
  processed_count: number;
  total_count: number;
  error?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  step?: string | null;
}
