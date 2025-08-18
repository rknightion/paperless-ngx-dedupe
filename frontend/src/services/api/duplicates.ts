import { apiClient } from './client';
import type {
  DuplicateGroup,
  DuplicateGroupsResponse,
  DuplicateGroupQueryParams,
  DuplicateStatistics,
  ApiResponse,
} from './types';

export const duplicatesApi = {
  // Get duplicate groups
  async getDuplicateGroups(params?: DuplicateGroupQueryParams): Promise<DuplicateGroupsResponse> {
    return apiClient.get<DuplicateGroupsResponse>('/duplicates/groups', params);
  },

  // Get specific duplicate group
  async getDuplicateGroup(id: string): Promise<DuplicateGroup> {
    return apiClient.get<DuplicateGroup>(`/duplicates/groups/${id}`);
  },

  // Mark duplicate group as reviewed
  async reviewDuplicateGroup(id: string, reviewed: boolean = true): Promise<ApiResponse> {
    return apiClient.post<ApiResponse>(`/duplicates/groups/${id}/review`, { reviewed });
  },

  // Delete duplicate group
  async deleteDuplicateGroup(id: string): Promise<ApiResponse> {
    return apiClient.delete<ApiResponse>(`/duplicates/groups/${id}`);
  },

  // Get duplicate statistics
  async getDuplicateStatistics(): Promise<DuplicateStatistics> {
    return apiClient.get<DuplicateStatistics>('/duplicates/statistics');
  },

  // Bulk operations
  async bulkReviewGroups(groupIds: string[], reviewed: boolean = true): Promise<ApiResponse> {
    return apiClient.post<ApiResponse>('/duplicates/groups/bulk-review', {
      group_ids: groupIds,
      reviewed,
    });
  },

  async bulkDeleteGroups(groupIds: string[]): Promise<ApiResponse> {
    return apiClient.post<ApiResponse>('/duplicates/groups/bulk-delete', {
      group_ids: groupIds,
    });
  },
};

export default duplicatesApi;