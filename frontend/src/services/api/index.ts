// Export API clients
export { apiClient, default as client } from './client';
export { documentsApi } from './documents';
export { duplicatesApi } from './duplicates';
export { processingApi } from './processing';
export { configApi } from './config';
export { batchApi, OperationType, OperationStatus } from './batch';

// Export types
export type * from './types';

// Main API object for easy access
export const api = {
  documents: () => import('./documents').then((m) => m.documentsApi),
  duplicates: () => import('./duplicates').then((m) => m.duplicatesApi),
  processing: () => import('./processing').then((m) => m.processingApi),
  config: () => import('./config').then((m) => m.configApi),
  batch: () => import('./batch').then((m) => m.batchApi),
};

// Convenience methods
export const getApi = () => ({
  documents: import('./documents').then((m) => m.documentsApi),
  duplicates: import('./duplicates').then((m) => m.duplicatesApi),
  processing: import('./processing').then((m) => m.processingApi),
  config: import('./config').then((m) => m.configApi),
  batch: import('./batch').then((m) => m.batchApi),
});
