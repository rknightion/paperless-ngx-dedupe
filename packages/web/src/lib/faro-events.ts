import { faro } from '@grafana/faro-web-sdk';

// ── Helpers ──────────────────────────────────────────────────────────

function pushEvent(name: string, attributes?: Record<string, string>) {
  faro.api?.pushEvent(name, attributes);
}

function pushMeasurement(type: string, values: Record<string, number>) {
  faro.api?.pushMeasurement({ type, values });
}

function str(v: unknown): string {
  return String(v ?? '');
}

/** Returns a stop function that, when called, pushes a duration measurement. */
export function startTimer(measurementType: string): () => void {
  const start = performance.now();
  return () => {
    pushMeasurement(measurementType, { duration_ms: Math.round(performance.now() - start) });
  };
}

// ── Sync ─────────────────────────────────────────────────────────────

export function trackSyncStarted(opts: { force: boolean; purge: boolean }) {
  pushEvent('sync_started', { force: str(opts.force), purge: str(opts.purge) });
}

export function trackSyncCompleted() {
  pushEvent('sync_completed');
}

export function trackSyncFailed(error: string) {
  pushEvent('sync_failed', { error });
}

// ── Analysis ─────────────────────────────────────────────────────────

export function trackAnalysisStarted(opts: { force: boolean }) {
  pushEvent('analysis_started', { force: str(opts.force) });
}

export function trackAnalysisCompleted() {
  pushEvent('analysis_completed');
}

export function trackAnalysisFailed(error: string) {
  pushEvent('analysis_failed', { error });
}

// ── Duplicates ───────────────────────────────────────────────────────

export function trackDuplicatesFilterApplied(filters: {
  status?: string;
  minConfidence?: string;
  maxConfidence?: string;
  sortBy?: string;
  sortOrder?: string;
}) {
  pushEvent('duplicates_filter_applied', {
    status: filters.status ?? 'all',
    min_confidence: filters.minConfidence ?? '',
    max_confidence: filters.maxConfidence ?? '',
    sort_by: filters.sortBy ?? '',
    sort_order: filters.sortOrder ?? '',
  });
}

export function trackDuplicatesBulkAction(action: string, groupCount: number) {
  pushEvent('duplicates_bulk_action', { action, group_count: str(groupCount) });
}

export function trackCsvExported() {
  pushEvent('csv_exported');
}

export function trackPurgeDeleted(count: number) {
  pushEvent('purge_deleted', { count: str(count) });
}

// ── Group Detail ─────────────────────────────────────────────────────

export function trackGroupViewed(opts: {
  groupId: string;
  memberCount: number;
  confidenceScore: number;
  status: string;
}) {
  pushEvent('duplicate_group_viewed', {
    group_id: opts.groupId,
    member_count: str(opts.memberCount),
    confidence_score: str(opts.confidenceScore),
    status: opts.status,
  });
}

export function trackGroupStatusChanged(groupId: string, action: string) {
  pushEvent('group_status_changed', { group_id: groupId, action });
}

export function trackMemberAction(
  action: 'set_primary' | 'remove' | 'delete_from_paperless',
  opts: { groupId: string; memberId: string },
) {
  pushEvent('member_action', { action, group_id: opts.groupId, member_id: opts.memberId });
}

// ── Wizard ───────────────────────────────────────────────────────────

export function trackWizardStepChanged(step: number) {
  pushEvent('wizard_step_changed', { step: str(step) });
}

export function trackWizardThresholdSet(threshold: number, matchingGroups: number) {
  pushEvent('wizard_threshold_set', {
    threshold: str(threshold),
    matching_groups: str(matchingGroups),
  });
}

export function trackWizardExecuted(opts: {
  action: string;
  groupCount: number;
  success: boolean;
  errors?: number;
}) {
  pushEvent('wizard_executed', {
    action: opts.action,
    group_count: str(opts.groupCount),
    success: str(opts.success),
    errors: str(opts.errors ?? 0),
  });
}

// ── AI Processing ────────────────────────────────────────────────────

export function trackAiResultAction(
  action: 'apply' | 'reject',
  opts: { resultId: string; fieldsApplied?: string[] },
) {
  pushEvent('ai_result_action', {
    action,
    result_id: opts.resultId,
    fields_applied: (opts.fieldsApplied ?? []).join(','),
  });
}

export function trackAiBulkAction(opts: {
  action: 'apply' | 'reject';
  scope: 'selected' | 'all_matching';
  count: number;
}) {
  pushEvent('ai_bulk_action', {
    action: opts.action,
    scope: opts.scope,
    count: str(opts.count),
  });
}

// ── RAG / Ask ────────────────────────────────────────────────────────

export function trackRagQuestionAsked(questionLength: number) {
  pushEvent('rag_question_asked', { question_length: str(questionLength) });
}

export function trackRagConversationStarted() {
  pushEvent('rag_conversation_started');
}

export function trackRagConversationDeleted() {
  pushEvent('rag_conversation_deleted');
}

export function trackRagIndexingStarted() {
  pushEvent('rag_indexing_started');
}

// ── Settings ─────────────────────────────────────────────────────────

export function trackSettingsSaved(section: 'connection' | 'dedup' | 'ai' | 'rag') {
  pushEvent('settings_saved', { section });
}

export function trackConnectionTested(success: boolean) {
  pushEvent('connection_tested', { success: str(success) });
}

export function trackConfigExported() {
  pushEvent('config_exported');
}

export function trackConfigImported(success: boolean) {
  pushEvent('config_imported', { success: str(success) });
}
