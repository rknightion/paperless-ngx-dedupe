import {
  type TypedUseSelectorHook,
  useDispatch,
  useSelector,
} from "react-redux";
import { createSelector } from "@reduxjs/toolkit";
import type { RootState, AppDispatch } from "../store/store";

// Use throughout your app instead of plain `useDispatch` and `useSelector`
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// Convenience hook for common state selections
export const useDocuments = () => useAppSelector((state) => state.documents);
export const useDuplicates = () => useAppSelector((state) => state.duplicates);
export const useProcessing = () => useAppSelector((state) => state.processing);
export const useConfig = () => useAppSelector((state) => state.config);

// Memoized selectors to prevent unnecessary re-renders
const selectDocumentsList = createSelector(
  [(state: RootState) => state.documents],
  (documents) => ({
    documents: documents.documents,
    loading: documents.loading.list,
    error: documents.error,
    pagination: documents.pagination,
  })
);

const selectDuplicateGroups = createSelector(
  [(state: RootState) => state.duplicates],
  (duplicates) => ({
    groups: duplicates.groups,
    loading: duplicates.loading.groups,
    error: duplicates.error,
    statistics: duplicates.statistics,
    totalCount: duplicates.pagination.count,
  })
);

const selectProcessingStatus = createSelector(
  [(state: RootState) => state.processing],
  (processing) => ({
    status: processing.status,
    wsConnected: processing.wsConnected,
    estimatedTimeRemaining: processing.estimatedTimeRemaining,
    processingSpeed: processing.processingSpeed,
    loading: processing.loading,
  })
);

const selectConnectionStatus = createSelector(
  [(state: RootState) => state.config.connectionStatus],
  (connectionStatus) => ({
    isConnected: connectionStatus.isConnected,
    testResult: connectionStatus.testResult,
    lastTested: connectionStatus.lastTested,
  })
);

// Selector hooks for specific parts of state
export const useDocumentsList = () => useAppSelector(selectDocumentsList);
export const useDuplicateGroups = () => useAppSelector(selectDuplicateGroups);
export const useProcessingStatus = () => useAppSelector(selectProcessingStatus);
export const useConnectionStatus = () => useAppSelector(selectConnectionStatus);
