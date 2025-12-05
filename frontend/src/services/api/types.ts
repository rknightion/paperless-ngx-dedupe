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

export interface DocumentListResponse {
  results: Document[];
  count: number;
  next?: string;
  previous?: string;
}

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
export interface Configuration {
  paperless_url: string;
  paperless_api_token?: string;
  paperless_username?: string;
  paperless_password?: string;
  openai_api_key?: string;
  fuzzy_match_threshold: number;
  max_ocr_length: number;
  lsh_threshold: number;
  minhash_num_perm: number;
  confidence_weight_jaccard?: number;
  confidence_weight_fuzzy?: number;
  confidence_weight_metadata?: number;
  openai_model?: string;
  openai_reasoning_effort?: string;
  ai_max_input_chars?: number;
  ai_prompt_caching_enabled?: boolean;
  openai_configured?: boolean;
}

export interface TestConnectionResponse {
  success: boolean;
  message: string;
  version?: string;
}

// WebSocket Types
export interface WebSocketMessage {
  type: 'processing_update' | 'error' | 'completed';
  data: ProcessingStatus | string;
}

// API Error Types
export interface ApiError {
  detail: string;
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
  page?: number;
  page_size?: number;
  search?: string;
  ordering?: string;
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
  correspondent?: string;
  document_type?: string;
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
  error?: string | null;
}
