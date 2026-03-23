import { relations } from 'drizzle-orm';

import { document, documentContent, documentSignature } from './sqlite/documents.js';
import { duplicateGroup, duplicateMember } from './sqlite/duplicates.js';
import { aiProcessingResult } from './sqlite/ai-processing.js';
import { documentChunk, ragConversation, ragMessage } from './sqlite/rag.js';

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
  chunks: many(documentChunk),
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

export const aiProcessingResultRelations = relations(aiProcessingResult, ({ one }) => ({
  document: one(document, {
    fields: [aiProcessingResult.documentId],
    references: [document.id],
  }),
}));

export const documentChunkRelations = relations(documentChunk, ({ one }) => ({
  document: one(document, {
    fields: [documentChunk.documentId],
    references: [document.id],
  }),
}));

export const ragConversationRelations = relations(ragConversation, ({ many }) => ({
  messages: many(ragMessage),
}));

export const ragMessageRelations = relations(ragMessage, ({ one }) => ({
  conversation: one(ragConversation, {
    fields: [ragMessage.conversationId],
    references: [ragConversation.id],
  }),
}));
