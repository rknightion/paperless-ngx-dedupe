import React, { useEffect, useState } from 'react';
import { useAppDispatch, useProcessingStatus } from '../../hooks/redux';
import {
  startAnalysis,
  cancelProcessing,
  fetchProcessingStatus,
} from '../../store/slices/processingSlice';
import { Button } from '../ui/Button';
import { Progress } from '../ui/Progress';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import {
  Play,
  Square,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  Zap,
  Activity,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { AnalyzeRequest } from '../../services/api/types';

interface ProgressTrackerProps {
  className?: string;
  onComplete?: (results: any) => void;
  showControls?: boolean;
}

interface AnalysisSettings {
  threshold?: number;
  force_rebuild: boolean;
  limit?: number;
}

export const ProgressTracker: React.FC<ProgressTrackerProps> = ({
  className,
  onComplete,
  showControls = true,
}) => {
  const dispatch = useAppDispatch();
  const {
    status,
    wsConnected,
    estimatedTimeRemaining,
    processingSpeed,
    loading,
  } = useProcessingStatus();

  const [analysisSettings, setAnalysisSettings] = useState<AnalysisSettings>({
    force_rebuild: false,
  });

  // Fetch initial status on mount
  useEffect(() => {
    dispatch(fetchProcessingStatus());
  }, [dispatch]);

  // Handle completion callback
  useEffect(() => {
    if (
      status.current_step === 'Completed' &&
      status.completed_at &&
      onComplete
    ) {
      onComplete({
        completed_at: status.completed_at,
        documents_processed: status.progress,
      });
    }
  }, [status.current_step, status.completed_at, status.progress, onComplete]);

  // Start analysis
  const handleStart = async () => {
    const request: AnalyzeRequest = {
      threshold: analysisSettings.threshold,
      force_rebuild: analysisSettings.force_rebuild,
      limit: analysisSettings.limit,
    };

    try {
      await dispatch(startAnalysis(request)).unwrap();
    } catch (error) {
      console.error('Failed to start analysis:', error);
    }
  };

  // Cancel analysis
  const handleCancel = async () => {
    try {
      await dispatch(cancelProcessing()).unwrap();
    } catch (error) {
      console.error('Failed to cancel processing:', error);
    }
  };

  // Format time remaining
  const formatTimeRemaining = (seconds: number | null) => {
    if (!seconds) return 'Calculating...';

    if (seconds < 60) return `${seconds}s remaining`;
    if (seconds < 3600)
      return `${Math.floor(seconds / 60)}m ${seconds % 60}s remaining`;

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m remaining`;
  };

  // Format processing speed
  const formatProcessingSpeed = (speed: number | null) => {
    if (!speed) return null;
    return `${speed.toFixed(1)} docs/min`;
  };

  // Get status color and icon
  const getStatusDisplay = () => {
    if (status.error) {
      return {
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        icon: XCircle,
        label: 'Error',
      };
    }

    if (status.is_processing) {
      return {
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        icon: Activity,
        label: 'Processing',
      };
    }

    if (status.current_step === 'Completed') {
      return {
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        icon: CheckCircle,
        label: 'Completed',
      };
    }

    return {
      color: 'text-gray-600',
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-200',
      icon: Clock,
      label: 'Ready',
    };
  };

  const statusDisplay = getStatusDisplay();
  const StatusIcon = statusDisplay.icon;
  const progressPercentage =
    status.total > 0 ? (status.progress / status.total) * 100 : 0;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <StatusIcon className={`h-5 w-5 ${statusDisplay.color}`} />
            <span>Processing Status</span>
            <div className="flex items-center space-x-1">
              {wsConnected ? (
                <Wifi className="h-4 w-4 text-green-500" />
              ) : (
                <WifiOff className="h-4 w-4 text-red-500" />
              )}
              <span
                className={`text-xs ${
                  wsConnected ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {wsConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>

          <div
            className={`px-3 py-1 rounded-full text-sm font-medium ${statusDisplay.bgColor} ${statusDisplay.color} ${statusDisplay.borderColor} border`}
          >
            {statusDisplay.label}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Current Step and Progress */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">
              {status.current_step || 'Waiting to start'}
            </h3>
            <div className="text-sm text-muted-foreground">
              {status.total > 0 && (
                <span>
                  {status.progress.toLocaleString()} /{' '}
                  {status.total.toLocaleString()}
                </span>
              )}
            </div>
          </div>

          {status.is_processing && (
            <div className="space-y-2">
              <Progress value={progressPercentage} className="h-3" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{Math.round(progressPercentage)}% complete</span>
                <div className="flex items-center space-x-3">
                  {processingSpeed && (
                    <div className="flex items-center space-x-1">
                      <Zap className="h-3 w-3" />
                      <span>{formatProcessingSpeed(processingSpeed)}</span>
                    </div>
                  )}
                  {estimatedTimeRemaining && (
                    <div className="flex items-center space-x-1">
                      <Clock className="h-3 w-3" />
                      <span>{formatTimeRemaining(estimatedTimeRemaining)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error Display */}
        {status.error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-md">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  Processing Error
                </h3>
                <div className="mt-2 text-sm text-red-700">{status.error}</div>
              </div>
            </div>
          </div>
        )}

        {/* Timing Information */}
        {(status.started_at || status.completed_at) && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            {status.started_at && (
              <div>
                <span className="text-muted-foreground">Started:</span>
                <div className="font-medium">
                  {new Date(status.started_at).toLocaleString()}
                </div>
              </div>
            )}
            {status.completed_at && (
              <div>
                <span className="text-muted-foreground">Completed:</span>
                <div className="font-medium">
                  {new Date(status.completed_at).toLocaleString()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Analysis Settings (only show when not processing) */}
        {showControls && !status.is_processing && (
          <div className="pt-4 border-t space-y-4">
            <h4 className="font-medium">Analysis Settings</h4>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Similarity Threshold
                </label>
                <input
                  type="number"
                  min="0.1"
                  max="1.0"
                  step="0.01"
                  placeholder="Default (0.8)"
                  value={analysisSettings.threshold || ''}
                  onChange={(e) =>
                    setAnalysisSettings({
                      ...analysisSettings,
                      threshold: e.target.value
                        ? parseFloat(e.target.value)
                        : undefined,
                    })
                  }
                  className="w-full px-3 py-2 border border-input rounded-md"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Document Limit</label>
                <input
                  type="number"
                  min="1"
                  placeholder="All documents"
                  value={analysisSettings.limit || ''}
                  onChange={(e) =>
                    setAnalysisSettings({
                      ...analysisSettings,
                      limit: e.target.value
                        ? parseInt(e.target.value)
                        : undefined,
                    })
                  }
                  className="w-full px-3 py-2 border border-input rounded-md"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="force-rebuild"
                checked={analysisSettings.force_rebuild}
                onChange={(e) =>
                  setAnalysisSettings({
                    ...analysisSettings,
                    force_rebuild: e.target.checked,
                  })
                }
              />
              <label htmlFor="force-rebuild" className="text-sm">
                Force rebuild (reprocess all documents)
              </label>
            </div>
          </div>
        )}

        {/* Control Buttons */}
        {showControls && (
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex items-center space-x-2">
              <Button
                onClick={handleStart}
                disabled={status.is_processing || loading.start}
                variant={status.is_processing ? 'outline' : 'default'}
              >
                {loading.start ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Start Analysis
              </Button>

              {status.is_processing && (
                <Button
                  onClick={handleCancel}
                  disabled={loading.cancel}
                  variant="outline"
                >
                  <Square className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              )}
            </div>

            <Button
              onClick={() => dispatch(fetchProcessingStatus())}
              variant="ghost"
              size="sm"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Status
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProgressTracker;
