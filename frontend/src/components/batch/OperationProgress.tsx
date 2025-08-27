import React, { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Progress,
  Badge,
  Button,
} from "../ui";
import {
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  X,
  RefreshCw,
} from "lucide-react";
import {
  batchApi,
  OperationStatus,
  OperationType,
} from "../../services/api/batch";

interface OperationProgressProps {
  operationId: string;
  onComplete?: () => void;
  onClose?: () => void;
}

export const OperationProgress: React.FC<OperationProgressProps> = ({
  operationId,
  onComplete,
  onClose,
}) => {
  const [progress, setProgress] = useState<any>(null);
  const [polling, setPolling] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!polling) return;

    const pollStatus = async () => {
      try {
        const status = await batchApi.getOperationStatus(operationId);
        setProgress(status);

        // Stop polling if operation is complete
        if (
          status.status === OperationStatus.COMPLETED ||
          status.status === OperationStatus.FAILED ||
          status.status === OperationStatus.PARTIALLY_COMPLETED
        ) {
          setPolling(false);
          if (onComplete) {
            onComplete();
          }
        }
      } catch (err) {
        console.error("Failed to get operation status:", err);
        setError("Failed to get operation status");
        setPolling(false);
      }
    };

    // Initial poll to get current status
    pollStatus();
    
    // No interval needed - WebSocket will handle updates
  }, [operationId, polling, onComplete]);

  const getStatusIcon = () => {
    if (!progress) return <Loader2 className="h-5 w-5 animate-spin" />;

    switch (progress.status) {
      case OperationStatus.PENDING:
      case OperationStatus.IN_PROGRESS:
        return <Loader2 className="h-5 w-5 animate-spin text-blue-600" />;
      case OperationStatus.COMPLETED:
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case OperationStatus.FAILED:
        return <XCircle className="h-5 w-5 text-red-600" />;
      case OperationStatus.PARTIALLY_COMPLETED:
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      default:
        return null;
    }
  };

  const getStatusBadge = () => {
    if (!progress) return null;

    const variants: Record<OperationStatus, any> = {
      [OperationStatus.PENDING]: "secondary",
      [OperationStatus.IN_PROGRESS]: "default",
      [OperationStatus.COMPLETED]: "success",
      [OperationStatus.FAILED]: "destructive",
      [OperationStatus.PARTIALLY_COMPLETED]: "warning",
    };

    return (
      <Badge variant={variants[progress.status as OperationStatus]}>
        {progress.status.replace("_", " ")}
      </Badge>
    );
  };

  const handleCancel = async () => {
    try {
      await batchApi.cancelOperation(operationId);
      setPolling(false);
      if (onClose) {
        onClose();
      }
    } catch (err) {
      console.error("Failed to cancel operation:", err);
    }
  };

  const getOperationTitle = () => {
    if (!progress) return "Processing...";

    const titles: Partial<Record<OperationType, string>> = {
      [OperationType.DELETE]: "Deleting Documents",
      [OperationType.TAG]: "Adding Tags",
      [OperationType.UNTAG]: "Removing Tags",
      [OperationType.UPDATE_METADATA]: "Updating Metadata",
      [OperationType.RESOLVE_DUPLICATES]: "Resolving Duplicates",
      [OperationType.MARK_REVIEWED]: "Marking as Reviewed",
    };

    return (
      titles[progress.operation as OperationType] || "Processing Operation"
    );
  };

  if (error) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="p-6">
          <div className="flex items-center space-x-2 text-red-600">
            <XCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
          {onClose && (
            <Button onClick={onClose} className="mt-4" size="sm">
              Close
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!progress) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="p-6">
          <div className="flex items-center space-x-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading operation status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            {getStatusIcon()}
            <span>{getOperationTitle()}</span>
          </CardTitle>
          <div className="flex items-center space-x-2">
            {getStatusBadge()}
            {onClose && (
              <Button
                onClick={onClose}
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>{progress.message}</span>
            <span className="font-medium">
              {Math.round(progress.progress_percentage)}%
            </span>
          </div>
          <Progress value={progress.progress_percentage} className="h-3" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {progress.current_item} of {progress.total_items} items
            </span>
            {progress.results && (
              <span>
                {progress.results.processed} processed,{" "}
                {progress.results.failed} failed
              </span>
            )}
          </div>
        </div>

        {/* Errors */}
        {progress.errors && progress.errors.length > 0 && (
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-red-600">Errors:</h4>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {progress.errors.slice(0, 5).map((error: string, idx: number) => (
                <p key={idx} className="text-xs text-red-600">
                  • {error}
                </p>
              ))}
              {progress.errors.length > 5 && (
                <p className="text-xs text-muted-foreground">
                  ...and {progress.errors.length - 5} more errors
                </p>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        {progress.status === OperationStatus.IN_PROGRESS && (
          <Button
            onClick={handleCancel}
            variant="outline"
            size="sm"
            className="w-full"
          >
            Cancel Operation
          </Button>
        )}

        {(progress.status === OperationStatus.COMPLETED ||
          progress.status === OperationStatus.FAILED ||
          progress.status === OperationStatus.PARTIALLY_COMPLETED) && (
          <div className="space-y-2">
            {progress.results?.started_at && progress.results?.completed_at && (
              <div className="text-xs text-muted-foreground text-center">
                Duration:{" "}
                {Math.round(
                  (new Date(progress.results.completed_at).getTime() -
                    new Date(progress.results.started_at).getTime()) /
                    1000,
                )}{" "}
                seconds
              </div>
            )}
            {onClose && (
              <Button onClick={onClose} size="sm" className="w-full">
                Close
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OperationProgress;
