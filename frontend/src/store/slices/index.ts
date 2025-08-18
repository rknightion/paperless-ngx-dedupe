export { default as documentsSlice } from './documentsSlice';
export { default as duplicatesSlice } from './duplicatesSlice';
export { default as processingSlice } from './processingSlice';
export { default as configSlice } from './configSlice';

// Export document actions
export {
  fetchDocuments,
  fetchDocument,
  syncDocuments,
  setSearchFilter,
  setProcessingStatusFilter,
  setOrdering,
  setCurrentPage as setDocumentPage,
  setPageSize as setDocumentPageSize,
  selectDocument,
  deselectDocument,
  selectAllDocuments,
  clearSelection as clearDocumentSelection,
  clearError as clearDocumentError,
  updateDocumentStatus,
} from './documentsSlice';

// Export duplicate actions
export {
  fetchDuplicateGroups,
  fetchDuplicateGroup,
  reviewDuplicateGroup,
  deleteDuplicateGroup,
  fetchDuplicateStatistics,
  bulkReviewGroups,
  setReviewedFilter,
  setMinConfidenceFilter,
  setCurrentPage as setDuplicatePage,
  setPageSize as setDuplicatePageSize,
  selectGroup,
  deselectGroup,
  selectAllGroups,
  clearSelection as clearDuplicateSelection,
  clearError as clearDuplicateError,
  updateGroupReviewStatus,
  removeGroup,
} from './duplicatesSlice';

// Export processing actions
export {
  startAnalysis,
  fetchProcessingStatus,
  cancelProcessing,
  clearCache,
  setWebSocketConnected,
  updateProcessingStatus,
  clearError as clearProcessingError,
  resetProcessingState,
  addToHistory,
} from './processingSlice';

// Export config actions
export {
  fetchConfiguration,
  updateConfiguration,
  testConnection,
  resetConfiguration,
  fetchConfigurationDefaults,
  updateFormData,
  setFormData,
  resetFormData,
  setValidationErrors,
  clearValidationErrors,
  setConnectionStatus,
  clearError as clearConfigError,
  clearConnectionTest,
} from './configSlice';
