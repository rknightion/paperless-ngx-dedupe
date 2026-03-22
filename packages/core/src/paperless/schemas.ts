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

export const paperlessTagSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    slug: z.string().default(''),
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
    slug: raw.slug,
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
    slug: z.string().default(''),
    matching_algorithm: z.number().default(0),
    match: z.string().default(''),
    document_count: z.number().default(0),
    last_correspondence: z.string().nullable().default(null),
  })
  .transform((raw) => ({
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    matchingAlgorithm: raw.matching_algorithm,
    match: raw.match,
    documentCount: raw.document_count,
    lastCorrespondence: raw.last_correspondence,
  }));

export const paperlessDocumentTypeSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    slug: z.string().default(''),
    matching_algorithm: z.number().default(0),
    match: z.string().default(''),
    document_count: z.number().default(0),
  })
  .transform((raw) => ({
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    matchingAlgorithm: raw.matching_algorithm,
    match: raw.match,
    documentCount: raw.document_count,
  }));

export const paperlessStatisticsSchema = z
  .object({
    documents_total: z.number(),
    documents_inbox: z.number().nullable().default(null),
    inbox_tag: z.number().nullable().default(null),
    // v2 field name (singular, inner field: count)
    document_file_type_count: z
      .array(z.object({ mime_type: z.string(), count: z.number() }))
      .optional(),
    // v3 field name (plural, inner field: mime_type_count)
    document_file_type_counts: z
      .array(z.object({ mime_type: z.string(), mime_type_count: z.number() }))
      .optional(),
    character_count: z.number(),
    // v3 additions (absent in v2)
    inbox_tags: z.array(z.number()).nullable().optional(),
    tag_count: z.number().optional(),
    correspondent_count: z.number().optional(),
    document_type_count: z.number().optional(),
    storage_path_count: z.number().optional(),
    current_asn: z.number().nullable().optional(),
  })
  .transform((raw) => {
    // Normalize file type counts: prefer v3 plural form, fall back to v2 singular
    const fileTypeCounts = raw.document_file_type_counts
      ? raw.document_file_type_counts.map((ft) => ({
          mimeType: ft.mime_type,
          count: ft.mime_type_count,
        }))
      : (raw.document_file_type_count ?? []).map((ft) => ({
          mimeType: ft.mime_type,
          count: ft.count,
        }));

    return {
      documentsTotal: raw.documents_total,
      documentsInbox: raw.documents_inbox,
      inboxTag: raw.inbox_tag,
      documentFileTypeCount: fileTypeCounts,
      characterCount: raw.character_count,
      tagCount: raw.tag_count ?? null,
      correspondentCount: raw.correspondent_count ?? null,
      documentTypeCount: raw.document_type_count ?? null,
      storagePathCount: raw.storage_path_count ?? null,
    };
  });

export const paperlessStatusSchema = z
  .object({
    pngx_version: z.string().optional(),
    server_os: z.string().optional(),
    install_type: z.string().optional(),
    storage: z.object({
      total: z.number(),
      available: z.number(),
    }),
    database: z.object({
      status: z.string(),
      type: z.string().optional(),
      url: z.string().optional(),
      error: z.string().nullable().optional(),
      migration_status: z
        .object({
          unapplied_migrations: z.array(z.string()).default([]),
          latest_migration: z.string().optional(),
        })
        .default({ unapplied_migrations: [] }),
    }),
    tasks: z.object({
      redis_status: z.string().default(''),
      redis_url: z.string().optional(),
      redis_error: z.string().nullable().optional(),
      celery_status: z.string().default(''),
      celery_url: z.string().nullable().optional(),
      celery_error: z.string().nullable().optional(),
      index_status: z.string().default(''),
      index_last_modified: z.string().nullable().default(null),
      index_error: z.string().nullable().optional(),
      classifier_status: z.string().default(''),
      classifier_last_trained: z.string().nullable().default(null),
      classifier_error: z.string().nullable().optional(),
      sanity_check_status: z.string().default(''),
      sanity_check_last_run: z.string().nullable().default(null),
      sanity_check_error: z.string().nullable().optional(),
      llmindex_status: z.string().optional(),
      llmindex_last_modified: z.string().nullable().optional(),
      llmindex_error: z.string().nullable().optional(),
    }),
  })
  .transform((raw) => ({
    pngxVersion: raw.pngx_version ?? null,
    storageTotal: raw.storage.total,
    storageAvailable: raw.storage.available,
    databaseStatus: raw.database.status,
    databaseUnappliedMigrations: raw.database.migration_status.unapplied_migrations.length,
    redisStatus: raw.tasks.redis_status,
    celeryStatus: raw.tasks.celery_status,
    indexStatus: raw.tasks.index_status,
    indexLastModified: raw.tasks.index_last_modified,
    classifierStatus: raw.tasks.classifier_status,
    classifierLastTrained: raw.tasks.classifier_last_trained,
    sanityCheckStatus: raw.tasks.sanity_check_status,
    sanityCheckLastRun: raw.tasks.sanity_check_last_run,
  }));

export const paperlessStoragePathSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    slug: z.string().default(''),
    document_count: z.number().default(0),
  })
  .transform((raw) => ({
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    documentCount: raw.document_count,
  }));

export const paperlessRemoteVersionSchema = z
  .object({
    version: z.string(),
    update_available: z.boolean(),
  })
  .transform((raw) => ({
    version: raw.version,
    updateAvailable: raw.update_available,
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
    url: z.url(),
    token: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    timeout: z.number().optional(),
    maxRetries: z.number().optional(),
  })
  .refine((data) => data.token || (data.username && data.password), {
    error: 'Either token or both username and password must be provided',
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
