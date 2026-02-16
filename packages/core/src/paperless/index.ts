export type {
  PaperlessConfig,
  PaperlessDocument,
  DocumentMetadata,
  PaperlessTag,
  PaperlessCorrespondent,
  PaperlessDocumentType,
  PaperlessStatistics,
  PaperlessStatus,
  PaperlessStoragePath,
  PaperlessTask,
  PaperlessRemoteVersion,
  PaginatedResponse,
  ConnectionTestResult,
} from './types.js';

export {
  paperlessDocumentSchema,
  documentMetadataSchema,
  paperlessTagSchema,
  paperlessCorrespondentSchema,
  paperlessDocumentTypeSchema,
  paperlessStatisticsSchema,
  paperlessStatusSchema,
  paperlessStoragePathSchema,
  paperlessTaskSchema,
  paperlessRemoteVersionSchema,
  connectionTestResultSchema,
  paperlessConfigSchema,
  paginatedResponseSchema,
  toPaperlessConfig,
} from './schemas.js';

export { PaperlessClient } from './client.js';
export { PaperlessApiError, PaperlessAuthError, PaperlessConnectionError } from './errors.js';
