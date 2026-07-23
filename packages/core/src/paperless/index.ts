export type {
  PaperlessConfig,
  PaperlessDocument,
  PaperlessTag,
  PaperlessCorrespondent,
  PaperlessDocumentType,
  PaperlessCustomField,
  PaperlessCustomFieldDataType,
  PaperlessCustomFieldInstance,
  PaperlessCustomFieldValue,
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
  paperlessCustomFieldSchema,
  paperlessCustomFieldInstanceSchema,
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
