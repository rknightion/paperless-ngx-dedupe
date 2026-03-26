import { buildQueryString, request, requestRaw } from './http.js';
import type { HttpOptions } from './http.js';
import { subscribeToJobProgress } from './sse.js';
import type {
  AiApplyOptions,
  AiConfig,
  AiProcessOptions,
  AiResultFilters,
  AiResultDetail,
  AiResultGroup,
  AiResultSummary,
  AiStats,
  ApplyPreflightResult,
  ApplyScope,
  BatchDeleteResult,
  BatchResult,
  ClientOptions,
  ConfigBackup,
  DashboardData,
  DedupConfig,
  DocumentDetail,
  DocumentFilters,
  DocumentStats,
  DocumentSummary,
  DuplicateGroupDetail,
  DuplicateGroupFilters,
  DuplicateGroupSummary,
  DuplicateStats,
  GroupByField,
  Job,
  PaginationMeta,
  PaginationParams,
  SSECallbacks,
  SSESubscription,
  SimilarityGraphData,
  SimilarityGraphFilters,
  SyncOptions,
} from './types.js';

const DEFAULT_TIMEOUT = 30_000;

export class PaperlessDedupeClient {
  private readonly httpOptions: HttpOptions;

  constructor(options: ClientOptions) {
    const baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.httpOptions = {
      baseUrl,
      fetch: options.fetch ?? globalThis.fetch,
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
    };
  }

  // ── Health ───────────────────────────────────────────────────────────

  async health(): Promise<{ status: string }> {
    const res = await request<{ status: string }>('/api/v1/health', this.httpOptions);
    return res.data;
  }

  async ready(): Promise<{ status: string }> {
    const res = await request<{ status: string }>('/api/v1/ready', this.httpOptions);
    return res.data;
  }

  // ── Sync & Analysis ──────────────────────────────────────────────────

  async sync(options?: SyncOptions): Promise<Job> {
    const res = await request<Job>('/api/v1/sync', this.httpOptions, {
      method: 'POST',
      body: options,
    });
    return res.data;
  }

  async analyze(): Promise<Job> {
    const res = await request<Job>('/api/v1/analysis', this.httpOptions, { method: 'POST' });
    return res.data;
  }

  // ── Documents ────────────────────────────────────────────────────────

  async listDocuments(
    params?: PaginationParams & DocumentFilters,
  ): Promise<{ data: DocumentSummary[]; meta: PaginationMeta }> {
    const qs = buildQueryString({ ...params });
    const res = await request<DocumentSummary[]>(`/api/v1/documents${qs}`, this.httpOptions);
    return { data: res.data, meta: res.meta! };
  }

  async getDocument(id: string): Promise<DocumentDetail> {
    const res = await request<DocumentDetail>(`/api/v1/documents/${id}`, this.httpOptions);
    return res.data;
  }

  async getDocumentContent(id: string): Promise<{ fullText: string | null }> {
    const res = await request<{ fullText: string | null }>(
      `/api/v1/documents/${id}/content`,
      this.httpOptions,
    );
    return res.data;
  }

  async getDocumentStats(): Promise<DocumentStats> {
    const res = await request<DocumentStats>('/api/v1/documents/stats', this.httpOptions);
    return res.data;
  }

  // ── Duplicate Groups ─────────────────────────────────────────────────

  async listDuplicates(
    params?: PaginationParams & DuplicateGroupFilters,
  ): Promise<{ data: DuplicateGroupSummary[]; meta: PaginationMeta }> {
    const qs = buildQueryString({ ...params });
    const res = await request<DuplicateGroupSummary[]>(`/api/v1/duplicates${qs}`, this.httpOptions);
    return { data: res.data, meta: res.meta! };
  }

  async getDuplicate(id: string): Promise<DuplicateGroupDetail> {
    const res = await request<DuplicateGroupDetail>(`/api/v1/duplicates/${id}`, this.httpOptions);
    return res.data;
  }

  async getDuplicateStats(): Promise<DuplicateStats> {
    const res = await request<DuplicateStats>('/api/v1/duplicates/stats', this.httpOptions);
    return res.data;
  }

  async getDuplicateGraph(params?: SimilarityGraphFilters): Promise<SimilarityGraphData> {
    const qs = buildQueryString({ ...params });
    const res = await request<SimilarityGraphData>(
      `/api/v1/duplicates/graph${qs}`,
      this.httpOptions,
    );
    return res.data;
  }

  async setPrimary(groupId: string, documentId: string): Promise<DuplicateGroupDetail> {
    const res = await request<DuplicateGroupDetail>(
      `/api/v1/duplicates/${groupId}/primary`,
      this.httpOptions,
      { method: 'POST', body: { documentId } },
    );
    return res.data;
  }

  async setGroupStatus(
    groupId: string,
    status: string,
  ): Promise<{ groupId: string; status: string }> {
    const res = await request<{ groupId: string; status: string }>(
      `/api/v1/duplicates/${groupId}/status`,
      this.httpOptions,
      { method: 'PUT', body: { status } },
    );
    return res.data;
  }

  async deleteDuplicate(groupId: string): Promise<void> {
    await request<unknown>(`/api/v1/duplicates/${groupId}`, this.httpOptions, {
      method: 'DELETE',
    });
  }

  // ── Batch Operations ─────────────────────────────────────────────────

  async batchSetStatus(groupIds: string[], status: string): Promise<BatchResult> {
    const res = await request<BatchResult>('/api/v1/batch/status', this.httpOptions, {
      method: 'POST',
      body: { groupIds, status },
    });
    return res.data;
  }

  async batchDeleteNonPrimary(groupIds: string[], confirm: boolean): Promise<BatchDeleteResult> {
    const res = await request<BatchDeleteResult>(
      '/api/v1/batch/delete-non-primary',
      this.httpOptions,
      { method: 'POST', body: { groupIds, confirm } },
    );
    return res.data;
  }

  async purgeDeletedGroups(): Promise<{ purged: number }> {
    const res = await request<{ purged: number }>('/api/v1/batch/purge-deleted', this.httpOptions, {
      method: 'POST',
    });
    return res.data;
  }

  // ── Dashboard ────────────────────────────────────────────────────────

  async getDashboard(): Promise<DashboardData> {
    const res = await request<DashboardData>('/api/v1/dashboard', this.httpOptions);
    return res.data;
  }

  // ── Config ───────────────────────────────────────────────────────────

  async getConfig(): Promise<Record<string, string>> {
    const res = await request<Record<string, string>>('/api/v1/config', this.httpOptions);
    return res.data;
  }

  async updateConfig(settings: Record<string, string>): Promise<Record<string, string>> {
    const res = await request<Record<string, string>>('/api/v1/config', this.httpOptions, {
      method: 'PUT',
      body: { settings },
    });
    return res.data;
  }

  // ── Dedup Config ─────────────────────────────────────────────────────

  async getDedupConfig(): Promise<DedupConfig> {
    const res = await request<DedupConfig>('/api/v1/dedup-config', this.httpOptions);
    return res.data;
  }

  async updateDedupConfig(config: Partial<DedupConfig>): Promise<DedupConfig> {
    const res = await request<DedupConfig>('/api/v1/dedup-config', this.httpOptions, {
      method: 'PUT',
      body: config,
    });
    return res.data;
  }

  async recalculateDedupConfig(): Promise<Job> {
    const res = await request<Job>('/api/v1/dedup-config/recalculate', this.httpOptions, {
      method: 'POST',
    });
    return res.data;
  }

  // ── Jobs ─────────────────────────────────────────────────────────────

  async getJob(jobId: string): Promise<Job> {
    const res = await request<Job>(`/api/v1/jobs/${jobId}`, this.httpOptions);
    return res.data;
  }

  subscribeToJobProgress(jobId: string, callbacks: SSECallbacks): SSESubscription {
    return subscribeToJobProgress(jobId, callbacks, this.httpOptions);
  }

  // ── Export / Import ──────────────────────────────────────────────────

  async exportDuplicatesCsv(params?: DuplicateGroupFilters): Promise<string> {
    const qs = buildQueryString({ ...params });
    const response = await requestRaw(`/api/v1/export/duplicates.csv${qs}`, this.httpOptions);
    return response.text();
  }

  async exportConfig(): Promise<ConfigBackup> {
    const res = await request<ConfigBackup>('/api/v1/export/config', this.httpOptions);
    return res.data;
  }

  async importConfig(backup: ConfigBackup): Promise<ConfigBackup> {
    const res = await request<ConfigBackup>('/api/v1/import/config', this.httpOptions, {
      method: 'POST',
      body: backup,
    });
    return res.data;
  }

  // ── AI Processing ───────────────────────────────────────────────────

  async processAi(options?: AiProcessOptions): Promise<Job> {
    const body: Record<string, unknown> = {};
    if (options?.reprocess !== undefined) body.reprocess = options.reprocess;
    if (options?.documentIds !== undefined) body.documentIds = options.documentIds;
    if (options?.scope !== undefined) body.scope = options.scope;

    const res = await request<Job>('/api/v1/ai/process', this.httpOptions, {
      method: 'POST',
      body: Object.keys(body).length > 0 ? body : undefined,
    });
    return res.data;
  }

  async getAiResults(
    params?: PaginationParams & AiResultFilters,
  ): Promise<{ data: AiResultSummary[]; meta: PaginationMeta }> {
    const qs = buildQueryString({ ...params });
    const res = await request<AiResultSummary[]>(`/api/v1/ai/results${qs}`, this.httpOptions);
    return { data: res.data, meta: res.meta as PaginationMeta };
  }

  async getAiResult(id: string): Promise<AiResultDetail> {
    const res = await request<AiResultDetail>(`/api/v1/ai/results/${id}`, this.httpOptions);
    return res.data;
  }

  async applyAiResult(id: string, options?: AiApplyOptions): Promise<void> {
    await request<unknown>(`/api/v1/ai/results/${id}/apply`, this.httpOptions, {
      method: 'POST',
      body: options,
    });
  }

  async rejectAiResult(id: string): Promise<void> {
    await request<unknown>(`/api/v1/ai/results/${id}/reject`, this.httpOptions, {
      method: 'POST',
    });
  }

  async batchApplyAiResults(
    resultIds: string[],
    fields?: ('correspondent' | 'documentType' | 'tags')[],
  ): Promise<Job> {
    const res = await request<{ jobId: string }>(
      '/api/v1/ai/results/batch-apply',
      this.httpOptions,
      {
        method: 'POST',
        body: { resultIds, fields },
      },
    );
    return this.getJob(res.data.jobId);
  }

  async batchRejectAiResults(resultIds: string[]): Promise<void> {
    await request<unknown>('/api/v1/ai/results/batch-reject', this.httpOptions, {
      method: 'POST',
      body: { resultIds },
    });
  }

  async applyAllAiResults(options?: AiApplyOptions): Promise<Job> {
    const res = await request<{ jobId: string }>('/api/v1/ai/results/apply-all', this.httpOptions, {
      method: 'POST',
      body: options,
    });
    return this.getJob(res.data.jobId);
  }

  async preflightApply(scope: ApplyScope, options?: AiApplyOptions): Promise<ApplyPreflightResult> {
    const res = await request<ApplyPreflightResult>(
      '/api/v1/ai/results/preflight',
      this.httpOptions,
      { method: 'POST', body: { scope, ...options } },
    );
    return res.data;
  }

  async getAiResultGroups(
    groupBy: GroupByField,
    filters?: AiResultFilters,
  ): Promise<{ groups: AiResultGroup[] }> {
    const qs = buildQueryString({ groupBy, ...filters });
    const res = await request<{ groups: AiResultGroup[] }>(
      `/api/v1/ai/results/groups${qs}`,
      this.httpOptions,
    );
    return res.data;
  }

  async getAiStats(): Promise<AiStats> {
    const res = await request<AiStats>('/api/v1/ai/stats', this.httpOptions);
    return res.data;
  }

  async getAiConfig(): Promise<AiConfig> {
    const res = await request<AiConfig>('/api/v1/ai/config', this.httpOptions);
    return res.data;
  }

  async updateAiConfig(config: Partial<AiConfig>): Promise<AiConfig> {
    const res = await request<AiConfig>('/api/v1/ai/config', this.httpOptions, {
      method: 'PUT',
      body: config,
    });
    return res.data;
  }
}
