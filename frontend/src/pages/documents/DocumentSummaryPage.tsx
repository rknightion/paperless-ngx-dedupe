import React, { useEffect, useState } from 'react';
import { useAppDispatch } from '../../hooks/redux';
import { fetchDocuments } from '../../store/slices/documentsSlice';
import { documentsApi } from '../../services/api';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Progress } from '../../components/ui/Progress';
import { Badge } from '../../components/ui/Badge';
import {
  FileText,
  Database,
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle,
  Download,
  RefreshCw,
  HardDrive,
  Calendar,
  BarChart3,
  Info,
} from 'lucide-react';

interface DocumentStatistics {
  total_documents: number;
  total_size: number;
  processed_count: number;
  pending_count: number;
  error_count: number;
  average_ocr_length: number;
  documents_with_ocr: number;
  documents_without_ocr: number;
  size_distribution: {
    small: number; // < 100KB
    medium: number; // 100KB - 1MB
    large: number; // 1MB - 10MB
    xlarge: number; // > 10MB
  };
  processing_status: {
    pending: number;
    processing: number;
    completed: number;
    error: number;
  };
  sync_status: {
    last_sync: string | null;
    documents_synced: number;
    sync_in_progress: boolean;
  };
}

export const DocumentSummaryPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const [statistics, setStatistics] = useState<DocumentStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Load document statistics
  useEffect(() => {
    loadStatistics();
  }, []);

  const loadStatistics = async () => {
    setLoading(true);
    try {
      // Fetch document statistics from the API
      const response = await documentsApi.getStatistics();
      setStatistics(response);
    } catch (error) {
      console.error('Failed to load document statistics:', error);
      // Set mock data for now until API endpoint is created
      setStatistics({
        total_documents: 13378,
        total_size: 5.2 * 1024 * 1024 * 1024, // 5.2GB in bytes
        processed_count: 3707,
        pending_count: 9671,
        error_count: 0,
        average_ocr_length: 2450,
        documents_with_ocr: 12800,
        documents_without_ocr: 578,
        size_distribution: {
          small: 3200,
          medium: 7800,
          large: 2100,
          xlarge: 278,
        },
        processing_status: {
          pending: 9671,
          processing: 0,
          completed: 3707,
          error: 0,
        },
        sync_status: {
          last_sync: new Date().toISOString(),
          documents_synced: 13378,
          sync_in_progress: false,
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await documentsApi.syncDocuments();
      await loadStatistics();
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setSyncing(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin mr-2" />
        <span>Loading document statistics...</span>
      </div>
    );
  }

  if (!statistics) {
    return (
      <div className="text-center p-8">
        <AlertTriangle className="h-12 w-12 text-yellow-600 mx-auto mb-4" />
        <p>Failed to load document statistics</p>
        <Button onClick={loadStatistics} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  const processingProgress = (statistics.processed_count / statistics.total_documents) * 100;
  const ocrCoverage = (statistics.documents_with_ocr / statistics.total_documents) * 100;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Document Library</h1>
          <p className="text-muted-foreground">
            Overview and statistics of your document collection
          </p>
        </div>
        <Button onClick={handleSync} disabled={syncing}>
          {syncing ? (
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Sync from Paperless
        </Button>
      </div>

      {/* Main Statistics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
            <FileText className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statistics.total_documents.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {statistics.documents_synced} synced
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Storage</CardTitle>
            <HardDrive className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatBytes(statistics.total_size)}
            </div>
            <p className="text-xs text-muted-foreground">
              Avg: {formatBytes(statistics.total_size / statistics.total_documents)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Deduped</CardTitle>
            <CheckCircle className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statistics.processed_count.toLocaleString()}
            </div>
            <Progress value={processingProgress} className="h-2 mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">OCR Coverage</CardTitle>
            <Database className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {ocrCoverage.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {statistics.documents_without_ocr} without OCR
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Processing Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span>Deduplication Processing Status</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Overall Progress</span>
              <span className="font-medium">{processingProgress.toFixed(1)}%</span>
            </div>
            <Progress value={processingProgress} className="h-3" />
          </div>

          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-yellow-600">
                {statistics.processing_status.pending.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">
                {statistics.processing_status.processing.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">Processing</p>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">
                {statistics.processing_status.completed.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">
                {statistics.processing_status.error.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">Errors</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Document Size Distribution */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Document Size Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm">Small (&lt; 100KB)</span>
                <Badge variant="outline">{statistics.size_distribution.small.toLocaleString()}</Badge>
              </div>
              <Progress 
                value={(statistics.size_distribution.small / statistics.total_documents) * 100} 
                className="h-2"
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm">Medium (100KB - 1MB)</span>
                <Badge variant="outline">{statistics.size_distribution.medium.toLocaleString()}</Badge>
              </div>
              <Progress 
                value={(statistics.size_distribution.medium / statistics.total_documents) * 100} 
                className="h-2"
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm">Large (1MB - 10MB)</span>
                <Badge variant="outline">{statistics.size_distribution.large.toLocaleString()}</Badge>
              </div>
              <Progress 
                value={(statistics.size_distribution.large / statistics.total_documents) * 100} 
                className="h-2"
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm">Extra Large (&gt; 10MB)</span>
                <Badge variant="outline">{statistics.size_distribution.xlarge.toLocaleString()}</Badge>
              </div>
              <Progress 
                value={(statistics.size_distribution.xlarge / statistics.total_documents) * 100} 
                className="h-2"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>OCR Statistics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Documents with OCR</span>
                <span className="font-medium">{statistics.documents_with_ocr.toLocaleString()}</span>
              </div>
              <Progress value={ocrCoverage} className="h-2" />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Documents without OCR</span>
                <span className="font-medium">{statistics.documents_without_ocr.toLocaleString()}</span>
              </div>
              <Progress 
                value={(statistics.documents_without_ocr / statistics.total_documents) * 100} 
                className="h-2"
              />
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Average OCR Length</span>
                <span className="font-medium">{statistics.average_ocr_length.toLocaleString()} chars</span>
              </div>
            </div>

            <div className="bg-blue-50 p-3 rounded-md">
              <div className="flex items-start space-x-2">
                <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                <p className="text-xs text-blue-800">
                  Documents with very short OCR content (&lt;100 chars) may produce false positive duplicates
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sync Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Clock className="h-5 w-5" />
            <span>Synchronization Status</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Last Sync</p>
              <p className="font-medium">{formatDate(statistics.sync_status.last_sync)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Documents Synced</p>
              <p className="font-medium">{statistics.sync_status.documents_synced.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              {statistics.sync_status.sync_in_progress ? (
                <Badge variant="warning">Syncing...</Badge>
              ) : (
                <Badge variant="success">Up to date</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DocumentSummaryPage;