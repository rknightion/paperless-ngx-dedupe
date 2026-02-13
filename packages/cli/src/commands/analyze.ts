import type { Command } from 'commander';
import { runAnalysis } from '@paperless-dedupe/core';

import { createCliContext } from '../lib/context.js';
import type { GlobalOpts } from '../lib/context.js';
import { writeProgress, clearProgress, formatAnalysisResult } from '../lib/output.js';

export function registerAnalyzeCommand(program: Command): void {
  program
    .command('analyze')
    .description('Run deduplication analysis')
    .option('--force', 'force re-analysis of all documents')
    .action(async (opts: { force?: boolean }) => {
      const globalOpts = program.opts<GlobalOpts>();
      const ctx = createCliContext(globalOpts);

      try {
        const result = await runAnalysis(ctx.db, {
          force: opts.force ?? false,
          onProgress: async (progress, message) => {
            writeProgress(progress, message);
          },
        });

        clearProgress();

        if (globalOpts.json) {
          process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        } else {
          process.stderr.write(formatAnalysisResult(result) + '\n');
        }
      } finally {
        ctx.sqlite.close();
      }
    });
}
