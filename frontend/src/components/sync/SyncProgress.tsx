import React, { useEffect, useState } from 'react';
import { Progress } from '../ui/progress';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { Loader2, CheckCircle, AlertCircle, RefreshCw, FileText } from 'lucide-react';
import { documentsApi } from '../../services/api/documents';
import { wsClient } from '../../services/websocket/client';
import { useAppDispatch } from '../../store/hooks';
import { fetchDocuments } from '../../store/slices/documentsSlice';

interface SyncStatus {
  is_syncing: boolean;
  current_step: string;
  progress: number;
  total: number;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  documents_synced: number;
  documents_updated: number;
}

export const SyncProgress: React.FC = () => {
  const dispatch = useAppDispatch();
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Get initial sync status
    documentsApi.getSyncStatus().then(setSyncStatus).catch(console.error);

    // Listen for WebSocket updates
    const handleSyncUpdate = (status: SyncStatus) => {
      setSyncStatus(status);
    };

    const handleSyncCompleted = (data: any) => {
      setSyncStatus(prev => prev ? {
        ...prev,
        is_syncing: false,
        current_step: 'Completed',
        completed_at: data.completed_at,
        progress: prev.total,
      } : null);
      
      // Refresh document list after sync
      dispatch(fetchDocuments({}));
    };

    wsClient.on('sync_update', handleSyncUpdate);
    wsClient.on('sync_completed', handleSyncCompleted);

    return () => {
      wsClient.off('sync_update', handleSyncUpdate);
      wsClient.off('sync_completed', handleSyncCompleted);
    };
  }, [dispatch]);

  const handleStartSync = async () => {
    setIsLoading(true);
    try {
      await documentsApi.syncDocuments();
      // Status will be updated via WebSocket
    } catch (error) {
      console.error('Failed to start sync:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForceSync = async () => {
    setIsLoading(true);
    try {
      await documentsApi.syncDocuments({ force_refresh: true });
      // Status will be updated via WebSocket
    } catch (error) {
      console.error('Failed to start force sync:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!syncStatus) {
    return null;
  }

  const progressPercentage = syncStatus.total > 0 
    ? Math.round((syncStatus.progress / syncStatus.total) * 100)
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Document Sync
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {syncStatus.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{syncStatus.error}</AlertDescription>
          </Alert>
        )}

        {syncStatus.is_syncing ? (
          <>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{syncStatus.current_step}</span>
            </div>
            
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>{syncStatus.progress} / {syncStatus.total}</span>
              </div>
              <Progress value={progressPercentage} />
              <p className="text-xs text-muted-foreground text-right">
                {progressPercentage}%
              </p>
            </div>
          </>
        ) : (
          <>
            {syncStatus.completed_at ? (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                <span>
                  Last sync completed: {new Date(syncStatus.completed_at).toLocaleString()}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No sync has been performed yet
              </p>
            )}

            {(syncStatus.documents_synced > 0 || syncStatus.documents_updated > 0) && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">New Documents</p>
                  <p className="text-2xl font-semibold">{syncStatus.documents_synced}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Updated Documents</p>
                  <p className="text-2xl font-semibold">{syncStatus.documents_updated}</p>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleStartSync}
                disabled={isLoading || syncStatus.is_syncing}
                className="flex-1"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Sync Documents
                  </>
                )}
              </Button>
              
              <Button
                onClick={handleForceSync}
                disabled={isLoading || syncStatus.is_syncing}
                variant="outline"
              >
                Force Refresh
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};