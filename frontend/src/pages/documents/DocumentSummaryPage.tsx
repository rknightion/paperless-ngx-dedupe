import React, { useEffect, useState } from "react";
import { useAppDispatch } from "../../hooks/redux";
import { fetchDocuments } from "../../store/slices/documentsSlice";
import { documentsApi } from "../../services/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Progress } from "../../components/ui/Progress";
import { Badge } from "../../components/ui/Badge";
import {
  FileText,
  Database,
  Clock,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Tags,
  Users,
  FileType,
  Info,
  FolderOpen,
} from "lucide-react";

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
  paperless_stats?: {
    total_tags?: number;
    total_correspondents?: number;
    total_document_types?: number;
    total_storage_paths?: number;
    total_custom_fields?: number;
    documents_with_correspondent?: number;
    documents_with_tags?: number;
    documents_with_type?: number;
    top_tags?: Array<{id: number; name: string; document_count: number}>;
    top_correspondents?: Array<{id: number; name: string; document_count: number}>;
    top_document_types?: Array<{id: number; name: string; document_count: number}>;
  };
}

export const DocumentSummaryPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const [statistics, setStatistics] = useState<DocumentStatistics | null>(null);
  const [loading, setLoading] = useState(true);

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
      console.error("Failed to load document statistics:", error);
      // Don't mask the error with mock data
      setStatistics(null);
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
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

  const processingProgress =
    (statistics.processed_count / statistics.total_documents) * 100;
  const ocrCoverage =
    (statistics.documents_with_ocr / statistics.total_documents) * 100;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Document Library</h1>
        <p className="text-muted-foreground">
          Overview and statistics of your document collection
        </p>
      </div>

      {/* Main Statistics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Documents
            </CardTitle>
            <FileText className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statistics.total_documents.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {statistics.processed_count} processed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tags</CardTitle>
            <Tags className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statistics.paperless_stats?.total_tags || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {statistics.paperless_stats?.documents_with_tags || 0} documents tagged
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Analyzed</CardTitle>
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
            <div className="text-2xl font-bold">{ocrCoverage.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {statistics.documents_without_ocr} without OCR
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Document Organization Statistics */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Document Organization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-600" />
                  <span className="text-sm">Correspondents</span>
                </div>
                <Badge variant="outline">
                  {statistics.paperless_stats?.total_correspondents || 0}
                </Badge>
              </div>
              <Progress
                value={
                  ((statistics.paperless_stats?.documents_with_correspondent || 0) /
                    statistics.total_documents) *
                  100
                }
                className="h-2"
              />
              <p className="text-xs text-muted-foreground">
                {statistics.paperless_stats?.documents_with_correspondent || 0} documents assigned
              </p>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <FileType className="h-4 w-4 text-green-600" />
                  <span className="text-sm">Document Types</span>
                </div>
                <Badge variant="outline">
                  {statistics.paperless_stats?.total_document_types || 0}
                </Badge>
              </div>
              <Progress
                value={
                  ((statistics.paperless_stats?.documents_with_type || 0) /
                    statistics.total_documents) *
                  100
                }
                className="h-2"
              />
              <p className="text-xs text-muted-foreground">
                {statistics.paperless_stats?.documents_with_type || 0} documents classified
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-purple-600" />
                  <span className="text-sm">Storage Paths</span>
                </div>
                <Badge variant="outline">
                  {statistics.paperless_stats?.total_storage_paths || 0}
                </Badge>
              </div>
            </div>

            {statistics.paperless_stats?.total_custom_fields ? (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-orange-600" />
                    <span className="text-sm">Custom Fields</span>
                  </div>
                  <Badge variant="outline">
                    {statistics.paperless_stats.total_custom_fields}
                  </Badge>
                </div>
              </div>
            ) : null}
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
                <span className="font-medium">
                  {statistics.documents_with_ocr.toLocaleString()}
                </span>
              </div>
              <Progress value={ocrCoverage} className="h-2" />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Documents without OCR</span>
                <span className="font-medium">
                  {statistics.documents_without_ocr.toLocaleString()}
                </span>
              </div>
              <Progress
                value={
                  (statistics.documents_without_ocr /
                    statistics.total_documents) *
                  100
                }
                className="h-2"
              />
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Average OCR Length
                </span>
                <span className="font-medium">
                  {statistics.average_ocr_length.toLocaleString()} chars
                </span>
              </div>
            </div>

            <div className="bg-blue-50 p-3 rounded-md">
              <div className="flex items-start space-x-2">
                <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                <p className="text-xs text-blue-800">
                  Documents with very short OCR content (&lt;100 chars) may
                  produce false positive duplicates
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Tags and Correspondents */}
      {statistics.paperless_stats?.top_tags || statistics.paperless_stats?.top_correspondents ? (
        <div className="grid gap-6 md:grid-cols-2">
          {statistics.paperless_stats?.top_tags && statistics.paperless_stats.top_tags.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Most Used Tags</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {statistics.paperless_stats.top_tags.slice(0, 5).map((tag) => (
                  <div key={tag.id} className="flex justify-between items-center">
                    <span className="text-sm truncate max-w-[200px]">{tag.name}</span>
                    <Badge variant="secondary">{tag.document_count}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {statistics.paperless_stats?.top_correspondents && statistics.paperless_stats.top_correspondents.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Top Correspondents</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {statistics.paperless_stats.top_correspondents.slice(0, 5).map((corr) => (
                  <div key={corr.id} className="flex justify-between items-center">
                    <span className="text-sm truncate max-w-[200px]">{corr.name}</span>
                    <Badge variant="secondary">{corr.document_count}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

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
              <p className="font-medium">
                {formatDate(statistics.sync_status.last_sync)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Documents Synced</p>
              <p className="font-medium">
                {statistics.sync_status.documents_synced.toLocaleString()}
              </p>
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
