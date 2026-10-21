import { describe, expect, it } from 'vitest';

import { resolveCorrelationId } from '../correlation-id.js';

const req = (value?: string) => ({ headers: value === undefined ? {} : { 'x-correlation-id': value } });

describe('resolveCorrelationId', () => {
  it('adopts a valid inbound id', () => {
    expect(resolveCorrelationId(req('abc.DEF_1-2'))).toBe('abc.DEF_1-2');
    expect(resolveCorrelationId(req('a'.repeat(128)))).toBe('a'.repeat(128));
  });

  it.each([['a b'], ['a'.repeat(129)], [''], ['x/y'], ['ü']])(
    'replaces an invalid inbound id (%j) with a generated srv- id',
    (value) => {
      expect(resolveCorrelationId(req(value))).toMatch(/^srv-\d+-[0-9a-f]+$/);
    },
  );

  it('generates a distinct id when the header is absent', () => {
    const a = resolveCorrelationId(req());
    expect(a).toMatch(/^srv-\d+-[0-9a-f]+$/);
    expect(resolveCorrelationId(req())).not.toBe(a);
  });
});
