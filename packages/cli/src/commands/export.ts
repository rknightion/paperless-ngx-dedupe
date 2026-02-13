import type { Command } from 'commander';
import {
  getDuplicateGroupsForExport,
  formatDuplicatesCsv,
  exportConfig,
} from '@paperless-dedupe/core';

import { createDbContext } from '../lib/context.js';
import type { GlobalOpts } from '../lib/context.js';

export function registerExportCommand(program: Command): void {
  const exportCmd = program.command('export').description('Export data');

  exportCmd
    .command('duplicates')
    .description('Export duplicate groups as CSV')
    .option('--min-confidence <value>', 'minimum confidence score (0-1)', parseFloat)
    .option('--unresolved-only', 'only include unresolved groups')
    .action((opts: { minConfidence?: number; unresolvedOnly?: boolean }) => {
      const globalOpts = program.opts<GlobalOpts>();
      const ctx = createDbContext(globalOpts);

      try {
        const rows = getDuplicateGroupsForExport(ctx.db, {
          minConfidence: opts.minConfidence,
          resolved: opts.unresolvedOnly ? false : undefined,
          sortBy: 'confidence',
          sortOrder: 'desc',
        });

        if (globalOpts.json) {
          process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
        } else {
          const csv = formatDuplicatesCsv(rows);
          process.stdout.write(csv);
          process.stderr.write(`Exported ${rows.length} rows\n`);
        }
      } finally {
        ctx.sqlite.close();
      }
    });

  exportCmd
    .command('config')
    .description('Export configuration backup as JSON')
    .action(() => {
      const globalOpts = program.opts<GlobalOpts>();
      const ctx = createDbContext(globalOpts);

      try {
        const backup = exportConfig(ctx.db);
        process.stdout.write(JSON.stringify(backup, null, 2) + '\n');

        if (!globalOpts.json) {
          process.stderr.write('Configuration exported\n');
        }
      } finally {
        ctx.sqlite.close();
      }
    });
}
