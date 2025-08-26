import React, { useEffect, useState } from 'react';
import { useAppDispatch, useDuplicateGroups } from '../../hooks/redux';
import { useSelector } from 'react-redux';
import { RootState } from '../../store/store';
import {
  fetchDuplicateGroups,
  fetchDuplicateStatistics,
  toggleGroupSelection,
  selectAllGroups,
  clearSelection,
} from '../../store/slices/duplicatesSlice';
import { DuplicateGroupCard } from '../../components/shared';
import { BulkActions } from '../../components/batch/BulkActions';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Checkbox } from '../../components/ui/Checkbox';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card';
import {
  Copy,
  Search,
  Filter,
  CheckCircle,
  Clock,
  RefreshCw,
} from 'lucide-react';

export const DuplicatesPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const { groups, loading, statistics } = useDuplicateGroups();
  const selectedGroups = useSelector((state: RootState) => state.duplicates.selectedGroups);
  const [searchQuery, setSearchQuery] = useState('');
  const [reviewedFilter, setReviewedFilter] = useState<boolean | null>(null);
  const [confidenceFilter, setConfidenceFilter] = useState(0.7);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);

  // Load duplicate groups and statistics
  useEffect(() => {
    dispatch(fetchDuplicateGroups());
    dispatch(fetchDuplicateStatistics());
  }, [dispatch]);

  // Handle filters
  const handleRefresh = () => {
    dispatch(fetchDuplicateGroups());
    dispatch(fetchDuplicateStatistics());
  };

  const handleDocumentSelect = (documentId: number) => {
    // Could navigate to document detail or open in paperless
    console.log('Selected document:', documentId);
  };

  // Filter groups based on search and filters
  const filteredGroups = (groups || []).filter((group) => {
    const matchesSearch =
      searchQuery === '' ||
      group.documents.some((doc) =>
        doc.title.toLowerCase().includes(searchQuery.toLowerCase())
      );

    const matchesReviewed =
      reviewedFilter === null || group.reviewed === reviewedFilter;

    const matchesConfidence = group.confidence >= confidenceFilter;

    return matchesSearch && matchesReviewed && matchesConfidence;
  });

  const StatCard: React.FC<{
    title: string;
    value: number;
    icon: React.ComponentType<{ className?: string }>;
    color?: string;
  }> = ({ title, value, icon: Icon, color = 'text-primary' }) => (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center space-x-2">
          <Icon className={`h-5 w-5 ${color}`} />
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{(value || 0).toLocaleString()}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (loading && groups.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Duplicate Groups
          </h1>
          <p className="text-muted-foreground">
            Review and manage potential duplicate documents
          </p>
        </div>
        <div className="flex items-center justify-center p-8">
          <RefreshCw className="h-6 w-6 animate-spin mr-2" />
          <span>Loading duplicate groups...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Duplicate Groups
          </h1>
          <p className="text-muted-foreground">
            Review and manage potential duplicate documents
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={loading}>
          <RefreshCw
            className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`}
          />
          Refresh
        </Button>
      </div>

      {/* Statistics */}
      {statistics && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Groups"
            value={statistics?.total_groups || 0}
            icon={Copy}
            color="text-blue-600"
          />
          <StatCard
            title="Total Duplicates"
            value={statistics?.total_duplicates || 0}
            icon={Copy}
            color="text-orange-600"
          />
          <StatCard
            title="Reviewed"
            value={statistics?.reviewed_groups || 0}
            icon={CheckCircle}
            color="text-green-600"
          />
          <StatCard
            title="Pending Review"
            value={statistics?.unreviewed_groups || 0}
            icon={Clock}
            color="text-yellow-600"
          />
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Filter className="h-5 w-5" />
            <span>Filters</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {/* Search */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Search Documents</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search document titles..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Review Status */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Review Status</label>
              <select
                className="w-full px-3 py-2 border border-input rounded-md bg-background"
                value={
                  reviewedFilter === null ? 'all' : reviewedFilter.toString()
                }
                onChange={(e) => {
                  const value = e.target.value;
                  setReviewedFilter(value === 'all' ? null : value === 'true');
                }}
              >
                <option value="all">All Groups</option>
                <option value="false">Unreviewed</option>
                <option value="true">Reviewed</option>
              </select>
            </div>

            {/* Confidence Threshold */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Min Confidence ({Math.round(confidenceFilter * 100)}%)
              </label>
              <Input
                type="range"
                min="0.5"
                max="1.0"
                step="0.05"
                value={confidenceFilter}
                onChange={(e) =>
                  setConfidenceFilter(parseFloat(e.target.value))
                }
                className="w-full"
              />
            </div>
          </div>

          {/* Active Filters Display */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-muted-foreground">
              Active filters:
            </span>
            {searchQuery && (
              <Badge variant="outline">Search: "{searchQuery}"</Badge>
            )}
            {reviewedFilter !== null && (
              <Badge variant="outline">
                {reviewedFilter ? 'Reviewed' : 'Unreviewed'}
              </Badge>
            )}
            {confidenceFilter > 0.7 && (
              <Badge variant="outline">
                Min {Math.round(confidenceFilter * 100)}% confidence
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setReviewedFilter(null);
                setConfidenceFilter(0.7);
              }}
            >
              Clear All
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results Summary */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Showing {filteredGroups.length} of {groups.length} duplicate groups
        </span>
        {statistics && (
          <span>
            Potential savings:{' '}
            {(statistics.potential_space_savings / (1024 * 1024)).toFixed(1)} MB
          </span>
        )}
      </div>

      {/* Bulk Actions Bar */}
      {bulkSelectMode && (
        <BulkActions
          selectedItems={selectedGroups}
          itemType="duplicates"
          onClearSelection={() => dispatch(clearSelection())}
          onOperationComplete={() => {
            setBulkSelectMode(false);
            dispatch(fetchDuplicateGroups());
            dispatch(fetchDuplicateStatistics());
          }}
        />
      )}

      {/* Bulk Selection Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Button
            variant={bulkSelectMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setBulkSelectMode(!bulkSelectMode);
              if (!bulkSelectMode) {
                dispatch(clearSelection());
              }
            }}
          >
            {bulkSelectMode ? 'Exit Bulk Mode' : 'Bulk Select'}
          </Button>
          {bulkSelectMode && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => dispatch(selectAllGroups())}
              >
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => dispatch(clearSelection())}
              >
                Clear Selection
              </Button>
              <span className="text-sm text-muted-foreground ml-2">
                {selectedGroups.length} selected
              </span>
            </>
          )}
        </div>
      </div>

      {/* Duplicate Groups List */}
      {filteredGroups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <Copy className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">
              {groups.length === 0
                ? 'No duplicate groups found'
                : 'No groups match your filters'}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {groups.length === 0
                ? 'Run the deduplication analysis to find duplicate documents'
                : 'Try adjusting your search criteria or filters'}
            </p>
            {groups.length === 0 && (
              <Button asChild>
                <a href="/processing">Start Analysis</a>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredGroups.map((group) => (
            <div key={group.id} className="flex items-start space-x-2">
              {bulkSelectMode && (
                <Checkbox
                  checked={selectedGroups.includes(group.id)}
                  onChange={() => dispatch(toggleGroupSelection(group.id))}
                  className="mt-6"
                />
              )}
              <div className="flex-1">
                <DuplicateGroupCard
                  group={group}
                  onDocumentSelect={handleDocumentSelect}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DuplicatesPage;
