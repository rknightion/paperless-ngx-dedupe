import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Filter,
  Layers,
  Loader2,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { duplicatesApi } from '../../services/api/duplicates';
import { batchApi } from '../../services/api/batch';
import type { DuplicateGroup } from '../../services/api/types';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Progress,
} from '../../components/ui';
import { ScrollArea } from '../../components/ui/ScrollArea';
import { cn } from '../../utils/cn';

interface WizardFilters {
  minConfidence: number;
  tag: string;
  correspondent: string;
  documentType: string;
}

const steps = [
  {
    id: 1,
    title: 'Target Groups',
    description: 'Filter and pick the right duplicates',
  },
  {
    id: 2,
    title: 'Bulk Action',
    description: 'Confirm what happens to non-primary docs',
  },
  {
    id: 3,
    title: 'Review & Launch',
    description: 'Double-check impact and run',
  },
];

export const BulkWizardPage: React.FC = () => {
  const [activeStep, setActiveStep] = useState(1);
  const [filters, setFilters] = useState<WizardFilters>({
    minConfidence: 0.85,
    tag: '',
    correspondent: '',
    documentType: '',
  });
  const [candidates, setCandidates] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [keepPrimary, setKeepPrimary] = useState(true);
  const [markReviewed, setMarkReviewed] = useState(true);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getConfidenceBadgeVariant = (score: number) => {
    if (score >= 0.9) return 'success';
    if (score >= 0.7) return 'warning';
    return 'secondary';
  };

  const loadCandidates = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await duplicatesApi.getDuplicateGroups({
        page: 1,
        page_size: 200,
        min_confidence: filters.minConfidence,
        tag: filters.tag || undefined,
        correspondent: filters.correspondent || undefined,
        document_type: filters.documentType || undefined,
        sort_by: 'confidence',
        sort_order: 'desc',
      });
      const groups = response.groups || [];
      const filteredGroups = groups.filter((group) => {
        const matchesConfidence = group.confidence >= filters.minConfidence;
        const matchesTag =
          !filters.tag ||
          group.documents.some((doc) =>
            (doc.tags || []).some((tag) =>
              tag.toLowerCase().includes(filters.tag.toLowerCase())
            )
          );
        const matchesCorrespondent =
          !filters.correspondent ||
          group.documents.some(
            (doc) =>
              doc.correspondent &&
              doc.correspondent
                .toLowerCase()
                .includes(filters.correspondent.toLowerCase())
          );
        const matchesDocumentType =
          !filters.documentType ||
          group.documents.some(
            (doc) =>
              doc.document_type &&
              doc.document_type
                .toLowerCase()
                .includes(filters.documentType.toLowerCase())
          );
        return (
          matchesConfidence &&
          matchesTag &&
          matchesCorrespondent &&
          matchesDocumentType
        );
      });
      setCandidates(filteredGroups);
      setSelectedGroups([]);
    } catch (err: any) {
      setError(err?.message || 'Failed to load duplicate groups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleGroup = (id: string) => {
    setSelectedGroups((prev) =>
      prev.includes(id) ? prev.filter((gid) => gid !== id) : [...prev, id]
    );
  };

  const selectionStats = useMemo(() => {
    const selected = candidates.filter((c) => selectedGroups.includes(c.id));
    const documents = selected.reduce(
      (acc, group) => acc + (group.documents?.length || 0),
      0
    );
    const deletions = selected.reduce(
      (acc, group) =>
        acc +
        Math.max((group.documents?.length || 1) - (keepPrimary ? 1 : 0), 0),
      0
    );
    return { groups: selected.length, documents, deletions };
  }, [candidates, keepPrimary, selectedGroups]);
  const canProceed = selectedGroups.length > 0;

  const runBulkResolve = async () => {
    if (!selectedGroups.length) return;
    setLoading(true);
    setError(null);
    try {
      const result = await batchApi.bulkResolveDuplicates(
        selectedGroups,
        keepPrimary
      );
      if (markReviewed) {
        try {
          await batchApi.bulkReviewDuplicates(selectedGroups, true);
        } catch (reviewErr) {
          console.warn('Bulk review update failed after resolve', reviewErr);
        }
      }
      setOperationId(
        result.operation_id ||
          // Some backends return task_id when enqueueing jobs
          (result as any).task_id ||
          null
      );
      setActiveStep(3);
    } catch (err: any) {
      setError(err?.message || 'Bulk resolve failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6 shadow-lg">
        <div className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-cyan-500 via-transparent to-transparent" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-300">
              Bulk Wizard
            </p>
            <h1 className="text-3xl font-bold mt-1">
              Resolve duplicates in guided steps
            </h1>
            <p className="text-slate-300 max-w-xl">
              Filter the right groups, preview the impact, then delete
              non-primary documents in one confident action.
            </p>
            <div className="flex items-center gap-3 mt-4">
              <Badge variant="secondary" className="bg-white/10 text-white">
                {selectedGroups.length} group(s) selected
              </Badge>
              <Badge variant="secondary" className="bg-white/10 text-white">
                {selectionStats.deletions} deletions planned
              </Badge>
              <Link to="/duplicates" className="underline text-slate-200">
                Back to Duplicates
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/10 rounded-xl p-3 border border-white/20">
              <p className="text-xs text-slate-200">Ready to review</p>
              <p className="text-2xl font-semibold">
                {candidates.length.toLocaleString()}
              </p>
              <p className="text-xs text-slate-300">candidate groups</p>
            </div>
            <div className="bg-white/10 rounded-xl p-3 border border-white/20">
              <p className="text-xs text-slate-200">Projected deletes</p>
              <p className="text-2xl font-semibold">
                {selectionStats.deletions.toLocaleString()}
              </p>
              <p className="text-xs text-slate-300">non-primary docs</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {steps.map((step) => {
          const isActive = step.id === activeStep;
          const isComplete = step.id < activeStep;
          return (
            <Card
              key={step.id}
              className={cn(
                'border-2',
                isActive
                  ? 'border-cyan-500 shadow-md'
                  : isComplete
                    ? 'border-green-500'
                    : 'border-muted'
              )}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Step {step.id}: {step.title}
                </CardTitle>
                {isComplete ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <Sparkles
                    className={cn('h-4 w-4', isActive && 'text-cyan-500')}
                  />
                )}
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {step.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Step 1: Filter + select */}
      <Card className={cn(activeStep !== 1 && 'opacity-70')}>
        <CardHeader className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            <CardTitle>Filter duplicate groups</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadCandidates}>
              Refresh
            </Button>
            <Button
              size="sm"
              disabled={loading || !canProceed}
              onClick={() => setActiveStep(2)}
              className="flex items-center gap-1"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-4 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Min confidence</label>
              <Input
                type="range"
                min="0.5"
                max="1"
                step="0.05"
                value={filters.minConfidence}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    minConfidence: parseFloat(e.target.value),
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Showing scores ≥ {Math.round(filters.minConfidence * 100)}%
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Correspondent</label>
              <Input
                placeholder="Matches text"
                value={filters.correspondent}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    correspondent: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Document type</label>
              <Input
                placeholder="e.g. invoice"
                value={filters.documentType}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    documentType: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tag contains</label>
              <Input
                placeholder="Any tag name"
                value={filters.tag}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, tag: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={loadCandidates} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Apply filters
            </Button>
            <span className="text-sm text-muted-foreground">
              {candidates.length} groups match these filters.
            </span>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-red-50 text-red-700 border border-red-200">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <div className="border rounded-lg">
            <div className="flex items-center justify-between px-4 py-3 bg-muted/50">
              <div>
                <p className="font-semibold">
                  Select duplicate groups ({selectedGroups.length} chosen)
                </p>
                <p className="text-xs text-muted-foreground">
                  Hover each row for metadata; primary docs stay, others are
                  removed.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {selectionStats.deletions} duplicates will be deleted
                </Badge>
                <Badge variant="outline">
                  {selectionStats.documents} documents involved
                </Badge>
              </div>
            </div>

            <ScrollArea className="max-h-[400px]">
              <div className="divide-y">
                {candidates.map((group) => {
                  const selected = selectedGroups.includes(group.id);
                  const deletions =
                    Math.max(
                      (group.documents?.length || 1) - (keepPrimary ? 1 : 0),
                      0
                    ) || 0;
                  return (
                    <div
                      key={group.id}
                      className={cn(
                        'flex items-center justify-between px-4 py-3 transition-colors',
                        selected ? 'bg-cyan-50' : 'hover:bg-muted/40'
                      )}
                      onClick={() => toggleGroup(group.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'h-4 w-4 border rounded-sm',
                            selected
                              ? 'bg-cyan-500 border-cyan-500'
                              : 'border-muted'
                          )}
                        />
                        <div>
                          <p className="font-medium flex items-center gap-2">
                            <span>Group #{group.id}</span>
                            <Badge
                              variant={getConfidenceBadgeVariant(
                                group.confidence
                              )}
                              className="text-xs"
                            >
                              {Math.round(group.confidence * 100)}% match
                            </Badge>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {group.documents?.length || 0} document(s) •{' '}
                            {group.documents
                              ?.map((d) => d.title)
                              .filter(Boolean)
                              .slice(0, 3)
                              .join(' • ')}
                            {group.documents && group.documents.length > 3
                              ? ' …'
                              : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <Badge variant="outline">{deletions} to delete</Badge>
                        {group.reviewed && (
                          <Badge
                            variant="secondary"
                            className="bg-green-100 text-green-800"
                          >
                            Reviewed
                          </Badge>
                        )}
                        <Link
                          to={`/duplicates`}
                          className="text-xs underline text-muted-foreground"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Open in Duplicates
                        </Link>
                      </div>
                    </div>
                  );
                })}

                {candidates.length === 0 && !loading && (
                  <div className="text-sm text-muted-foreground px-4 py-6">
                    No groups found for these filters. Try reducing the
                    confidence threshold or clearing tag filters.
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Action definition */}
      <Card className={cn(activeStep !== 2 && 'opacity-70')}>
        <CardHeader className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4" />
            <CardTitle>What should happen?</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveStep(1)}
              disabled={loading}
            >
              Back
            </Button>
            <Button
              size="sm"
              disabled={!canProceed || loading}
              onClick={() => setActiveStep(3)}
              className="flex items-center gap-1"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-green-600" />
                  Keep primaries, delete duplicates
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  For each selected group, keep the primary (blue badge) and
                  delete the others in Paperless-NGX. Groups will be marked
                  resolved.
                </p>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={keepPrimary}
                    onChange={(e) => setKeepPrimary(e.target.checked)}
                  />
                  Keep primaries (recommended)
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={markReviewed}
                    onChange={(e) => setMarkReviewed(e.target.checked)}
                  />
                  Mark groups as reviewed after resolution
                </label>
              </CardContent>
            </Card>

            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-blue-600" />
                  Impact preview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span>Groups selected</span>
                  <span className="font-semibold">{selectionStats.groups}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Documents touched</span>
                  <span className="font-semibold">
                    {selectionStats.documents.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Planned deletions</span>
                  <span className="font-semibold text-red-600">
                    {selectionStats.deletions.toLocaleString()}
                  </span>
                </div>
                <Progress value={selectionStats.groups ? 100 : 0} />
                <p className="text-xs text-muted-foreground">
                  Bulk actions are executed via the batch API. You can monitor
                  operation status from the Batch Operations screen.
                </p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Step 3: Confirmation */}
      <Card className={cn(activeStep !== 3 && 'opacity-70')}>
        <CardHeader className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BadgeCheck className="h-4 w-4 text-green-600" />
            <CardTitle>Review & launch</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveStep(2)}
              disabled={loading}
            >
              Back
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!selectedGroups.length || loading}
              onClick={runBulkResolve}
              className="flex items-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Launch bulk resolve
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>
              This will delete non-primary documents in each selected group
              inside Paperless-NGX. Ensure backups or test environments are in
              place.
            </span>
          </div>
          <div className="grid md:grid-cols-3 gap-3 text-sm">
            <div className="p-3 border rounded-md">
              <p className="text-muted-foreground">Groups</p>
              <p className="text-2xl font-semibold">{selectionStats.groups}</p>
            </div>
            <div className="p-3 border rounded-md">
              <p className="text-muted-foreground">Documents impacted</p>
              <p className="text-2xl font-semibold">
                {selectionStats.documents.toLocaleString()}
              </p>
            </div>
            <div className="p-3 border rounded-md">
              <p className="text-muted-foreground">Planned deletions</p>
              <p className="text-2xl font-semibold text-red-600">
                {selectionStats.deletions.toLocaleString()}
              </p>
            </div>
          </div>
          {operationId && (
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              <span>
                Bulk resolve queued. Operation ID:{' '}
                <strong>{operationId}</strong>. Track progress in Batch
                Operations.
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BulkWizardPage;
