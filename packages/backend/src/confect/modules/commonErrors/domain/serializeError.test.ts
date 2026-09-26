import { describe, expect, it } from 'vitest';

import { stringifyUnknownError } from './serializeError';

describe('stringifyUnknownError', () => {
  it('stringifies values that JSON.stringify cannot serialize', () => {
    expect(stringifyUnknownError(undefined)).toBe('undefined');
    expect(stringifyUnknownError(Symbol('workflow'))).toBe('Symbol(workflow)');
  });
});
