import React, { useState } from 'react';
import { useAppDispatch } from '../../hooks/redux';
import {
  reviewDuplicateGroup,
  deleteDuplicateGroup,
} from '../../store/slices/duplicatesSlice';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Progress } from '../ui/Progress';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Trash2,
  FileText,
  Calendar,
  BarChart3,
  Copy,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import type { DuplicateGroup } from '../../services/api/types';

interface DuplicateGroupCardProps {
  group: DuplicateGroup;
  className?: string;
  onDocumentSelect?: (documentId: number) => void;
}

interface ConfidenceBreakdownProps {
  breakdown?: DuplicateGroup['confidence_breakdown'];
  overallConfidence: number;
}

// Component to visualize confidence breakdown
const ConfidenceBreakdown: React.FC<ConfidenceBreakdownProps> = ({
  breakdown,
  overallConfidence,
}) => {
  if (!breakdown) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Overall Confidence</span>
          <span className="text-sm font-bold">
            {Math.round(overallConfidence * 100)}%
          </span>
        </div>
        <Progress value={overallConfidence * 100} className="h-3" />
      </div>
    );
  }

  const metrics = [
    {
      label: 'Jaccard Similarity',
      value: breakdown.jaccard_similarity,
      color: 'bg-blue-500',
      weight: '40%',
    },
    {
      label: 'Fuzzy Text Match',
      value: breakdown.fuzzy_text_ratio,
      color: 'bg-green-500',
      weight: '30%',
    },
    {
      label: 'Metadata Match',
      value: breakdown.metadata_similarity,
      color: 'bg-yellow-500',
      weight: '20%',
    },
    {
      label: 'Filename Match',
      value: breakdown.filename_similarity,
      color: 'bg-purple-500',
      weight: '10%',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Overall Confidence</span>
        <span className="text-lg font-bold text-primary">
          {Math.round(overallConfidence * 100)}%
        </span>
      </div>
      <Progress value={overallConfidence * 100} className="h-3" />

      <div className="space-y-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <div
                  className={`w-3 h-3 rounded-full ${metric.color}`}
                  aria-hidden="true"
                />
                <span className="font-medium">{metric.label}</span>
                <span className="text-muted-foreground">({metric.weight})</span>
              </div>
              <span className="font-medium">
                {Math.round(metric.value * 100)}%
              </span>
            </div>
            <Progress value={metric.value * 100} className="h-1.5" />
          </div>
        ))}
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

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

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  // Get document preview
  const getDocumentPreview = (doc: any) => ({
    title: doc.title,
    created: doc.created,
    fileType: doc.file_type,
    size: doc.archive_serial_number, // Using as placeholder for size
  });

  return (
    <Card className={`transition-all hover:shadow-md ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center space-x-2">
              <Copy className="h-5 w-5" />
              <span>Duplicate Group #{group.id.slice(-8)}</span>
              <Badge variant={getConfidenceColor(group.confidence)}>
                {Math.round(group.confidence * 100)}% match
              </Badge>
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

          <div className="flex items-center space-x-2">
            <Button
              onClick={() => setIsExpanded(!isExpanded)}
              variant="outline"
              size="sm"
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Document List Preview */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Documents in this group:</h4>
          <div className="space-y-2">
            {group.documents
              .slice(0, isExpanded ? undefined : 2)
              .map((doc, index) => {
                const preview = getDocumentPreview(doc);
                return (
                  <div
                    key={doc.id}
                    className={`flex items-center justify-between p-3 rounded-md border cursor-pointer hover:bg-muted/50 ${
                      index === 0
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-background'
                    }`}
                    onClick={() => onDocumentSelect?.(doc.id)}
                  >
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {preview.title}
                        </p>
                        <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                          <span>ID: {doc.id}</span>
                          {preview.fileType && (
                            <span>{preview.fileType.toUpperCase()}</span>
                          )}
                          <span>{formatDate(preview.created)}</span>
                        </div>
                      </div>
                    </div>
                    {index === 0 && (
                      <Badge variant="secondary" className="text-xs">
                        Primary
                      </Badge>
                    )}
                  </div>
                );
              })}

            {!isExpanded && group.documents.length > 2 && (
              <div className="text-center">
                <Button
                  onClick={() => setIsExpanded(true)}
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                >
                  +{group.documents.length - 2} more documents
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Confidence Breakdown */}
        {isExpanded && (
          <div className="pt-4 border-t">
            <div className="flex items-center space-x-2 mb-3">
              <BarChart3 className="h-4 w-4" />
              <h4 className="text-sm font-medium">Confidence Analysis</h4>
            </div>
            <ConfidenceBreakdown
              breakdown={group.confidence_breakdown}
              overallConfidence={group.confidence}
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex items-center space-x-2">
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

            <Button
              onClick={handleDelete}
              disabled={loading}
              variant="outline"
              size="sm"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Group
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DuplicateGroupCard;
