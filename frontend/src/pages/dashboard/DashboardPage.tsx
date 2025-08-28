import React, { useEffect } from 'react';
import {
  useAppDispatch,
  useDocuments,
  useDuplicates,
  useProcessingStatus,
} from '../../hooks/redux';
import { fetchDuplicateStatistics } from '../../store/slices/duplicatesSlice';
import { fetchDocuments } from '../../store/slices/documentsSlice';
import { ProgressTracker } from '../../components/shared';
import { SyncProgress } from '../../components/sync/SyncProgress';
import { OperationsList } from '../../components/batch/OperationsList';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
  FileText,
  Copy,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  Activity,
  Clock,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const { documents, pagination } = useDocuments();
  const { statistics } = useDuplicates();
  const { status } = useProcessingStatus();

  // Load dashboard data
  useEffect(() => {
    dispatch(fetchDocuments({ page_size: 1 })); // Just get the count
    dispatch(fetchDuplicateStatistics());
  }, [dispatch]);

  // Calculate processing statistics based on duplicates
  const processingStats = {
    pending: statistics?.unreviewed_groups || 0,
    completed: statistics?.reviewed_groups || 0,
    errors: 0, // No error tracking in current API
  };

  const StatCard: React.FC<{
    title: string;
    value: string | number;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    trend?: number;
    color?: string;
  }> = ({
    title,
    value,
    description,
    icon: Icon,
    trend,
    color = 'text-primary',
  }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
        {trend !== undefined && (
          <div className="flex items-center text-xs text-green-600 mt-1">
            <TrendingUp className="h-3 w-3 mr-1" />
            {trend > 0 ? '+' : ''}
            {trend}% from last scan
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your document deduplication system
        </p>
      </div>

      {/* Statistics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Documents"
          value={pagination.count}
          description="Documents in your library"
          icon={FileText}
          color="text-blue-600"
        />

        <StatCard
          title="Duplicate Groups"
          value={statistics?.total_groups || 0}
          description="Groups of potential duplicates"
          icon={Copy}
          color="text-orange-600"
        />

        <StatCard
          title="Reviewed Groups"
          value={statistics?.reviewed_groups || 0}
          description="Groups you've already reviewed"
          icon={CheckCircle}
          color="text-green-600"
        />

        <StatCard
          title="Pending Review"
          value={statistics?.unreviewed_groups || 0}
          description="Groups needing your attention"
          icon={AlertTriangle}
          color="text-yellow-600"
        />
      </div>

      {/* Processing Status and Quick Actions */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Progress Tracker */}
        <div className="space-y-4">
          <ProgressTracker
            showControls={true}
            onComplete={(_results) => {
              // Refresh statistics when processing completes
              dispatch(fetchDuplicateStatistics());
            }}
          />
        </div>

        {/* Quick Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Activity className="h-5 w-5" />
              <span>Processing Overview</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="space-y-1">
                <div className="text-2xl font-bold text-yellow-600">
                  {processingStats.pending}
                </div>
                <div className="text-xs text-muted-foreground">
                  Pending Review
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold text-green-600">
                  {processingStats.completed}
                </div>
                <div className="text-xs text-muted-foreground">Reviewed</div>
              </div>
            </div>

            {status.started_at && (
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>Last processed:</span>
                  </div>
                  <span className="font-medium">
                    {new Date(status.started_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Document Sync Status */}
      <SyncProgress />

      {/* Batch Operations */}
      <OperationsList />

      {/* Storage Savings Estimate */}
      {statistics && statistics.potential_space_savings > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <span>Potential Storage Savings</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 mb-2">
              {(
                statistics.potential_space_savings /
                (1024 * 1024 * 1024)
              ).toFixed(2)}{' '}
              GB
            </div>
            <p className="text-sm text-muted-foreground">
              Estimated space that could be saved by removing duplicate
              documents. This is based on {statistics.total_duplicates}{' '}
              duplicate documents across {statistics.total_groups} groups.
            </p>
            <div className="mt-4">
              <Button size="sm">View Duplicate Groups</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity or Getting Started */}
      {(documents || []).length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Get Started</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Welcome to Paperless Dedupe! To get started, you'll need to:
            </p>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>Configure your paperless-ngx connection in Settings</li>
              <li>Sync your documents from paperless-ngx</li>
              <li>Run the deduplication analysis</li>
              <li>Review and manage duplicate groups</li>
            </ol>
            <div className="flex space-x-2">
              <Button asChild>
                <a href="/settings">Configure Connection</a>
              </Button>
              <Button variant="outline" asChild>
                <a href="/processing">Start Processing</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>System Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span>System operational</span>
              </div>
              <span className="text-sm text-muted-foreground">
                Last updated: {new Date().toLocaleTimeString()}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DashboardPage;
