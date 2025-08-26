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
  AlertCircle,
  FileX,
  Settings,
  Info,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { configApi } from '../../services/api/config';

export const DuplicatesPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const { groups, loading, statistics, totalCount } = useDuplicateGroups();
  const selectedGroups = useSelector((state: RootState) => state.duplicates.selectedGroups);
  const [searchQuery, setSearchQuery] = useState('');
  const [reviewedFilter, setReviewedFilter] = useState<boolean | null>(null);
  const [confidenceFilter, setConfidenceFilter] = useState(0.7);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [showConfidenceSettings, setShowConfidenceSettings] = useState(false);
  const [confidenceWeights, setConfidenceWeights] = useState({
    jaccard: true,
    fuzzy: true,
    metadata: true,
    filename: true,
  });
  const [config, setConfig] = useState<any>(null);
  const [infoBoxExpanded, setInfoBoxExpanded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState<'confidence' | 'created' | 'documents' | 'filename'>('confidence');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Load duplicate groups, statistics and configuration
  useEffect(() => {
    dispatch(fetchDuplicateGroups({
      page: currentPage,
      page_size: pageSize,
      sort_by: sortBy,
      sort_order: sortDirection,
    }));
    dispatch(fetchDuplicateStatistics());
    // Load configuration to show current settings
    configApi.getConfiguration().then(setConfig).catch(console.error);
  }, [dispatch, currentPage, pageSize, sortBy, sortDirection]);

  // Handle filters
  const handleRefresh = () => {
    dispatch(fetchDuplicateGroups({
      page: currentPage,
      page_size: pageSize,
      sort_by: sortBy,
      sort_order: sortDirection,
    }));
    dispatch(fetchDuplicateStatistics());
  };

  const handleDocumentSelect = (documentId: number) => {
    // Could navigate to document detail or open in paperless
    console.log('Selected document:', documentId);
  };

  // Filter groups based on search and filters
  // Calculate total pages
  const totalPages = Math.ceil(totalCount / pageSize);

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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
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
            title="Potential Deletions"
            value={statistics?.potential_deletions || 0}
            icon={FileX}
            color="text-red-600"
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

      {/* Information Box */}
      <Card className="bg-blue-50/30 dark:bg-blue-950/30 border-blue-200/50 dark:border-blue-800/50">
        <CardHeader 
          className="pb-3 cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-950/50 transition-colors"
          onClick={() => setInfoBoxExpanded(!infoBoxExpanded)}
        >
          <CardTitle className="flex items-center justify-between text-base">
            <div className="flex items-center space-x-2">
              <Info className="h-5 w-5 text-blue-600" />
              <span>Understanding Duplicate Detection</span>
            </div>
            {infoBoxExpanded ? (
              <ChevronUp className="h-4 w-4 text-blue-600" />
            ) : (
              <ChevronDown className="h-4 w-4 text-blue-600" />
            )}
          </CardTitle>
        </CardHeader>
        {infoBoxExpanded && (
          <CardContent className="space-y-3 text-sm">
            <div className="space-y-2">
              <div>
                <strong className="text-blue-900 dark:text-blue-100">Primary Document:</strong> The first document found in each group, used as the reference for comparison.
              </div>
              <div>
                <strong className="text-blue-900 dark:text-blue-100">Confidence Score:</strong> How similar documents are (0-100%). Calculated from:
                <ul className="ml-4 mt-1 space-y-1 text-xs text-gray-700 dark:text-gray-300">
                  <li>• <strong>Jaccard Similarity (40%):</strong> Overlapping unique words</li>
                  <li>• <strong>Fuzzy Text (30%):</strong> Handles OCR errors and variations</li>
                  <li>• <strong>Metadata (20%):</strong> Date, size, type matching</li>
                  <li>• <strong>Filename (10%):</strong> Similar file names</li>
                </ul>
              </div>
              <div className="pt-2 border-t">
                <strong className="text-blue-900 dark:text-blue-100">Actions Explained:</strong>
                <ul className="ml-4 mt-1 space-y-1 text-xs text-gray-700 dark:text-gray-300">
                  <li>• <strong>Mark Reviewed:</strong> Flag group as manually checked</li>
                  <li>• <strong>Delete Group:</strong> Remove grouping (keeps documents)</li>
                  <li>• <strong>Resolve Groups:</strong> Delete duplicate documents (keeps primary)</li>
                </ul>
              </div>
              {config && (
                <div className="pt-2 border-t flex items-center justify-between">
                  <div>
                    <strong className="text-blue-900 dark:text-blue-100">Current Settings:</strong>
                    <div className="text-xs mt-1 space-y-1 text-gray-700 dark:text-gray-300">
                      <div>OCR Length: {config.max_ocr_length} chars</div>
                      <div>Fuzzy Threshold: {config.fuzzy_match_threshold}%</div>
                    </div>
                  </div>
                  <Link to="/settings">
                    <Button variant="outline" size="sm">
                      <Settings className="h-3 w-3 mr-1" />
                      Settings
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Results Summary and Controls */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium">Sort by:</label>
              <select
                className="px-3 py-1 text-sm border border-input rounded-md bg-background"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
              >
                <option value="confidence">Confidence</option>
                <option value="created">Date Found</option>
                <option value="documents">Document Count</option>
                <option value="filename">Filename</option>
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
              >
                {sortDirection === 'asc' ? '↑' : '↓'}
              </Button>
            </div>
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium">Show:</label>
              <select
                className="px-3 py-1 text-sm border border-input rounded-md bg-background"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value="10">10 per page</option>
                <option value="20">20 per page</option>
                <option value="50">50 per page</option>
                <option value="100">100 per page</option>
              </select>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            Showing {Math.min(pageSize, filteredGroups.length)} of {totalCount || groups.length} groups
            {statistics && statistics.potential_deletions > 0 && (
              <span className="ml-2">• {statistics.potential_deletions} documents can be deleted</span>
            )}
          </div>
        </div>

        {/* Page Navigation Top */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
            >
              First
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <span className="px-3 py-1 text-sm">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
            >
              Last
            </Button>
          </div>
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

      {/* Page Navigation Bottom */}
      {totalPages > 1 && filteredGroups.length > 0 && (
        <div className="flex items-center justify-center space-x-2 pt-4 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
          >
            First
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(currentPage - 1)}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <span className="px-3 py-1 text-sm">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages}
          >
            Last
          </Button>
        </div>
      )}
    </div>
  );
};

export default DuplicatesPage;
