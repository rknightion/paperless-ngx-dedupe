export type {
  PaperlessConfig,
  PaperlessDocument,
  DocumentMetadata,
  PaperlessTag,
  PaperlessCorrespondent,
  PaperlessDocumentType,
  PaperlessStatistics,
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
  connectionTestResultSchema,
  paperlessConfigSchema,
  paginatedResponseSchema,
  toPaperlessConfig,
} from './schemas.js';

export { PaperlessClient } from './client.js';
export { PaperlessApiError, PaperlessAuthError, PaperlessConnectionError } from './errors.js';
