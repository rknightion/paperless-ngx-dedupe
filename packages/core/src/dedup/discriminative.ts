/**
 * Discriminative content scoring — extracts dates, monetary amounts, and
 * reference numbers from document text and compares the token sets via Jaccard.
 *
 * Template-based documents (e.g. monthly bank statements) share most of their
 * text but have different dates and amounts, yielding a low discriminative
 * score. True duplicates share the same structured data, scoring high.
 */

// ── Regex patterns (operate on lowercased, whitespace-collapsed text) ───

const DATE_PATTERNS = [
  // DD/MM/YYYY, MM/DD/YYYY, DD-MM-YY, etc.
  /\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/g,
  // Month DD, YYYY or Month DD YYYY (e.g. "january 15, 2024")
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s*\d{2,4}\b/g,
  // ISO format: YYYY-MM-DD or YYYY/MM/DD
  /\b\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2}\b/g,
];

const MONEY_PATTERNS = [
  // Currency symbol followed by amount: $1,234.56
  /[$£€¥]\s*[\d,]+\.?\d*/g,
  // Amount followed by currency code: 1234.56 usd
  /[\d,]+\.\d{2}\s*(?:usd|eur|gbp|cad|aud|chf|jpy)/g,
  // Standalone comma-formatted decimal: 1,234.56 (no symbol)
  /\b\d{1,3}(?:,\d{3})+\.\d{2}\b/g,
];

const REFERENCE_PATTERNS = [
  // 6+ digit sequences (account numbers, statement numbers, reference IDs)
  /\b\d{6,}\b/g,
];

// ── Token extraction ────────────────────────────────────────────────────

function extractByPatterns(text: string, patterns: RegExp[]): string[] {
  const tokens: string[] = [];
  for (const pattern of patterns) {
    // Reset lastIndex for each call since patterns use the g flag
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      tokens.push(match[0]);
    }
  }
  return tokens;
}

/** Normalize a date token to digits-only for comparison. */
function normalizeDate(token: string): string {
  return token.replace(/[^0-9]/g, '');
}

/** Normalize a monetary amount to digits + decimal point only. */
function normalizeAmount(token: string): string {
  return token.replace(/[^0-9.]/g, '');
}

/** Normalize a reference number to digits only. */
function normalizeReference(token: string): string {
  return token.replace(/[^0-9]/g, '');
}

export interface DiscriminativeTokens {
  dates: Set<string>;
  amounts: Set<string>;
  references: Set<string>;
  total: number;
}

export function extractDiscriminativeTokens(text: string): DiscriminativeTokens {
  const rawDates = extractByPatterns(text, DATE_PATTERNS);
  const rawAmounts = extractByPatterns(text, MONEY_PATTERNS);
  const rawReferences = extractByPatterns(text, REFERENCE_PATTERNS);

  const dates = new Set(rawDates.map(normalizeDate).filter((t) => t.length > 0));
  const amounts = new Set(rawAmounts.map(normalizeAmount).filter((t) => t.length > 0));
  const references = new Set(rawReferences.map(normalizeReference).filter((t) => t.length > 0));

  return {
    dates,
    amounts,
    references,
    total: dates.size + amounts.size + references.size,
  };
}

// ── Jaccard on sets ─────────────────────────────────────────────────────

function setJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1.0;
  if (a.size === 0 || b.size === 0) return 0.0;

  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 1.0;
}

// ── Public scoring function ─────────────────────────────────────────────

/**
 * Compute discriminative similarity between two documents.
 *
 * Returns:
 * - 1.0 when both documents have no discriminative tokens (neutral — does not
 *   penalize non-financial documents).
 * - 0.5 when only one document has tokens (ambiguous).
 * - Weighted Jaccard of date, amount, and reference token sets otherwise.
 *   Dates are weighted 3x, amounts 2x, and references 1x.
 */
export function computeDiscriminativeScore(text1: string, text2: string): number {
  const tokens1 = extractDiscriminativeTokens(text1);
  const tokens2 = extractDiscriminativeTokens(text2);

  // Neither document has discriminative tokens — neutral score
  if (tokens1.total === 0 && tokens2.total === 0) return 1.0;

  // Only one document has tokens — ambiguous
  if (tokens1.total === 0 || tokens2.total === 0) return 0.5;

  // Weighted Jaccard across token categories
  let weightedSum = 0;
  let totalWeight = 0;

  if (tokens1.dates.size > 0 || tokens2.dates.size > 0) {
    weightedSum += setJaccard(tokens1.dates, tokens2.dates) * 3;
    totalWeight += 3;
  }
  if (tokens1.amounts.size > 0 || tokens2.amounts.size > 0) {
    weightedSum += setJaccard(tokens1.amounts, tokens2.amounts) * 2;
    totalWeight += 2;
  }
  if (tokens1.references.size > 0 || tokens2.references.size > 0) {
    weightedSum += setJaccard(tokens1.references, tokens2.references) * 1;
    totalWeight += 1;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 1.0;
}
