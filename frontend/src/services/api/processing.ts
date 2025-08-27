import { apiClient } from "./client";
import type {
  ProcessingStatus,
  AnalyzeRequest,
  AnalyzeResponse,
  ApiResponse,
} from "./types";

export const processingApi = {
  // Start deduplication analysis
  async startAnalysis(request: AnalyzeRequest = {}): Promise<AnalyzeResponse> {
    return apiClient.post<AnalyzeResponse>("/processing/analyze", request);
  },

  // Get current processing status
  async getProcessingStatus(): Promise<ProcessingStatus> {
    return apiClient.get<ProcessingStatus>("/processing/status");
  },

  // Cancel current processing
  async cancelProcessing(): Promise<ApiResponse> {
    return apiClient.post<ApiResponse>("/processing/cancel");
  },

  // Clear cache
  async clearCache(): Promise<ApiResponse> {
    return apiClient.post<ApiResponse>("/processing/clear-cache");
  },

  // Get processing history
  async getProcessingHistory(): Promise<{
    runs: Array<{
      id: string;
      started_at: string;
      completed_at?: string;
      status: "completed" | "failed" | "cancelled";
      documents_processed: number;
      groups_found: number;
      error?: string;
    }>;
  }> {
    return apiClient.get("/processing/history");
  },
};

export default processingApi;
