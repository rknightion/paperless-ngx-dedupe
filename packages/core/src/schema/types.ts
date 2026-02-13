import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type { document, documentContent, documentSignature } from './sqlite/documents.js';
import type { duplicateGroup, duplicateMember } from './sqlite/duplicates.js';
import type { job } from './sqlite/jobs.js';
import type { appConfig, syncState } from './sqlite/app.js';

// Select types (reading from DB)
export type Document = InferSelectModel<typeof document>;
export type DocumentContent = InferSelectModel<typeof documentContent>;
export type DocumentSignature = InferSelectModel<typeof documentSignature>;
export type DuplicateGroup = InferSelectModel<typeof duplicateGroup>;
export type DuplicateMember = InferSelectModel<typeof duplicateMember>;
export type Job = InferSelectModel<typeof job>;
export type AppConfigRow = InferSelectModel<typeof appConfig>;
export type SyncState = InferSelectModel<typeof syncState>;

// Insert types (writing to DB)
export type NewDocument = InferInsertModel<typeof document>;
export type NewDocumentContent = InferInsertModel<typeof documentContent>;
export type NewDocumentSignature = InferInsertModel<typeof documentSignature>;
export type NewDuplicateGroup = InferInsertModel<typeof duplicateGroup>;
export type NewDuplicateMember = InferInsertModel<typeof duplicateMember>;
export type NewJob = InferInsertModel<typeof job>;
export type NewAppConfigRow = InferInsertModel<typeof appConfig>;
export type NewSyncState = InferInsertModel<typeof syncState>;
