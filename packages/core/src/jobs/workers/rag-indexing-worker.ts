import { runWorkerTask } from '../worker-entry.js';
import { parseConfig } from '../../index.js';
import { getRagConfig } from '../../rag/config.js';
import { indexDocuments } from '../../rag/indexer.js';
import { loadSqliteVec, initRagTables } from '../../rag/vector-store.js';

runWorkerTask(async (ctx, onProgress) => {
  const config = parseConfig(process.env as Record<string, string | undefined>);

  if (!config.AI_OPENAI_API_KEY) {
    throw new Error('AI_OPENAI_API_KEY is required for RAG indexing');
  }

  const ragConfig = getRagConfig(ctx.db);
  const taskData = ctx.taskData as { rebuild?: boolean } | undefined;

  // Ensure sqlite-vec is loaded and RAG tables exist
  loadSqliteVec(ctx.sqlite);
  initRagTables(ctx.sqlite, ragConfig.embeddingDimensions);

  const result = await indexDocuments(ctx.db, ctx.sqlite, ragConfig, {
    apiKey: config.AI_OPENAI_API_KEY,
    rebuild: taskData?.rebuild,
    onProgress: (progress) => {
      const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
      const msg = progress.documentTitle
        ? `Indexing: ${progress.documentTitle}`
        : `Indexing documents...`;
      onProgress(pct, msg);
    },
  });

  return result;
});
