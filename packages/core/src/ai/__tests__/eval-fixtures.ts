export interface EvalFixture {
  name: string;
  document: { title: string; content: string };
  referenceData: {
    correspondents: string[];
    documentTypes: string[];
    tags: string[];
  };
  expected: {
    title: string | null;
    correspondent: string | null;
    documentType: string | null;
    tags: string[];
    minConfidence?: {
      title?: number;
      correspondent?: number;
      documentType?: number;
      tags?: number;
    };
  };
}

export const EVAL_FIXTURES: EvalFixture[] = [
  {
    name: 'clear-invoice',
    document: {
      title: 'Invoice #INV-2024-0847',
      content: `INVOICE
Amazon.co.uk
1 Principal Place, Worship Street
London EC2A 2FA

Invoice Number: INV-2024-0847
Date: 15 March 2024
Due Date: 14 April 2024

Bill To:
John Smith
42 Oak Lane
Manchester M1 2AB

Items:
1x Kindle Paperwhite - £129.99
1x USB-C Cable - £8.99
Subtotal: £138.98
VAT (20%): £27.80
Total: £166.78

Payment Terms: Net 30
Payment Method: Visa ending 4521`,
    },
    referenceData: {
      correspondents: ['Amazon', 'Barclays', 'HMRC', 'NHS', 'British Gas'],
      documentTypes: ['Invoice', 'Receipt', 'Bank Statement', 'Letter', 'Contract'],
      tags: ['tax-2024', 'electronics', 'home', 'medical', 'utilities'],
    },
    expected: {
      title: 'Amazon Invoice INV-2024-0847 - Mar 2024',
      correspondent: 'Amazon',
      documentType: 'Invoice',
      tags: ['electronics'],
      minConfidence: { title: 0.7, correspondent: 0.8, documentType: 0.9 },
    },
  },
  {
    name: 'null-case-generic-page',
    document: {
      title: 'Scanned Page 003',
      content: `Page 3 of 7

...continued from previous page.

The results of the analysis are presented in Table 2 below. Further discussion
can be found in Section 4.

Note: All figures are approximate and subject to revision.

See appendix for methodology details.`,
    },
    referenceData: {
      correspondents: ['Amazon', 'Barclays', 'HMRC'],
      documentTypes: ['Invoice', 'Receipt', 'Letter', 'Report'],
      tags: ['tax-2024', 'finance', 'medical'],
    },
    expected: {
      title: null,
      correspondent: null,
      documentType: null,
      tags: [],
      minConfidence: { title: 0, correspondent: 0, documentType: 0 },
    },
  },
  {
    name: 'ocr-noisy-receipt',
    document: {
      title: 'receipt_scan_20240301.pdf',
      content: `T3SC0  Exprass
Stor3 #4421  Manchester

03/01/2024  14:32

Meal D3al          £3.59
  Sandw1ch
  Cr1sps
  Dr1nk
Latt3              £2.95
-----------------------
TOTAL              £6.54
VISA ***4521       £6.54

Th4nk you for shopp1ng
w1th us!

VAT No: GB 232 4567 89
Reg: Tesco Stores Ltd`,
    },
    referenceData: {
      correspondents: ['Tesco', 'Sainsburys', 'Waitrose', 'Amazon'],
      documentTypes: ['Invoice', 'Receipt', 'Bank Statement'],
      tags: ['groceries', 'food', 'tax-2024'],
    },
    expected: {
      title: 'Tesco Express Receipt - Mar 2024',
      correspondent: 'Tesco',
      documentType: 'Receipt',
      tags: ['groceries'],
      minConfidence: { correspondent: 0.5, documentType: 0.7 },
    },
  },
  {
    name: 'reused-reference-match',
    document: {
      title: 'Account Statement - March 2024',
      content: `Barclays Bank UK PLC
1 Churchill Place, London E14 5HP

CURRENT ACCOUNT STATEMENT

Account Holder: John Smith
Sort Code: 20-45-67
Account No: 12345678
Statement Period: 01 Mar 2024 - 31 Mar 2024

Date        Description                  Debit      Credit     Balance
01/03       Opening Balance                                    £2,345.67
05/03       DD - British Gas             £127.50               £2,218.17
10/03       DD - Netflix                 £15.99                £2,202.18
15/03       Salary - Acme Corp                      £3,200.00  £5,402.18
20/03       Card - Tesco                 £45.32                £5,356.86
25/03       Transfer to Savings          £500.00               £4,856.86
31/03       Closing Balance                                    £4,856.86`,
    },
    referenceData: {
      correspondents: ['Barclays', 'HSBC', 'Lloyds', 'NatWest'],
      documentTypes: ['Invoice', 'Receipt', 'Bank Statement', 'Letter'],
      tags: ['finance', 'banking', 'tax-2024', 'monthly'],
    },
    expected: {
      title: 'Barclays Current Account Statement - Mar 2024',
      correspondent: 'Barclays',
      documentType: 'Bank Statement',
      tags: ['finance', 'banking', 'monthly'],
      minConfidence: { correspondent: 0.8, documentType: 0.9, tags: 0.7 },
    },
  },
  {
    name: 'multi-tag-insurance',
    document: {
      title: 'Home Insurance Policy Renewal',
      content: `Aviva Insurance Limited
Policy Renewal Notice

Policy Number: HI-2024-789456
Renewal Date: 1 April 2024

Dear John Smith,

Your home insurance policy is due for renewal. Please find below a summary
of your cover:

Property: 42 Oak Lane, Manchester M1 2AB
Type: Buildings and Contents

Buildings Cover: £350,000
Contents Cover: £75,000
Personal Possessions: £5,000
Accidental Damage: Included
Legal Expenses: Included

Annual Premium: £487.20 (including Insurance Premium Tax)

Excess: £250 standard, £1,000 subsidence

Please review the enclosed documents carefully and contact us if you need
to make any changes to your cover.

Yours sincerely,
Aviva Customer Services
0800 051 1411`,
    },
    referenceData: {
      correspondents: ['Aviva', 'AXA', 'Admiral', 'Direct Line'],
      documentTypes: ['Invoice', 'Insurance Policy', 'Letter', 'Contract'],
      tags: ['insurance', 'home', 'renewal', 'annual', 'property'],
    },
    expected: {
      title: 'Aviva Home Insurance Renewal - Apr 2024',
      correspondent: 'Aviva',
      documentType: 'Insurance Policy',
      tags: ['insurance', 'home', 'renewal'],
      minConfidence: { correspondent: 0.9, documentType: 0.8, tags: 0.7 },
    },
  },
  {
    name: 'ambiguous-document-type',
    document: {
      title: 'Important Notice Regarding Your Account',
      content: `HMRC
HM Revenue & Customs

Date: 20 February 2024
Our Ref: TC/2024/123456

Dear Mr Smith,

TAX CREDITS - IMPORTANT INFORMATION

We are writing to inform you about changes to your tax credits for the
2024/25 tax year. Based on the information you provided, your annual
award has been recalculated.

Your new annual entitlement: £4,320.00
Weekly payment: £83.08

This change takes effect from 6 April 2024. If your circumstances
change, you must inform us within 30 days.

If you disagree with this decision, you have the right to request a
mandatory reconsideration within 30 days of this notice.

For more information visit: www.gov.uk/tax-credits

Yours sincerely,
Tax Credit Office`,
    },
    referenceData: {
      correspondents: ['HMRC', 'DWP', 'DVLA', 'NHS'],
      documentTypes: ['Letter', 'Notification', 'Tax Return', 'Invoice'],
      tags: ['tax-2024', 'government', 'benefits', 'annual'],
    },
    expected: {
      title: 'HMRC Tax Credits Notice 2024/25',
      correspondent: 'HMRC',
      documentType: 'Notification',
      tags: ['tax-2024', 'government'],
      minConfidence: { correspondent: 0.9 },
    },
  },
];
