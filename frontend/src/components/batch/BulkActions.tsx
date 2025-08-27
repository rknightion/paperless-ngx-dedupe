import React, { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui";
import {
  Trash2,
  Tag,
  CheckCircle,
  AlertTriangle,
  Loader2,
  FileX,
  Eye,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";
import { batchApi, OperationType } from "../../services/api/batch";
import { useAppDispatch } from "../../hooks/redux";
import { fetchDuplicateGroups } from "../../store/slices/duplicatesSlice";

interface BulkActionsProps {
  selectedItems: string[] | number[];
  itemType: "documents" | "duplicates";
  onClearSelection: () => void;
  onOperationComplete?: (result: any) => void;
}

export const BulkActions: React.FC<BulkActionsProps> = ({
  selectedItems,
  itemType,
  onClearSelection,
  onOperationComplete,
}) => {
  const dispatch = useAppDispatch();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [currentAction, setCurrentAction] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [operationResult, setOperationResult] = useState<any>(null);
  const [showHelp, setShowHelp] = useState(false);

  const handleAction = (action: string) => {
    setCurrentAction(action);
    setShowConfirmDialog(true);
  };

  const executeAction = async () => {
    setIsProcessing(true);
    setShowConfirmDialog(false);

    try {
      let result;

      switch (currentAction) {
        case "delete":
          if (itemType === "documents") {
            result = await batchApi.deleteDocuments(selectedItems as number[]);
          } else {
            // For duplicate groups, resolve them (delete non-primary documents)
            result = await batchApi.bulkResolveDuplicates(
              selectedItems as string[],
              true,
            );
          }
          break;

        case "mark-reviewed":
          if (itemType === "duplicates") {
            result = await batchApi.bulkReviewDuplicates(
              selectedItems as string[],
              true,
            );
          }
          break;

        case "mark-unreviewed":
          if (itemType === "duplicates") {
            result = await batchApi.bulkReviewDuplicates(
              selectedItems as string[],
              false,
            );
          }
          break;

        case "resolve":
          if (itemType === "duplicates") {
            result = await batchApi.bulkResolveDuplicates(
              selectedItems as string[],
              true,
            );
          }
          break;

        default:
          throw new Error(`Unknown action: ${currentAction}`);
      }

      setOperationResult(result);
      onClearSelection();

      // Refresh data
      if (itemType === "duplicates") {
        dispatch(fetchDuplicateGroups());
      }

      if (onOperationComplete) {
        onOperationComplete(result);
      }
    } catch (error) {
      console.error("Bulk operation failed:", error);
      setOperationResult({
        error: true,
        message: `Failed to ${currentAction}: ${error}`,
      });
    } finally {
      setIsProcessing(false);
      setCurrentAction(null);
    }
  };

  const getActionDescription = () => {
    const count = selectedItems.length;
    switch (currentAction) {
      case "delete":
        return itemType === "documents"
          ? {
              title: `Delete ${count} Document${count > 1 ? "s" : ""}`,
              description: `This will permanently delete ${count} document${count > 1 ? "s" : ""} from Paperless-NGX.`,
              details: [
                "• Documents will be removed from Paperless-NGX permanently",
                "• All associated metadata, tags, and correspondents will be lost",
                "• This action cannot be undone",
                "• File will be deleted from storage"
              ]
            }
          : {
              title: `Delete Duplicates in ${count} Group${count > 1 ? "s" : ""}`,
              description: `This will resolve ${count} duplicate group${count > 1 ? "s" : ""} by keeping the primary document and deleting the rest.`,
              details: [
                "• Primary document (marked in blue) will be kept",
                "• All other documents in the group will be deleted from Paperless-NGX",
                "• Duplicate groups will be marked as resolved",
                "• Primary selection is automatic (newest, most complete metadata)"
              ]
            };
      case "mark-reviewed":
        return {
          title: `Mark ${count} Group${count > 1 ? "s" : ""} as Reviewed`,
          description: `This will mark ${count} duplicate group${count > 1 ? "s" : ""} as reviewed.`,
          details: [
            "• Groups will be marked with a green 'Reviewed' badge",
            "• No documents will be deleted or modified",
            "• You can filter to hide reviewed groups",
            "• This helps track your duplicate resolution progress"
          ]
        };
      case "mark-unreviewed":
        return {
          title: `Mark ${count} Group${count > 1 ? "s" : ""} as Unreviewed`,
          description: `This will mark ${count} duplicate group${count > 1 ? "s" : ""} as unreviewed.`,
          details: [
            "• Removes the 'Reviewed' status from groups",
            "• Groups will appear in unreviewed filter",
            "• No documents will be deleted or modified",
            "• Useful if you want to re-examine groups later"
          ]
        };
      case "resolve":
        return {
          title: `Resolve ${count} Group${count > 1 ? "s" : ""}`,
          description: `This will resolve ${count} duplicate group${count > 1 ? "s" : ""} by keeping the primary document and removing the duplicates.`,
          details: [
            "• Primary document will be preserved in Paperless-NGX",
            "• Duplicate documents will be removed from the system",
            "• Groups will be marked as both reviewed and resolved",
            "• Free up storage space by eliminating true duplicates"
          ]
        };
      default:
        return { title: "", description: "", details: [] };
    }
  };

  const getActionButtonHelp = (action: string) => {
    switch (action) {
      case "mark-reviewed":
        return "Track which groups you've manually examined without making changes";
      case "mark-unreviewed":
        return "Remove reviewed status to re-examine groups later";
      case "resolve":
        return "Keep primary documents and remove duplicates from Paperless-NGX";
      case "delete":
        return "Permanently delete duplicate documents from Paperless-NGX";
      default:
        return "";
    }
  };

  if (selectedItems.length === 0) {
    return null;
  }

  return (
    <>
      <div className="space-y-3 p-4 bg-muted/50 rounded-lg border">
        {/* Header with selection count and help toggle */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            {selectedItems.length}{" "}
            {itemType === "documents" ? "document" : "group"}
            {selectedItems.length > 1 ? "s" : ""} selected
          </span>
          
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowHelp(!showHelp)}
            className="text-muted-foreground hover:text-foreground"
          >
            <HelpCircle className="h-4 w-4 mr-1" />
            {showHelp ? "Hide Help" : "Show Help"}
            {showHelp ? (
              <ChevronUp className="h-3 w-3 ml-1" />
            ) : (
              <ChevronDown className="h-3 w-3 ml-1" />
            )}
          </Button>
        </div>

        {/* Help Section */}
        {showHelp && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm">
            <div className="flex items-start space-x-2">
              <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="space-y-2">
                <p className="font-medium text-blue-900">Bulk Actions Guide</p>
                <div className="space-y-1 text-blue-800">
                  <p><strong>Mark Reviewed:</strong> Track examined groups without changes</p>
                  <p><strong>Mark Unreviewed:</strong> Remove reviewed status for re-examination</p>
                  <p><strong>Resolve Groups:</strong> Keep primary documents, remove duplicates</p>
                  <p><strong>Delete Duplicates:</strong> Permanently delete duplicate documents</p>
                </div>
                <p className="text-xs text-blue-700 mt-2">
                  💡 Tip: Use "Mark Reviewed" first to track your progress, then "Resolve Groups" or "Delete Duplicates" to clean up.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          {itemType === "duplicates" && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAction("mark-reviewed")}
                disabled={isProcessing}
                title={getActionButtonHelp("mark-reviewed")}
              >
                <Eye className="h-4 w-4 mr-2" />
                Mark Reviewed
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAction("mark-unreviewed")}
                disabled={isProcessing}
                title={getActionButtonHelp("mark-unreviewed")}
              >
                <FileX className="h-4 w-4 mr-2" />
                Mark Unreviewed
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAction("resolve")}
                disabled={isProcessing}
                className="text-orange-600 hover:text-orange-700 border-orange-300 hover:border-orange-400"
                title={getActionButtonHelp("resolve")}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Resolve Groups
              </Button>
            </>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction("delete")}
            disabled={isProcessing}
            className="text-red-600 hover:text-red-700 border-red-300 hover:border-red-400"
            title={getActionButtonHelp("delete")}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {itemType === "documents" ? "Delete" : "Delete Duplicates"}
          </Button>

          <div className="flex-1" />

          <Button
            size="sm"
            variant="ghost"
            onClick={onClearSelection}
            disabled={isProcessing}
          >
            Clear Selection
          </Button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <span>{getActionDescription().title}</span>
            </DialogTitle>
            <DialogDescription className="space-y-4">
              <p className="text-gray-700">{getActionDescription().description}</p>
              
              {/* Action Details */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-900">What this will do:</p>
                <ul className="text-sm text-gray-700 space-y-1">
                  {getActionDescription().details.map((detail, index) => (
                    <li key={index} className="leading-relaxed">{detail}</li>
                  ))}
                </ul>
              </div>

              {/* Warning for destructive actions */}
              {(currentAction === "delete" || currentAction === "resolve") && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-red-800 font-medium text-sm flex items-center">
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    This action cannot be undone
                  </p>
                  <p className="text-red-700 text-xs mt-1">
                    Documents will be permanently removed from Paperless-NGX. Make sure you have backups if needed.
                  </p>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={executeAction}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                "Confirm"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Result Dialog */}
      {operationResult && (
        <Dialog
          open={!!operationResult}
          onOpenChange={() => setOperationResult(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {operationResult.error
                  ? "Operation Failed"
                  : "Operation Complete"}
              </DialogTitle>
              <DialogDescription>
                {operationResult.message ||
                  `Successfully processed ${selectedItems.length} items`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => setOperationResult(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default BulkActions;
