import { relations } from 'drizzle-orm';

import { document, documentContent, documentSignature } from './sqlite/documents.js';
import { duplicateGroup, duplicateMember } from './sqlite/duplicates.js';

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
