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
    switch (currentAction) {
      case "delete":
        return itemType === "documents"
          ? `This will permanently delete ${selectedItems.length} document(s) from Paperless-NGX.`
          : `This will resolve ${selectedItems.length} duplicate group(s) by keeping the primary document and deleting the rest.`;
      case "mark-reviewed":
        return `This will mark ${selectedItems.length} duplicate group(s) as reviewed.`;
      case "mark-unreviewed":
        return `This will mark ${selectedItems.length} duplicate group(s) as unreviewed.`;
      case "resolve":
        return `This will resolve ${selectedItems.length} duplicate group(s) by keeping the primary document and removing the duplicates.`;
      default:
        return "";
    }
  };

  if (selectedItems.length === 0) {
    return null;
  }

  return (
    <>
      <div className="flex items-center space-x-2 p-4 bg-muted/50 rounded-lg border">
        <span className="text-sm font-medium">
          {selectedItems.length}{" "}
          {itemType === "documents" ? "document" : "group"}
          {selectedItems.length > 1 ? "s" : ""} selected
        </span>

        <div className="flex-1" />

        {itemType === "duplicates" && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAction("mark-reviewed")}
              disabled={isProcessing}
            >
              <Eye className="h-4 w-4 mr-2" />
              Mark Reviewed
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAction("mark-unreviewed")}
              disabled={isProcessing}
            >
              <FileX className="h-4 w-4 mr-2" />
              Mark Unreviewed
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAction("resolve")}
              disabled={isProcessing}
              className="text-orange-600 hover:text-orange-700"
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
          className="text-red-600 hover:text-red-700"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          {itemType === "documents" ? "Delete" : "Delete Duplicates"}
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={onClearSelection}
          disabled={isProcessing}
        >
          Clear Selection
        </Button>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <span>Confirm Action</span>
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <p>{getActionDescription()}</p>
              <p className="text-red-600 font-medium">
                This action cannot be undone.
              </p>
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
