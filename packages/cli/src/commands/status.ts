import type { Command } from 'commander';
import { getDashboard, getDuplicateStats } from '@paperless-dedupe/core';

import { createDbContext } from '../lib/context.js';
import type { GlobalOpts } from '../lib/context.js';
import { formatDashboard, formatDuplicateStats } from '../lib/output.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show dashboard and duplicate statistics')
    .action(() => {
      const globalOpts = program.opts<GlobalOpts>();
      const ctx = createDbContext(globalOpts);

      try {
        const dashboard = getDashboard(ctx.db);
        const stats = getDuplicateStats(ctx.db);

        if (globalOpts.json) {
          process.stdout.write(JSON.stringify({ dashboard, stats }, null, 2) + '\n');
        } else {
          process.stderr.write(formatDashboard(dashboard) + '\n\n');
          process.stderr.write(formatDuplicateStats(stats) + '\n');
        }
      } finally {
        ctx.sqlite.close();
      }
    });
}
