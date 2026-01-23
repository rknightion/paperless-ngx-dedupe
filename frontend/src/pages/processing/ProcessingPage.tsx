import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ProgressTracker } from '../../components/shared';
import { SyncProgress } from '../../components/sync/SyncProgress';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
} from '../../components/ui';
import { Activity, Info, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { processingApi } from '../../services/api/processing';
import { useProcessingStatus } from '../../hooks/redux';
import type { ProcessingHistoryResponse } from '../../services/api/types';

export const ProcessingPage: React.FC = () => {
  const handleProcessingComplete = (results: any) => {
    console.log('Processing completed:', results);
    // Could show notification or redirect
  };
  const { status } = useProcessingStatus();
  const [history, setHistory] = useState<ProcessingHistoryResponse['runs']>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const data = await processingApi.getProcessingHistory();
      setHistory(data.runs || []);
    } catch (error: any) {
      console.error('Failed to load processing history:', error);
      setHistoryError('Failed to load processing history');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (
      status.status &&
      ['completed', 'failed', 'cancelled'].includes(status.status)
    ) {
      loadHistory();
    }
  }, [status.status, status.completed_at, loadHistory]);

  const formatDuration = (
    started?: string | null,
    completed?: string | null
  ) => {
    if (!started || !completed) return '—';
    const start = new Date(started).getTime();
    const end = new Date(completed).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return '—';
    const seconds = Math.round((end - start) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remaining}s`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const renderStatusBadge = (value: string) => {
    const normalized = value.toLowerCase();
    const variant =
      normalized === 'completed'
        ? 'success'
        : normalized === 'failed'
          ? 'destructive'
          : normalized === 'cancelled'
            ? 'warning'
            : 'secondary';
    return (
      <Badge variant={variant} className="text-xs">
        {value.replace('_', ' ')}
      </Badge>
    );
  };

  const historyRows = useMemo(() => history.slice(0, 10), [history]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Processing Control
        </h1>
        <p className="text-muted-foreground">
          Monitor and control document deduplication analysis
        </p>
      </div>

      {/* Document Sync */}
      <SyncProgress />

      {/* Main Progress Tracker */}
      <ProgressTracker
        showControls={true}
        onComplete={handleProcessingComplete}
      />

      {/* Processing History */}
      <Card>
        <CardHeader className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle>Processing History</CardTitle>
            <p className="text-sm text-muted-foreground">
              Recent deduplication runs with task metadata.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadHistory}
            disabled={historyLoading}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="text-sm text-muted-foreground">
              Loading history…
            </div>
          ) : historyError ? (
            <div className="text-sm text-red-600">{historyError}</div>
          ) : historyRows.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No processing runs yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2">Run</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Started</th>
                    <th className="py-2">Duration</th>
                    <th className="py-2 text-right">Docs</th>
                    <th className="py-2 text-right">Groups</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((run) => (
                    <tr key={run.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-4">
                        <div className="text-sm font-medium">
                          {run.id.slice(-8)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {run.id}
                        </div>
                      </td>
                      <td className="py-2">{renderStatusBadge(run.status)}</td>
                      <td className="py-2">
                        {run.started_at
                          ? new Date(run.started_at).toLocaleString()
                          : '—'}
                      </td>
                      <td className="py-2">
                        {formatDuration(run.started_at, run.completed_at)}
                      </td>
                      <td className="py-2 text-right">
                        {run.documents_processed.toLocaleString()}
                      </td>
                      <td className="py-2 text-right">
                        {run.groups_found.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {historyRows.some((run) => run.error) && (
            <div className="mt-4 text-xs text-muted-foreground">
              Tip: failed runs include error details in the backend logs.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Information Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Info className="h-5 w-5" />
            <span>About the Deduplication Process</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="prose text-sm text-muted-foreground max-w-none">
            <p>
              The deduplication analysis uses advanced algorithms to identify
              potentially duplicate documents in your paperless-ngx library. The
              process involves several steps:
            </p>

            <ol className="list-decimal list-inside space-y-2 mt-4">
              <li>
                <strong>Document Loading:</strong> Retrieval of document
                metadata and OCR content from your paperless-ngx instance
              </li>
              <li>
                <strong>Content Processing:</strong> Generation of MinHash
                fingerprints for efficient similarity detection
              </li>
              <li>
                <strong>Similarity Analysis:</strong> Comparison of documents
                using Locality-Sensitive Hashing (LSH) for fast candidate
                identification
              </li>
              <li>
                <strong>Fuzzy Matching:</strong> Detailed comparison of
                candidate pairs using fuzzy text matching algorithms
              </li>
              <li>
                <strong>Confidence Scoring:</strong> Calculation of confidence
                scores based on multiple similarity factors
              </li>
              <li>
                <strong>Group Formation:</strong> Organization of similar
                documents into duplicate groups for review
              </li>
            </ol>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-medium text-blue-900 mb-2">
                Processing Tips:
              </h4>
              <ul className="text-blue-800 text-sm space-y-1">
                <li>
                  • Higher similarity thresholds reduce false positives but may
                  miss some duplicates
                </li>
                <li>
                  • Force rebuild will reprocess all documents, useful after
                  configuration changes
                </li>
                <li>
                  • Document limits are helpful for testing with large libraries
                </li>
                <li>
                  • Processing speed depends on document count and OCR text
                  length
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Metrics */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Activity className="h-5 w-5" />
              <span>Algorithm Details</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-medium">MinHash Permutations</div>
                <div className="text-muted-foreground">128 hash functions</div>
              </div>
              <div>
                <div className="font-medium">LSH Bands</div>
                <div className="text-muted-foreground">16 bands × 8 rows</div>
              </div>
              <div>
                <div className="font-medium">Similarity Threshold</div>
                <div className="text-muted-foreground">
                  Configurable (80% default)
                </div>
              </div>
              <div>
                <div className="font-medium">Confidence Weights</div>
                <div className="text-muted-foreground">
                  Jaccard + Fuzzy + Metadata
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Expected Performance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>1,000 documents</span>
                <span className="text-muted-foreground">~8-10 minutes</span>
              </div>
              <div className="flex justify-between">
                <span>5,000 documents</span>
                <span className="text-muted-foreground">~40-50 minutes</span>
              </div>
              <div className="flex justify-between">
                <span>10,000 documents</span>
                <span className="text-muted-foreground">~80-100 minutes</span>
              </div>
              <div className="flex justify-between">
                <span>15,000 documents</span>
                <span className="text-muted-foreground">~120-150 minutes</span>
              </div>
              <div className="flex justify-between">
                <span>Processing speed</span>
                <span className="text-muted-foreground">~100-150 docs/min</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              * LSH index building is the slowest phase. Times vary based on
              document size, OCR content length (up to 500K chars), and system
              performance.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ProcessingPage;
