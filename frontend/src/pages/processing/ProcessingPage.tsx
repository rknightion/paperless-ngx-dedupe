import React from "react";
import { ProgressTracker } from "../../components/shared";
import { SyncProgress } from "../../components/sync/SyncProgress";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/Card";
import { Activity, Info } from "lucide-react";

export const ProcessingPage: React.FC = () => {
  const handleProcessingComplete = (results: any) => {
    console.log("Processing completed:", results);
    // Could show notification or redirect
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Processing Control
        </h1>
        <p className="text-muted-foreground">
          Monitor and control document deduplication analysis
        </p>
      </div>

      {/* Document Sync */}
      <SyncProgress />

      {/* Main Progress Tracker */}
      <ProgressTracker
        showControls={true}
        onComplete={handleProcessingComplete}
      />

      {/* Information Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Info className="h-5 w-5" />
            <span>About the Deduplication Process</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="prose text-sm text-muted-foreground max-w-none">
            <p>
              The deduplication analysis uses advanced algorithms to identify
              potentially duplicate documents in your paperless-ngx library. The
              process involves several steps:
            </p>

            <ol className="list-decimal list-inside space-y-2 mt-4">
              <li>
                <strong>Document Loading:</strong> Retrieval of document
                metadata and OCR content from your paperless-ngx instance
              </li>
              <li>
                <strong>Content Processing:</strong> Generation of MinHash
                fingerprints for efficient similarity detection
              </li>
              <li>
                <strong>Similarity Analysis:</strong> Comparison of documents
                using Locality-Sensitive Hashing (LSH) for fast candidate
                identification
              </li>
              <li>
                <strong>Fuzzy Matching:</strong> Detailed comparison of
                candidate pairs using fuzzy text matching algorithms
              </li>
              <li>
                <strong>Confidence Scoring:</strong> Calculation of confidence
                scores based on multiple similarity factors
              </li>
              <li>
                <strong>Group Formation:</strong> Organization of similar
                documents into duplicate groups for review
              </li>
            </ol>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-medium text-blue-900 mb-2">
                Processing Tips:
              </h4>
              <ul className="text-blue-800 text-sm space-y-1">
                <li>
                  • Higher similarity thresholds reduce false positives but may
                  miss some duplicates
                </li>
                <li>
                  • Force rebuild will reprocess all documents, useful after
                  configuration changes
                </li>
                <li>
                  • Document limits are helpful for testing with large libraries
                </li>
                <li>
                  • Processing speed depends on document count and OCR text
                  length
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Metrics */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Activity className="h-5 w-5" />
              <span>Algorithm Details</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-medium">MinHash Permutations</div>
                <div className="text-muted-foreground">128 hash functions</div>
              </div>
              <div>
                <div className="font-medium">LSH Bands</div>
                <div className="text-muted-foreground">16 bands × 8 rows</div>
              </div>
              <div>
                <div className="font-medium">Similarity Threshold</div>
                <div className="text-muted-foreground">
                  Configurable (80% default)
                </div>
              </div>
              <div>
                <div className="font-medium">Confidence Weights</div>
                <div className="text-muted-foreground">
                  Jaccard + Fuzzy + Metadata
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Expected Performance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>1,000 documents</span>
                <span className="text-muted-foreground">~8-10 minutes</span>
              </div>
              <div className="flex justify-between">
                <span>5,000 documents</span>
                <span className="text-muted-foreground">~40-50 minutes</span>
              </div>
              <div className="flex justify-between">
                <span>10,000 documents</span>
                <span className="text-muted-foreground">~80-100 minutes</span>
              </div>
              <div className="flex justify-between">
                <span>15,000 documents</span>
                <span className="text-muted-foreground">~120-150 minutes</span>
              </div>
              <div className="flex justify-between">
                <span>Processing speed</span>
                <span className="text-muted-foreground">~100-150 docs/min</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              * LSH index building is the slowest phase. Times vary based on
              document size, OCR content length (up to 500K chars), and system
              performance.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ProcessingPage;
