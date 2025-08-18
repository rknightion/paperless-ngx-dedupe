import { type TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '../store/store';

// Use throughout your app instead of plain `useDispatch` and `useSelector`
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// Convenience hook for common state selections
export const useDocuments = () => useAppSelector((state) => state.documents);
export const useDuplicates = () => useAppSelector((state) => state.duplicates);
export const useProcessing = () => useAppSelector((state) => state.processing);
export const useConfig = () => useAppSelector((state) => state.config);

// Selector hooks for specific parts of state
export const useDocumentsList = () => useAppSelector((state) => ({
  documents: state.documents.documents,
  loading: state.documents.loading.list,
  error: state.documents.error,
  pagination: state.documents.pagination,
}));

export const useDuplicateGroups = () => useAppSelector((state) => ({
  groups: state.duplicates.groups,
  loading: state.duplicates.loading.groups,
  error: state.duplicates.error,
  statistics: state.duplicates.statistics,
}));

export const useProcessingStatus = () => useAppSelector((state) => ({
  status: state.processing.status,
  wsConnected: state.processing.wsConnected,
  estimatedTimeRemaining: state.processing.estimatedTimeRemaining,
  processingSpeed: state.processing.processingSpeed,
  loading: state.processing.loading,
}));

export const useConnectionStatus = () => useAppSelector((state) => ({
  isConnected: state.config.connectionStatus.isConnected,
  testResult: state.config.connectionStatus.testResult,
  lastTested: state.config.connectionStatus.lastTested,
}));