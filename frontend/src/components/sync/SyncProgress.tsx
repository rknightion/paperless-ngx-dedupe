import React, { useEffect, useState } from 'react';
import { Progress } from '../ui/Progress';
import { Button } from '../ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Alert, AlertDescription } from '../ui/Alert';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/Tooltip';
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  FileText,
  Info,
} from 'lucide-react';
import { documentsApi } from '../../services/api/documents';
import { useAppDispatch, useAppSelector } from '../../hooks/redux';
import {
  fetchDocuments,
  updateSyncStatus,
} from '../../store/slices/documentsSlice';
import { useProcessingStatus } from '../../hooks/redux';

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
  const { status: processingStatus } = useProcessingStatus();

  // Get sync status from Redux store
  const syncStatus = useAppSelector((state) => state.documents.syncStatus);
  const pageSize = useAppSelector(
    (state) => state.documents.pagination.pageSize
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Get initial sync status
    documentsApi
      .getSyncStatus()
      .then((status) => {
        // Update Redux store with initial status
        if (status) {
          dispatch(updateSyncStatus(status));
        }
      })
      .catch(console.error);
  }, [dispatch]);

  useEffect(() => {
    // Refresh document list after sync completion
    if (syncStatus?.completed_at && !syncStatus?.is_syncing) {
      dispatch(fetchDocuments({ limit: pageSize }));
    }
  }, [syncStatus, dispatch, pageSize]);

  const handleStartSync = async () => {
    setIsLoading(true);
    try {
      await documentsApi.syncDocuments();
      // Status will be updated via WebSocket
    } catch (error: any) {
      console.error('Failed to start sync:', error);
      if (error?.response?.data?.detail) {
        alert(error.response.data.detail);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForceSync = async () => {
    // Show warning dialog
    const confirmed = window.confirm(
      '⚠️ Force Refresh Warning\n\n' +
        'This will DELETE all existing documents and duplicate analysis results, then re-import everything from Paperless-NGX.\n\n' +
        'This action cannot be undone. Are you sure you want to continue?'
    );

    if (!confirmed) {
      return;
    }

    setIsLoading(true);
    try {
      await documentsApi.syncDocuments({ force_refresh: true });
      // Status will be updated via WebSocket
    } catch (error: any) {
      console.error('Failed to start force sync:', error);
      if (error?.response?.data?.detail) {
        alert(error.response.data.detail);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!syncStatus) {
    return null;
  }

  const progressPercentage =
    syncStatus.total > 0
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
        {syncStatus.error && syncStatus.error.trim() !== '' && (
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
                <span>
                  {syncStatus.progress} / {syncStatus.total}
                </span>
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
                  Last sync completed:{' '}
                  {new Date(syncStatus.completed_at).toLocaleString()}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No sync has been performed yet
              </p>
            )}

            {(syncStatus.documents_synced > 0 ||
              syncStatus.documents_updated > 0) && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">New Documents</p>
                  <p className="text-2xl font-semibold">
                    {syncStatus.documents_synced}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Updated Documents</p>
                  <p className="text-2xl font-semibold">
                    {syncStatus.documents_updated}
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex-1">
                      <Button
                        onClick={handleStartSync}
                        disabled={
                          isLoading ||
                          syncStatus.is_syncing ||
                          processingStatus.is_processing
                        }
                        className="w-full"
                        title={
                          processingStatus.is_processing
                            ? 'Cannot sync while analysis is in progress'
                            : ''
                        }
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
                            <Info className="h-3 w-3 ml-1" />
                          </>
                        )}
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      <strong>Sync Documents:</strong> Fetches only NEW
                      documents from Paperless-NGX that haven't been imported
                      yet. Existing documents are skipped.
                    </p>
                    <p className="mt-1 text-xs">
                      Use this for regular updates to import recently added
                      documents.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleForceSync}
                      disabled={
                        isLoading ||
                        syncStatus.is_syncing ||
                        processingStatus.is_processing
                      }
                      variant="outline"
                    >
                      Force Refresh
                      <Info className="h-3 w-3 ml-1" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      <strong>Force Refresh:</strong> Re-fetches ALL documents
                      from Paperless-NGX, updating metadata and OCR content for
                      existing documents.
                    </p>
                    <p className="mt-1 text-xs">
                      Use this if document metadata or OCR content has changed
                      in Paperless-NGX and you need to update the local copies.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
