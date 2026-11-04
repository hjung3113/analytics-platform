import { describe, expect, it } from 'vitest';

// Imports the `@ap/contracts` TS barrel, so this file is type-checked by the relaxed
// tsconfig.platform-tests.json (like transition-drift.test.ts), not by the strict source project.
import { isAppRelativePath } from '@ap/contracts';

import { ITEM_INPUT_KEYS, ORIGIN_CONTEXT_MAX_DEPTH, appRelativePath, parseItemInput, validateItemInput } from '../domain/item-input.js';

const ID = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';
const codes = (op: Parameters<typeof validateItemInput>[0], input: Record<string, unknown>) =>
  validateItemInput(op, input).map((e) => `${e.path.join('.')}:${e.code}`);

describe('improvement item write input (DB-free)', () => {
  it('normalises create text and keeps absent optionals absent', () => {
    const parsed = parseItemInput('itemCreate', { problem: '  p  ', action: '  ', origin: { menuId: ' m ', context: {} } });
    expect(parsed).toMatchObject({ ok: true, value: { problem: 'p', action: null, origin: { menuId: 'm' } } });
    expect(parseItemInput('itemUpdate', { itemId: ID, problem: 'p' })).toMatchObject({ ok: true, value: { problem: 'p' } });
    expect((parseItemInput('itemUpdate', { itemId: ID, problem: 'p' }) as { value: object }).value).not.toHaveProperty('action');
  });

  it('flags a duplicate (kind, externalKey) at the index of the second one', () => {
    const t = (k: string) => ({ kind: 'equipment', externalKey: k, displayName: k });
    expect(codes('itemUpdate', { itemId: ID, targets: [t('a'), t('b'), t('a')] })).toEqual(['targets.2:duplicate']);
    expect(codes('itemUpdate', { itemId: ID, targets: [t('a'), { ...t('a'), kind: 'process' }] })).toEqual([]);
  });

  it.each([
    ['https://x.example/a', 1],
    ['//x.example', 1],
    ['/ok/path?x=1', 0],
    ['/\t/evil.example/x', 1],
    ['/\r/evil.example/x', 1],
    ['/\n/evil.example/x', 1],
    ['/%2F%2Fevil.example/x', 1],
    ['/note:x', 1],
  ])('compareLink %s → %i error', (compareLink, count) => {
    expect(codes('itemSetStatus', { itemId: ID, status: 'verified', effect: { result: 'effective', compareLink } })).toHaveLength(count);
  });

  it('the compare-link rule mirrors the SDK isAppRelativePath on both sides of every case', () => {
    const cases = [
      ['app path with query', '/analysis/compare?x=1', true],
      ['percent-encoded space', '/ok%20path?x=1', true],
      ['colon in the path', '/note:x', false],
      ['fragment', '/a#frag', false],
      ['inner double slash', '/a//b', false],
      ['backslash', '/\\evil', false],
      ['protocol-relative', '//evil.example/x', false],
      ['absolute URL', 'https://x.example/a', false],
      ['bare word', 'compare', false],
      ['empty', '', false],
      ['percent-encoded protocol-relative', '/%2F%2Fevil.example/x', false],
      ['broken percent escape', '/bad%escape', false],
      ['TAB after the slash', '/\t/evil.example/x', false],
      ['CR after the slash', '/\r/evil.example/x', false],
      ['LF after the slash', '/\n/evil.example/x', false],
      ['NUL', '/a\u0000b', false],
      ['DEL', '/a\u007Fb', false],
    ] as const;
    for (const [name, value, expected] of cases) {
      expect(appRelativePath(value), name).toBe(expected);
      expect(isAppRelativePath(value), name).toBe(expected);
    }
  });

  it.each(['itemCreate', 'itemUpdate'] as const)('%s validates every key and string inside origin.context recursively', (op) => {
    const base = op === 'itemCreate' ? { problem: 'p' } : { itemId: ID };
    const origin = (context: Record<string, unknown>) => ({ ...base, origin: { menuId: 'm', context } });
    expect(codes(op, origin({ q: 'bad\u0000value' }))).toEqual(['origin.context:malformed']);
    expect(codes(op, origin({ list: [{ deep: { k: 'x\ud800y' } }] }))).toEqual(['origin.context:malformed']);
    expect(codes(op, origin({ '\u0000': 1 }))).toEqual(['origin.context:malformed']);
    expect(codes(op, origin({ arr: ['ok', '\udf41'] }))).toEqual(['origin.context:malformed']);
    expect(codes(op, origin({ n: { x: 2, y: [1, 'two', null, true] } }))).toEqual([]);
  });

  it('refuses origin.context nested deeper than ORIGIN_CONTEXT_MAX_DEPTH (the context itself is level 1)', () => {
    const deep = (levels: number): Record<string, unknown> => {
      let node: Record<string, unknown> = { leaf: 0 };
      for (let i = 1; i < levels; i++) node = { v: node };
      return node;
    };
    const origin = (context: Record<string, unknown>) => ({ problem: 'p', origin: { menuId: 'm', context } });
    expect(codes('itemCreate', origin(deep(ORIGIN_CONTEXT_MAX_DEPTH - 1)))).toEqual([]);
    expect(codes('itemCreate', origin(deep(ORIGIN_CONTEXT_MAX_DEPTH)))).toEqual(['origin.context:malformed']);
  });

  it('requires the quest pair together and a reason on reopen', () => {
    expect(codes('itemLinkQuest', { itemId: ID, questId: 'q', questTitle: null })).toContain('questTitle:required');
    expect(codes('itemReopen', { itemId: ID, reason: ' ' })).toEqual(['reason:required']);
  });

  it('lists every key the schemas accept', () => {
    for (const keys of Object.values(ITEM_INPUT_KEYS)) expect(new Set(keys).size).toBe(keys.length);
  });
});
