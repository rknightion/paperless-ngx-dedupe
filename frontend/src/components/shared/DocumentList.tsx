import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { FixedSizeList as List } from "react-window";
import { useAppDispatch, useDocumentsList } from "../../hooks/redux";
import {
  fetchDocuments,
  syncDocuments,
  setSearchFilter,
  setProcessingStatusFilter,
  selectDocument,
  deselectDocument,
  selectAllDocuments,
  clearSelection,
} from "../../store/slices/documentsSlice";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Badge } from "../ui/Badge";
import { Checkbox } from "../ui/Checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import {
  Search,
  RefreshCw,
  Download,
  FileText,
  Calendar,
  HardDrive,
  Copy,
} from "lucide-react";
import type { Document } from "../../services/api/types";

interface DocumentListProps {
  className?: string;
  onDocumentSelect?: (document: Document) => void;
  selectable?: boolean;
  compact?: boolean;
}

interface DocumentRowProps {
  index: number;
  style: React.CSSProperties;
  data: {
    documents: Document[];
    selectedDocuments: number[];
    onSelect: (id: number) => void;
    onDeselect: (id: number) => void;
    onDocumentClick: (doc: Document) => void;
    selectable: boolean;
    compact: boolean;
  };
}

// Virtual list item component
const DocumentRow: React.FC<DocumentRowProps> = ({ index, style, data }) => {
  const {
    documents,
    selectedDocuments,
    onSelect,
    onDeselect,
    onDocumentClick,
    selectable,
    compact,
  } = data;

  const document = documents[index];
  const isSelected = selectedDocuments.includes(document.id);
  const isEven = index % 2 === 0;

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.target.checked) {
      onSelect(document.id);
    } else {
      onDeselect(document.id);
    }
  };

  const getStatusBadge = (status: Document["processing_status"]) => {
    if (!status) return null;
    
    const variants = {
      pending: "secondary",
      processing: "warning",
      completed: "success",
      error: "destructive",
    } as const;

    return (
      <Badge variant={variants[status]} className="text-xs">
        {status}
      </Badge>
    );
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString();
  };

  if (compact) {
    return (
      <div
        style={style}
        className={`flex items-center px-4 py-2 border-b hover:bg-muted/50 cursor-pointer ${
          isEven ? "bg-background" : "bg-muted/20"
        } ${isSelected ? "bg-blue-50 border-blue-200" : ""}`}
        onClick={() => onDocumentClick(document)}
      >
        {selectable && (
          <div className="flex items-center mr-3">
            <Checkbox
              checked={isSelected}
              onChange={handleCheckboxChange}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="font-medium truncate">{document.title}</span>
            {getStatusBadge(document.processing_status)}
          </div>
        </div>

        <div className="flex items-center space-x-4 text-sm text-muted-foreground">
          <span>{formatDate(document.created_date)}</span>
          {document.has_duplicates && <Copy className="h-4 w-4" />}
        </div>
      </div>
    );
  }

  return (
    <div
      style={style}
      className={`flex items-center px-6 py-4 border-b hover:bg-muted/50 cursor-pointer ${
        isEven ? "bg-background" : "bg-muted/20"
      } ${isSelected ? "bg-blue-50 border-blue-200" : ""}`}
      onClick={() => onDocumentClick(document)}
    >
      {selectable && (
        <div className="flex items-center mr-4">
          <Checkbox
            checked={isSelected}
            onChange={handleCheckboxChange}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center space-x-3">
          <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <h3 className="font-medium truncate">{document.title}</h3>
          {getStatusBadge(document.processing_status)}
          {document.has_duplicates && (
            <Badge variant="outline" className="text-xs">
              <Copy className="h-3 w-3 mr-1" />
              Has duplicates
            </Badge>
          )}
        </div>

        <div className="flex items-center space-x-4 text-sm text-muted-foreground">
          <div className="flex items-center space-x-1">
            <Calendar className="h-4 w-4" />
            <span>Created: {formatDate(document.created_date)}</span>
          </div>
          {document.last_processed && (
            <div className="flex items-center space-x-1">
              <span>Processed: {formatDate(document.last_processed)}</span>
            </div>
          )}
          {document.file_type && (
            <div className="flex items-center space-x-1">
              <HardDrive className="h-4 w-4" />
              <span>{document.file_type.toUpperCase()}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end space-y-1 text-sm">
        <span className="font-mono text-muted-foreground">
          #{document.paperless_id}
        </span>
        {document.file_size && (
          <span className="text-xs text-muted-foreground">
            {(document.file_size / 1024 / 1024).toFixed(2)} MB
          </span>
        )}
      </div>
    </div>
  );
};

export const DocumentList: React.FC<DocumentListProps> = ({
  className,
  onDocumentSelect,
  selectable = false,
  compact = false,
}) => {
  const dispatch = useAppDispatch();
  const { documents, loading, error, pagination } = useDocumentsList();
  const listRef = useRef<List>(null);

  // Load documents on mount
  useEffect(() => {
    dispatch(fetchDocuments());
  }, [dispatch]);

  // Handle search
  const handleSearch = useCallback(
    (query: string) => {
      dispatch(setSearchFilter(query));
      dispatch(fetchDocuments({ search: query }));
    },
    [dispatch],
  );

  // Handle status filter
  const handleStatusFilter = useCallback(
    (status: string) => {
      dispatch(setProcessingStatusFilter(status));
      dispatch(fetchDocuments({ processing_status: status }));
    },
    [dispatch],
  );

  // Handle sync documents
  const handleSync = useCallback(async () => {
    try {
      await dispatch(syncDocuments()).unwrap();
      // Refresh the list after sync
      dispatch(fetchDocuments());
    } catch (error) {
      console.error("Failed to sync documents:", error);
    }
  }, [dispatch]);

  // Handle document selection
  const handleSelect = useCallback(
    (id: number) => {
      dispatch(selectDocument(id));
    },
    [dispatch],
  );

  const handleDeselect = useCallback(
    (id: number) => {
      dispatch(deselectDocument(id));
    },
    [dispatch],
  );

  const handleSelectAll = useCallback(() => {
    dispatch(selectAllDocuments());
  }, [dispatch]);

  const handleClearSelection = useCallback(() => {
    dispatch(clearSelection());
  }, [dispatch]);

  const handleDocumentClick = useCallback(
    (document: Document) => {
      onDocumentSelect?.(document);
    },
    [onDocumentSelect],
  );

  // Memoize the data for virtual list
  const listData = useMemo(
    () => ({
      documents,
      selectedDocuments: [], // This would come from Redux state
      onSelect: handleSelect,
      onDeselect: handleDeselect,
      onDocumentClick: handleDocumentClick,
      selectable,
      compact,
    }),
    [
      documents,
      handleSelect,
      handleDeselect,
      handleDocumentClick,
      selectable,
      compact,
    ],
  );

  // Calculate item height based on compact mode
  const itemHeight = compact ? 60 : 100;

  if (loading && documents.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center p-8">
          <RefreshCw className="h-6 w-6 animate-spin mr-2" />
          <span>Loading documents...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>Documents ({pagination.count.toLocaleString()})</span>
          </CardTitle>

          <div className="flex items-center space-x-2">
            <Button
              onClick={handleSync}
              disabled={loading}
              variant="outline"
              size="sm"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Sync from Paperless
            </Button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex items-center space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              className="pl-10"
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>

          <select
            className="px-3 py-2 border border-input rounded-md bg-background text-sm"
            onChange={(e) => handleStatusFilter(e.target.value)}
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="error">Error</option>
          </select>
        </div>

        {/* Selection Controls */}
        {selectable && (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <Button onClick={handleSelectAll} variant="outline" size="sm">
                Select All
              </Button>
              <Button
                onClick={handleClearSelection}
                variant="outline"
                size="sm"
              >
                Clear Selection
              </Button>
            </div>
            <span className="text-muted-foreground">
              {documents.length} documents
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {error && (
          <div className="p-4 bg-red-50 border-t border-red-200">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {documents.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">No documents found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Sync from paperless-ngx to get started
            </p>
            <Button onClick={handleSync} disabled={loading}>
              <Download className="h-4 w-4 mr-2" />
              Sync Documents
            </Button>
          </div>
        ) : (
          <div className="border-t">
            <List
              ref={listRef}
              height={600} // Fixed height for virtual scrolling
              width="100%"
              itemCount={documents.length}
              itemSize={itemHeight}
              itemData={listData}
              className="scrollbar-thin scrollbar-thumb-muted scrollbar-track-background"
            >
              {DocumentRow}
            </List>
          </div>
        )}

        {/* Pagination Info */}
        {documents.length > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/20">
            <p className="text-sm text-muted-foreground">
              Showing {documents.length} of {pagination.count.toLocaleString()}{" "}
              documents
            </p>
            {pagination.count > documents.length && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  dispatch(fetchDocuments({ page: pagination.currentPage + 1 }))
                }
                disabled={loading}
              >
                {loading ? "Loading..." : "Load More"}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DocumentList;
