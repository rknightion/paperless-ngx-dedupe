export type {
  PaperlessConfig,
  PaperlessDocument,
  PaperlessTag,
  PaperlessCorrespondent,
  PaperlessDocumentType,
  PaperlessStatistics,
  PaperlessStatus,
  PaperlessStoragePath,
  PaperlessRemoteVersion,
  PaginatedResponse,
  ConnectionTestResult,
} from './types.js';

export {
  paperlessDocumentSchema,
  paperlessTagSchema,
  paperlessCorrespondentSchema,
  paperlessDocumentTypeSchema,
  paperlessStatisticsSchema,
  paperlessStatusSchema,
  paperlessStoragePathSchema,
  paperlessRemoteVersionSchema,
  connectionTestResultSchema,
  paperlessConfigSchema,
  paginatedResponseSchema,
  toPaperlessConfig,
} from './schemas.js';

export { PaperlessClient } from './client.js';
export { PaperlessApiError, PaperlessAuthError, PaperlessConnectionError } from './errors.js';
