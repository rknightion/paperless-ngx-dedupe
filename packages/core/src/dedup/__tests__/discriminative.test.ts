import { describe, it, expect } from 'vitest';
import { extractDiscriminativeTokens, computeDiscriminativeScore } from '../discriminative.js';

describe('extractDiscriminativeTokens', () => {
  // ── Dates ───────────────────────────────────────────────────────────

  it('extracts dates in numeric formats', () => {
    const tokens = extractDiscriminativeTokens('statement date 01/15/2024 due date 02/15/2024');
    expect(tokens.dates.size).toBe(2);
    expect(tokens.dates.has('01152024')).toBe(true);
    expect(tokens.dates.has('02152024')).toBe(true);
  });

  it('extracts dates with dash separators', () => {
    const tokens = extractDiscriminativeTokens('date: 15-01-2024');
    expect(tokens.dates.size).toBe(1);
    expect(tokens.dates.has('15012024')).toBe(true);
  });

  it('extracts ISO format dates', () => {
    const tokens = extractDiscriminativeTokens('created 2024-01-15');
    expect(tokens.dates.size).toBe(1);
    expect(tokens.dates.has('20240115')).toBe(true);
  });

  it('extracts month-name dates', () => {
    const tokens = extractDiscriminativeTokens('january 15, 2024 and december 3, 2023');
    expect(tokens.dates.size).toBe(2);
  });

  // ── Times ───────────────────────────────────────────────────────────

  it('extracts 12-hour times with am/pm', () => {
    const tokens = extractDiscriminativeTokens('departure 2:30 pm arrival 11:45am');
    expect(tokens.times.size).toBe(2);
    expect(tokens.times.has('230')).toBe(true);
    expect(tokens.times.has('1145')).toBe(true);
  });

  it('extracts 24-hour times', () => {
    const tokens = extractDiscriminativeTokens('scheduled 14:30 and 08:15');
    expect(tokens.times.size).toBe(2);
    expect(tokens.times.has('1430')).toBe(true);
    expect(tokens.times.has('0815')).toBe(true);
  });

  it('extracts 24-hour times with seconds', () => {
    const tokens = extractDiscriminativeTokens('timestamp 23:59:59');
    expect(tokens.times.size).toBe(1);
    expect(tokens.times.has('235959')).toBe(true);
  });

  it('extracts military/aviation times', () => {
    const tokens = extractDiscriminativeTokens('etd 0830h eta 1430 hrs');
    expect(tokens.times.size).toBe(2);
    expect(tokens.times.has('0830')).toBe(true);
    expect(tokens.times.has('1430')).toBe(true);
  });

  // ── Amounts ─────────────────────────────────────────────────────────

  it('extracts monetary amounts with currency symbols', () => {
    const tokens = extractDiscriminativeTokens('total: $1,234.56 balance: $500.00');
    expect(tokens.amounts.size).toBe(2);
    expect(tokens.amounts.has('1234.56')).toBe(true);
    expect(tokens.amounts.has('500.00')).toBe(true);
  });

  it('extracts monetary amounts with currency codes', () => {
    const tokens = extractDiscriminativeTokens('amount 1234.56 usd');
    expect(tokens.amounts.size).toBe(1);
    expect(tokens.amounts.has('1234.56')).toBe(true);
  });

  it('extracts standalone comma-formatted decimals', () => {
    const tokens = extractDiscriminativeTokens('balance 2,500.00 remaining');
    expect(tokens.amounts.size).toBeGreaterThanOrEqual(1);
  });

  it('extracts amounts with expanded currency symbols', () => {
    const tokens = extractDiscriminativeTokens('price ₹1,234.56 or ₩50000 or ₺789.00');
    expect(tokens.amounts.size).toBe(3);
  });

  it('extracts amounts with expanded currency codes', () => {
    const tokens = extractDiscriminativeTokens('total 1234.56 nzd subtotal 789.00 brl');
    expect(tokens.amounts.size).toBe(2);
    expect(tokens.amounts.has('1234.56')).toBe(true);
    expect(tokens.amounts.has('789.00')).toBe(true);
  });

  it('extracts amounts with asian currency codes', () => {
    const tokens = extractDiscriminativeTokens('price 5000.00 krw fee 1234.56 sgd');
    expect(tokens.amounts.size).toBe(2);
  });

  // ── Identifiers ─────────────────────────────────────────────────────

  it('extracts invoice numbers', () => {
    const tokens = extractDiscriminativeTokens('invoice inv-2024-001 due in 30 days');
    expect(tokens.identifiers.size).toBe(1);
    expect(tokens.identifiers.has('inv2024001')).toBe(true);
  });

  it('extracts order and PO numbers', () => {
    const tokens = extractDiscriminativeTokens('order #ab-123 po po-5001');
    expect(tokens.identifiers.size).toBe(2);
    expect(tokens.identifiers.has('ab123')).toBe(true);
    expect(tokens.identifiers.has('po5001')).toBe(true);
  });

  it('extracts flight numbers', () => {
    const tokens = extractDiscriminativeTokens('flight ba1234 connecting flt ua567');
    expect(tokens.identifiers.size).toBe(2);
    expect(tokens.identifiers.has('ba1234')).toBe(true);
    expect(tokens.identifiers.has('ua567')).toBe(true);
  });

  it('extracts booking and confirmation codes', () => {
    const tokens = extractDiscriminativeTokens('booking ref xkcd42 confirmation abc123');
    expect(tokens.identifiers.size).toBe(2);
    expect(tokens.identifiers.has('xkcd42')).toBe(true);
    expect(tokens.identifiers.has('abc123')).toBe(true);
  });

  it('extracts policy and claim numbers', () => {
    const tokens = extractDiscriminativeTokens('policy no. abc-123456 claim #789012');
    expect(tokens.identifiers.size).toBe(2);
    expect(tokens.identifiers.has('abc123456')).toBe(true);
    expect(tokens.identifiers.has('789012')).toBe(true);
  });

  it('extracts gate, seat, and zone', () => {
    const tokens = extractDiscriminativeTokens('gate b32 seat 14a zone 2');
    expect(tokens.identifiers.size).toBe(3);
    expect(tokens.identifiers.has('b32')).toBe(true);
    expect(tokens.identifiers.has('14a')).toBe(true);
    expect(tokens.identifiers.has('2')).toBe(true);
  });

  it('extracts card last-4 digits', () => {
    const tokens = extractDiscriminativeTokens('paid with visa ****4532');
    expect(tokens.identifiers.size).toBe(1);
    expect(tokens.identifiers.has('4532')).toBe(true);
  });

  it('extracts tracking numbers', () => {
    const tokens = extractDiscriminativeTokens('tracking 1z999aa10123456784');
    expect(tokens.identifiers.size).toBe(1);
    expect(tokens.identifiers.has('1z999aa10123456784')).toBe(true);
  });

  it('extracts account identifiers', () => {
    const tokens = extractDiscriminativeTokens('account no. 12345678');
    expect(tokens.identifiers.size).toBe(1);
    expect(tokens.identifiers.has('12345678')).toBe(true);
  });

  // ── DD-Mon-YYYY dates ──────────────────────────────────────────────

  it('extracts DD-Mon-YYYY dates', () => {
    const tokens = extractDiscriminativeTokens('issue date: 30-apr-2016 due: 22-nov-2024');
    expect(tokens.dates.size).toBeGreaterThanOrEqual(2);
  });

  it('extracts DD Mon YYYY dates with spaces', () => {
    const tokens = extractDiscriminativeTokens('purchased on 15 aug 2019');
    expect(tokens.dates.size).toBeGreaterThanOrEqual(1);
  });

  it('extracts DD-Month-YYYY with full month names', () => {
    const tokens = extractDiscriminativeTokens('valid until 15 august 2019');
    expect(tokens.dates.size).toBeGreaterThanOrEqual(1);
  });

  // ── Multi-word label identifiers ──────────────────────────────────

  it('extracts identifiers with "number" label: invoice number xyz', () => {
    const tokens = extractDiscriminativeTokens('invoice number: 6148352054267949-21');
    expect(tokens.identifiers.size).toBe(1);
    expect(tokens.identifiers.has('614835205426794921')).toBe(true);
  });

  it('extracts identifiers with "number" label without colon', () => {
    const tokens = extractDiscriminativeTokens('invoice number iee2024013465150');
    expect(tokens.identifiers.size).toBe(1);
    expect(tokens.identifiers.has('iee2024013465150')).toBe(true);
  });

  it('extracts customer number identifiers', () => {
    const tokens = extractDiscriminativeTokens('customer number 1207310464');
    expect(tokens.identifiers.size).toBe(1);
    expect(tokens.identifiers.has('1207310464')).toBe(true);
  });

  it('extracts ticket number identifiers', () => {
    const tokens = extractDiscriminativeTokens('ticket number ttfl9bnpf74');
    expect(tokens.identifiers.size).toBe(1);
    expect(tokens.identifiers.has('ttfl9bnpf74')).toBe(true);
  });

  // ── Contextual amounts ────────────────────────────────────────────

  it('extracts amounts near financial keywords without currency symbol', () => {
    const tokens = extractDiscriminativeTokens('net amount 25.28 grand total 25.28');
    expect(tokens.amounts.size).toBeGreaterThanOrEqual(1);
    expect(tokens.amounts.has('25.28')).toBe(true);
  });

  it('extracts amounts after "total (gbp)"', () => {
    const tokens = extractDiscriminativeTokens('grand total (gbp) 25.28');
    expect(tokens.amounts.size).toBeGreaterThanOrEqual(1);
    expect(tokens.amounts.has('25.28')).toBe(true);
  });

  // ── Segmented references ──────────────────────────────────────────

  it('extracts dash-separated digit groups as references', () => {
    const tokens = extractDiscriminativeTokens('billing id: 7846-3149-2683');
    expect(tokens.references.has('784631492683')).toBe(true);
  });

  it('extracts longer segmented references', () => {
    const tokens = extractDiscriminativeTokens('account number: 6148-3520-5426-7949');
    expect(tokens.references.has('6148352054267949')).toBe(true);
  });

  // ── References ──────────────────────────────────────────────────────

  it('extracts reference numbers (6+ digits)', () => {
    const tokens = extractDiscriminativeTokens('account 123456789 ref 987654');
    expect(tokens.references.size).toBeGreaterThanOrEqual(2);
    expect(tokens.references.has('123456789')).toBe(true);
    expect(tokens.references.has('987654')).toBe(true);
  });

  it('does not extract short numbers as references', () => {
    const tokens = extractDiscriminativeTokens('page 42 of 100');
    expect(tokens.references.size).toBe(0);
  });

  // ── Routes ────────────────────────────────────────────────────────

  it('extracts direction-prefixed routes preserving order', () => {
    const tokens = extractDiscriminativeTokens('out: bsk - lon');
    expect(tokens.routes.size).toBe(1);
    expect(tokens.routes.has('bsk>lon')).toBe(true);
  });

  it('extracts return routes with reversed order', () => {
    const tokens = extractDiscriminativeTokens('ret: lon - bsk');
    expect(tokens.routes.size).toBe(1);
    expect(tokens.routes.has('lon>bsk')).toBe(true);
  });

  it('extracts from-to routes', () => {
    const tokens = extractDiscriminativeTokens('from lhr to jfk');
    expect(tokens.routes.size).toBe(1);
    expect(tokens.routes.has('lhr>jfk')).toBe(true);
  });

  it('extracts departure routes', () => {
    const tokens = extractDiscriminativeTokens('depart: syd - mel');
    expect(tokens.routes.size).toBe(1);
    expect(tokens.routes.has('syd>mel')).toBe(true);
  });

  // ── Edge cases ──────────────────────────────────────────────────────

  it('returns empty sets for text with no structured data', () => {
    const tokens = extractDiscriminativeTokens('the quick brown fox jumps over the lazy dog');
    expect(tokens.total).toBe(0);
    expect(tokens.dates.size).toBe(0);
    expect(tokens.times.size).toBe(0);
    expect(tokens.amounts.size).toBe(0);
    expect(tokens.identifiers.size).toBe(0);
    expect(tokens.references.size).toBe(0);
    expect(tokens.routes.size).toBe(0);
  });

  it('extracts multiple token types from mixed content', () => {
    const tokens = extractDiscriminativeTokens(
      'statement 01/15/2024 account 123456789 balance $1,234.56',
    );
    expect(tokens.dates.size).toBeGreaterThanOrEqual(1);
    expect(tokens.amounts.size).toBeGreaterThanOrEqual(1);
    expect(tokens.references.size).toBeGreaterThanOrEqual(1);
    expect(tokens.total).toBeGreaterThanOrEqual(3);
  });
});

describe('computeDiscriminativeScore', () => {
  it('returns 1.0 when both texts have no discriminative tokens', () => {
    const score = computeDiscriminativeScore(
      'the quick brown fox jumps over the lazy dog',
      'a different sentence with no numbers or dates',
    );
    expect(score).toBe(1.0);
  });

  it('returns 0.5 when only one text has tokens', () => {
    const score = computeDiscriminativeScore(
      'statement date 01/15/2024 total $500.00',
      'the quick brown fox jumps over the lazy dog',
    );
    expect(score).toBe(0.5);
  });

  it('returns 1.0 for identical structured content', () => {
    const text = 'statement 01/15/2024 account 123456789 balance $1,234.56';
    const score = computeDiscriminativeScore(text, text);
    expect(score).toBe(1.0);
  });

  it('returns 0.0 for completely different structured content', () => {
    const text1 = 'statement 01/15/2024 balance $1,234.56 account 111111';
    const text2 = 'statement 06/30/2025 balance $9,876.54 account 222222';
    const score = computeDiscriminativeScore(text1, text2);
    expect(score).toBe(0.0);
  });

  it('returns partial score for overlapping structured content', () => {
    const text1 = 'statement 01/15/2024 account 123456789 balance $1,234.56';
    const text2 = 'statement 01/15/2024 account 123456789 balance $2,345.67';
    const score = computeDiscriminativeScore(text1, text2);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  // ── Real-world scenarios ────────────────────────────────────────────

  describe('real-world scenarios', () => {
    // Bank statements
    const bankStatementTemplate = (month: string, date: string, amounts: string[]) =>
      `acme bank monthly statement ${month} account number 1234567890 ` +
      `statement date ${date} ` +
      `opening balance ${amounts[0]} ` +
      `transaction grocery store ${amounts[1]} ` +
      `transaction gas station ${amounts[2]} ` +
      `closing balance ${amounts[3]} ` +
      `minimum payment due ${amounts[4]}`;

    it('scores low for same-template different-month bank statements', () => {
      const jan = bankStatementTemplate('january 2024', '01/31/2024', [
        '$5,000.00',
        '$150.00',
        '$45.00',
        '$4,805.00',
        '$25.00',
      ]);
      const feb = bankStatementTemplate('february 2024', '02/28/2024', [
        '$4,805.00',
        '$200.00',
        '$60.00',
        '$4,545.00',
        '$30.00',
      ]);
      const score = computeDiscriminativeScore(jan, feb);
      expect(score).toBeLessThan(0.5);
    });

    it('scores high for true duplicate (identical content)', () => {
      const statement = bankStatementTemplate('january 2024', '01/31/2024', [
        '$5,000.00',
        '$150.00',
        '$45.00',
        '$4,805.00',
        '$25.00',
      ]);
      const score = computeDiscriminativeScore(statement, statement);
      expect(score).toBe(1.0);
    });

    // Invoices
    const invoiceTemplate = (
      invNo: string,
      date: string,
      due: string,
      amounts: { subtotal: string; tax: string; total: string },
      poNo: string,
    ) =>
      `acme corp invoice ${invNo} date ${date} due ${due} ` +
      `bill to: widgets inc 123 main street ` +
      `description: professional services for march 2024 ` +
      `subtotal ${amounts.subtotal} tax ${amounts.tax} total ${amounts.total} ` +
      `po ${poNo} payment terms net 30`;

    it('scores low for same-vendor different invoices', () => {
      const inv1 = invoiceTemplate(
        'inv-2024-001',
        '01/15/2024',
        '02/15/2024',
        {
          subtotal: '$1,234.56',
          tax: '$98.76',
          total: '$1,333.32',
        },
        'po-5001',
      );
      const inv2 = invoiceTemplate(
        'inv-2024-002',
        '02/15/2024',
        '03/15/2024',
        {
          subtotal: '$2,100.00',
          tax: '$168.00',
          total: '$2,268.00',
        },
        'po-5002',
      );
      const score = computeDiscriminativeScore(inv1, inv2);
      expect(score).toBeLessThan(0.3);
    });

    it('scores high for duplicate invoices', () => {
      const inv = invoiceTemplate(
        'inv-2024-001',
        '01/15/2024',
        '02/15/2024',
        {
          subtotal: '$1,234.56',
          tax: '$98.76',
          total: '$1,333.32',
        },
        'po-5001',
      );
      const score = computeDiscriminativeScore(inv, inv);
      expect(score).toBe(1.0);
    });

    // Receipts
    const receiptTemplate = (
      date: string,
      time: string,
      txnId: string,
      items: string[],
      total: string,
      card: string,
    ) =>
      `megamart store #4521 ${date} ${time} ` +
      `transaction ${txnId} ` +
      items.map((item, i) => `item ${i + 1} ${item}`).join(' ') +
      ` subtotal ${total} tax $1.48 total ${total} ` +
      `card ****${card}`;

    it('scores low for same-store different receipts', () => {
      const r1 = receiptTemplate(
        '01/15/2024',
        '14:30',
        '845123',
        ['$5.99', '$12.49'],
        '$19.96',
        '4532',
      );
      const r2 = receiptTemplate(
        '02/20/2024',
        '09:15',
        '891456',
        ['$8.99', '$3.49'],
        '$13.48',
        '4532',
      );
      const score = computeDiscriminativeScore(r1, r2);
      expect(score).toBeLessThan(0.4);
    });

    it('scores high for duplicate receipts', () => {
      const r = receiptTemplate(
        '01/15/2024',
        '14:30',
        '845123',
        ['$5.99', '$12.49'],
        '$19.96',
        '4532',
      );
      const score = computeDiscriminativeScore(r, r);
      expect(score).toBe(1.0);
    });

    // Boarding passes
    const boardingPassTemplate = (
      date: string,
      time: string,
      gate: string,
      seat: string,
      bookingRef: string,
      zone: string,
    ) =>
      `boarding pass flight ba1234 date ${date} departure ${time} ` +
      `from lhr to jfk gate ${gate} seat ${seat} ` +
      `booking ref ${bookingRef} zone ${zone} ` +
      `passenger j smith`;

    it('scores low for same-route different boarding passes', () => {
      const bp1 = boardingPassTemplate('01/15/2024', '14:30', 'b32', '14a', 'xkcd42', '2');
      const bp2 = boardingPassTemplate('03/22/2024', '14:30', 'a15', '22c', 'pqrs99', '1');
      const score = computeDiscriminativeScore(bp1, bp2);
      // Route is identical (lhr>jfk) so it contributes 1.0×3 to the weighted score,
      // but different dates/gates/seats/bookings still pull the overall well below 1.0
      expect(score).toBeLessThan(0.6);
    });

    it('scores high for duplicate boarding passes', () => {
      const bp = boardingPassTemplate('01/15/2024', '14:30', 'b32', '14a', 'xkcd42', '2');
      const score = computeDiscriminativeScore(bp, bp);
      expect(score).toBe(1.0);
    });

    // Google invoices (DD-Mon-YYYY dates, multi-word labels, segmented refs)
    it('scores low for different-month Google invoices', () => {
      const inv1 =
        'invoice number: 6148352054267949-21 issue date: 30-apr-2016 ' +
        'billing id: 7846-3149-2683 billing account number: 6148-3520-5426-7949 ' +
        '01-apr-2016 - 30-apr-2016 subtotal in gbp: 6.58 amount due in gbp: £6.58';
      const inv2 =
        'invoice number: 6148352054267949-18 issue date: 31-jan-2016 ' +
        'billing id: 7846-3149-2683 billing account number: 6148-3520-5426-7949 ' +
        '01-jan-2016 - 31-jan-2016 subtotal in gbp: 6.58 amount due in gbp: £6.58';
      const score = computeDiscriminativeScore(inv1, inv2);
      // Dates and invoice numbers differ; amounts and billing ID are shared
      expect(score).toBeLessThan(0.6);
    });

    // Adobe invoices (DD-MON-YYYY dates, amounts without currency symbol)
    it('scores low for different-month Adobe invoices', () => {
      const inv1 =
        'invoice number iee2024013465150 invoice date 22-nov-2024 ' +
        'order number 7183658461 customer number 1207310464 ' +
        'service term: 22-nov-2024 to 21-dec-2024 net amount 25.28 total 25.28';
      const inv2 =
        'invoice number iee2025015991687 invoice date 22-oct-2025 ' +
        'order number 7183658461 customer number 1207310464 ' +
        'service term: 22-oct-2025 to 21-nov-2025 net amount 25.28 total 25.28';
      const score = computeDiscriminativeScore(inv1, inv2);
      // Dates and invoice numbers differ; amounts, order/customer numbers are shared
      expect(score).toBeLessThan(0.6);
    });

    // Train tickets — outbound vs return (route direction detection)
    it('scores below 1.0 for outbound vs return train tickets', () => {
      const outbound =
        'ttfl9bnpf74 15 aug 2019 out: bsk - lon basingstoke bsk london terminals lon ' +
        'ticket type off-peak day return adult route via woking valid until 15 aug 2019 ' +
        'ticket number ttfl9bnpf74 price £25.60 purchased on 15 august 2019';
      const returnTicket =
        'ttfl9bnpf74 15 aug 2019 ret: lon - bsk london terminals lon basingstoke bsk ' +
        'ticket type off-peak day return adult route via woking valid until 15 aug 2019 ' +
        'ticket number ttfl9bnpf74 price £25.60 purchased on 15 august 2019';
      const score = computeDiscriminativeScore(outbound, returnTicket);
      // Routes differ (bsk>lon vs lon>bsk) but all other tokens are identical
      expect(score).toBeLessThan(0.85);
      expect(score).toBeGreaterThan(0.5);
    });
  });
});
