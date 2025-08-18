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
  async getDocuments(params?: DocumentQueryParams): Promise<DocumentListResponse> {
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
  async syncDocuments(): Promise<ApiResponse> {
    return apiClient.post<ApiResponse>('/documents/sync');
  },

  // Get document statistics
  async getDocumentStats(): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    errors: number;
  }> {
    return apiClient.get('/documents/stats');
  },
};

export default documentsApi;