import type { Command } from 'commander';
import { syncDocuments } from '@paperless-dedupe/core';

import { createCliContext } from '../lib/context.js';
import type { GlobalOpts } from '../lib/context.js';
import { writeProgress, clearProgress, formatSyncResult } from '../lib/output.js';

export function registerSyncCommand(program: Command): void {
  program
    .command('sync')
    .description('Sync documents from Paperless-NGX')
    .option('--full', 'force full sync instead of incremental')
    .action(async (opts: { full?: boolean }) => {
      const globalOpts = program.opts<GlobalOpts>();
      const ctx = createCliContext(globalOpts);

      try {
        const result = await syncDocuments(
          { db: ctx.db, client: ctx.client },
          {
            forceFullSync: opts.full ?? false,
            onProgress: async (progress, message) => {
              writeProgress(progress, message);
            },
          },
        );

        clearProgress();

        if (globalOpts.json) {
          process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        } else {
          process.stderr.write(formatSyncResult(result) + '\n');
        }
      } finally {
        ctx.sqlite.close();
      }
    });
}
