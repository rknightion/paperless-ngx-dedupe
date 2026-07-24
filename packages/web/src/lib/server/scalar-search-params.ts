export class ScalarSearchParamError extends Error {
  constructor(readonly parameter: string) {
    super('Repeated scalar search parameter');
    this.name = 'ScalarSearchParamError';
  }
}

/**
 * Read URL state without applying URLSearchParams' implicit first/last-value
 * semantics. Every key in these views is scalar, so repeated values are
 * rejected before schema validation.
 */
export function readScalarSearchParams(parameters: URLSearchParams): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of new Set(parameters.keys())) {
    const values = parameters.getAll(key);
    if (values.length !== 1) throw new ScalarSearchParamError(key);
    result[key] = values[0];
  }
  return result;
}
