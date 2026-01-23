import React, { useState } from 'react';
import { useAppDispatch } from '../../hooks/redux';
import { useSelector } from 'react-redux';
import { RootState } from '../../store/store';
import {
  reviewDuplicateGroup,
  deleteDuplicateGroup,
} from '../../store/slices/duplicatesSlice';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/Tooltip';
import {
  Eye,
  EyeOff,
  Trash2,
  FileText,
  Calendar,
  Copy,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  X,
  ArrowLeftRight,
} from 'lucide-react';
import type { DuplicateGroup } from '../../services/api/types';
import { configApi } from '../../services/api/config';
import { documentCache } from '../../services/cache/documentCache';
import SimilarityIndicator from '../duplicates/SimilarityIndicator';
import { DocumentComparisonModal } from '../duplicates/DocumentComparisonModal';

interface DuplicateGroupCardProps {
  group: DuplicateGroup;
  className?: string;
  onDocumentSelect?: (documentId: number) => void;
}

// Custom progress bar with proper color coding based on value
const ColoredProgress: React.FC<{ value: number; className?: string }> = ({
  value,
  className = '',
}) => {
  // Determine color based on value
  let barColor = 'bg-red-500'; // 0-50% - Poor match
  if (value >= 90) {
    barColor = 'bg-green-500'; // 90-100% - Excellent match
  } else if (value >= 70) {
    barColor = 'bg-yellow-500'; // 70-89% - Good match
  } else if (value >= 50) {
    barColor = 'bg-orange-500'; // 50-69% - Fair match
  }

  return (
    <div
      className={`relative h-2 w-full overflow-hidden rounded-full bg-gray-200 ${className}`}
    >
      <div
        className={`h-full transition-all ${barColor}`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
};

interface ConfidenceBreakdownProps {
  breakdown?: DuplicateGroup['confidence_breakdown'];
  overallConfidence: number;
}

// Component to visualize confidence breakdown - matching SimilarityBreakdown style
const ConfidenceBreakdown: React.FC<ConfidenceBreakdownProps> = ({
  breakdown,
  overallConfidence,
}) => {
  // Get confidence weights from config
  const config = useSelector((state: RootState) => state.config.configuration);
  const weights = {
    jaccard: config?.confidence_weight_jaccard ?? 90,
    fuzzy: config?.confidence_weight_fuzzy ?? 10,
    metadata: config?.confidence_weight_metadata ?? 0,
  };

  const metrics = [
    {
      label: 'Overall Confidence',
      value: overallConfidence,
      color: 'bg-indigo-500',
      weight: 'Combined',
    },
    {
      label: 'Content Similarity',
      value: breakdown?.jaccard_similarity || 0,
      color: 'bg-blue-500',
      weight: `${weights.jaccard}%`,
    },
    {
      label: 'Text Fuzzy Match',
      value: breakdown?.fuzzy_text_ratio || 0,
      color: 'bg-green-500',
      weight: `${weights.fuzzy}%`,
    },
    {
      label: 'Metadata Match',
      value: breakdown?.metadata_similarity || 0,
      color: 'bg-yellow-500',
      weight: `${weights.metadata}%`,
    },
  ];

  return (
    <div className="p-3 space-y-4 min-w-[280px]">
      <div className="text-center">
        <h4 className="font-semibold text-sm mb-1">Group Confidence</h4>
        <p className="text-xs text-muted-foreground">
          How confident we are these documents are duplicates
        </p>
      </div>

      <div className="space-y-3">
        {metrics.map((metric, index) => (
          <div key={metric.label}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center space-x-2">
                <div
                  className={`w-3 h-3 rounded-full ${metric.color}`}
                  aria-hidden="true"
                />
                <span className="text-xs font-medium">{metric.label}</span>
                <span className="text-xs text-muted-foreground">
                  ({metric.weight})
                </span>
              </div>
              <span className="text-xs font-bold">
                {Math.round((metric.value || 0) * 100)}%
              </span>
            </div>
            <ColoredProgress
              value={(metric.value || 0) * 100}
              className={index === 0 ? 'mb-2' : ''}
            />
            {index === 0 && <hr className="border-muted" />}
          </div>
        ))}
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>• Content: Based on document text similarity</p>
        <p>• Text: Fuzzy matching accounting for OCR variations</p>
        <p>• Metadata: File size, dates, types, correspondents</p>
      </div>
    </div>
  );
};

export const DuplicateGroupCard: React.FC<DuplicateGroupCardProps> = ({
  group,
  className,
  onDocumentSelect,
}) => {
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [previewCache, setPreviewCache] = useState<Record<number, string>>({});
  const [previewLoading, setPreviewLoading] = useState<Record<number, boolean>>(
    {}
  );

  // Find the primary document in the group
  const primaryDocument =
    group.documents?.find((d) => d.is_primary) || group.documents?.[0];

  // Debug logging to check group data
  console.log(
    `Group ${group.id} has ${group.documents?.length || 0} documents:`,
    group.documents
  );

  // Handle review status toggle
  const handleReviewToggle = async () => {
    setLoading(true);
    try {
      await dispatch(
        reviewDuplicateGroup({ id: group.id, reviewed: !group.reviewed })
      ).unwrap();
    } catch (error) {
      console.error('Failed to update review status:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle group deletion
  const handleDelete = async () => {
    if (
      !window.confirm('Are you sure you want to delete this duplicate group?')
    ) {
      return;
    }

    setLoading(true);
    try {
      await dispatch(deleteDuplicateGroup(group.id)).unwrap();
    } catch (error) {
      console.error('Failed to delete group:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get confidence color based on percentage
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'success';
    if (confidence >= 0.7) return 'warning';
    return 'secondary';
  };

  // Format date with fallback for invalid dates
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'No date';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'No date';
      return date.toLocaleDateString();
    } catch {
      return 'No date';
    }
  };

  // Get document preview
  const getDocumentPreview = (doc: any) => ({
    title: doc.title,
    created: doc.created || doc.created_date,
    fileType: doc.file_type || 'pdf',
    size:
      doc.original_file_size ??
      doc.archive_file_size ??
      doc.archive_serial_number,
    paperlessId: doc.paperless_id || doc.id,
  });

  // Open document in paperless
  const openInPaperless = async (documentId: number) => {
    try {
      const config = await configApi.getConfiguration();
      const paperlessUrl = config.paperless_url.replace(/\/+$/, '');
      window.open(`${paperlessUrl}/documents/${documentId}/details`, '_blank');
    } catch (error) {
      console.error('Failed to get paperless URL:', error);
      // Fallback to a reasonable default
      window.open(`/documents/${documentId}/details`, '_blank');
    }
  };

  // Handle removing a document from the group
  const handleRemoveFromGroup = async (documentId: number) => {
    if (
      !window.confirm(
        'Are you sure you want to remove this document from the group?'
      )
    ) {
      return;
    }
    try {
      // Call API to remove document from group
      console.log('Removing document', documentId, 'from group', group.id);
      // TODO: Implement API call to remove document from group
      alert('Document removal feature will be implemented soon');
    } catch (error) {
      console.error('Failed to remove document from group:', error);
    }
  };

  // Handle deleting a document from Paperless
  const handleDeleteDocument = async (
    documentId: number,
    paperlessId: number
  ) => {
    if (
      !window.confirm(
        'Are you sure you want to permanently delete this document from Paperless-ngx?'
      )
    ) {
      return;
    }
    try {
      // Call API to delete document from Paperless
      console.log(
        'Deleting document',
        documentId,
        'with Paperless ID',
        paperlessId
      );
      // TODO: Implement API call to delete document from Paperless
      alert('Document deletion feature will be implemented soon');
    } catch (error) {
      console.error('Failed to delete document:', error);
    }
  };

  const prefetchPreview = async (documentId: number) => {
    if (previewCache[documentId] || previewLoading[documentId]) {
      return;
    }
    const cached = documentCache.peekPreviewDataUrl(documentId);
    if (cached) {
      setPreviewCache((prev) => ({ ...prev, [documentId]: cached }));
      return;
    }

    setPreviewLoading((prev) => ({ ...prev, [documentId]: true }));
    try {
      const dataUrl = await documentCache.getPreviewDataUrl(documentId);
      setPreviewCache((prev) => ({
        ...prev,
        [documentId]: dataUrl || '',
      }));
    } catch (error) {
      console.error('Failed to fetch preview', error);
      setPreviewCache((prev) => ({ ...prev, [documentId]: '' }));
    } finally {
      setPreviewLoading((prev) => ({ ...prev, [documentId]: false }));
    }
  };

  return (
    <Card className={`transition-all hover:shadow-md ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center space-x-2">
              <Copy className="h-5 w-5" />
              <span>Duplicate Group #{group.id.slice(-8)}</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant={getConfidenceColor(group.confidence)}
                      className="cursor-help"
                    >
                      {Math.round(group.confidence * 100)}% match
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs p-0">
                    <ConfidenceBreakdown
                      breakdown={group.confidence_breakdown}
                      overallConfidence={group.confidence}
                    />
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {group.reviewed && (
                <Badge
                  variant="outline"
                  className="text-green-700 border-green-300"
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Reviewed
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
              <div className="flex items-center space-x-1">
                <FileText className="h-4 w-4" />
                <span>{group.documents.length} documents</span>
              </div>
              <div className="flex items-center space-x-1">
                <Calendar className="h-4 w-4" />
                <span>Found: {formatDate(group.created_at)}</span>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Document List */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Documents in this group:</h4>
          <div className="space-y-2">
            {group.documents.map((doc, index) => {
              const preview = getDocumentPreview(doc);
              return (
                <Tooltip key={doc.id} delayDuration={200}>
                  <TooltipTrigger asChild>
                    <div
                      className="relative flex items-center justify-between p-3 rounded-md border bg-background hover:bg-muted/50"
                      onMouseEnter={() => prefetchPreview(doc.id)}
                    >
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-2">
                            <p className="text-sm font-medium truncate">
                              {preview.title}
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                openInPaperless(preview.paperlessId);
                              }}
                              title="Open in Paperless-ngx"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                            <span>ID: {preview.paperlessId}</span>
                            {preview.fileType && (
                              <span>{preview.fileType.toUpperCase()}</span>
                            )}
                            <span>{formatDate(preview.created)}</span>
                            {doc.page_estimate && (
                              <span>{doc.page_estimate}p est.</span>
                            )}
                          </div>
                          {/* Additional metadata */}
                          {(doc.correspondent ||
                            doc.document_type ||
                            (doc.tags && doc.tags.length > 0)) && (
                            <div className="flex items-center flex-wrap gap-1 mt-1">
                              {doc.correspondent && (
                                <Badge
                                  variant="outline"
                                  className="text-xs py-0"
                                >
                                  {doc.correspondent}
                                </Badge>
                              )}
                              {doc.document_type && (
                                <Badge
                                  variant="outline"
                                  className="text-xs py-0"
                                >
                                  {doc.document_type}
                                </Badge>
                              )}
                              {doc.tags &&
                                doc.tags.map((tag: string) => (
                                  <Badge
                                    key={tag}
                                    variant="secondary"
                                    className="text-xs py-0"
                                  >
                                    {tag}
                                  </Badge>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {doc.is_primary && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant="default"
                                  className="text-xs bg-blue-500 hover:bg-blue-600 cursor-help"
                                >
                                  Primary
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs bg-gray-900 text-white">
                                <p className="font-semibold mb-1">
                                  Primary Document
                                </p>
                                <p className="text-xs">
                                  The primary document is automatically selected
                                  based on these criteria (in order):
                                </p>
                                <ul className="text-xs mt-1 space-y-0.5">
                                  <li>• Newest creation date</li>
                                  <li>
                                    • Most complete metadata (title,
                                    correspondent, tags)
                                  </li>
                                  <li>• Longest OCR content</li>
                                  <li>
                                    • Highest Paperless ID (if all else equal)
                                  </li>
                                </ul>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {!doc.is_primary && doc.similarity_to_primary && (
                          <SimilarityIndicator
                            similarity={doc.similarity_to_primary}
                            className="text-xs"
                          />
                        )}
                      </div>
                      {!doc.is_primary && (
                        <div className="flex items-center space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 hover:bg-red-50 hover:text-red-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveFromGroup(doc.id);
                            }}
                            title="Remove from this group"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 hover:bg-red-50 hover:text-red-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteDocument(doc.id, preview.paperlessId);
                            }}
                            title="Delete from Paperless-ngx"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    align="start"
                    className="max-w-xl p-2"
                  >
                    {previewLoading[doc.id] ? (
                      <div className="text-xs text-muted-foreground">
                        Loading preview from Paperless...
                      </div>
                    ) : previewCache[doc.id] ? (
                      <img
                        src={previewCache[doc.id]}
                        alt="Document preview"
                        className="rounded border max-h-[320px]"
                      />
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        Preview not available for this document.
                      </div>
                    )}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3 pt-4 border-t">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => setShowComparison(true)}
                      variant="outline"
                      size="sm"
                      className="hover:bg-blue-50"
                    >
                      <ArrowLeftRight className="h-3 w-3 mr-1" />
                      Compare
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Open a side-by-side comparison of the primary document and
                    its matches.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleReviewToggle}
                      disabled={loading}
                      variant={group.reviewed ? 'outline' : 'default'}
                      size="sm"
                    >
                      {group.reviewed ? (
                        <>
                          <EyeOff className="h-4 w-4 mr-2" />
                          Mark as Unreviewed
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4 mr-2" />
                          Mark as Reviewed
                        </>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    {group.reviewed
                      ? 'Remove reviewed status to re-examine this group later'
                      : 'Mark as reviewed to track your progress without making changes'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => {
                        if (
                          window.confirm(
                            `This will keep the primary document and delete ${
                              group.documents.length - 1
                            } duplicate(s) from Paperless-NGX. This cannot be undone. Continue?`
                          )
                        ) {
                          // TODO: Implement resolve functionality
                          alert(
                            'Resolve functionality will be implemented soon'
                          );
                        }
                      }}
                      disabled={loading}
                      variant="outline"
                      size="sm"
                      className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 border-orange-300"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Resolve Group
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Keep the primary document and remove duplicates from
                    Paperless-NGX. This frees up storage space by eliminating
                    true duplicates.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="flex items-center space-x-2">
              {!group.reviewed && group.confidence < 0.8 && (
                <div className="flex items-center space-x-1 text-amber-600">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-xs">
                    Low confidence - review carefully
                  </span>
                </div>
              )}

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleDelete}
                      disabled={loading}
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-300"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Group
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Remove this entire group as a false positive. No documents
                    will be deleted from Paperless-NGX.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Action Explanations */}
          <div className="text-xs text-muted-foreground bg-gray-50 p-3 rounded-md">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <span className="font-medium">📝 Review:</span> Track your
                examination progress
              </div>
              <div>
                <span className="font-medium">✅ Resolve:</span> Keep primary,
                delete duplicates
              </div>
              <div>
                <span className="font-medium">❌ Delete Group:</span> Mark as
                false positive
              </div>
              <div>
                <span className="font-medium">💡 Primary:</span> Auto-selected
                (blue badge)
              </div>
            </div>
          </div>
        </div>
      </CardContent>

      {/* Document Comparison Modal */}
      {showComparison && primaryDocument && (
        <DocumentComparisonModal
          open={showComparison}
          onClose={() => setShowComparison(false)}
          primaryDocument={primaryDocument}
          compareDocuments={group.documents.filter((d) => !d.is_primary)}
          confidence={group.confidence}
        />
      )}
    </Card>
  );
};

export default DuplicateGroupCard;
