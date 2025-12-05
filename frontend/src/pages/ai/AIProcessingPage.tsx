import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { aiApi } from '../../services/api/ai';
import type { AIField, AIJob, AIResult } from '../../services/api/types';
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
} from '../../components/ui';
import { useConfig } from '../../hooks/redux';
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
  const { configuration } = useConfig();

  const resolvedFields = useMemo(() => {
    if (targetFields.includes('all')) return fieldOptions.map((f) => f.value);
    return targetFields;
  }, [targetFields]);

  const paperlessUrl = configuration?.paperless_url;

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
    if (!currentJob) return;
    const interval = setInterval(() => {
      if (currentJob && currentJob.status !== 'completed') {
        refreshJob(currentJob.id);
      }
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentJob?.id, currentJob?.status]);

  useEffect(() => {
    if (currentJob?.id) {
      loadResults(currentJob.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentJob?.id]);

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
      setStatusMessage('Job queued. We will poll for progress.');
      setSelectedResultIds([]);
    } catch (err: any) {
      setError(err?.message || 'Failed to start AI processing');
    } finally {
      setLoading(false);
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
      const result = await aiApi.applyResults(currentJob.id, payload);
      setStatusMessage(
        `Applied ${result.applied} suggestion(s). ${result.remaining_pending} still pending review.`
      );
      await loadResults(currentJob.id);
      setSelectedResultIds([]);
    } catch (err: any) {
      setError(err?.message || 'Failed to apply metadata');
    } finally {
      setLoading(false);
    }
  };

  const inProgress = currentJob && currentJob.status !== 'completed';
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
        <Badge variant="outline" className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Structured outputs + prompt caching
        </Badge>
      </div>

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
                  onCheckedChange={(checked) =>
                    setIncludeAll(Boolean(checked))
                  }
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
              <Button onClick={startJob} disabled={loading}>
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
                      currentJob.status === 'completed' ? 'secondary' : 'outline'
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
                    Polling for progress...
                  </div>
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
                        onCheckedChange={(checked) =>
                          setSelectedResultIds(
                            Boolean(checked)
                              ? results.map((r) => r.id)
                              : []
                          )
                        }
                      />
                    </th>
                    <th className="py-2 px-2">Document</th>
                    <th className="py-2 px-2">Suggestions</th>
                    <th className="py-2 px-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result) => (
                    <tr key={result.id} className="border-b align-top">
                      <td className="py-2 px-2">
                        <Checkbox
                          checked={selectedResultIds.includes(result.id)}
                          onCheckedChange={(checked) =>
                            setSelectedResultIds((prev) =>
                              Boolean(checked)
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
                          {result.document_correspondent || 'Unknown correspondent'}
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
                          {(result.suggested_tags || [])
                            .map((tag) =>
                              typeof tag === 'string'
                                ? tag
                                : tag?.value || ''
                            )
                            .filter(Boolean)
                            .join(', ') || '—'}{' '}
                          <span className="text-xs text-muted-foreground">
                            {formatConfidence(result.tags_confidence)}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium">Date:</span>{' '}
                          {result.suggested_date
                            ? new Date(result.suggested_date).toLocaleDateString()
                            : '—'}{' '}
                          <span className="text-xs text-muted-foreground">
                            {formatConfidence(result.date_confidence)}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <Badge
                          variant={
                            result.status === 'applied' ? 'secondary' : 'outline'
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
