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
  FileText,
  BarChart3,
  Percent,
  Trash2,
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
  const [fuzzyRatioFilter, setFuzzyRatioFilter] = useState(0.5);
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
      min_confidence: confidenceFilter,
      reviewed: reviewedFilter ?? undefined,
      use_jaccard: confidenceWeights.jaccard,
      use_fuzzy: confidenceWeights.fuzzy,
      use_metadata: confidenceWeights.metadata,
      use_filename: confidenceWeights.filename,
      min_fuzzy_ratio: fuzzyRatioFilter,
    }));
    dispatch(fetchDuplicateStatistics());
    // Load configuration to show current settings
    configApi.getConfiguration().then(setConfig).catch(console.error);
  }, [dispatch, currentPage, pageSize, sortBy, sortDirection, confidenceFilter, reviewedFilter, confidenceWeights, fuzzyRatioFilter]);

  // Handle filters
  const handleRefresh = () => {
    dispatch(fetchDuplicateGroups({
      page: currentPage,
      page_size: pageSize,
      sort_by: sortBy,
      sort_order: sortDirection,
      min_confidence: confidenceFilter,
      reviewed: reviewedFilter ?? undefined,
      use_jaccard: confidenceWeights.jaccard,
      use_fuzzy: confidenceWeights.fuzzy,
      use_metadata: confidenceWeights.metadata,
      use_filename: confidenceWeights.filename,
      min_fuzzy_ratio: fuzzyRatioFilter,
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

          {/* Advanced Confidence Settings */}
          <div className="space-y-3 pt-3 border-t">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Advanced Confidence Settings</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowConfidenceSettings(!showConfidenceSettings)}
              >
                {showConfidenceSettings ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
            
            {showConfidenceSettings && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <Checkbox
                      checked={confidenceWeights.jaccard}
                      onChange={(e) => setConfidenceWeights(prev => ({ ...prev, jaccard: e.target.checked }))}
                    />
                    <span className="text-sm">Jaccard (40%)</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <Checkbox
                      checked={confidenceWeights.fuzzy}
                      onChange={(e) => setConfidenceWeights(prev => ({ ...prev, fuzzy: e.target.checked }))}
                    />
                    <span className="text-sm">Fuzzy Text (30%)</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <Checkbox
                      checked={confidenceWeights.metadata}
                      onChange={(e) => setConfidenceWeights(prev => ({ ...prev, metadata: e.target.checked }))}
                    />
                    <span className="text-sm">Metadata (20%)</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <Checkbox
                      checked={confidenceWeights.filename}
                      onChange={(e) => setConfidenceWeights(prev => ({ ...prev, filename: e.target.checked }))}
                    />
                    <span className="text-sm">Filename (10%)</span>
                  </label>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Min Fuzzy Text Ratio ({Math.round(fuzzyRatioFilter * 100)}%)
                  </label>
                  <div className="flex items-center space-x-3">
                    <Input
                      type="range"
                      min="0.5"
                      max="1.0"
                      step="0.05"
                      value={fuzzyRatioFilter}
                      onChange={(e) => setFuzzyRatioFilter(parseFloat(e.target.value))}
                      className="flex-1"
                    />
                    <span className="text-sm font-medium w-12 text-right">
                      {Math.round(fuzzyRatioFilter * 100)}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Only show groups where fuzzy text similarity is at least this value.
                    Groups below 50% are never stored.
                  </p>
                </div>
                
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <div className="flex items-start space-x-2">
                    <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-blue-900">Dynamic Confidence Recalculation</p>
                      <p className="text-blue-800 mt-1">
                        Confidence scores are recalculated on-the-fly based on your selected factors.
                        No rescanning required - changes apply immediately!
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
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
            {fuzzyRatioFilter > 0.5 && (
              <Badge variant="outline">
                Min {Math.round(fuzzyRatioFilter * 100)}% fuzzy ratio
              </Badge>
            )}
            {(!confidenceWeights.jaccard || !confidenceWeights.fuzzy || !confidenceWeights.metadata || !confidenceWeights.filename) && (
              <Badge variant="outline">
                Custom weights
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setReviewedFilter(null);
                setConfidenceFilter(0.7);
                setFuzzyRatioFilter(0.5);
                setConfidenceWeights({
                  jaccard: true,
                  fuzzy: true,
                  metadata: true,
                  filename: true,
                });
              }}
            >
              Clear All
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Information Box */}
      <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-indigo-50 via-white to-purple-50 border border-indigo-100 shadow-sm">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-purple-100/20 to-indigo-100/20 rounded-full blur-3xl" />
        <div className="relative">
          <div 
            className="p-4 cursor-pointer hover:bg-white/40 transition-all duration-200"
            onClick={() => setInfoBoxExpanded(!infoBoxExpanded)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg shadow-md">
                  <Info className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-gray-800">Understanding Duplicate Detection</h3>
              </div>
              <div className="p-1.5 rounded-full hover:bg-indigo-50 transition-colors">
                {infoBoxExpanded ? (
                  <ChevronUp className="h-5 w-5 text-indigo-600" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-indigo-600" />
                )}
              </div>
            </div>
          </div>
          
          {infoBoxExpanded && (
            <div className="px-4 pb-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="p-3 bg-white/70 rounded-lg border border-indigo-100/50">
                  <div className="flex items-start space-x-2 mb-2">
                    <div className="p-1 bg-indigo-100 rounded">
                      <FileText className="h-4 w-4 text-indigo-600" />
                    </div>
                    <h4 className="font-semibold text-gray-800">Primary Document</h4>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    The first document found in each group, used as the reference for comparison.
                  </p>
                </div>
                
                <div className="p-3 bg-white/70 rounded-lg border border-purple-100/50">
                  <div className="flex items-start space-x-2 mb-2">
                    <div className="p-1 bg-purple-100 rounded">
                      <BarChart3 className="h-4 w-4 text-purple-600" />
                    </div>
                    <h4 className="font-semibold text-gray-800">Confidence Score</h4>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    How similar documents are (0-100%), calculated from multiple factors.
                  </p>
                </div>
              </div>
              
              <div className="p-3 bg-gradient-to-r from-indigo-50/50 to-purple-50/50 rounded-lg border border-indigo-100/30">
                <h4 className="font-semibold text-gray-800 mb-2 flex items-center">
                  <Percent className="h-4 w-4 mr-2 text-indigo-600" />
                  Confidence Breakdown
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center justify-between p-2 bg-white/60 rounded">
                    <span className="text-gray-700 font-medium">Jaccard Similarity</span>
                    <span className="text-indigo-600 font-semibold">40%</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-white/60 rounded">
                    <span className="text-gray-700 font-medium">Fuzzy Text</span>
                    <span className="text-purple-600 font-semibold">30%</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-white/60 rounded">
                    <span className="text-gray-700 font-medium">Metadata</span>
                    <span className="text-indigo-600 font-semibold">20%</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-white/60 rounded">
                    <span className="text-gray-700 font-medium">Filename</span>
                    <span className="text-purple-600 font-semibold">10%</span>
                  </div>
                </div>
              </div>
              
              <div className="grid gap-2 md:grid-cols-3">
                <div className="p-2.5 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-semibold text-green-800">Mark Reviewed</span>
                  </div>
                  <p className="text-xs text-green-700 mt-1">Flag as manually checked</p>
                </div>
                
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-semibold text-amber-800">Delete Group</span>
                  </div>
                  <p className="text-xs text-amber-700 mt-1">Remove grouping only</p>
                </div>
                
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Trash2 className="h-4 w-4 text-red-600" />
                    <span className="text-sm font-semibold text-red-800">Resolve Groups</span>
                  </div>
                  <p className="text-xs text-red-700 mt-1">Delete duplicates</p>
                </div>
              </div>
              
              {config && (
                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-gray-50 to-indigo-50 rounded-lg border border-gray-200">
                  <div>
                    <h4 className="font-semibold text-gray-800 flex items-center">
                      <Settings className="h-4 w-4 mr-2 text-gray-600" />
                      Current Settings
                    </h4>
                    <div className="flex gap-4 mt-1">
                      <span className="text-sm text-gray-600">
                        OCR: <span className="font-semibold text-indigo-600">{config.max_ocr_length.toLocaleString()}</span> chars
                      </span>
                      <span className="text-sm text-gray-600">
                        Threshold: <span className="font-semibold text-purple-600">{config.fuzzy_match_threshold}%</span>
                      </span>
                    </div>
                  </div>
                  <Link to="/settings">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="border-indigo-200 hover:bg-indigo-50 hover:border-indigo-300 text-indigo-700"
                    >
                      <Settings className="h-3 w-3 mr-1.5" />
                      Configure
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

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
