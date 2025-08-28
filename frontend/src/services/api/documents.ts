import { apiClient } from './client';
import type {
  Document,
  DocumentContent,
  DocumentListResponse,
  DocumentQueryParams,
  DuplicateGroup,
  ApiResponse,
} from './types';

export const documentsApi = {
  // Get list of documents
  async getDocuments(
    params?: DocumentQueryParams
  ): Promise<DocumentListResponse> {
    return apiClient.get<DocumentListResponse>('/documents/', params);
  },

  // Get specific document
  async getDocument(id: number): Promise<Document> {
    return apiClient.get<Document>(`/documents/${id}`);
  },

  // Get document OCR content
  async getDocumentContent(id: number): Promise<DocumentContent> {
    return apiClient.get<DocumentContent>(`/documents/${id}/content`);
  },

  // Get document duplicates
  async getDocumentDuplicates(id: number): Promise<DuplicateGroup[]> {
    return apiClient.get<DuplicateGroup[]>(`/documents/${id}/duplicates`);
  },

  // Sync documents from paperless-ngx
  async syncDocuments(params?: {
    force_refresh?: boolean;
    limit?: number;
  }): Promise<ApiResponse> {
    return apiClient.post<ApiResponse>('/documents/sync', params || {});
  },

  // Get sync status
  async getSyncStatus(): Promise<{
    is_syncing: boolean;
    current_step: string;
    progress: number;
    total: number;
    started_at: string | null;
    completed_at: string | null;
    error: string | null;
    documents_synced: number;
    documents_updated: number;
  }> {
    return apiClient.get('/documents/sync/status');
  },

  // Get document statistics (old endpoint - kept for compatibility)
  async getDocumentStats(): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    errors: number;
  }> {
    return apiClient.get('/documents/stats');
  },

  // Get comprehensive document statistics
  async getStatistics(): Promise<any> {
    return apiClient.get('/documents/statistics');
  },
};

export default documentsApi;
