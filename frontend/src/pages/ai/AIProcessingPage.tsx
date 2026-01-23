import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { aiApi } from '../../services/api/ai';
import { documentCache } from '../../services/cache/documentCache';
import type {
  AIField,
  AIFieldDecision,
  AIFieldName,
  AIFieldOverride,
  AIJobUpdate,
  AIJob,
  AIResult,
  AIHealth,
  DocumentContent,
} from '../../services/api/types';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Label,
  Input,
  Progress,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui';
import { ScrollArea } from '../../components/ui/ScrollArea';
import { useConfig, useProcessingStatus } from '../../hooks/redux';
import { wsClient } from '../../services/websocket';
import { cn } from '../../utils/cn';

const fieldOptions: { value: AIField; label: string }[] = [
  { value: 'title', label: 'Title' },
  { value: 'correspondent', label: 'Correspondent' },
  { value: 'document_type', label: 'Document Type' },
  { value: 'tags', label: 'Tags' },
  { value: 'date', label: 'Date' },
];

export const AIProcessingPage: React.FC = () => {
  const [tag, setTag] = useState('');
  const [includeAll, setIncludeAll] = useState(true);
  const [targetFields, setTargetFields] = useState<AIField[]>(['all']);
  const [currentJob, setCurrentJob] = useState<AIJob | null>(null);
  const [jobs, setJobs] = useState<AIJob[]>([]);
  const [results, setResults] = useState<AIResult[]>([]);
  const [selectedResultIds, setSelectedResultIds] = useState<number[]>([]);
  const [applyFields, setApplyFields] = useState<AIField[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [health, setHealth] = useState<AIHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewResult, setReviewResult] = useState<AIResult | null>(null);
  const [reviewDecisions, setReviewDecisions] = useState<
    Record<AIFieldName, AIFieldDecision>
  >({});
  const [reviewOverrides, setReviewOverrides] = useState<
    Partial<Record<AIFieldName, string>>
  >({});
  const [reviewSaving, setReviewSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [ocrContent, setOcrContent] = useState<DocumentContent | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const { configuration } = useConfig();
  const { wsConnected } = useProcessingStatus();

  const resolvedFields = useMemo(() => {
    if (targetFields.includes('all')) return fieldOptions.map((f) => f.value);
    return targetFields;
  }, [targetFields]);

  const paperlessUrl = configuration?.paperless_url;
  const openaiConfigured = Boolean(configuration?.openai_configured);
  const reviewFields = useMemo(
    () => fieldOptions.map((field) => field.value) as AIFieldName[],
    []
  );

  const normalizeSuggestedTags = (result: AIResult): string[] => {
    return (result.suggested_tags || [])
      .map((tag) => (typeof tag === 'string' ? tag : tag?.value || ''))
      .map((tag) => tag.trim())
      .filter(Boolean);
  };

  const formatDate = (value?: string | null) => {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString();
  };

  const toDateInputValue = (value?: string | null) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
  };

  const toggleField = (field: AIField) => {
    setTargetFields((prev) => {
      if (field === 'all') return ['all'];
      const next = prev.includes(field)
        ? prev.filter((f) => f !== field && f !== 'all')
        : [...prev.filter((f) => f !== 'all'), field];
      return next.length === fieldOptions.length ? ['all'] : next;
    });
  };

  const toggleApplyField = (field: AIField) => {
    setApplyFields((prev) => {
      if (field === 'all') return fieldOptions.map((f) => f.value);
      return prev.includes(field)
        ? prev.filter((f) => f !== field)
        : [...prev, field];
    });
  };

  const loadJobs = async () => {
    try {
      const list = await aiApi.listJobs();
      setJobs(list);
      if (!currentJob && list.length) {
        setCurrentJob(list[0]);
        setApplyFields(list[0].target_fields || []);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const refreshJob = async (jobId: number) => {
    try {
      const job = await aiApi.getJob(jobId);
      setCurrentJob(job);
      if (job.status === 'completed') {
        await loadResults(job.id);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadResults = async (jobId: number) => {
    try {
      const data = await aiApi.getResults(jobId);
      setResults(data.results || []);
      setApplyFields(data.job?.target_fields || []);
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  useEffect(() => {
    if (configuration?.openai_configured) {
      runHealthCheck();
    }
  }, [configuration?.openai_configured]);

  useEffect(() => {
    if (!currentJob) return;
    if (wsConnected) {
      if (!['completed', 'failed', 'cancelled'].includes(currentJob.status)) {
        refreshJob(currentJob.id);
      }
      return;
    }

    const interval = setInterval(() => {
      if (
        currentJob &&
        !['completed', 'failed', 'cancelled'].includes(currentJob.status)
      ) {
        refreshJob(currentJob.id);
      }
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentJob?.id, currentJob?.status, wsConnected]);

  useEffect(() => {
    if (currentJob?.id) {
      loadResults(currentJob.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentJob?.id]);

  useEffect(() => {
    const handleUpdate = (update: AIJobUpdate) => {
      if (!update.job_id) return;
      setJobs((prev) =>
        prev.map((job) =>
          job.id === update.job_id
            ? {
                ...job,
                status: update.status,
                processed_count: update.processed_count,
                total_count: update.total_count,
                started_at: update.started_at || job.started_at,
                completed_at: update.completed_at || job.completed_at,
                error: update.error || job.error,
              }
            : job
        )
      );
      setCurrentJob((prev) =>
        prev && prev.id === update.job_id
          ? {
              ...prev,
              status: update.status,
              processed_count: update.processed_count,
              total_count: update.total_count,
              started_at: update.started_at || prev.started_at,
              completed_at: update.completed_at || prev.completed_at,
              error: update.error || prev.error,
            }
          : prev
      );
      if (update.status === 'completed') {
        setStatusMessage(
          'AI processing completed. Results are ready to review.'
        );
        void loadResults(update.job_id);
      }
      if (update.status === 'failed') {
        setStatusMessage('AI processing failed. Check the job for errors.');
      }
    };

    wsClient.on('ai_job_update', handleUpdate);
    wsClient.on('ai_job_completed', handleUpdate);

    return () => {
      wsClient.off('ai_job_update', handleUpdate);
      wsClient.off('ai_job_completed', handleUpdate);
    };
  }, []);

  const startJob = async () => {
    setLoading(true);
    setError(null);
    try {
      const job = await aiApi.startJob({
        tag: tag || undefined,
        include_all: includeAll,
        target_fields: targetFields,
      });
      setCurrentJob(job);
      setApplyFields(job.target_fields || []);
      await loadJobs();
      setStatusMessage('Job queued. Live updates will appear as it runs.');
      setSelectedResultIds([]);
    } catch (err: any) {
      setError(err?.message || 'Failed to start AI processing');
    } finally {
      setLoading(false);
    }
  };

  const runHealthCheck = async () => {
    setHealthLoading(true);
    setError(null);
    try {
      const result = await aiApi.healthCheck();
      setHealth(result);
    } catch (err: any) {
      setHealth({
        healthy: false,
        message: err?.message || 'Health check failed',
      });
    } finally {
      setHealthLoading(false);
    }
  };

  const applySelected = async () => {
    if (!currentJob) return;
    setLoading(true);
    setError(null);
    try {
      const payload: any = {};
      if (selectedResultIds.length) payload.result_ids = selectedResultIds;
      if (applyFields.length) payload.fields = applyFields;
      if (
        selectedResultIds.some(
          (id) =>
            results.find((result) => result.id === id)?.status === 'failed'
        )
      ) {
        payload.include_failed = true;
      }
      const result = await aiApi.applyResults(currentJob.id, payload);
      const failedCount = result.failed?.length || 0;
      const rejectedCount = result.rejected?.length || 0;
      setStatusMessage(
        `Applied ${result.applied} suggestion(s). ${failedCount} failed, ${rejectedCount} rejected. ${result.remaining_pending} still pending review.`
      );
      await loadResults(currentJob.id);
      setSelectedResultIds([]);
    } catch (err: any) {
      setError(err?.message || 'Failed to apply metadata');
    } finally {
      setLoading(false);
    }
  };

  const getSuggestedValue = (result: AIResult, field: AIFieldName) => {
    switch (field) {
      case 'title':
        return result.suggested_title || '';
      case 'correspondent':
        return result.suggested_correspondent || '';
      case 'document_type':
        return result.suggested_document_type || '';
      case 'tags':
        return normalizeSuggestedTags(result).join(', ');
      case 'date':
        return toDateInputValue(result.suggested_date || null);
      default:
        return '';
    }
  };

  const deriveReviewState = (result: AIResult) => {
    const storedDecisions = result.field_decisions || {};
    const storedOverrides = result.field_overrides || {};
    const decisions: Record<AIFieldName, AIFieldDecision> = {} as Record<
      AIFieldName,
      AIFieldDecision
    >;
    const overrides: Partial<Record<AIFieldName, string>> = {};

    const suggestedTags = normalizeSuggestedTags(result);

    reviewFields.forEach((field) => {
      const storedDecision = storedDecisions[field];
      const storedOverride = storedOverrides[field] as
        | AIFieldOverride
        | undefined;

      if (storedDecision) {
        decisions[field] = storedDecision;
      } else if (storedOverride !== undefined && storedOverride !== null) {
        decisions[field] = 'edit';
      } else {
        const hasSuggestion = (() => {
          switch (field) {
            case 'title':
              return Boolean(result.suggested_title);
            case 'correspondent':
              return Boolean(result.suggested_correspondent);
            case 'document_type':
              return Boolean(result.suggested_document_type);
            case 'tags':
              return suggestedTags.length > 0;
            case 'date':
              return Boolean(result.suggested_date);
            default:
              return false;
          }
        })();
        decisions[field] = hasSuggestion ? 'accept' : 'reject';
      }

      if (storedOverride !== undefined && storedOverride !== null) {
        if (field === 'tags') {
          overrides[field] = Array.isArray(storedOverride)
            ? storedOverride.join(', ')
            : String(storedOverride);
        } else if (field === 'date') {
          overrides[field] = toDateInputValue(
            typeof storedOverride === 'string'
              ? storedOverride
              : String(storedOverride)
          );
        } else {
          overrides[field] = String(storedOverride);
        }
      }
    });

    reviewFields.forEach((field) => {
      if (decisions[field] === 'edit' && overrides[field] === undefined) {
        overrides[field] = getSuggestedValue(result, field);
      }
    });

    return { decisions, overrides };
  };

  const loadPreview = async (documentId: number) => {
    setPreviewLoading(true);
    try {
      const dataUrl = await documentCache.getPreviewDataUrl(documentId);
      setPreviewUrl(dataUrl);
    } catch (err) {
      console.error('Failed to load preview', err);
      setPreviewUrl(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const loadOcr = async (documentId: number) => {
    setOcrLoading(true);
    try {
      const data = await documentCache.getContent(documentId);
      setOcrContent(data);
    } catch (err) {
      console.error('Failed to load OCR', err);
      setOcrContent(null);
    } finally {
      setOcrLoading(false);
    }
  };

  const openReview = (result: AIResult) => {
    setReviewResult(result);
    const { decisions, overrides } = deriveReviewState(result);
    setReviewDecisions(decisions);
    setReviewOverrides(overrides);
    setPreviewUrl(null);
    setOcrContent(null);
    setReviewOpen(true);
    if (result.document_id) {
      void loadPreview(result.document_id);
      void loadOcr(result.document_id);
    }
  };

  const closeReview = () => {
    setReviewOpen(false);
    setReviewResult(null);
    setReviewDecisions({});
    setReviewOverrides({});
    setPreviewUrl(null);
    setOcrContent(null);
  };

  const updateDecision = (field: AIFieldName, decision: AIFieldDecision) => {
    if (!reviewResult) return;
    setReviewDecisions((prev) => ({ ...prev, [field]: decision }));
    if (decision === 'edit') {
      setReviewOverrides((prev) => {
        if (prev[field] !== undefined) return prev;
        return { ...prev, [field]: getSuggestedValue(reviewResult, field) };
      });
    }
  };

  const updateOverride = (field: AIFieldName, value: string) => {
    setReviewOverrides((prev) => ({ ...prev, [field]: value }));
  };

  const buildOverridesPayload = () => {
    const overrides: Partial<Record<AIFieldName, AIFieldOverride>> = {};
    reviewFields.forEach((field) => {
      if (reviewDecisions[field] !== 'edit') return;
      const value = reviewOverrides[field] ?? '';
      if (field === 'tags') {
        const tags = value
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean);
        overrides[field] = tags;
      } else if (field === 'date') {
        overrides[field] = value || null;
      } else {
        overrides[field] = value || null;
      }
    });
    return overrides;
  };

  const saveReview = async () => {
    if (!reviewResult) return null;
    setReviewSaving(true);
    setError(null);
    try {
      const payload = {
        field_decisions: reviewDecisions,
        field_overrides: buildOverridesPayload(),
      };
      const updated = await aiApi.updateResult(reviewResult.id, payload);
      setResults((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
      setReviewResult(updated);
      setStatusMessage('Saved review decisions.');
      return updated;
    } catch (err: any) {
      setError(err?.message || 'Failed to save review decisions');
      return null;
    } finally {
      setReviewSaving(false);
    }
  };

  const applyResult = async (resultId: number, includeFailed = false) => {
    if (!currentJob) return;
    setLoading(true);
    setError(null);
    try {
      const payload: any = {
        result_ids: [resultId],
        include_failed: includeFailed,
      };
      if (applyFields.length) payload.fields = applyFields;
      const result = await aiApi.applyResults(currentJob.id, payload);
      const failedCount = result.failed?.length || 0;
      const rejectedCount = result.rejected?.length || 0;
      setStatusMessage(
        `Applied ${result.applied} suggestion(s). ${failedCount} failed, ${rejectedCount} rejected.`
      );
      await loadResults(currentJob.id);
    } catch (err: any) {
      setError(err?.message || 'Failed to apply metadata');
    } finally {
      setLoading(false);
    }
  };

  const applyReviewResult = async () => {
    if (!reviewResult) return;
    const updated = await saveReview();
    if (!updated) return;
    const target = updated.id;
    const status = updated.status;
    await applyResult(target, status === 'failed');
  };

  const inProgress =
    currentJob &&
    !['completed', 'failed', 'cancelled'].includes(currentJob.status);
  const progressPercent = currentJob
    ? Math.round(
        (currentJob.processed_count / Math.max(currentJob.total_count, 1)) * 100
      )
    : 0;

  const formatConfidence = (value?: number | null) => {
    if (value === undefined || value === null) return '–';
    return `${Math.round(value * 100)}%`;
  };

  const renderPaperlessLink = (paperlessId: number) => {
    if (!paperlessUrl) return null;
    const normalized = paperlessUrl.replace(/\/$/, '');
    return (
      <a
        href={`${normalized}/documents/${paperlessId}`}
        target="_blank"
        rel="noreferrer"
        className="text-sm text-blue-600 hover:underline"
      >
        Open in paperless-ngx
      </a>
    );
  };

  const renderReviewRow = ({
    field,
    label,
    currentValue,
    suggestedValue,
    confidence,
    inputType = 'text',
    placeholder,
  }: {
    field: AIFieldName;
    label: string;
    currentValue: string;
    suggestedValue: string;
    confidence?: number | null;
    inputType?: string;
    placeholder?: string;
  }) => {
    const decision = reviewDecisions[field] || 'accept';
    return (
      <div className="rounded-md border p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-medium">{label}</div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={decision === 'accept' ? 'secondary' : 'outline'}
              onClick={() => updateDecision(field, 'accept')}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant={decision === 'reject' ? 'destructive' : 'outline'}
              onClick={() => updateDecision(field, 'reject')}
            >
              Reject
            </Button>
            <Button
              size="sm"
              variant={decision === 'edit' ? 'default' : 'outline'}
              onClick={() => updateDecision(field, 'edit')}
            >
              Edit
            </Button>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Current: {currentValue || '—'}
        </div>
        <div className="text-sm">
          Suggested: {suggestedValue || '—'}{' '}
          <span className="text-xs text-muted-foreground">
            {formatConfidence(confidence)}
          </span>
        </div>
        {decision === 'edit' && (
          <Input
            type={inputType}
            value={reviewOverrides[field] ?? ''}
            onChange={(e) => updateOverride(field, e.target.value)}
            placeholder={placeholder}
          />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Processing</h1>
          <p className="text-muted-foreground max-w-2xl">
            Run OpenAI against your document text to propose titles,
            correspondents, document types, tags, and likely dates. Review
            suggestions and apply them safely to paperless-ngx.
          </p>
        </div>
      </div>

      {!openaiConfigured && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          OpenAI API key is not set. Configure it in Settings to enable AI
          processing.
        </div>
      )}

      {openaiConfigured && health && !health.healthy && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          OpenAI configuration is not healthy. {health.message || ''}
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Something went wrong</p>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {statusMessage && (
        <div className="rounded-md bg-blue-50 border border-blue-200 p-4 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-blue-500 mt-0.5" />
          <div>
            <p className="font-medium text-blue-900">Update</p>
            <p className="text-sm text-blue-800">{statusMessage}</p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Launch a run</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tag-filter">Process tag (optional)</Label>
                <Input
                  id="tag-filter"
                  placeholder="invoice, statements, etc."
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  disabled={includeAll}
                />
                <p className="text-xs text-muted-foreground">
                  Choose a tag to scope processing. Leave blank to process
                  everything.
                </p>
              </div>
              <div className="flex items-center gap-2 mt-6">
                <Checkbox
                  id="include_all"
                  checked={includeAll}
                  onChange={(e) => setIncludeAll(e.target.checked)}
                />
                <Label htmlFor="include_all" className="text-sm">
                  Process all documents
                </Label>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">
                What should we extract?
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className={cn(
                    'px-3 py-2 rounded-md border text-sm',
                    targetFields.includes('all')
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-muted-foreground/40 hover:border-primary'
                  )}
                  onClick={() => setTargetFields(['all'])}
                >
                  Everything
                </button>
                {fieldOptions.map((field) => (
                  <button
                    key={field.value}
                    type="button"
                    onClick={() => toggleField(field.value)}
                    className={cn(
                      'px-3 py-2 rounded-md border text-sm',
                      resolvedFields.includes(field.value)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-muted-foreground/40 hover:border-primary'
                    )}
                  >
                    {field.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Uses structured outputs with confidence scores and up to five
                concise tags per document. Responses are forced to English.
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={runHealthCheck}
                  disabled={healthLoading || !openaiConfigured}
                >
                  {healthLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    'Verify OpenAI'
                  )}
                </Button>
                <Button
                  onClick={startJob}
                  disabled={
                    loading ||
                    !openaiConfigured ||
                    (health !== null && !health.healthy)
                  }
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      Start processing
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current run</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {currentJob ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge
                    variant={
                      currentJob.status === 'completed'
                        ? 'success'
                        : currentJob.status === 'failed'
                          ? 'destructive'
                          : currentJob.status === 'running'
                            ? 'warning'
                            : 'outline'
                    }
                  >
                    {currentJob.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Documents</span>
                  <span>
                    {currentJob.processed_count}/{currentJob.total_count}
                  </span>
                </div>
                <Progress value={progressPercent} />
                <div className="text-xs text-muted-foreground">
                  Targets: {(currentJob.target_fields || []).join(', ')}
                </div>
                {inProgress && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {wsConnected
                      ? 'Live updates connected.'
                      : 'Live updates unavailable. Polling every 5s.'}
                  </div>
                )}
                {currentJob.error && (
                  <div className="text-xs text-red-600">{currentJob.error}</div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No run selected. Launch a job to begin.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle>Results</CardTitle>
            <p className="text-sm text-muted-foreground">
              Review extracted metadata and apply selected rows back to
              paperless-ngx.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!currentJob}
              onClick={() => currentJob && refreshJob(currentJob.id)}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={applySelected}
              disabled={loading || !results.length}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : (
                'Apply selected'
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No suggestions yet. Start a run or wait for it to finish.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 px-2">
                      <Checkbox
                        checked={
                          selectedResultIds.length === results.length &&
                          results.length > 0
                        }
                        onChange={(e) =>
                          setSelectedResultIds(
                            e.target.checked ? results.map((r) => r.id) : []
                          )
                        }
                      />
                    </th>
                    <th className="py-2 px-2">Document</th>
                    <th className="py-2 px-2">Suggestions</th>
                    <th className="py-2 px-2">Status</th>
                    <th className="py-2 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result) => (
                    <tr key={result.id} className="border-b align-top">
                      <td className="py-2 px-2">
                        <Checkbox
                          checked={selectedResultIds.includes(result.id)}
                          onChange={(e) =>
                            setSelectedResultIds((prev) =>
                              e.target.checked
                                ? [...prev, result.id]
                                : prev.filter((id) => id !== result.id)
                            )
                          }
                        />
                      </td>
                      <td className="py-2 px-2">
                        <div className="font-medium">
                          {result.document_title || 'Untitled'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {result.document_correspondent ||
                            'Unknown correspondent'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Tags: {(result.document_tags || []).join(', ') || '—'}
                        </div>
                        {renderPaperlessLink(result.paperless_id)}
                      </td>
                      <td className="py-2 px-2 space-y-2">
                        <div>
                          <span className="font-medium">Title:</span>{' '}
                          {result.suggested_title || '—'}{' '}
                          <span className="text-xs text-muted-foreground">
                            {formatConfidence(result.title_confidence)}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium">Correspondent:</span>{' '}
                          {result.suggested_correspondent || '—'}{' '}
                          <span className="text-xs text-muted-foreground">
                            {formatConfidence(result.correspondent_confidence)}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium">Document type:</span>{' '}
                          {result.suggested_document_type || '—'}{' '}
                          <span className="text-xs text-muted-foreground">
                            {formatConfidence(result.document_type_confidence)}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium">Tags:</span>{' '}
                          {normalizeSuggestedTags(result).join(', ') || '—'}{' '}
                          <span className="text-xs text-muted-foreground">
                            {formatConfidence(result.tags_confidence)}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium">Date:</span>{' '}
                          {formatDate(result.suggested_date)}{' '}
                          <span className="text-xs text-muted-foreground">
                            {formatConfidence(result.date_confidence)}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <Badge
                          variant={
                            result.status === 'applied'
                              ? 'success'
                              : result.status === 'failed'
                                ? 'destructive'
                                : result.status === 'rejected'
                                  ? 'secondary'
                                  : 'outline'
                          }
                        >
                          {result.status}
                        </Badge>
                        {result.error && (
                          <div className="text-xs text-red-600 mt-1">
                            {result.error}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex flex-col gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openReview(result)}
                          >
                            Review
                          </Button>
                          {result.status === 'failed' && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => applyResult(result.id, true)}
                              disabled={loading}
                            >
                              Retry apply
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t pt-3">
            <p className="text-sm font-medium mb-2">Fields to apply</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={cn(
                  'px-3 py-1 rounded-md border text-sm',
                  applyFields.length === fieldOptions.length
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-muted-foreground/40 hover:border-primary'
                )}
                onClick={() => setApplyFields(fieldOptions.map((f) => f.value))}
              >
                All fields
              </button>
              {fieldOptions.map((field) => (
                <button
                  key={field.value}
                  type="button"
                  onClick={() => toggleApplyField(field.value)}
                  className={cn(
                    'px-3 py-1 rounded-md border text-sm',
                    applyFields.includes(field.value)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-muted-foreground/40 hover:border-primary'
                  )}
                >
                  {field.label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={reviewOpen}
        onOpenChange={(open) => {
          if (!open) closeReview();
        }}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Review AI suggestions</DialogTitle>
            <DialogDescription>
              Approve, reject, or edit each field before applying updates.
            </DialogDescription>
          </DialogHeader>
          {reviewResult ? (
            <div className="space-y-4">
              <div className="grid md:grid-cols-[220px,1fr] gap-4">
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Preview
                  </div>
                  <div className="rounded-md border bg-muted/20 p-2 min-h-[180px] flex items-center justify-center">
                    {previewLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Document preview"
                        className="max-h-44 w-full object-contain rounded"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Preview not available
                      </span>
                    )}
                  </div>
                  {renderPaperlessLink(reviewResult.paperless_id)}
                </div>
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    OCR excerpt
                  </div>
                  <ScrollArea className="h-44 rounded-md border p-3 text-xs whitespace-pre-wrap">
                    {ocrLoading ? (
                      <div className="text-muted-foreground">Loading OCR…</div>
                    ) : ocrContent?.full_text ? (
                      ocrContent.full_text.slice(0, 1200)
                    ) : (
                      'No OCR text available.'
                    )}
                  </ScrollArea>
                </div>
              </div>

              <div className="space-y-3">
                {renderReviewRow({
                  field: 'title',
                  label: 'Title',
                  currentValue: reviewResult.document_title || '',
                  suggestedValue: reviewResult.suggested_title || '',
                  confidence: reviewResult.title_confidence,
                })}
                {renderReviewRow({
                  field: 'correspondent',
                  label: 'Correspondent',
                  currentValue: reviewResult.document_correspondent || '',
                  suggestedValue: reviewResult.suggested_correspondent || '',
                  confidence: reviewResult.correspondent_confidence,
                })}
                {renderReviewRow({
                  field: 'document_type',
                  label: 'Document type',
                  currentValue: reviewResult.document_type || '',
                  suggestedValue: reviewResult.suggested_document_type || '',
                  confidence: reviewResult.document_type_confidence,
                })}
                {renderReviewRow({
                  field: 'tags',
                  label: 'Tags',
                  currentValue: (reviewResult.document_tags || []).join(', '),
                  suggestedValue:
                    normalizeSuggestedTags(reviewResult).join(', '),
                  confidence: reviewResult.tags_confidence,
                  placeholder: 'tag1, tag2, tag3',
                })}
                {renderReviewRow({
                  field: 'date',
                  label: 'Date',
                  currentValue: '—',
                  suggestedValue: formatDate(reviewResult.suggested_date),
                  confidence: reviewResult.date_confidence,
                  inputType: 'date',
                })}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Select a result to review.
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={closeReview}
              disabled={reviewSaving}
            >
              Close
            </Button>
            <Button
              variant="outline"
              onClick={saveReview}
              disabled={!reviewResult || reviewSaving}
            >
              {reviewSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save review'
              )}
            </Button>
            <Button
              onClick={applyReviewResult}
              disabled={!reviewResult || loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : reviewResult?.status === 'failed' ? (
                'Retry apply'
              ) : (
                'Apply now'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Recent jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No jobs yet.</p>
          ) : (
            <div className="grid md:grid-cols-3 gap-3">
              {jobs.map((job) => (
                <button
                  key={job.id}
                  onClick={() => {
                    setCurrentJob(job);
                    setApplyFields(job.target_fields || []);
                  }}
                  className={cn(
                    'p-3 text-left rounded-md border transition hover:border-primary',
                    currentJob?.id === job.id
                      ? 'border-primary bg-primary/5'
                      : 'border-muted-foreground/30'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Job #{job.id}</span>
                    <Badge variant="outline">{job.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {job.processed_count}/{job.total_count} processed
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {job.tag_filter
                      ? `Tag: ${job.tag_filter}`
                      : 'All documents'}
                  </p>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AIProcessingPage;
