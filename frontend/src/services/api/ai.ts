import { apiClient } from './client';
import type {
  AIField,
  AIJob,
  AIResult,
  AIHealth,
  AIFieldDecision,
  AIFieldName,
  AIFieldOverride,
} from './types';

export const aiApi = {
  async startJob(payload: {
    tag?: string;
    include_all?: boolean;
    target_fields: AIField[];
  }): Promise<AIJob> {
    return apiClient.post<AIJob>('/ai/jobs', payload);
  },

  async listJobs(): Promise<AIJob[]> {
    return apiClient.get<AIJob[]>('/ai/jobs');
  },

  async getJob(jobId: number): Promise<AIJob> {
    return apiClient.get<AIJob>(`/ai/jobs/${jobId}`);
  },

  async getResults(jobId: number): Promise<{
    job: AIJob;
    results: AIResult[];
  }> {
    return apiClient.get(`/ai/jobs/${jobId}/results`);
  },

  async applyResults(
    jobId: number,
    payload: {
      result_ids?: number[];
      fields?: AIField[];
      include_failed?: boolean;
    }
  ): Promise<{
    status: string;
    applied: number;
    skipped: number[];
    rejected?: number[];
    failed?: Array<{ id: number; error?: string }>;
    remaining_pending: number;
  }> {
    return apiClient.post(`/ai/jobs/${jobId}/apply`, payload);
  },

  async updateResult(
    resultId: number,
    payload: {
      field_decisions?: Partial<Record<AIFieldName, AIFieldDecision>>;
      field_overrides?: Partial<Record<AIFieldName, AIFieldOverride>>;
      status?: 'pending_review' | 'rejected';
    }
  ): Promise<AIResult> {
    return apiClient.patch(`/ai/results/${resultId}`, payload);
  },

  async healthCheck(): Promise<AIHealth> {
    return apiClient.get('/ai/health');
  },
};

export default aiApi;
