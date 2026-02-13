import type { Command } from 'commander';
import { getDedupConfig, setDedupConfig } from '@paperless-dedupe/core';
import type { DedupConfig } from '@paperless-dedupe/core';

import { createDbContext } from '../lib/context.js';
import type { GlobalOpts } from '../lib/context.js';

export function registerConfigCommand(program: Command): void {
  const configCmd = program.command('config').description('Manage dedup configuration');

  configCmd
    .command('show')
    .description('Display current dedup configuration')
    .action(() => {
      const globalOpts = program.opts<GlobalOpts>();
      const ctx = createDbContext(globalOpts);

      try {
        const config = getDedupConfig(ctx.db);

        if (globalOpts.json) {
          process.stdout.write(JSON.stringify(config, null, 2) + '\n');
        } else {
          process.stderr.write('Dedup Configuration\n');
          for (const [key, value] of Object.entries(config)) {
            process.stderr.write(`  ${key}: ${value}\n`);
          }
        }
      } finally {
        ctx.sqlite.close();
      }
    });

  configCmd
    .command('set')
    .description('Update dedup configuration parameters')
    .option('--similarity-threshold <value>', 'similarity threshold (0-1)', parseFloat)
    .option('--num-permutations <value>', 'number of MinHash permutations', parseInt)
    .option('--num-bands <value>', 'number of LSH bands', parseInt)
    .option('--ngram-size <value>', 'n-gram size for shingling', parseInt)
    .option('--min-words <value>', 'minimum words for analysis', parseInt)
    .option('--weight-jaccard <value>', 'confidence weight for Jaccard (0-100)', parseInt)
    .option('--weight-fuzzy <value>', 'confidence weight for fuzzy text (0-100)', parseInt)
    .option('--weight-metadata <value>', 'confidence weight for metadata (0-100)', parseInt)
    .option('--weight-filename <value>', 'confidence weight for filename (0-100)', parseInt)
    .option('--fuzzy-sample-size <value>', 'fuzzy text sample size', parseInt)
    .option('--auto-analyze <value>', 'auto-analyze after sync (true/false)')
    .action(
      (opts: {
        similarityThreshold?: number;
        numPermutations?: number;
        numBands?: number;
        ngramSize?: number;
        minWords?: number;
        weightJaccard?: number;
        weightFuzzy?: number;
        weightMetadata?: number;
        weightFilename?: number;
        fuzzySampleSize?: number;
        autoAnalyze?: string;
      }) => {
        const globalOpts = program.opts<GlobalOpts>();
        const ctx = createDbContext(globalOpts);

        try {
          const updates: Partial<DedupConfig> = {};

          if (opts.similarityThreshold !== undefined) {
            updates.similarityThreshold = opts.similarityThreshold;
          }
          if (opts.numPermutations !== undefined) {
            updates.numPermutations = opts.numPermutations;
          }
          if (opts.numBands !== undefined) updates.numBands = opts.numBands;
          if (opts.ngramSize !== undefined) updates.ngramSize = opts.ngramSize;
          if (opts.minWords !== undefined) updates.minWords = opts.minWords;
          if (opts.weightJaccard !== undefined) {
            updates.confidenceWeightJaccard = opts.weightJaccard;
          }
          if (opts.weightFuzzy !== undefined) {
            updates.confidenceWeightFuzzy = opts.weightFuzzy;
          }
          if (opts.weightMetadata !== undefined) {
            updates.confidenceWeightMetadata = opts.weightMetadata;
          }
          if (opts.weightFilename !== undefined) {
            updates.confidenceWeightFilename = opts.weightFilename;
          }
          if (opts.fuzzySampleSize !== undefined) {
            updates.fuzzySampleSize = opts.fuzzySampleSize;
          }
          if (opts.autoAnalyze !== undefined) {
            updates.autoAnalyze = opts.autoAnalyze === 'true';
          }

          if (Object.keys(updates).length === 0) {
            process.stderr.write('No configuration values provided. Use --help for options.\n');
            process.exitCode = 1;
            return;
          }

          const config = setDedupConfig(ctx.db, updates);

          if (globalOpts.json) {
            process.stdout.write(JSON.stringify(config, null, 2) + '\n');
          } else {
            process.stderr.write('Configuration updated\n');
            for (const [key, value] of Object.entries(config)) {
              process.stderr.write(`  ${key}: ${value}\n`);
            }
          }
        } finally {
          ctx.sqlite.close();
        }
      },
    );
}
