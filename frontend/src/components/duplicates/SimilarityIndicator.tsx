import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../store/store';
import { Badge } from '../ui/Badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/Tooltip';
import { Percent } from 'lucide-react';

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

interface SimilarityIndicatorProps {
  similarity: {
    overall: number;
    jaccard_similarity: number;
    fuzzy_text_ratio: number;
    metadata_similarity: number;
  };
  className?: string;
}

const SimilarityIndicator: React.FC<SimilarityIndicatorProps> = ({
  similarity,
  className = '',
}) => {
  const getSimilarityColorClass = (score: number): string => {
    if (score >= 0.9) return 'text-green-700 bg-green-100 border-green-300';
    if (score >= 0.7) return 'text-yellow-700 bg-yellow-100 border-yellow-300';
    return 'text-red-700 bg-red-100 border-red-300';
  };

  const overallPercent = Math.round(similarity.overall * 100);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`cursor-help ${getSimilarityColorClass(
              similarity.overall
            )} ${className}`}
          >
            <Percent className="h-3 w-3 mr-1" />
            {overallPercent}% similar
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs p-0">
          <SimilarityBreakdown similarity={similarity} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

interface SimilarityBreakdownProps {
  similarity: SimilarityIndicatorProps['similarity'];
}

const SimilarityBreakdown: React.FC<SimilarityBreakdownProps> = ({
  similarity,
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
      label: 'Overall Similarity',
      value: similarity.overall,
      color: 'bg-indigo-500',
      weight: 'Combined',
    },
    {
      label: 'Content Similarity',
      value: similarity.jaccard_similarity,
      color: 'bg-blue-500',
      weight: `${weights.jaccard}%`,
    },
    {
      label: 'Text Fuzzy Match',
      value: similarity.fuzzy_text_ratio,
      color: 'bg-green-500',
      weight: `${weights.fuzzy}%`,
    },
    {
      label: 'Metadata Match',
      value: similarity.metadata_similarity,
      color: 'bg-yellow-500',
      weight: `${weights.metadata}%`,
    },
  ];

  return (
    <div className="p-3 space-y-4 min-w-[280px]">
      <div className="text-center">
        <h4 className="font-semibold text-sm mb-1">Similarity to Primary</h4>
        <p className="text-xs text-muted-foreground">
          How similar this document is to the primary document
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
        <p>• Filename: Original filename similarity</p>
      </div>
    </div>
  );
};

export default SimilarityIndicator;
