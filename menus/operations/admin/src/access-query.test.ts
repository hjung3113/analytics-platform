import { describe, expect, it } from 'vitest';
import { ACCESS_PAGE_KEYS, parseAccessKeys } from './access-query';

const keys = (over: Partial<Record<string, string | null>> = {}) => ({
  role: null, permission: null, sort: null, page: null, focus: null,
  ...over,
}) as Parameters<typeof parseAccessKeys>[0];

describe('parseAccessKeys (#49 page keys)', () => {
  it('declares exactly the five keys of admin-roles', () => {
    expect(ACCESS_PAGE_KEYS).toEqual(['role', 'permission', 'sort', 'page', 'focus']);
  });

  it('accepts every key absent: filters unset, default page and sort, no focus', () => {
    expect(parseAccessKeys(keys())).toEqual({ ok: true, filters: { role: null, permission: null }, sorting: [], page: null, focus: null });
  });

  it('parses the sort wire form, a 1-based page and a well-formed focus token', () => {
    const parsed = parseAccessKeys(keys({ role: 'engineer', permission: 'console:access', sort: 'name:desc', page: '3', focus: 'engineer' }));
    expect(parsed).toEqual({
      ok: true,
      filters: { role: 'engineer', permission: 'console:access' },
      sorting: [{ id: 'name', desc: true }],
      page: 3,
      focus: 'engineer',
    });
  });

  it.each([
    ['unknown permission', keys({ permission: 'console:write' })],
    ['empty role', keys({ role: '' })],
    ['role bearing a query mark', keys({ role: 'a?b' })],
    ['role over 80 chars', keys({ role: 'x'.repeat(81) })],
    ['malformed focus (whitespace)', keys({ focus: 'a b' })],
    ['malformed focus (empty)', keys({ focus: '' })],
    ['sort outside the four fields', keys({ sort: 'sites:asc' })],
    ['malformed sort wire form', keys({ sort: 'name:up' })],
    ['page 0', keys({ page: '0' })],
    ['non-numeric page', keys({ page: 'abc' })],
  ])('rejects %s instead of coercing', (_name, raw) => {
    expect(parseAccessKeys(raw)).toEqual({ ok: false });
  });
});
