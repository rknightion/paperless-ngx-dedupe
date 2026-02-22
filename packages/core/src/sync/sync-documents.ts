import { eq } from 'drizzle-orm';
import { document, documentContent } from '../schema/sqlite/documents.js';
import { syncState } from '../schema/sqlite/app.js';
import { createLogger } from '../logger.js';
import { normalizeText } from './normalize.js';
import { computeFingerprint } from './fingerprint.js';
import { withSpan } from '../telemetry/spans.js';
import { syncDocumentsTotal, syncRunsTotal, syncDuration } from '../telemetry/metrics.js';
import { purgeAllDocumentData } from './purge.js';
import type { SyncDependencies, SyncOptions, SyncResult, ReferenceMaps } from './types.js';
import type { PaperlessDocument } from '../paperless/types.js';
import type { PaperlessClient } from '../paperless/client.js';
import type { AppDatabase } from '../db/client.js';

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_OCR_LENGTH = 500_000;

export async function syncDocuments(
  deps: SyncDependencies,
  options?: SyncOptions,
): Promise<SyncResult> {
  const logger = createLogger('sync');
  const startTime = Date.now();
  const { db, client } = deps;
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxOcrLength = options?.maxOcrLength ?? DEFAULT_MAX_OCR_LENGTH;
  const onProgress = options?.onProgress;

  // 1. Purge all local data if requested (before determining sync type)
  if (options?.purgeBeforeSync) {
    logger.info('Purging all local document data before sync');
    await onProgress?.(0, 'Purging existing data...');
    const purgeResult = purgeAllDocumentData(db);
    logger.info(purgeResult, 'Purge complete');
  }

  // 2. Determine sync type (full vs incremental)
  const state = db.select().from(syncState).where(eq(syncState.id, 'singleton')).get();
  const lastSyncAt = state?.lastSyncAt ?? null;
  const isFullSync = options?.forceFullSync || !lastSyncAt;
  const syncType = isFullSync ? 'full' : 'incremental';

  logger.info({ syncType, lastSyncAt }, 'Starting document sync');
  await onProgress?.(0, `Starting ${syncType} sync...`);

  // 3. Fetch reference data
  const refMaps = await withSpan('dedupe.sync.fetch_references', {}, async () =>
    fetchReferenceMaps(client),
  );
  await onProgress?.(0.02, 'Loaded reference data');

  // 4. Load local documents for O(1) lookup
  const localDocs = loadLocalDocuments(db);

  // 5. Iterate through Paperless documents
  const result: SyncResult = {
    totalFetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    durationMs: 0,
    syncType,
  };

  let shouldStop = false;
  let totalCount: number | undefined;

  for await (const page of client.getDocuments({ ordering: '-modified', pageSize })) {
    if (shouldStop) break;

    totalCount ??= page.totalCount;

    for (const doc of page.results) {
      result.totalFetched++;

      try {
        const fingerprint = computeFingerprint(doc);
        const localDoc = localDocs.get(doc.id);

        if (!localDoc) {
          // New document - insert
          insertDocument(db, doc, fingerprint, refMaps, maxOcrLength);
          result.inserted++;
        } else if (localDoc.fingerprint !== fingerprint) {
          // Modified - update
          updateDocument(db, localDoc.id, doc, fingerprint, refMaps, maxOcrLength);
          result.updated++;
        } else {
          // Unchanged - skip
          result.skipped++;
        }
      } catch (error) {
        result.failed++;
        const errorMsg = `Document ${doc.id} (${doc.title}): ${error instanceof Error ? error.message : String(error)}`;
        result.errors.push(errorMsg);
        logger.warn({ paperlessId: doc.id, error: errorMsg }, 'Failed to sync document');
      }
    }

    // Report progress
    const docPhase = totalCount && totalCount > 0 ? result.totalFetched / totalCount : 0;
    const progress = 0.02 + 0.93 * docPhase;
    await onProgress?.(
      Math.min(progress, 0.95),
      `Syncing documents: ${result.totalFetched}/${totalCount ?? '?'} (${result.inserted} new, ${result.updated} updated)`,
      docPhase,
    );

    // Incremental sync cutoff: stop when oldest doc in batch is older than lastSyncAt
    if (!isFullSync && lastSyncAt && page.results.length > 0) {
      const oldestInBatch = page.results[page.results.length - 1];
      if (oldestInBatch.modified < lastSyncAt) {
        shouldStop = true;
      }
    }
  }

  // 6. Update sync state
  const now = new Date().toISOString();
  const totalDocsCount = db.select().from(document).all().length;

  db.insert(syncState)
    .values({
      id: 'singleton',
      lastSyncAt: now,
      lastSyncDocumentCount: result.inserted + result.updated,
      totalDocuments: totalDocsCount,
    })
    .onConflictDoUpdate({
      target: syncState.id,
      set: {
        lastSyncAt: now,
        lastSyncDocumentCount: result.inserted + result.updated,
        totalDocuments: totalDocsCount,
      },
    })
    .run();

  result.durationMs = Date.now() - startTime;
  await onProgress?.(
    1,
    `Sync complete: ${result.inserted} new, ${result.updated} updated, ${result.skipped} unchanged`,
  );

  logger.info(
    { ...result },
    `Sync complete: ${result.inserted} inserted, ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed`,
  );

  // Record OTEL metrics
  syncDocumentsTotal().add(result.inserted, { status: 'inserted' });
  syncDocumentsTotal().add(result.updated, { status: 'updated' });
  syncDocumentsTotal().add(result.skipped, { status: 'skipped' });
  syncDocumentsTotal().add(result.failed, { status: 'failed' });
  syncRunsTotal().add(1, {
    outcome: result.failed > 0 && result.inserted === 0 ? 'failure' : 'success',
  });
  syncDuration().record(result.durationMs / 1000);

  return result;
}

async function fetchReferenceMaps(client: PaperlessClient): Promise<ReferenceMaps> {
  const [tags, correspondents, documentTypes] = await Promise.all([
    client.getTags(),
    client.getCorrespondents(),
    client.getDocumentTypes(),
  ]);

  return {
    tags: new Map(tags.map((t) => [t.id, t.name])),
    correspondents: new Map(correspondents.map((c) => [c.id, c.name])),
    documentTypes: new Map(documentTypes.map((d) => [d.id, d.name])),
  };
}

function loadLocalDocuments(
  db: AppDatabase,
): Map<number, { id: string; fingerprint: string | null }> {
  const docs = db
    .select({
      id: document.id,
      paperlessId: document.paperlessId,
      fingerprint: document.fingerprint,
    })
    .from(document)
    .all();

  return new Map(docs.map((d) => [d.paperlessId, { id: d.id, fingerprint: d.fingerprint }]));
}

function resolveTagNames(tagIds: number[], refMaps: ReferenceMaps): string[] {
  return tagIds
    .map((id) => refMaps.tags.get(id))
    .filter((name): name is string => name !== undefined)
    .sort();
}

function insertDocument(
  db: AppDatabase,
  doc: PaperlessDocument,
  fingerprint: string,
  refMaps: ReferenceMaps,
  maxOcrLength: number,
): string {
  const now = new Date().toISOString();
  const tagNames = resolveTagNames(doc.tags, refMaps);
  const content = doc.content.slice(0, maxOcrLength);
  const normalized = normalizeText(content);

  return db.transaction((tx) => {
    const docResult = tx
      .insert(document)
      .values({
        paperlessId: doc.id,
        title: doc.title,
        fingerprint,
        correspondent:
          doc.correspondent !== null
            ? (refMaps.correspondents.get(doc.correspondent) ?? null)
            : null,
        documentType:
          doc.documentType !== null ? (refMaps.documentTypes.get(doc.documentType) ?? null) : null,
        tagsJson: JSON.stringify(tagNames),
        createdDate: doc.created,
        addedDate: doc.added,
        modifiedDate: doc.modified,
        processingStatus: 'pending',
        syncedAt: now,
      })
      .returning({ id: document.id })
      .get();

    tx.insert(documentContent)
      .values({
        documentId: docResult.id,
        fullText: content,
        normalizedText: normalized.normalizedText,
        wordCount: normalized.wordCount,
        contentHash: normalized.contentHash,
      })
      .run();

    return docResult.id;
  });
}

function updateDocument(
  db: AppDatabase,
  localDocId: string,
  doc: PaperlessDocument,
  fingerprint: string,
  refMaps: ReferenceMaps,
  maxOcrLength: number,
): void {
  const now = new Date().toISOString();
  const tagNames = resolveTagNames(doc.tags, refMaps);
  const content = doc.content.slice(0, maxOcrLength);
  const normalized = normalizeText(content);

  db.transaction((tx) => {
    tx.update(document)
      .set({
        title: doc.title,
        fingerprint,
        correspondent:
          doc.correspondent !== null
            ? (refMaps.correspondents.get(doc.correspondent) ?? null)
            : null,
        documentType:
          doc.documentType !== null ? (refMaps.documentTypes.get(doc.documentType) ?? null) : null,
        tagsJson: JSON.stringify(tagNames),
        createdDate: doc.created,
        addedDate: doc.added,
        modifiedDate: doc.modified,
        processingStatus: 'pending',
        syncedAt: now,
      })
      .where(eq(document.id, localDocId))
      .run();

    // Upsert document content
    const existingContent = tx
      .select({ id: documentContent.id })
      .from(documentContent)
      .where(eq(documentContent.documentId, localDocId))
      .get();

    if (existingContent) {
      tx.update(documentContent)
        .set({
          fullText: content,
          normalizedText: normalized.normalizedText,
          wordCount: normalized.wordCount,
          contentHash: normalized.contentHash,
        })
        .where(eq(documentContent.documentId, localDocId))
        .run();
    } else {
      tx.insert(documentContent)
        .values({
          documentId: localDocId,
          fullText: content,
          normalizedText: normalized.normalizedText,
          wordCount: normalized.wordCount,
          contentHash: normalized.contentHash,
        })
        .run();
    }
  });
}
