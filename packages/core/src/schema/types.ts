import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type { document, documentContent, documentSignature } from './sqlite/documents.js';
import type { duplicateGroup, duplicateMember } from './sqlite/duplicates.js';
import type { job } from './sqlite/jobs.js';
import type { appConfig, syncState } from './sqlite/app.js';
import type { aiProcessingResult } from './sqlite/ai-processing.js';
import type { aiResultRevision } from './sqlite/ai-result-revisions.js';
import type {
  aiBudgetReservation,
  automationSchedule,
  dispatchIntent,
  operationLease,
  syncChangeGeneration,
} from './sqlite/automation.js';
import type {
  reviewedMutationDocumentCheckpoint,
  reviewedMutationGroupCheckpoint,
  reviewedMutationPlan,
} from './sqlite/review.js';

// Select types (reading from DB)
export type Document = InferSelectModel<typeof document>;
export type DocumentContent = InferSelectModel<typeof documentContent>;
export type DocumentSignature = InferSelectModel<typeof documentSignature>;
export type DuplicateGroup = InferSelectModel<typeof duplicateGroup>;
export type DuplicateMember = InferSelectModel<typeof duplicateMember>;
export type Job = InferSelectModel<typeof job>;
export type AppConfigRow = InferSelectModel<typeof appConfig>;
export type SyncState = InferSelectModel<typeof syncState>;
export type AiProcessingResult = InferSelectModel<typeof aiProcessingResult>;
export type AiResultRevision = InferSelectModel<typeof aiResultRevision>;
export type AutomationScheduleRow = InferSelectModel<typeof automationSchedule>;
export type DispatchIntent = InferSelectModel<typeof dispatchIntent>;
export type OperationLease = InferSelectModel<typeof operationLease>;
export type SyncChangeGeneration = InferSelectModel<typeof syncChangeGeneration>;
export type AiBudgetReservation = InferSelectModel<typeof aiBudgetReservation>;
export type ReviewedMutationPlan = InferSelectModel<typeof reviewedMutationPlan>;
export type ReviewedMutationGroupCheckpoint = InferSelectModel<
  typeof reviewedMutationGroupCheckpoint
>;
export type ReviewedMutationDocumentCheckpoint = InferSelectModel<
  typeof reviewedMutationDocumentCheckpoint
>;

// Insert types (writing to DB)
export type NewDocument = InferInsertModel<typeof document>;
export type NewDocumentContent = InferInsertModel<typeof documentContent>;
export type NewDocumentSignature = InferInsertModel<typeof documentSignature>;
export type NewDuplicateGroup = InferInsertModel<typeof duplicateGroup>;
export type NewDuplicateMember = InferInsertModel<typeof duplicateMember>;
export type NewJob = InferInsertModel<typeof job>;
export type NewAppConfigRow = InferInsertModel<typeof appConfig>;
export type NewSyncState = InferInsertModel<typeof syncState>;
export type NewAiProcessingResult = InferInsertModel<typeof aiProcessingResult>;
export type NewAiResultRevision = InferInsertModel<typeof aiResultRevision>;
export type NewAutomationScheduleRow = InferInsertModel<typeof automationSchedule>;
export type NewDispatchIntent = InferInsertModel<typeof dispatchIntent>;
export type NewOperationLease = InferInsertModel<typeof operationLease>;
export type NewSyncChangeGeneration = InferInsertModel<typeof syncChangeGeneration>;
export type NewAiBudgetReservation = InferInsertModel<typeof aiBudgetReservation>;
export type NewReviewedMutationPlan = InferInsertModel<typeof reviewedMutationPlan>;
export type NewReviewedMutationGroupCheckpoint = InferInsertModel<
  typeof reviewedMutationGroupCheckpoint
>;
export type NewReviewedMutationDocumentCheckpoint = InferInsertModel<
  typeof reviewedMutationDocumentCheckpoint
>;
