import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { useAppDispatch, useDuplicateGroups } from '../../hooks/redux';
import { useSelector } from 'react-redux';
import { RootState } from '../../store/store';
import {
  fetchDuplicateGroups,
  fetchDuplicateStatistics,
  toggleGroupSelection,
  selectAllGroups,
  clearSelection,
  reviewDuplicateGroup,
  deleteDuplicateGroup,
} from '../../store/slices/duplicatesSlice';
import { DuplicateGroupCard } from '../../components/shared';
import { BulkActions } from '../../components/batch/BulkActions';
import { KeyboardShortcutsHelp } from '../../components/shared/KeyboardShortcutsHelp';
import {
  useKeyboardShortcuts,
  COMMON_SHORTCUTS,
} from '../../hooks/useKeyboardShortcuts';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Checkbox } from '../../components/ui/Checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/ui/Tooltip';
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
  ChevronDown,
  ChevronUp,
  FileText,
  BarChart3,
  Percent,
  Trash2,
  Keyboard,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { configApi } from '../../services/api/config';
import { fetchConfiguration } from '../../store/slices/configSlice';
import { duplicatesApi } from '../../services/api/duplicates';

export const DuplicatesPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const { groups, loading, statistics, totalCount } = useDuplicateGroups();
  const selectedGroups = useSelector(
    (state: RootState) => state.duplicates.selectedGroups
  );

  // Get confidence weights from config
  const reduxConfig = useSelector(
    (state: RootState) => state.config.configuration
  );
  const configWeights = {
    jaccard: reduxConfig?.confidence_weight_jaccard ?? 90,
    fuzzy: reduxConfig?.confidence_weight_fuzzy ?? 10,
    metadata: reduxConfig?.confidence_weight_metadata ?? 0,
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [reviewedFilter, setReviewedFilter] = useState<boolean | null>(null);
  const [confidenceFilter, setConfidenceFilter] = useState(0.7);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [showConfidenceSettings, setShowConfidenceSettings] = useState(false);
  const [confidenceWeights, setConfidenceWeights] = useState({
    jaccard: true,
    fuzzy: true,
    metadata: true,
  });
  const [fuzzyRatioFilter, setFuzzyRatioFilter] = useState(0.5);
  const [selectedCorrespondent, setSelectedCorrespondent] = useState('');
  const [selectedDocumentType, setSelectedDocumentType] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [minPages, setMinPages] = useState('');
  const [maxPages, setMaxPages] = useState('');
  const [minFileSizeMb, setMinFileSizeMb] = useState('');
  const [maxFileSizeMb, setMaxFileSizeMb] = useState('');
  const [config, setConfig] = useState<any>(null);
  const [infoBoxExpanded, setInfoBoxExpanded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState<
    | 'confidence'
    | 'created'
    | 'documents'
    | 'filename'
    | 'file_size'
    | 'page_count'
    | 'correspondent'
    | 'document_type'
  >('confidence');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const minPagesValue = useMemo(
    () => (minPages ? parseInt(minPages, 10) || undefined : undefined),
    [minPages]
  );
  const maxPagesValue = useMemo(
    () => (maxPages ? parseInt(maxPages, 10) || undefined : undefined),
    [maxPages]
  );
  const minFileSizeBytes = useMemo(
    () =>
      minFileSizeMb
        ? Math.max(parseFloat(minFileSizeMb) * 1024 * 1024, 0) || undefined
        : undefined,
    [minFileSizeMb]
  );
  const maxFileSizeBytes = useMemo(
    () =>
      maxFileSizeMb
        ? Math.max(parseFloat(maxFileSizeMb) * 1024 * 1024, 0) || undefined
        : undefined,
    [maxFileSizeMb]
  );
  const metadataFacets = useMemo(() => {
    const correspondents = new Set<string>();
    const documentTypes = new Set<string>();
    const tags = new Set<string>();

    (groups || []).forEach((group) => {
      group.documents.forEach((doc) => {
        if (doc.correspondent) {
          correspondents.add(doc.correspondent);
        }
        if (doc.document_type) {
          documentTypes.add(doc.document_type);
        }
        (doc.tags || []).forEach((tag) => tags.add(tag));
      });
    });

    return {
      correspondents: Array.from(correspondents).sort(),
      documentTypes: Array.from(documentTypes).sort(),
      tags: Array.from(tags).sort(),
    };
  }, [groups]);

  // Keyboard shortcuts state
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [focusedGroupIndex, setFocusedGroupIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const groupRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Load duplicate groups, statistics and configuration
  useEffect(() => {
    // Fetch configuration to get weights
    dispatch(fetchConfiguration());
  }, [dispatch]);

  useEffect(() => {
    dispatch(
      fetchDuplicateGroups({
        page: currentPage,
        page_size: pageSize,
        sort_by: sortBy,
        sort_order: sortDirection,
        min_confidence: confidenceFilter,
        reviewed: reviewedFilter ?? undefined,
        use_jaccard: confidenceWeights.jaccard,
        use_fuzzy: confidenceWeights.fuzzy,
        use_metadata: confidenceWeights.metadata,
        min_fuzzy_ratio: fuzzyRatioFilter,
      })
    );
    dispatch(fetchDuplicateStatistics());
    // Load configuration to show current settings
    configApi.getConfiguration().then(setConfig).catch(console.error);
  }, [
    dispatch,
    currentPage,
    pageSize,
    sortBy,
    sortDirection,
    confidenceFilter,
    reviewedFilter,
    confidenceWeights,
    fuzzyRatioFilter,
  ]);

  // Handle filters
  const handleRefresh = () => {
    dispatch(
      fetchDuplicateGroups({
        page: currentPage,
        page_size: pageSize,
        sort_by: sortBy,
        sort_order: sortDirection,
        min_confidence: confidenceFilter,
        reviewed: reviewedFilter ?? undefined,
        use_jaccard: confidenceWeights.jaccard,
        use_fuzzy: confidenceWeights.fuzzy,
        use_metadata: confidenceWeights.metadata,
        min_fuzzy_ratio: fuzzyRatioFilter,
      })
    );
    dispatch(fetchDuplicateStatistics());
  };

  const handleDocumentSelect = (documentId: number) => {
    // Could navigate to document detail or open in paperless
    console.log('Selected document:', documentId);
  };

  const applyLocalFilters = useCallback(
    (collection: typeof groups) => {
      return (collection || []).filter((group) => {
        const matchesSearch =
          searchQuery === '' ||
          group.documents.some((doc) =>
            doc.title.toLowerCase().includes(searchQuery.toLowerCase())
          );

        const matchesReviewed =
          reviewedFilter === null || group.reviewed === reviewedFilter;

        const matchesConfidence = group.confidence >= confidenceFilter;

        const matchesCorrespondent =
          !selectedCorrespondent ||
          group.documents.some(
            (doc) =>
              doc.correspondent &&
              doc.correspondent.toLowerCase() ===
                selectedCorrespondent.toLowerCase()
          );

        const matchesDocumentType =
          !selectedDocumentType ||
          group.documents.some(
            (doc) =>
              doc.document_type &&
              doc.document_type.toLowerCase() ===
                selectedDocumentType.toLowerCase()
          );

        const matchesTag =
          !selectedTag ||
          group.documents.some((doc) =>
            (doc.tags || []).some(
              (tag) => tag.toLowerCase() === selectedTag.toLowerCase()
            )
          );

        const matchesPages =
          minPagesValue === undefined && maxPagesValue === undefined
            ? true
            : group.documents.some((doc) => {
                const pages = doc.page_estimate;
                if (pages === undefined || pages === null) {
                  return false;
                }
                if (minPagesValue !== undefined && pages < minPagesValue) {
                  return false;
                }
                if (maxPagesValue !== undefined && pages > maxPagesValue) {
                  return false;
                }
                return true;
              });

        const matchesFileSize =
          minFileSizeBytes === undefined && maxFileSizeBytes === undefined
            ? true
            : group.documents.some((doc) => {
                const size =
                  doc.original_file_size ??
                  doc.archive_file_size;
                if (size === undefined || size === null) {
                  return false;
                }
                if (minFileSizeBytes !== undefined && size < minFileSizeBytes) {
                  return false;
                }
                if (maxFileSizeBytes !== undefined && size > maxFileSizeBytes) {
                  return false;
                }
                return true;
              });

        return (
          matchesSearch &&
          matchesReviewed &&
          matchesConfidence &&
          matchesCorrespondent &&
          matchesDocumentType &&
          matchesTag &&
          matchesPages &&
          matchesFileSize
        );
      });
    },
    [
      confidenceFilter,
      maxFileSizeBytes,
      maxPagesValue,
      minFileSizeBytes,
      minPagesValue,
      reviewedFilter,
      searchQuery,
      selectedCorrespondent,
      selectedDocumentType,
      selectedTag,
    ]
  );

  // Calculate filtered groups first to avoid using undefined paginatedGroups
  const tempFilteredGroups = applyLocalFilters(groups);

  // Calculate pagination for keyboard shortcuts
  const tempStartIndex = (currentPage - 1) * pageSize;
  const tempEndIndex = tempStartIndex + pageSize;
  const tempPaginatedGroups = tempFilteredGroups.slice(
    tempStartIndex,
    tempEndIndex
  );

  // Keyboard shortcut handlers
  const navigateToGroup = useCallback(
    (direction: 'up' | 'down') => {
      setFocusedGroupIndex((prev) => {
        const newIndex =
          direction === 'down'
            ? Math.min(prev + 1, tempPaginatedGroups.length - 1)
            : Math.max(prev - 1, 0);

        // Scroll the focused group into view
        setTimeout(() => {
          groupRefs.current[newIndex]?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        }, 0);

        return newIndex;
      });
    },
    [tempPaginatedGroups.length]
  );

  const handleReviewFocusedGroup = useCallback(async () => {
    if (focusedGroupIndex < tempPaginatedGroups.length) {
      const group = tempPaginatedGroups[focusedGroupIndex];
      await dispatch(
        reviewDuplicateGroup({ id: group.id, reviewed: !group.reviewed })
      );
      handleRefresh();
    }
  }, [focusedGroupIndex, tempPaginatedGroups, dispatch]);

  const handleDeleteFocusedGroup = useCallback(async () => {
    if (focusedGroupIndex < tempPaginatedGroups.length) {
      const group = tempPaginatedGroups[focusedGroupIndex];
      if (confirm(`Are you sure you want to delete this duplicate group?`)) {
        await dispatch(deleteDuplicateGroup(group.id));
        handleRefresh();
      }
    }
  }, [focusedGroupIndex, tempPaginatedGroups, dispatch]);

  const handleToggleSelectFocusedGroup = useCallback(() => {
    if (focusedGroupIndex < tempPaginatedGroups.length && bulkSelectMode) {
      const group = tempPaginatedGroups[focusedGroupIndex];
      dispatch(toggleGroupSelection(group.id));
    }
  }, [focusedGroupIndex, tempPaginatedGroups, bulkSelectMode, dispatch]);

  const handleSelectAllAcrossPages = useCallback(async () => {
    // This will be implemented to select all groups across all pages
    try {
      const params = {
        min_confidence: confidenceFilter,
        reviewed: reviewedFilter ?? undefined,
        use_jaccard: confidenceWeights.jaccard,
        use_fuzzy: confidenceWeights.fuzzy,
        use_metadata: confidenceWeights.metadata,
        min_fuzzy_ratio: fuzzyRatioFilter,
        page_size: 10000, // Get all IDs
      };

      const response = await duplicatesApi.getDuplicateGroups(params);
      const allGroupIds = response.groups.map((g) => g.id);

      // Update Redux to track all selected groups
      allGroupIds.forEach((id) => {
        if (!selectedGroups.includes(id)) {
          dispatch(toggleGroupSelection(id));
        }
      });

      setBulkSelectMode(true);
    } catch (error) {
      console.error('Failed to select all groups:', error);
    }
  }, [
    confidenceFilter,
    reviewedFilter,
    confidenceWeights,
    fuzzyRatioFilter,
    selectedGroups,
    dispatch,
  ]);

  // Setup keyboard shortcuts
  useKeyboardShortcuts(
    [
      {
        key: 'j',
        handler: () => navigateToGroup('down'),
        description: 'Navigate to next group',
      },
      {
        key: 'k',
        handler: () => navigateToGroup('up'),
        description: 'Navigate to previous group',
      },
      {
        key: 'Enter',
        handler: () => {
          if (focusedGroupIndex < paginatedGroups.length) {
            const group = paginatedGroups[focusedGroupIndex];
            handleDocumentSelect(group.documents[0].paperless_id);
          }
        },
        description: 'Open focused group',
      },
      {
        key: 'r',
        handler: handleReviewFocusedGroup,
        description: 'Toggle review status',
      },
      {
        key: 'd',
        handler: handleDeleteFocusedGroup,
        description: 'Delete focused group',
      },
      {
        key: ' ',
        handler: handleToggleSelectFocusedGroup,
        description: 'Toggle selection',
        preventDefault: true,
      },
      {
        key: 'a',
        shift: true,
        handler: () => dispatch(selectAllGroups()),
        description: 'Select all visible groups',
      },
      {
        key: 'a',
        ctrl: true,
        handler: handleSelectAllAcrossPages,
        description: 'Select all groups (across pages)',
      },
      {
        key: 'Escape',
        handler: () => {
          dispatch(clearSelection());
          setBulkSelectMode(false);
        },
        description: 'Clear selection',
      },
      {
        key: '/',
        handler: () => searchInputRef.current?.focus(),
        description: 'Focus search',
        preventDefault: true,
      },
      {
        key: '?',
        handler: () => setShowShortcutsHelp(true),
        description: 'Show keyboard shortcuts',
      },
      {
        key: 'r',
        ctrl: true,
        handler: handleRefresh,
        description: 'Refresh data',
      },
      {
        key: 'ArrowLeft',
        handler: () => {
          if (currentPage > 1) {
            setCurrentPage(currentPage - 1);
          }
        },
        description: 'Previous page',
      },
      {
        key: 'ArrowRight',
        handler: () => {
          if (currentPage < totalPages) {
            setCurrentPage(currentPage + 1);
          }
        },
        description: 'Next page',
      },
    ],
    { enabled: !showShortcutsHelp }
  );

  // Filter groups based on search and filters
  const filteredGroups = applyLocalFilters(groups);

  // Calculate total pages based on filtered groups
  const totalPages = Math.ceil(filteredGroups.length / pageSize);

  // Paginate the filtered groups
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedGroups = filteredGroups.slice(startIndex, endIndex);

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
            <p className="text-2xl font-bold">
              {(value || 0).toLocaleString()}
            </p>
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
    <TooltipProvider>
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
          <div className="flex items-center space-x-2">
            <Link to="/bulk-wizard">
              <Button size="sm" className="bg-slate-900 text-white hover:bg-slate-800">
                Launch Bulk Wizard
              </Button>
            </Link>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowShortcutsHelp(true)}
                  title="Keyboard shortcuts (?)"
                >
                  <Keyboard className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Press ? to see all keyboard shortcuts
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={handleRefresh} disabled={loading}>
                  <RefreshCw
                    className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`}
                  />
                  Refresh
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reload duplicate groups (Ctrl+R)</TooltipContent>
            </Tooltip>
          </div>
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
                    ref={searchInputRef}
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
                    setReviewedFilter(
                      value === 'all' ? null : value === 'true'
                    );
                  }}
                >
                  <option value="all">All Groups</option>
                  <option value="false">Unreviewed</option>
                  <option value="true">Reviewed</option>
                </select>
              </div>

              {/* Confidence Threshold */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium">
                    Min Confidence ({Math.round(confidenceFilter * 100)}%)
                  </label>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Only show groups with a confidence score above this
                      threshold. Higher values = fewer but more accurate
                      results.
                    </TooltipContent>
                  </Tooltip>
                </div>
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

            <div className="grid gap-4 md:grid-cols-4">
              {/* Correspondent Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Correspondent</label>
                <select
                  className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  value={selectedCorrespondent}
                  onChange={(e) => setSelectedCorrespondent(e.target.value)}
                >
                  <option value="">All correspondents</option>
                  {metadataFacets.correspondents.map((corr) => (
                    <option key={corr} value={corr}>
                      {corr}
                    </option>
                  ))}
                </select>
              </div>

              {/* Document Type Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Document Type</label>
                <select
                  className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  value={selectedDocumentType}
                  onChange={(e) => setSelectedDocumentType(e.target.value)}
                >
                  <option value="">All types</option>
                  {metadataFacets.documentTypes.map((docType) => (
                    <option key={docType} value={docType}>
                      {docType}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tag Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Tag</label>
                <select
                  className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  value={selectedTag}
                  onChange={(e) => setSelectedTag(e.target.value)}
                >
                  <option value="">Any tag</option>
                  {metadataFacets.tags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </div>

              {/* Page Count Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Page Count (estimated)
                </label>
                <div className="flex space-x-2">
                  <Input
                    type="number"
                    min="1"
                    placeholder="Min"
                    value={minPages}
                    onChange={(e) => setMinPages(e.target.value)}
                  />
                  <Input
                    type="number"
                    min="1"
                    placeholder="Max"
                    value={maxPages}
                    onChange={(e) => setMaxPages(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Based on OCR word count (350 words ≈ 1 page)
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {/* File Size Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">File Size (MB)</label>
                <div className="flex space-x-2">
                  <Input
                    type="number"
                    min="0"
                    placeholder="Min"
                    value={minFileSizeMb}
                    onChange={(e) => setMinFileSizeMb(e.target.value)}
                  />
                  <Input
                    type="number"
                    min="0"
                    placeholder="Max"
                    value={maxFileSizeMb}
                    onChange={(e) => setMaxFileSizeMb(e.target.value)}
                  />
                </div>
              </div>

              {/* Sort By */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Sort By</label>
                <select
                  className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  value={sortBy}
                  onChange={(e) =>
                    setSortBy(e.target.value as typeof sortBy)
                  }
                >
                  <option value="confidence">Confidence</option>
                  <option value="created">Created Date</option>
                  <option value="documents">Document Count</option>
                  <option value="page_count">Page Count (est.)</option>
                  <option value="file_size">File Size</option>
                  <option value="correspondent">Correspondent</option>
                  <option value="document_type">Document Type</option>
                  <option value="filename">Filename</option>
                </select>
              </div>

              {/* Sort Direction */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Sort Direction</label>
                <select
                  className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  value={sortDirection}
                  onChange={(e) =>
                    setSortDirection(e.target.value as 'asc' | 'desc')
                  }
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </div>
            </div>

            {/* Advanced Confidence Settings */}
            <div className="space-y-3 pt-3 border-t">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">
                  Advanced Confidence Settings
                </h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setShowConfidenceSettings(!showConfidenceSettings)
                  }
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
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-medium text-gray-900">
                        Include/Exclude Confidence Factors
                      </h5>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const allEnabled =
                            Object.values(confidenceWeights).every(Boolean);
                          // Toggle all while keeping at least one factor on
                          if (allEnabled) {
                            setConfidenceWeights({
                              jaccard: true,
                              fuzzy: false,
                              metadata: false,
                            });
                          } else {
                            setConfidenceWeights({
                              jaccard: true,
                              fuzzy: true,
                              metadata: true,
                            });
                          }
                        }}
                        className="text-xs"
                      >
                        {Object.values(confidenceWeights).every(Boolean)
                          ? 'Disable All'
                          : 'Enable All'}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Toggle factors on/off to customize how confidence is
                      calculated. Disabled factors are completely excluded from
                      scoring.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <label
                        className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                          confidenceWeights.jaccard
                            ? 'border-blue-200 bg-blue-50'
                            : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={confidenceWeights.jaccard}
                            onChange={(e) => {
                              const newWeights = {
                                ...confidenceWeights,
                                jaccard: e.target.checked,
                              };
                              // Prevent disabling all factors
                              if (Object.values(newWeights).some(Boolean)) {
                                setConfidenceWeights(newWeights);
                              }
                            }}
                          />
                          <div>
                            <div className="flex items-center space-x-1">
                              <span className="text-sm font-medium">
                                Content Similarity
                              </span>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Info className="h-3 w-3 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  Uses MinHash fingerprinting to detect
                                  documents with similar content, even when word
                                  order varies or minor edits have been made.
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              MinHash/Jaccard similarity of document text
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {configWeights.jaccard}%
                        </Badge>
                      </label>

                      <label
                        className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                          confidenceWeights.fuzzy
                            ? 'border-green-200 bg-green-50'
                            : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={confidenceWeights.fuzzy}
                            onChange={(e) => {
                              const newWeights = {
                                ...confidenceWeights,
                                fuzzy: e.target.checked,
                              };
                              // Prevent disabling all factors
                              if (Object.values(newWeights).some(Boolean)) {
                                setConfidenceWeights(newWeights);
                              }
                            }}
                          />
                          <div>
                            <span className="text-sm font-medium">
                              Fuzzy Text Match
                            </span>
                            <p className="text-xs text-muted-foreground">
                              Handles OCR errors and word order changes
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {configWeights.fuzzy}%
                        </Badge>
                      </label>
                    </div>

                    <div className="space-y-3">
                      <label
                        className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                          confidenceWeights.metadata
                            ? 'border-yellow-200 bg-yellow-50'
                            : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={confidenceWeights.metadata}
                            onChange={(e) => {
                              const newWeights = {
                                ...confidenceWeights,
                                metadata: e.target.checked,
                              };
                              // Prevent disabling all factors
                              if (Object.values(newWeights).some(Boolean)) {
                                setConfidenceWeights(newWeights);
                              }
                            }}
                          />
                          <div>
                            <span className="text-sm font-medium">
                              Metadata Match
                            </span>
                            <p className="text-xs text-muted-foreground">
                              File size, dates, types, correspondents
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {configWeights.metadata}%
                        </Badge>
                      </label>
                    </div>
                  </div>

                  {/* Validation Warning */}
                  {!Object.values(confidenceWeights).some(Boolean) && (
                    <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-md">
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      <p className="text-sm text-red-800">
                        At least one factor must be enabled for confidence
                        calculation.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Min Fuzzy Text Ratio ({Math.round(fuzzyRatioFilter * 100)}
                      %)
                    </label>
                    <div className="flex items-center space-x-3">
                      <Input
                        type="range"
                        min="0.5"
                        max="1.0"
                        step="0.05"
                        value={fuzzyRatioFilter}
                        onChange={(e) =>
                          setFuzzyRatioFilter(parseFloat(e.target.value))
                        }
                        className="flex-1"
                      />
                      <span className="text-sm font-medium w-12 text-right">
                        {Math.round(fuzzyRatioFilter * 100)}%
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Only show groups where fuzzy text similarity is at least
                      this value. Groups below 50% are never stored.
                    </p>
                  </div>

                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <div className="flex items-start space-x-2">
                      <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-blue-900">
                          Dynamic Confidence Recalculation
                        </p>
                        <p className="text-blue-800 mt-1">
                          Confidence scores are recalculated on-the-fly based on
                          your selected factors. No rescanning required -
                          changes apply immediately!
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
              {selectedCorrespondent && (
                <Badge variant="outline">
                  Correspondent: {selectedCorrespondent}
                </Badge>
              )}
              {selectedDocumentType && (
                <Badge variant="outline">
                  Type: {selectedDocumentType}
                </Badge>
              )}
              {selectedTag && <Badge variant="outline">Tag: {selectedTag}</Badge>}
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
              {(!confidenceWeights.jaccard ||
                !confidenceWeights.fuzzy ||
                !confidenceWeights.metadata) && (
                <Badge variant="outline">Custom weights</Badge>
              )}
              {(minPagesValue !== undefined || maxPagesValue !== undefined) && (
                <Badge variant="outline">
                  Pages:{' '}
                  {`${minPagesValue ?? '0'}-${maxPagesValue ?? 'max'}`}
                </Badge>
              )}
              {(minFileSizeBytes !== undefined ||
                maxFileSizeBytes !== undefined) && (
                <Badge variant="outline">
                  {`Size: ${Math.round((minFileSizeBytes ?? 0) / 1024 / 1024)}-${maxFileSizeBytes !== undefined ? Math.round(maxFileSizeBytes / 1024 / 1024) : 'max'} MB`}
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
                  });
                  setSelectedCorrespondent('');
                  setSelectedDocumentType('');
                  setSelectedTag('');
                  setMinPages('');
                  setMaxPages('');
                  setMinFileSizeMb('');
                  setMaxFileSizeMb('');
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
                  <h3 className="text-lg font-semibold text-gray-800">
                    Understanding Duplicate Detection
                  </h3>
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
                      <h4 className="font-semibold text-gray-800">
                        Primary Document
                      </h4>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      The first document found in each group, used as the
                      reference for comparison.
                    </p>
                  </div>

                  <div className="p-3 bg-white/70 rounded-lg border border-purple-100/50">
                    <div className="flex items-start space-x-2 mb-2">
                      <div className="p-1 bg-purple-100 rounded">
                        <BarChart3 className="h-4 w-4 text-purple-600" />
                      </div>
                      <h4 className="font-semibold text-gray-800">
                        Confidence Score
                      </h4>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      How similar documents are (0-100%), calculated from
                      multiple factors.
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-gradient-to-r from-indigo-50/50 to-purple-50/50 rounded-lg border border-indigo-100/30">
                  <h4 className="font-semibold text-gray-800 mb-3 flex items-center">
                    <Percent className="h-4 w-4 mr-2 text-indigo-600" />
                    Confidence Factors Explained
                  </h4>
                  <div className="space-y-3">
                    <div className="p-3 bg-white/60 rounded-lg border border-indigo-100/50">
                      <div className="flex items-start justify-between mb-1">
                        <span className="text-gray-800 font-semibold">
                          Jaccard Similarity
                        </span>
                        <Badge
                          variant="outline"
                          className="text-xs bg-indigo-50"
                        >
                          {configWeights.jaccard}% weight
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        Measures the overlap between document content using
                        MinHash signatures. This technique creates a
                        "fingerprint" of each document by selecting a set of
                        characteristic word sequences (shingles). Documents with
                        similar fingerprints likely contain similar content.
                        Highly effective for finding near-duplicates even when
                        word order varies or small edits have been made.
                      </p>
                    </div>

                    <div className="p-3 bg-white/60 rounded-lg border border-purple-100/50">
                      <div className="flex items-start justify-between mb-1">
                        <span className="text-gray-800 font-semibold">
                          Fuzzy Text Matching
                        </span>
                        <Badge
                          variant="outline"
                          className="text-xs bg-purple-50"
                        >
                          {configWeights.fuzzy}% weight
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        Uses advanced string matching algorithms (Levenshtein
                        distance) to find similar text even when there are OCR
                        errors, typos, or minor variations. This is crucial for
                        scanned documents where OCR might misread characters
                        (e.g., "0" as "O", "rn" as "m"). Can detect documents
                        that are the same despite scanning artifacts or quality
                        issues.
                      </p>
                    </div>

                    <div className="p-3 bg-white/60 rounded-lg border border-yellow-100/50">
                      <div className="flex items-start justify-between mb-1">
                        <span className="text-gray-800 font-semibold">
                          Metadata Similarity
                        </span>
                        <Badge
                          variant="outline"
                          className="text-xs bg-yellow-50"
                        >
                          {configWeights.metadata}% weight
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        Compares document properties including: file size
                        (within 10% tolerance), creation and modification dates
                        (same day), document type (invoice, receipt, etc.),
                        correspondent (sender/company), and tags. Documents with
                        matching metadata are more likely to be duplicates. This
                        helps catch re-scanned documents that might have
                        different text due to OCR variations.
                      </p>
                    </div>

                    <div className="mt-3 p-2 bg-blue-50/50 rounded border border-blue-200/50">
                      <p className="text-xs text-blue-800">
                        <strong>Note:</strong> We recommend keeping scoring
                        focused on OCR content (90% Jaccard, 10% fuzzy).
                        Metadata only kicks in as a fallback when OCR text is
                        missing. You can adjust these in Settings if needed.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-3">
                  <div className="p-2.5 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-semibold text-green-800">
                        Mark Reviewed
                      </span>
                    </div>
                    <p className="text-xs text-green-700 mt-1">
                      Flag as manually checked
                    </p>
                  </div>

                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      <span className="text-sm font-semibold text-amber-800">
                        Delete Group
                      </span>
                    </div>
                    <p className="text-xs text-amber-700 mt-1">
                      Remove grouping only
                    </p>
                  </div>

                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Trash2 className="h-4 w-4 text-red-600" />
                      <span className="text-sm font-semibold text-red-800">
                        Resolve Groups
                      </span>
                    </div>
                    <p className="text-xs text-red-700 mt-1">
                      Delete duplicates
                    </p>
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
                          OCR:{' '}
                          <span className="font-semibold text-indigo-600">
                            {config.max_ocr_length.toLocaleString()}
                          </span>{' '}
                          chars
                        </span>
                        <span className="text-sm text-gray-600">
                          Threshold:{' '}
                          <span className="font-semibold text-purple-600">
                            {config.fuzzy_match_threshold}%
                          </span>
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
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
                  }
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
              Showing {paginatedGroups.length} of {filteredGroups.length} groups
              {statistics && statistics.potential_deletions > 0 && (
                <span className="ml-2">
                  • {statistics.potential_deletions} documents can be deleted
                </span>
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
                  title="Select all on current page (Shift+A)"
                >
                  Select Page
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAllAcrossPages}
                  title="Select all groups across all pages (Ctrl+A)"
                >
                  Select All ({totalCount})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => dispatch(clearSelection())}
                  title="Clear selection (Escape)"
                >
                  Clear Selection
                </Button>
                <span className="text-sm text-muted-foreground ml-2">
                  {selectedGroups.length} selected
                  {selectedGroups.length > 0 && totalCount > 0 && (
                    <span className="text-xs">
                      {' '}
                      ({Math.round((selectedGroups.length / totalCount) * 100)}
                      %)
                    </span>
                  )}
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
            {paginatedGroups.map((group, index) => (
              <div
                key={group.id}
                ref={(el) => {
                  if (el) groupRefs.current[index] = el;
                }}
                className={`flex items-start space-x-2 rounded-lg transition-all duration-200 ${
                  focusedGroupIndex === index
                    ? 'ring-2 ring-primary ring-offset-2'
                    : ''
                }`}
              >
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
        {totalPages > 1 && paginatedGroups.length > 0 && (
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

        {/* Keyboard Shortcuts Help Modal */}
        <KeyboardShortcutsHelp
          open={showShortcutsHelp}
          onClose={() => setShowShortcutsHelp(false)}
        />
      </div>
    </TooltipProvider>
  );
};

export default DuplicatesPage;
