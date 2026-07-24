import { describe, expect, it } from 'vitest';

import { safeDocumentReturnTarget } from './safe-return';

describe('safeDocumentReturnTarget', () => {
  it('accepts same-origin relative document-library paths', () => {
    expect(
      safeDocumentReturnTarget('/documents?library=true&text=invoice&customFieldValue=%5B1%2C2%5D'),
    ).toBe('/documents?library=true&text=invoice&customFieldValue=%5B1%2C2%5D');
  });

  it.each([
    'https://attacker.example/documents',
    '//attacker.example/documents',
    '/settings',
    '/documents-elsewhere',
    'documents?library=true',
    '/documents\nLocation:https://attacker.example',
  ])('rejects unsafe or out-of-scope target %s', (target) => {
    expect(safeDocumentReturnTarget(target)).toBeNull();
  });
});
