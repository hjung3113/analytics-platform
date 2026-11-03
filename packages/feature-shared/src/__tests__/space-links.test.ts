import { describe, expect, it } from 'vitest';
import { spaceLinksResponseSchema } from '../index.js';

const ID = '4f1b2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const ok = { items: [{ space_id: 'mars', managed_system_id: ID, declared: false }], platform_managed_system_id: ID };

describe('spaceLinksResponseSchema (GET /managed-systems/space-links, #1289 node j)', () => {
  it('accepts the response, a disconnected link and a missing 「플랫폼」 system included', () => {
    expect(spaceLinksResponseSchema.parse(ok)).toEqual(ok);
    expect(spaceLinksResponseSchema.parse({ items: [], platform_managed_system_id: null }).platform_managed_system_id).toBeNull();
  });

  it.each([
    ['an unknown top-level key', { ...ok, extra: 1 }],
    ['an unknown item key', { ...ok, items: [{ ...ok.items[0], scope_kind: 'workspace' }] }],
    ['a missing declared flag', { ...ok, items: [{ space_id: 'mars', managed_system_id: ID }] }],
    ['a non-uuid system id', { ...ok, items: [{ ...ok.items[0], managed_system_id: 'x' }] }],
    ['an empty space id', { ...ok, items: [{ ...ok.items[0], space_id: '' }] }],
    ['a missing 「플랫폼」 key', { items: [] }],
  ])('rejects %s', (_name, value) => {
    expect(spaceLinksResponseSchema.safeParse(value).success).toBe(false);
  });
});
