import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabaseWithHandle } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import type { AppDatabase } from '../../db/client.js';
import { getAiConfig, setAiConfig } from '../config.js';
import { DEFAULT_AI_CONFIG } from '../types.js';

describe('getAiConfig', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  it('returns defaults for a fresh database', () => {
    const config = getAiConfig(db);
    expect(config.provider).toBe('openai');
    expect(config.model).toBe('gpt-5.4-mini');
    expect(config.maxContentLength).toBe(8000);
    expect(config.batchSize).toBe(10);
    expect(config.autoProcess).toBe(false);
    expect(config.addProcessedTag).toBe(false);
    expect(config.includeCorrespondents).toBe(false);
    expect(config.includeDocumentTypes).toBe(false);
    expect(config.includeTags).toBe(false);
    expect(config.rateDelayMs).toBe(0);
    expect(config.reasoningEffort).toBe('low');
    expect(config.maxRetries).toBe(3);
  });

  it('matches DEFAULT_AI_CONFIG for a fresh database', () => {
    const config = getAiConfig(db);
    expect(config).toEqual(DEFAULT_AI_CONFIG);
  });
});

describe('setAiConfig', () => {
  let db: AppDatabase;

  beforeEach(async () => {
    const handle = createDatabaseWithHandle(':memory:');
    db = handle.db;
    await migrateDatabase(handle.sqlite);
  });

  it('persists and retrieves config', () => {
    setAiConfig(db, { provider: 'anthropic', model: 'claude-sonnet-4-6' });
    const config = getAiConfig(db);
    expect(config.provider).toBe('anthropic');
    expect(config.model).toBe('claude-sonnet-4-6');
  });

  it('merges partial updates with existing config', () => {
    setAiConfig(db, { provider: 'anthropic' });
    setAiConfig(db, { model: 'claude-haiku-4-5' });

    const config = getAiConfig(db);
    expect(config.provider).toBe('anthropic');
    expect(config.model).toBe('claude-haiku-4-5');
    // Other defaults should remain
    expect(config.maxContentLength).toBe(8000);
    expect(config.batchSize).toBe(10);
  });

  it('parses boolean values correctly', () => {
    setAiConfig(db, {
      autoProcess: true,
      addProcessedTag: true,
      includeCorrespondents: true,
      includeDocumentTypes: true,
      includeTags: true,
    });

    const config = getAiConfig(db);
    expect(config.autoProcess).toBe(true);
    expect(config.addProcessedTag).toBe(true);
    expect(config.includeCorrespondents).toBe(true);
    expect(config.includeDocumentTypes).toBe(true);
    expect(config.includeTags).toBe(true);
  });

  it('parses number values correctly', () => {
    setAiConfig(db, {
      maxContentLength: 16000,
      batchSize: 25,
      rateDelayMs: 1000,
      maxRetries: 5,
    });

    const config = getAiConfig(db);
    expect(config.maxContentLength).toBe(16000);
    expect(config.batchSize).toBe(25);
    expect(config.rateDelayMs).toBe(1000);
    expect(config.maxRetries).toBe(5);
  });

  it('returns the validated config', () => {
    const result = setAiConfig(db, { provider: 'anthropic', batchSize: 50 });
    expect(result.provider).toBe('anthropic');
    expect(result.batchSize).toBe(50);
    expect(result.model).toBe('gpt-5.4-mini'); // default preserved
  });

  it('preserves string fields that look numeric', () => {
    // Provider, model, and promptTemplate should remain strings
    setAiConfig(db, { processedTagName: 'ai-processed-v2' });
    const config = getAiConfig(db);
    expect(config.processedTagName).toBe('ai-processed-v2');
    expect(typeof config.processedTagName).toBe('string');
  });
});
