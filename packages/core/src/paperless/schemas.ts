import { z } from 'zod';
import type { ZodType } from 'zod';
import type { AppConfig } from '../config.js';
import type { PaperlessConfig } from './types.js';

export const paperlessDocumentSchema = z
  .object({
    id: z.number(),
    title: z.string(),
    content: z.string().default(''),
    tags: z.array(z.number()).default([]),
    correspondent: z.number().nullable().default(null),
    document_type: z.number().nullable().default(null),
    created: z.string(),
    modified: z.string(),
    added: z.string(),
    original_file_name: z.string().nullable().default(null),
    archived_file_name: z.string().nullable().default(null),
    archive_serial_number: z.number().nullable().default(null),
  })
  .transform((raw) => ({
    id: raw.id,
    title: raw.title,
    content: raw.content,
    tags: raw.tags,
    correspondent: raw.correspondent,
    documentType: raw.document_type,
    created: raw.created,
    modified: raw.modified,
    added: raw.added,
    originalFileName: raw.original_file_name,
    archivedFileName: raw.archived_file_name,
    archiveSerialNumber: raw.archive_serial_number,
  }));

export const documentMetadataSchema = z
  .object({
    original_checksum: z.string(),
    original_size: z.number(),
    original_mime_type: z.string(),
    media_filename: z.string(),
    has_archive_version: z.boolean(),
    archive_checksum: z.string().nullable().default(null),
    archive_size: z.number().nullable().default(null),
    archive_media_filename: z.string().nullable().default(null),
  })
  .transform((raw) => ({
    originalChecksum: raw.original_checksum,
    originalSize: raw.original_size,
    originalMimeType: raw.original_mime_type,
    mediaFilename: raw.media_filename,
    hasArchiveVersion: raw.has_archive_version,
    archiveChecksum: raw.archive_checksum,
    archiveSize: raw.archive_size,
    archiveMediaFilename: raw.archive_media_filename,
  }));

export const paperlessTagSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    color: z.string().default('#a6cee3'),
    text_color: z.string().default('#000000'),
    is_inbox_tag: z.boolean().default(false),
    matching_algorithm: z.number().default(0),
    match: z.string().default(''),
    document_count: z.number().default(0),
  })
  .transform((raw) => ({
    id: raw.id,
    name: raw.name,
    color: raw.color,
    textColor: raw.text_color,
    isInboxTag: raw.is_inbox_tag,
    matchingAlgorithm: raw.matching_algorithm,
    match: raw.match,
    documentCount: raw.document_count,
  }));

export const paperlessCorrespondentSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    matching_algorithm: z.number().default(0),
    match: z.string().default(''),
    document_count: z.number().default(0),
  })
  .transform((raw) => ({
    id: raw.id,
    name: raw.name,
    matchingAlgorithm: raw.matching_algorithm,
    match: raw.match,
    documentCount: raw.document_count,
  }));

export const paperlessDocumentTypeSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    matching_algorithm: z.number().default(0),
    match: z.string().default(''),
    document_count: z.number().default(0),
  })
  .transform((raw) => ({
    id: raw.id,
    name: raw.name,
    matchingAlgorithm: raw.matching_algorithm,
    match: raw.match,
    documentCount: raw.document_count,
  }));

export const paperlessStatisticsSchema = z
  .object({
    documents_total: z.number(),
    documents_inbox: z.number(),
    inbox_tag: z.number().nullable().default(null),
    document_file_type_count: z
      .array(
        z
          .object({
            mime_type: z.string(),
            count: z.number(),
          })
          .transform((raw) => ({
            mimeType: raw.mime_type,
            count: raw.count,
          })),
      )
      .default([]),
    character_count: z.number(),
  })
  .transform((raw) => ({
    documentsTotal: raw.documents_total,
    documentsInbox: raw.documents_inbox,
    inboxTag: raw.inbox_tag,
    documentFileTypeCount: raw.document_file_type_count,
    characterCount: raw.character_count,
  }));

export const connectionTestResultSchema = z
  .object({
    success: z.boolean(),
    version: z.string().optional(),
    document_count: z.number().optional(),
    error: z.string().optional(),
  })
  .transform((raw) => ({
    success: raw.success,
    version: raw.version,
    documentCount: raw.document_count,
    error: raw.error,
  }));

export const paperlessConfigSchema = z
  .object({
    url: z.string().url(),
    token: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    timeout: z.number().optional(),
    maxRetries: z.number().optional(),
  })
  .refine((data) => data.token || (data.username && data.password), {
    message: 'Either token or both username and password must be provided',
    path: ['token'],
  });

export function toPaperlessConfig(appConfig: AppConfig): PaperlessConfig {
  return {
    url: appConfig.PAPERLESS_URL,
    token: appConfig.PAPERLESS_API_TOKEN,
    username: appConfig.PAPERLESS_USERNAME,
    password: appConfig.PAPERLESS_PASSWORD,
  };
}

export function paginatedResponseSchema<T extends ZodType>(itemSchema: T) {
  return z.object({
    count: z.number(),
    next: z.string().nullable().default(null),
    previous: z.string().nullable().default(null),
    results: z.array(itemSchema),
  });
}
