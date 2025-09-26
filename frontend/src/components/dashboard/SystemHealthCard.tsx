import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Progress } from '../ui/Progress';
import {
  Activity,
  CheckCircle,
  AlertCircle,
  XCircle,
  Database,
  Globe,
  Server,
  HardDrive,
  RefreshCw,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { Button } from '../ui/Button';

interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency_ms?: number;
  details?: Record<string, any>;
  last_check?: string;
  message?: string;
}

interface SystemHealth {
  overall_status: 'healthy' | 'degraded' | 'unhealthy';
  database: ComponentHealth;
  paperless_api: ComponentHealth;
  celery_worker?: ComponentHealth;
  redis?: ComponentHealth;
  timestamp: string;
  uptime_seconds?: number;
}

interface HealthMetrics {
  timestamp: string;
  uptime_seconds: number;
  database?: {
    documents_by_status?: Record<string, number>;
    duplicate_groups?: {
      total: number;
      reviewed: number;
      resolved: number;
      avg_confidence: number;
    };
  };
  memory?: {
    rss_mb: number;
    percent: number;
  };
  cpu?: {
    percent: number;
    num_threads: number;
  };
}

export const SystemHealthCard: React.FC = () => {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchHealth = async () => {
    try {
      // Fetch health status
      const healthResponse = await fetch('/api/v1/health');
      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        setHealth(healthData);
      }

      // Fetch detailed metrics
      const metricsResponse = await fetch('/api/v1/health/metrics');
      if (metricsResponse.ok) {
        const metricsData = await metricsResponse.json();
        setMetrics(metricsData);
      }
    } catch (error) {
      console.error('Failed to fetch health status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();

    if (autoRefresh) {
      const interval = setInterval(fetchHealth, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'degraded':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'unhealthy':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'success' | 'warning' | 'destructive'> = {
      healthy: 'success',
      degraded: 'warning',
      unhealthy: 'destructive',
    };
    return (
      <Badge variant={variants[status] || 'secondary'}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const formatUptime = (seconds?: number) => {
    if (!seconds) return 'Unknown';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const formatLatency = (ms?: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) {
      return `${Math.round(ms)}ms`;
    } else {
      return `${(ms / 1000).toFixed(2)}s`;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Activity className="h-5 w-5 animate-pulse" />
            <span>System Health</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-4">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            <span>Checking system health...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!health) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Activity className="h-5 w-5" />
            <span>System Health</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-4 text-muted-foreground">
            <AlertCircle className="h-5 w-5 mr-2" />
            <span>Unable to fetch health status</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <Activity className="h-5 w-5" />
            <span>System Health</span>
          </CardTitle>
          <div className="flex items-center space-x-2">
            {getStatusBadge(health.overall_status)}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchHealth()}
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Uptime */}
        <div className="flex items-center justify-between pb-3 border-b">
          <div className="flex items-center space-x-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Uptime</span>
          </div>
          <span className="text-sm font-medium">
            {formatUptime(health.uptime_seconds)}
          </span>
        </div>

        {/* Component Status */}
        <div className="space-y-3">
          {/* Database */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Database className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium">Database</span>
              </div>
              <div className="flex items-center space-x-2">
                {getStatusIcon(health.database.status)}
                <span className="text-xs text-muted-foreground">
                  {formatLatency(health.database.latency_ms)}
                </span>
              </div>
            </div>
            {health.database.details && (
              <div className="ml-6 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Documents:</span>
                  <span className="ml-1 font-medium">
                    {health.database.details.document_count?.toLocaleString() ||
                      0}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Groups:</span>
                  <span className="ml-1 font-medium">
                    {health.database.details.duplicate_group_count?.toLocaleString() ||
                      0}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Paperless API */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Globe className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">Paperless API</span>
              </div>
              <div className="flex items-center space-x-2">
                {getStatusIcon(health.paperless_api.status)}
                <span className="text-xs text-muted-foreground">
                  {formatLatency(health.paperless_api.latency_ms)}
                </span>
              </div>
            </div>
            {health.paperless_api.details && (
              <div className="ml-6 text-xs text-muted-foreground">
                {health.paperless_api.details.total_documents && (
                  <span>
                    {health.paperless_api.details.total_documents.toLocaleString()}{' '}
                    documents
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Celery Worker */}
          {health.celery_worker && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Server className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium">Background Worker</span>
                </div>
                <div className="flex items-center space-x-2">
                  {getStatusIcon(health.celery_worker.status)}
                </div>
              </div>
              {health.celery_worker.details && (
                <div className="ml-6 text-xs text-muted-foreground">
                  <span>
                    {health.celery_worker.details.worker_count} worker(s)
                  </span>
                  {health.celery_worker.details.active_tasks > 0 && (
                    <span className="ml-2">
                      • {health.celery_worker.details.active_tasks} active tasks
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Redis */}
          {health.redis && (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <HardDrive className="h-4 w-4 text-orange-500" />
                <span className="text-sm font-medium">Redis Cache</span>
              </div>
              <div className="flex items-center space-x-2">
                {getStatusIcon(health.redis.status)}
                <span className="text-xs text-muted-foreground">
                  {formatLatency(health.redis.latency_ms)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* System Metrics */}
        {metrics && (
          <div className="pt-3 border-t space-y-3">
            {metrics.memory && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Memory Usage</span>
                  <span className="font-medium">
                    {Math.round(metrics.memory.rss_mb)} MB (
                    {metrics.memory.percent.toFixed(1)}%)
                  </span>
                </div>
                <Progress value={metrics.memory.percent} className="h-2" />
              </div>
            )}

            {metrics.cpu && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">CPU Usage</span>
                  <span className="font-medium">
                    {metrics.cpu.percent.toFixed(1)}% ({metrics.cpu.num_threads}{' '}
                    threads)
                  </span>
                </div>
                <Progress value={metrics.cpu.percent} className="h-2" />
              </div>
            )}

            {metrics.database?.duplicate_groups && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Avg Confidence</span>
                <div className="flex items-center space-x-1">
                  <TrendingUp className="h-3 w-3 text-green-500" />
                  <span className="font-medium">
                    {(
                      metrics.database.duplicate_groups.avg_confidence * 100
                    ).toFixed(1)}
                    %
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Auto-refresh toggle */}
        <div className="pt-3 border-t">
          <label className="flex items-center space-x-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span>Auto-refresh (30s)</span>
          </label>
        </div>
      </CardContent>
    </Card>
  );
};

export default SystemHealthCard;
