import React, { useEffect, useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { ScrollArea } from '../ui/ScrollArea';
import { Progress } from '../ui/Progress';
import {
  FileText,
  Calendar,
  Tag,
  User,
  FileType,
  HardDrive,
  Check,
  X,
  Copy,
  ExternalLink,
  Info,
  AlertCircle,
  ArrowLeftRight,
  BarChart3,
} from 'lucide-react';
import { documentsApi } from '../../services/api/documents';
import { diffWords, diffLines, Change } from 'diff';

interface Document {
  id: number;
  paperless_id: number;
  title: string;
  content?: string;
  created_date?: string;
  modified_date?: string;
  correspondent?: string;
  document_type?: string;
  tags?: string[];
  original_filename?: string;
  file_size?: number;
  archive_serial_number?: number;
}

interface DocumentComparisonModalProps {
  open: boolean;
  onClose: () => void;
  primaryDocument: Document;
  compareDocuments: Document[];
  confidence?: number;
}

interface DiffStats {
  additions: number;
  deletions: number;
  similarity: number;
}

export const DocumentComparisonModal: React.FC<DocumentComparisonModalProps> = ({
  open,
  onClose,
  primaryDocument,
  compareDocuments,
  confidence = 0,
}) => {
  const [selectedCompareIndex, setSelectedCompareIndex] = useState(0);
  const [primaryContent, setPrimaryContent] = useState<string>('');
  const [compareContent, setCompareContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'side-by-side' | 'unified'>('side-by-side');
  const [diffType, setDiffType] = useState<'words' | 'lines'>('lines');
  const [syncScroll, setSyncScroll] = useState(true);

  const selectedCompareDocument = compareDocuments[selectedCompareIndex];

  // Fetch document content
  useEffect(() => {
    if (open && primaryDocument && selectedCompareDocument) {
      fetchDocumentContent();
    }
  }, [open, primaryDocument, selectedCompareDocument]);

  const fetchDocumentContent = async () => {
    setLoading(true);
    try {
      // Fetch primary document content
      const primaryResponse = await documentsApi.getDocumentContent(primaryDocument.id);
      setPrimaryContent(primaryResponse.full_text || '');

      // Fetch compare document content
      const compareResponse = await documentsApi.getDocumentContent(selectedCompareDocument.id);
      setCompareContent(compareResponse.full_text || '');
    } catch (error) {
      console.error('Failed to fetch document content:', error);
      setPrimaryContent('Failed to load content');
      setCompareContent('Failed to load content');
    } finally {
      setLoading(false);
    }
  };

  // Calculate diff
  const diffResult = useMemo(() => {
    if (!primaryContent || !compareContent) return [];

    if (diffType === 'words') {
      return diffWords(primaryContent, compareContent);
    } else {
      return diffLines(primaryContent, compareContent);
    }
  }, [primaryContent, compareContent, diffType]);

  // Calculate diff statistics
  const diffStats: DiffStats = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    let unchanged = 0;

    diffResult.forEach((part) => {
      const count = diffType === 'words'
        ? part.value.split(/\s+/).length
        : part.value.split('\n').length;

      if (part.added) additions += count;
      else if (part.removed) deletions += count;
      else unchanged += count;
    });

    const total = additions + deletions + unchanged;
    const similarity = total > 0 ? (unchanged / total) * 100 : 0;

    return { additions, deletions, similarity };
  }, [diffResult, diffType]);

  // Render diff content
  const renderDiffContent = (changes: Change[]) => {
    return changes.map((part: Change, index: number) => {
      const className = part.added
        ? 'bg-green-100 text-green-900'
        : part.removed
        ? 'bg-red-100 text-red-900'
        : '';

      return (
        <span key={index} className={className}>
          {part.value}
        </span>
      );
    });
  };

  // Render metadata comparison
  const renderMetadataComparison = () => {
    const fields = [
      { label: 'Title', primary: primaryDocument.title, compare: selectedCompareDocument.title },
      { label: 'Created', primary: primaryDocument.created_date, compare: selectedCompareDocument.created_date },
      { label: 'Correspondent', primary: primaryDocument.correspondent, compare: selectedCompareDocument.correspondent },
      { label: 'Type', primary: primaryDocument.document_type, compare: selectedCompareDocument.document_type },
      { label: 'Filename', primary: primaryDocument.original_filename, compare: selectedCompareDocument.original_filename },
      { label: 'File Size', primary: primaryDocument.file_size, compare: selectedCompareDocument.file_size, format: (v: any) => v ? `${(v / 1024 / 1024).toFixed(2)} MB` : 'N/A' },
    ];

    return (
      <div className="space-y-3">
        {fields.map(({ label, primary, compare, format }) => {
          const primaryValue = format && primary ? format(primary) : (primary || 'N/A');
          const compareValue = format && compare ? format(compare) : (compare || 'N/A');
          const isMatch = primaryValue === compareValue;

          return (
            <div key={label} className="grid grid-cols-3 gap-4 items-center">
              <div className="text-sm font-medium text-muted-foreground">{label}</div>
              <div className={`text-sm ${!isMatch ? 'font-medium' : ''}`}>
                {primaryValue}
              </div>
              <div className={`text-sm flex items-center space-x-2 ${!isMatch ? 'font-medium' : ''}`}>
                {compareValue}
                {isMatch ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <X className="h-3 w-3 text-red-500" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            Document Comparison
          </DialogTitle>
          <DialogClose />
        </DialogHeader>

        <div className="flex items-center justify-between py-3 border-b">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{primaryDocument.title}</span>
              <Badge variant="outline" className="text-xs">Primary</Badge>
            </div>
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
            <div className="flex items-center space-x-2">
              {compareDocuments.length > 1 ? (
                <select
                  className="text-sm border rounded px-2 py-1"
                  value={selectedCompareIndex}
                  onChange={(e) => setSelectedCompareIndex(Number(e.target.value))}
                >
                  {compareDocuments.map((doc, index) => (
                    <option key={doc.id} value={index}>
                      {doc.title}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{selectedCompareDocument.title}</span>
                </>
              )}
              <Badge variant="outline" className="text-xs">Duplicate</Badge>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Badge variant={confidence >= 0.9 ? 'destructive' : confidence >= 0.7 ? 'warning' : 'secondary'}>
              {Math.round(confidence * 100)}% Match
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/paperless/documents/${primaryDocument.paperless_id}`, '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              Open Primary
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/paperless/documents/${selectedCompareDocument.paperless_id}`, '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              Open Duplicate
            </Button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Similarity: {diffStats.similarity.toFixed(1)}%</span>
            </div>
            <Progress value={diffStats.similarity} className="w-24 h-2" />
          </div>
          <div className="flex items-center space-x-4 text-sm">
            <span className="text-green-600">+{diffStats.additions} additions</span>
            <span className="text-red-600">-{diffStats.deletions} deletions</span>
          </div>
          <div className="flex items-center space-x-2">
            <label className="flex items-center space-x-1 text-sm">
              <input
                type="checkbox"
                checked={syncScroll}
                onChange={(e) => setSyncScroll(e.target.checked)}
              />
              <span>Sync scroll</span>
            </label>
          </div>
        </div>

        <Tabs defaultValue="content" className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="content">Content Comparison</TabsTrigger>
            <TabsTrigger value="metadata">Metadata</TabsTrigger>
            <TabsTrigger value="summary">Summary</TabsTrigger>
          </TabsList>

          <TabsContent value="content" className="flex-1 mt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Button
                  variant={viewMode === 'side-by-side' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('side-by-side')}
                >
                  Side by Side
                </Button>
                <Button
                  variant={viewMode === 'unified' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('unified')}
                >
                  Unified
                </Button>
              </div>
              <div className="flex items-center space-x-2">
                <label className="text-sm">Diff by:</label>
                <select
                  className="text-sm border rounded px-2 py-1"
                  value={diffType}
                  onChange={(e) => setDiffType(e.target.value as 'words' | 'lines')}
                >
                  <option value="lines">Lines</option>
                  <option value="words">Words</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-96">
                <div className="text-center">
                  <Progress className="w-48 mb-2" />
                  <p className="text-sm text-muted-foreground">Loading document content...</p>
                </div>
              </div>
            ) : viewMode === 'side-by-side' ? (
              <div className="grid grid-cols-2 gap-4 h-[500px]">
                <div className="border rounded-lg p-4">
                  <h3 className="font-medium mb-2">Primary Document</h3>
                  <ScrollArea className="h-[450px]">
                    <pre className="text-sm whitespace-pre-wrap">
                      {primaryContent || 'No content available'}
                    </pre>
                  </ScrollArea>
                </div>
                <div className="border rounded-lg p-4">
                  <h3 className="font-medium mb-2">Compare Document</h3>
                  <ScrollArea className="h-[450px]">
                    <pre className="text-sm whitespace-pre-wrap">
                      <>{renderDiffContent(diffResult)}</>
                    </pre>
                  </ScrollArea>
                </div>
              </div>
            ) : (
              <ScrollArea className="h-[500px] border rounded-lg p-4">
                <pre className="text-sm whitespace-pre-wrap">
                  <>{renderDiffContent(diffResult)}</>
                </pre>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="metadata" className="mt-4">
            <div className="border rounded-lg p-6">
              {renderMetadataComparison()}
            </div>
          </TabsContent>

          <TabsContent value="summary" className="mt-4">
            <div className="space-y-4">
              <div className="border rounded-lg p-4">
                <h3 className="font-medium mb-3 flex items-center">
                  <Info className="h-4 w-4 mr-2" />
                  Comparison Summary
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Overall Confidence</p>
                    <p className="text-2xl font-bold">{Math.round(confidence * 100)}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Content Similarity</p>
                    <p className="text-2xl font-bold">{diffStats.similarity.toFixed(1)}%</p>
                  </div>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-yellow-900">Recommendation</h4>
                    <p className="text-sm text-yellow-800 mt-1">
                      {confidence >= 0.9
                        ? 'These documents are very likely duplicates. Consider keeping only one.'
                        : confidence >= 0.7
                        ? 'These documents are probable duplicates. Review carefully before deletion.'
                        : 'These documents have some similarities but may not be true duplicates.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={onClose}>
                  Close
                </Button>
                <Button variant="destructive">
                  Delete Duplicate
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentComparisonModal;