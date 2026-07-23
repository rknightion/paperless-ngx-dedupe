import { relations } from 'drizzle-orm';

import { document, documentContent, documentSignature } from './sqlite/documents.js';
import { duplicateGroup, duplicateMember } from './sqlite/duplicates.js';
import { aiProcessingResult } from './sqlite/ai-processing.js';
import { aiResultRevision } from './sqlite/ai-result-revisions.js';

export const documentRelations = relations(document, ({ one, many }) => ({
  content: one(documentContent, {
    fields: [document.id],
    references: [documentContent.documentId],
  }),
  signature: one(documentSignature, {
    fields: [document.id],
    references: [documentSignature.documentId],
  }),
  duplicateMembers: many(duplicateMember),
  aiProcessingResult: one(aiProcessingResult, {
    fields: [document.id],
    references: [aiProcessingResult.documentId],
  }),
}));

export const documentContentRelations = relations(documentContent, ({ one }) => ({
  document: one(document, {
    fields: [documentContent.documentId],
    references: [document.id],
  }),
}));

export const documentSignatureRelations = relations(documentSignature, ({ one }) => ({
  document: one(document, {
    fields: [documentSignature.documentId],
    references: [document.id],
  }),
}));

export const duplicateGroupRelations = relations(duplicateGroup, ({ many }) => ({
  members: many(duplicateMember),
}));

export const duplicateMemberRelations = relations(duplicateMember, ({ one }) => ({
  group: one(duplicateGroup, {
    fields: [duplicateMember.groupId],
    references: [duplicateGroup.id],
  }),
  document: one(document, {
    fields: [duplicateMember.documentId],
    references: [document.id],
  }),
}));

export const aiProcessingResultRelations = relations(aiProcessingResult, ({ one, many }) => ({
  document: one(document, {
    fields: [aiProcessingResult.documentId],
    references: [document.id],
  }),
  revisions: many(aiResultRevision),
}));

export const aiResultRevisionRelations = relations(aiResultRevision, ({ one }) => ({
  result: one(aiProcessingResult, {
    fields: [aiResultRevision.resultId],
    references: [aiProcessingResult.id],
  }),
}));
