import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

interface SeedOptions {
  documentCount?: number;
  groupCount?: number;
}

export interface SeedResult {
  documentIds: string[];
  groupIds: string[];
  jobIds: string[];
}

export function seedDatabase(dbPath: string, options?: SeedOptions): SeedResult {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const docCount = options?.documentCount ?? 10;
  const groupCount = options?.groupCount ?? 3;
  const now = new Date().toISOString();

  const documentIds: string[] = [];
  const groupIds: string[] = [];
  const jobIds: string[] = [];

  const insertDoc = db.prepare(`
    INSERT OR IGNORE INTO document (id, paperless_id, title, fingerprint, correspondent, document_type, tags_json, created_date, added_date, modified_date, original_file_size, archive_file_size, processing_status, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertContent = db.prepare(`
    INSERT OR IGNORE INTO document_content (id, document_id, full_text, normalized_text, word_count, content_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertGroup = db.prepare(`
    INSERT OR IGNORE INTO duplicate_group (id, confidence_score, jaccard_similarity, fuzzy_text_ratio, metadata_similarity, filename_similarity, algorithm_version, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMember = db.prepare(`
    INSERT OR IGNORE INTO duplicate_member (id, group_id, document_id, is_primary)
    VALUES (?, ?, ?, ?)
  `);

  const insertJob = db.prepare(`
    INSERT OR IGNORE INTO job (id, type, status, progress, progress_message, started_at, completed_at, error_message, result_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const correspondents = ['Alice Corp', 'Bob Industries', 'Charlie LLC', null];
  const docTypes = ['Invoice', 'Receipt', 'Contract', null];

  const transaction = db.transaction(() => {
    // Insert documents
    for (let i = 1; i <= docCount; i++) {
      const docId = nanoid();
      documentIds.push(docId);
      const correspondent = correspondents[(i - 1) % correspondents.length];
      const docType = docTypes[(i - 1) % docTypes.length];
      const tags = i % 2 === 0 ? '["finance","tax"]' : '["important"]';

      insertDoc.run(
        docId,
        i,
        `Test Document ${i}`,
        `fp-${i}`,
        correspondent,
        docType,
        tags,
        `2024-0${Math.min(i, 9)}-01T00:00:00Z`,
        `2024-0${Math.min(i, 9)}-02T00:00:00Z`,
        `2024-0${Math.min(i, 9)}-03T00:00:00Z`,
        1000 + i * 100,
        800 + i * 80,
        'completed',
        now,
      );

      // Insert content for each document
      insertContent.run(
        nanoid(),
        docId,
        `This is the full text content of test document ${i}. It contains sample text for testing purposes.`,
        `full text content test document ${i} contains sample text testing purposes`,
        15,
        `hash-${i}`,
      );
    }

    // Insert duplicate groups
    const groupConfigs = [
      {
        confidence: 0.95,
        jaccard: 0.92,
        fuzzy: 0.89,
        metadata: 0.85,
        filename: 0.78,
        status: 'pending',
        memberCount: 2,
      },
      {
        confidence: 0.82,
        jaccard: 0.78,
        fuzzy: 0.75,
        metadata: 0.7,
        filename: 0.65,
        status: 'ignored',
        memberCount: 3,
      },
      {
        confidence: 0.71,
        jaccard: 0.65,
        fuzzy: 0.6,
        metadata: 0.55,
        filename: 0.5,
        status: 'deleted',
        memberCount: 2,
      },
    ];

    let docIndex = 0;
    for (let g = 0; g < Math.min(groupCount, groupConfigs.length); g++) {
      const cfg = groupConfigs[g];
      const groupId = nanoid();
      groupIds.push(groupId);

      insertGroup.run(
        groupId,
        cfg.confidence,
        cfg.jaccard,
        cfg.fuzzy,
        cfg.metadata,
        cfg.filename,
        'v1',
        cfg.status,
        `2024-01-${10 + g}T00:00:00Z`,
        `2024-01-${10 + g}T00:00:00Z`,
      );

      // Insert members
      for (let m = 0; m < cfg.memberCount && docIndex < documentIds.length; m++) {
        insertMember.run(nanoid(), groupId, documentIds[docIndex], m === 0 ? 1 : 0);
        docIndex++;
      }
    }

    // Insert completed jobs
    const syncJobId = nanoid();
    const analysisJobId = nanoid();
    jobIds.push(syncJobId, analysisJobId);

    insertJob.run(
      syncJobId,
      'SYNC',
      'completed',
      1.0,
      'Sync complete',
      '2024-01-10T00:00:00Z',
      '2024-01-10T00:05:00Z',
      null,
      JSON.stringify({ documentsProcessed: docCount }),
      '2024-01-10T00:00:00Z',
    );

    insertJob.run(
      analysisJobId,
      'ANALYSIS',
      'completed',
      1.0,
      'Analysis complete',
      '2024-01-10T00:05:00Z',
      '2024-01-10T00:10:00Z',
      null,
      JSON.stringify({ groupsFound: groupCount }),
      '2024-01-10T00:05:00Z',
    );

    // Insert sync state
    db.prepare(
      `
      INSERT OR REPLACE INTO sync_state (id, last_sync_at, last_sync_document_count, last_analysis_at, total_documents, total_duplicate_groups)
      VALUES ('singleton', ?, ?, ?, ?, ?)
    `,
    ).run(now, docCount, now, docCount, groupCount);

    // Insert app config
    db.prepare(
      `
      INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
    `,
    ).run('paperless.url', 'http://localhost:18923', now);
    db.prepare(
      `
      INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
    `,
    ).run('paperless.apiToken', 'test-token-e2e', now);
  });

  transaction();
  db.close();

  return { documentIds, groupIds, jobIds };
}

export function clearDatabase(dbPath: string): void {
  const db = new Database(dbPath);
  db.pragma('foreign_keys = OFF');

  db.exec(`
    DELETE FROM duplicate_member;
    DELETE FROM duplicate_group;
    DELETE FROM document_signature;
    DELETE FROM document_content;
    DELETE FROM document;
    DELETE FROM job;
    DELETE FROM sync_state;
    DELETE FROM app_config;
  `);

  db.pragma('foreign_keys = ON');
  db.close();
}
