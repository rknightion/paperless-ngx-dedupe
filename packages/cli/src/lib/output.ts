import type {
  SyncResult,
  AnalysisResult,
  DashboardData,
  DuplicateStats,
} from '@paperless-dedupe/core';

const isTTY = process.stderr.isTTY ?? false;
let lastProgressLength = 0;

/**
 * Write a progress line to stderr. On TTY uses \r to overwrite; otherwise prints newlines.
 */
export function writeProgress(progress: number, message?: string): void {
  const pct = Math.round(progress * 100);
  const line = message ? `[${pct}%] ${message}` : `[${pct}%]`;

  if (isTTY) {
    const padding =
      lastProgressLength > line.length ? ' '.repeat(lastProgressLength - line.length) : '';
    process.stderr.write(`\r${line}${padding}`);
    lastProgressLength = line.length;
  } else {
    process.stderr.write(`${line}\n`);
  }
}

/**
 * Clear the current progress line on TTY.
 */
export function clearProgress(): void {
  if (isTTY && lastProgressLength > 0) {
    process.stderr.write(`\r${' '.repeat(lastProgressLength)}\r`);
    lastProgressLength = 0;
  }
}

export function formatSyncResult(result: SyncResult): string {
  const lines = [
    `Sync completed (${result.syncType})`,
    `  Duration:  ${(result.durationMs / 1000).toFixed(1)}s`,
    `  Fetched:   ${result.totalFetched}`,
    `  Inserted:  ${result.inserted}`,
    `  Updated:   ${result.updated}`,
    `  Skipped:   ${result.skipped}`,
    `  Failed:    ${result.failed}`,
  ];
  if (result.errors.length > 0) {
    lines.push(`  Errors:`);
    for (const err of result.errors) {
      lines.push(`    - ${err}`);
    }
  }
  return lines.join('\n');
}

export function formatAnalysisResult(result: AnalysisResult): string {
  return [
    'Analysis completed',
    `  Duration:             ${(result.durationMs / 1000).toFixed(1)}s`,
    `  Total documents:      ${result.totalDocuments}`,
    `  Documents analyzed:   ${result.documentsAnalyzed}`,
    `  Signatures generated: ${result.signaturesGenerated}`,
    `  Signatures reused:    ${result.signaturesReused}`,
    `  Candidate pairs:      ${result.candidatePairsFound}`,
    `  Pairs scored:         ${result.candidatePairsScored}`,
    `  Groups created:       ${result.groupsCreated}`,
    `  Groups updated:       ${result.groupsUpdated}`,
    `  Groups removed:       ${result.groupsRemoved}`,
  ].join('\n');
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDashboard(data: DashboardData): string {
  const lines = [
    'Dashboard',
    `  Total documents:      ${data.totalDocuments}`,
    `  Pending groups:       ${data.pendingGroups}`,
    `  Storage savings:      ${formatBytes(data.storageSavingsBytes)}`,
    `  Pending analysis:     ${data.pendingAnalysis}`,
    `  Last sync:            ${data.lastSyncAt ?? 'never'}`,
    `  Last sync docs:       ${data.lastSyncDocumentCount ?? 'n/a'}`,
    `  Last analysis:        ${data.lastAnalysisAt ?? 'never'}`,
    `  Total dup groups:     ${data.totalDuplicateGroups ?? 'n/a'}`,
  ];
  if (data.topCorrespondents.length > 0) {
    lines.push('  Top correspondents:');
    for (const c of data.topCorrespondents) {
      lines.push(`    - ${c.correspondent}: ${c.groupCount} groups`);
    }
  }
  return lines.join('\n');
}

export function formatDuplicateStats(stats: DuplicateStats): string {
  const lines = [
    'Duplicate Stats',
    `  Total groups:     ${stats.totalGroups}`,
    `  Pending:          ${stats.pendingGroups}`,
    `  False Positive:   ${stats.falsePositiveGroups}`,
    `  Ignored:          ${stats.ignoredGroups}`,
    `  Deleted:          ${stats.deletedGroups}`,
  ];
  if (stats.confidenceDistribution.length > 0) {
    lines.push('  Confidence distribution:');
    for (const bucket of stats.confidenceDistribution) {
      lines.push(`    ${bucket.label}: ${bucket.count}`);
    }
  }
  if (stats.topCorrespondents.length > 0) {
    lines.push('  Top correspondents:');
    for (const c of stats.topCorrespondents) {
      lines.push(`    - ${c.correspondent}: ${c.groupCount} groups`);
    }
  }
  return lines.join('\n');
}
