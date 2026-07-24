import { describe, expect, it } from 'vitest';

import { readScalarSearchParams, ScalarSearchParamError } from '../scalar-search-params';

describe('readScalarSearchParams', () => {
  it('returns unique scalar values without using last-value-wins semantics', () => {
    const parameters = new URLSearchParams('library=true&text=invoice&limit=25');

    expect(readScalarSearchParams(parameters)).toEqual({
      library: 'true',
      text: 'invoice',
      limit: '25',
    });
  });

  it('rejects every repeated parameter instead of silently selecting a value', () => {
    const parameters = new URLSearchParams('text=public&text=private');

    expect(() => readScalarSearchParams(parameters)).toThrow(ScalarSearchParamError);
  });
});
