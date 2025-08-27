import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "../ui";
import { OperationProgress } from "./OperationProgress";
import {
  Activity,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { batchApi, OperationStatus } from "../../services/api/batch";

export const OperationsList: React.FC = () => {
  const [operations, setOperations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOperation, setSelectedOperation] = useState<string | null>(
    null,
  );

  const loadOperations = async () => {
    setLoading(true);
    try {
      const ops = await batchApi.listOperations();
      setOperations(ops);
    } catch (error) {
      console.error("Failed to load operations:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOperations();

    // Refresh every 5 seconds
    const interval = setInterval(loadOperations, 5000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: OperationStatus) => {
    switch (status) {
      case OperationStatus.PENDING:
        return <Activity className="h-4 w-4 text-gray-500" />;
      case OperationStatus.IN_PROGRESS:
        return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
      case OperationStatus.COMPLETED:
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case OperationStatus.FAILED:
        return <XCircle className="h-4 w-4 text-red-600" />;
      case OperationStatus.PARTIALLY_COMPLETED:
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: OperationStatus) => {
    const variants: Record<OperationStatus, any> = {
      [OperationStatus.PENDING]: "secondary",
      [OperationStatus.IN_PROGRESS]: "default",
      [OperationStatus.COMPLETED]: "success",
      [OperationStatus.FAILED]: "destructive",
      [OperationStatus.PARTIALLY_COMPLETED]: "warning",
    };

    return (
      <Badge variant={variants[status]} className="text-xs">
        {status.replace("_", " ")}
      </Badge>
    );
  };

  // Filter to show only active operations
  const activeOperations = operations.filter(
    (op) =>
      op.status === OperationStatus.PENDING ||
      op.status === OperationStatus.IN_PROGRESS,
  );

  const recentOperations = operations
    .filter(
      (op) =>
        op.status === OperationStatus.COMPLETED ||
        op.status === OperationStatus.FAILED ||
        op.status === OperationStatus.PARTIALLY_COMPLETED,
    )
    .slice(0, 5);

  if (loading && operations.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center space-x-2">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span>Loading operations...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (selectedOperation) {
    return (
      <OperationProgress
        operationId={selectedOperation}
        onClose={() => {
          setSelectedOperation(null);
          loadOperations();
        }}
        onComplete={() => {
          setTimeout(() => {
            setSelectedOperation(null);
            loadOperations();
          }, 2000);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Active Operations */}
      {activeOperations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Active Operations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeOperations.map((op) => (
              <div
                key={op.operation_id}
                className="flex items-center justify-between p-3 rounded-md border hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => setSelectedOperation(op.operation_id)}
              >
                <div className="flex items-center space-x-3">
                  {getStatusIcon(op.status)}
                  <div>
                    <p className="text-sm font-medium">{op.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {op.current_item} / {op.total_items} items
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium">
                    {Math.round(op.progress_percentage)}%
                  </span>
                  {getStatusBadge(op.status)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent Operations */}
      {recentOperations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Operations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentOperations.map((op) => (
              <div
                key={op.operation_id}
                className="flex items-center justify-between p-3 rounded-md border hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => setSelectedOperation(op.operation_id)}
              >
                <div className="flex items-center space-x-3">
                  {getStatusIcon(op.status)}
                  <div>
                    <p className="text-sm font-medium">{op.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {op.results?.processed || 0} processed,{" "}
                      {op.results?.failed || 0} failed
                    </p>
                  </div>
                </div>
                {getStatusBadge(op.status)}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {operations.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No batch operations yet</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default OperationsList;
