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
  file_size?: number;
  file_type?: string;
  mime_type?: string;
  checksum?: string;
  archive_serial_number?: number;
  filename?: string;
  processing_status: 'pending' | 'processing' | 'completed' | 'error';
  fingerprint?: string;
  has_duplicates?: boolean;
}

export interface DocumentContent {
  id: number;
  document_id: number;
  full_text: string;
  language?: string;
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
    filename_similarity: number;
  };
}

export interface DuplicateGroupsResponse {
  groups: DuplicateGroup[];
  count: number;
}

export interface DuplicateStatistics {
  total_groups: number;
  total_duplicates: number;
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
  fuzzy_match_threshold: number;
  max_ocr_length: number;
  lsh_threshold: number;
  minhash_num_perm: number;
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
}
