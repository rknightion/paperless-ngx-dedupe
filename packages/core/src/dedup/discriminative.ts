/**
 * Discriminative content scoring — extracts structured data (dates, times,
 * monetary amounts, identifiers, reference numbers) from document text and
 * compares the token sets via weighted Jaccard similarity.
 *
 * Template-based documents (bank statements, invoices, receipts, boarding
 * passes, travel itineraries) share most of their text but differ in specific
 * structured data, yielding a low discriminative score. True duplicates share
 * the same structured data, scoring high.
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

const TIME_PATTERNS = [
  // 12-hour with am/pm: 2:30 pm, 11:45am, 2:30:00 pm
  /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)\b/g,
  // 24-hour: 14:30, 08:15, 23:59:59 (requires leading zero or 1x/2x hour)
  /\b(?:[01]\d|2[0-3]):\d{2}(?::\d{2})?\b/g,
  // Military/aviation: 0830h, 1430 hrs
  /\b\d{4}\s*(?:h|hrs?)\b/g,
];

// Currency symbols: major global currencies
const CURRENCY_SYMBOLS = '[$£€¥₹₩₽₺₴₱₫₦₵₡₿₸₼₾₮฿₪ƒ]';

// ISO 4217 currency codes (lowercased, grouped by region)
const CURRENCY_CODES = [
  // Major / reserve
  'usd',
  'eur',
  'gbp',
  'jpy',
  'chf',
  'cad',
  'aud',
  'nzd',
  // Asia-Pacific
  'cny',
  'rmb',
  'hkd',
  'sgd',
  'twd',
  'krw',
  'inr',
  'thb',
  'myr',
  'php',
  'idr',
  'vnd',
  'pkr',
  'bdt',
  'lkr',
  // Europe (non-EUR)
  'sek',
  'nok',
  'dkk',
  'pln',
  'czk',
  'huf',
  'ron',
  'bgn',
  'hrk',
  'isk',
  'rub',
  'uah',
  'try',
  'gel',
  'rsd',
  // Middle East & Africa
  'aed',
  'sar',
  'qar',
  'kwd',
  'bhd',
  'omr',
  'ils',
  'egp',
  'ngn',
  'kes',
  'ghs',
  'zar',
  'mad',
  'tnd',
  'tzs',
  // Americas
  'brl',
  'mxn',
  'ars',
  'clp',
  'cop',
  'pen',
  'uyp',
  'dop',
  'jmd',
  'ttd',
  'crc',
].join('|');

const MONEY_PATTERNS = [
  // Currency symbol followed by amount: $1,234.56  ₹50,000  €12.99
  new RegExp(`${CURRENCY_SYMBOLS}\\s*[\\d,]+\\.?\\d*`, 'g'),
  // Amount followed by currency code: 1234.56 usd
  new RegExp(`(?:\\d{1,3}(?:,\\d{3})*|\\d{1,20})\\.\\d{2}\\s*(?:${CURRENCY_CODES})`, 'g'),
  // Standalone comma-formatted decimal: 1,234.56 (no symbol)
  /\b\d{1,3}(?:,\d{3})+\.\d{2}\b/g,
];

const IDENTIFIER_PATTERNS = [
  // Invoice/receipt/order numbers: "invoice 12345", "inv-2024-001", "order #ab123"
  /\b(?:invoice|inv|receipt|order|po|bill|quote|estimate|credit\s+note)\b\s*(?:no\.?\s*|#\s*|:\s*)?([a-z0-9][-a-z0-9./]{2,20})\b/g,
  // Flight numbers: "flight ba1234", "flt ua567"
  /\b(?:flight|flt)\b\s*(?:no\.?\s*|#\s*|:\s*)?([a-z0-9]{2}\d{1,4})\b/g,
  // Booking/confirmation codes: "booking ref xkcd42", "confirmation: abc123", "pnr: abcdef"
  /\b(?:booking|confirmation|conf|pnr|reservation|itinerary)\b\s*(?:ref(?:erence)?\s*)?(?:no\.?\s*|#\s*|:\s*)?([a-z0-9]{4,10})\b/g,
  // Policy/claim/case numbers: "policy no. abc-123456", "claim #789012"
  /\b(?:policy|claim|case|file|docket|permit|licen[sc]e)\b\s*(?:no\.?\s*|#\s*|:\s*)?([a-z0-9][-a-z0-9./]{2,20})\b/g,
  // Account/customer IDs: "account: 12345678", "customer id abc123"
  /\b(?:account|acct|customer|member|patient|employee|subscriber)\b\s*(?:id|no\.?|#|:)\s*:?\s*([a-z0-9][-a-z0-9./]{2,20})\b/g,
  // Gate/seat/zone: "gate b12", "seat 14a", "zone 3"
  /\b(?:gate|seat|zone|boarding\s+group)\b\s*:?\s*([a-z]?\d{1,3}[a-z]?)\b/g,
  // Card last-4 digits: "****1234", "xxxx5678"
  /(?:\*{4}|x{4})\s*(\d{4})\b/g,
  // Tracking/shipment numbers: "tracking: 1z999aa10123456784"
  /\b(?:tracking|shipment|parcel|consignment|waybill|awb)\b\s*(?:no\.?\s*|#\s*|:\s*)?([a-z0-9]{8,30})\b/g,
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

/**
 * Extract tokens using capturing groups — returns the first captured group
 * from each match rather than the full match. Falls back to full match if
 * no capturing group is present.
 */
function extractByCaptureGroups(text: string, patterns: RegExp[]): string[] {
  const tokens: string[] = [];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      tokens.push(match[1] ?? match[0]);
    }
  }
  return tokens;
}

/** Normalize a date token to digits-only for comparison. */
function normalizeDate(token: string): string {
  return token.replace(/[^0-9]/g, '');
}

/** Normalize a time token to digits-only for comparison. */
function normalizeTime(token: string): string {
  return token.replace(/[^0-9]/g, '');
}

/** Normalize a monetary amount to digits + decimal point only. */
function normalizeAmount(token: string): string {
  return token.replace(/[^0-9.]/g, '');
}

/** Normalize an identifier to lowercase alphanumeric only. */
function normalizeIdentifier(token: string): string {
  return token.replace(/[-./\s]/g, '').toLowerCase();
}

/** Normalize a reference number to digits only. */
function normalizeReference(token: string): string {
  return token.replace(/[^0-9]/g, '');
}

export interface DiscriminativeTokens {
  dates: Set<string>;
  times: Set<string>;
  amounts: Set<string>;
  identifiers: Set<string>;
  references: Set<string>;
  total: number;
}

export function extractDiscriminativeTokens(text: string): DiscriminativeTokens {
  const rawDates = extractByPatterns(text, DATE_PATTERNS);
  const rawTimes = extractByPatterns(text, TIME_PATTERNS);
  const rawAmounts = extractByPatterns(text, MONEY_PATTERNS);
  const rawIdentifiers = extractByCaptureGroups(text, IDENTIFIER_PATTERNS);
  const rawReferences = extractByPatterns(text, REFERENCE_PATTERNS);

  const dates = new Set(rawDates.map(normalizeDate).filter((t) => t.length > 0));
  const times = new Set(rawTimes.map(normalizeTime).filter((t) => t.length > 0));
  const amounts = new Set(rawAmounts.map(normalizeAmount).filter((t) => t.length > 0));
  const identifiers = new Set(rawIdentifiers.map(normalizeIdentifier).filter((t) => t.length > 0));
  const references = new Set(rawReferences.map(normalizeReference).filter((t) => t.length > 0));

  return {
    dates,
    times,
    amounts,
    identifiers,
    references,
    total: dates.size + times.size + amounts.size + identifiers.size + references.size,
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
 *   penalize documents without structured data).
 * - 0.5 when only one document has tokens (ambiguous).
 * - Weighted Jaccard of token-set categories otherwise.
 *   Dates 3x, times 2x, amounts 2x, identifiers 2x, references 1x.
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
  if (tokens1.times.size > 0 || tokens2.times.size > 0) {
    weightedSum += setJaccard(tokens1.times, tokens2.times) * 2;
    totalWeight += 2;
  }
  if (tokens1.amounts.size > 0 || tokens2.amounts.size > 0) {
    weightedSum += setJaccard(tokens1.amounts, tokens2.amounts) * 2;
    totalWeight += 2;
  }
  if (tokens1.identifiers.size > 0 || tokens2.identifiers.size > 0) {
    weightedSum += setJaccard(tokens1.identifiers, tokens2.identifiers) * 2;
    totalWeight += 2;
  }
  if (tokens1.references.size > 0 || tokens2.references.size > 0) {
    weightedSum += setJaccard(tokens1.references, tokens2.references) * 1;
    totalWeight += 1;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 1.0;
}
