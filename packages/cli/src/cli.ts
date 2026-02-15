import { Command } from 'commander';

import { registerSyncCommand } from './commands/sync.js';
import { registerAnalyzeCommand } from './commands/analyze.js';
import { registerStatusCommand } from './commands/status.js';
import { registerConfigCommand } from './commands/config.js';
import { registerExportCommand } from './commands/export.js';

export const program = new Command();

program
  .name('paperless-ngx-dedupe')
  .description('Document deduplication companion for Paperless-NGX')
  .version('0.0.1')
  .option('--db <path>', 'database file path (overrides DATABASE_URL)')
  .option('--env-file <path>', 'path to .env file', '.env')
  .option('--log-level <level>', 'log level: debug, info, warn, error')
  .option('--json', 'output results as JSON to stdout');

registerSyncCommand(program);
registerAnalyzeCommand(program);
registerStatusCommand(program);
registerConfigCommand(program);
registerExportCommand(program);
