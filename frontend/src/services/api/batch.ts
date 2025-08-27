import { apiClient } from "./client";

export const OperationType = {
  MARK_FOR_DELETION: "mark_for_deletion",
  DELETE: "delete",
  TAG: "tag",
  UNTAG: "untag",
  UPDATE_METADATA: "update_metadata",
  MERGE_DOCUMENTS: "merge_documents",
  MARK_REVIEWED: "mark_reviewed",
  RESOLVE_DUPLICATES: "resolve_duplicates",
} as const;

export type OperationType = (typeof OperationType)[keyof typeof OperationType];

export const OperationStatus = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  FAILED: "failed",
  PARTIALLY_COMPLETED: "partially_completed",
} as const;

export type OperationStatus =
  (typeof OperationStatus)[keyof typeof OperationStatus];

export interface BatchOperationRequest {
  operation: OperationType;
  document_ids?: number[];
  group_ids?: string[];
  parameters?: Record<string, any>;
}

export interface BatchOperationResponse {
  operation_id: string;
  operation: OperationType;
  status: OperationStatus;
  message: string;
  total_items: number;
  processed_items?: number;
  failed_items?: number;
  started_at?: string;
  completed_at?: string;
}

export interface BatchOperationProgress {
  operation_id: string;
  status: OperationStatus;
  progress_percentage: number;
  current_item: number;
  total_items: number;
  message: string;
  errors: string[];
  results?: {
    processed: number;
    failed: number;
    started_at?: string;
    completed_at?: string;
  };
}

export const batchApi = {
  // Execute batch operation
  async executeBatchOperation(
    request: BatchOperationRequest,
  ): Promise<BatchOperationResponse> {
    return apiClient.post<BatchOperationResponse>("/batch/execute", request);
  },

  // Get operation status
  async getOperationStatus(
    operationId: string,
  ): Promise<BatchOperationProgress> {
    return apiClient.get<BatchOperationProgress>(
      `/batch/status/${operationId}`,
    );
  },

  // List operations
  async listOperations(
    status?: OperationStatus,
    limit: number = 10,
  ): Promise<BatchOperationProgress[]> {
    const params: any = { limit };
    if (status) params.status = status;
    return apiClient.get<BatchOperationProgress[]>("/batch/operations", params);
  },

  // Cancel operation
  async cancelOperation(operationId: string): Promise<any> {
    return apiClient.delete(`/batch/cancel/${operationId}`);
  },

  // Bulk resolve duplicates
  async bulkResolveDuplicates(
    groupIds: string[],
    keepPrimary: boolean = true,
  ): Promise<BatchOperationResponse> {
    return apiClient.post<BatchOperationResponse>(
      "/batch/duplicates/bulk-resolve",
      {
        group_ids: groupIds,
        keep_primary: keepPrimary,
      },
    );
  },

  // Bulk review duplicates
  async bulkReviewDuplicates(
    groupIds: string[],
    reviewed: boolean = true,
  ): Promise<any> {
    return apiClient.post("/batch/duplicates/bulk-review", {
      group_ids: groupIds,
      reviewed,
    });
  },

  // Helper functions for common operations
  async deleteDocuments(
    documentIds: number[],
  ): Promise<BatchOperationResponse> {
    return this.executeBatchOperation({
      operation: OperationType.DELETE,
      document_ids: documentIds,
    });
  },

  async tagDocuments(
    documentIds: number[],
    tagIds: number[],
  ): Promise<BatchOperationResponse> {
    return this.executeBatchOperation({
      operation: OperationType.TAG,
      document_ids: documentIds,
      parameters: { tags: tagIds },
    });
  },

  async untagDocuments(
    documentIds: number[],
    tagIds: number[],
  ): Promise<BatchOperationResponse> {
    return this.executeBatchOperation({
      operation: OperationType.UNTAG,
      document_ids: documentIds,
      parameters: { tags: tagIds },
    });
  },

  async updateDocumentMetadata(
    documentIds: number[],
    metadata: Record<string, any>,
  ): Promise<BatchOperationResponse> {
    return this.executeBatchOperation({
      operation: OperationType.UPDATE_METADATA,
      document_ids: documentIds,
      parameters: { metadata },
    });
  },
};

export default batchApi;
