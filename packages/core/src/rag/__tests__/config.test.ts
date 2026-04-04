import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import { getRagConfig, setRagConfig } from '../config.js';

describe('getRagConfig', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  it('returns defaults for fresh DB', () => {
    const config = getRagConfig(db);
    expect(config.embeddingModel).toBe('text-embedding-3-small');
    expect(config.embeddingDimensions).toBe(1536);
    expect(config.chunkSize).toBe(400);
    expect(config.chunkOverlap).toBe(40);
    expect(config.topK).toBe(20);
    expect(config.answerModel).toBe('gpt-5.4-mini');
    expect(config.autoIndex).toBe(false);
  });
});

describe('setRagConfig', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  it('persists and retrieves config', () => {
    setRagConfig(db, { chunkSize: 500, topK: 20 });
    const config = getRagConfig(db);
    expect(config.chunkSize).toBe(500);
    expect(config.topK).toBe(20);
  });

  it('merges partial updates with existing', () => {
    setRagConfig(db, { chunkSize: 500 });
    setRagConfig(db, { topK: 15 });

    const config = getRagConfig(db);
    expect(config.chunkSize).toBe(500);
    expect(config.topK).toBe(15);
    // Defaults should remain for unset values
    expect(config.embeddingModel).toBe('text-embedding-3-small');
  });

  it('parses boolean values correctly (autoIndex)', () => {
    setRagConfig(db, { autoIndex: true });
    const config = getRagConfig(db);
    expect(config.autoIndex).toBe(true);
    expect(typeof config.autoIndex).toBe('boolean');
  });

  it('parses number values correctly', () => {
    setRagConfig(db, { chunkSize: 800, topK: 25, embeddingDimensions: 768 });
    const config = getRagConfig(db);
    expect(config.chunkSize).toBe(800);
    expect(typeof config.chunkSize).toBe('number');
    expect(config.topK).toBe(25);
    expect(typeof config.topK).toBe('number');
    expect(config.embeddingDimensions).toBe(768);
    expect(typeof config.embeddingDimensions).toBe('number');
  });

  it('preserves string values', () => {
    setRagConfig(db, { embeddingModel: 'text-embedding-3-large', answerModel: 'gpt-4o' });
    const config = getRagConfig(db);
    expect(config.embeddingModel).toBe('text-embedding-3-large');
    expect(config.answerModel).toBe('gpt-4o');
  });

  it('returns validated config from setRagConfig', () => {
    const result = setRagConfig(db, { chunkSize: 600 });
    expect(result.chunkSize).toBe(600);
    expect(result.embeddingModel).toBe('text-embedding-3-small');
  });
});
