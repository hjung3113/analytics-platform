import { House } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { createRegistry } from '@ap/kernel';
import { noContext, testSpace } from '@ap/kernel/testing';
import { emptyGlobal, groupId, parseQuery, spaceId, type GlobalContext } from '@ap/contracts';
import { buildShareLink } from '../shareLink';

const menu = (id: string, path: string) => ({
  id, group: groupId('overview'), primary: id === 'home', label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: noContext, pageType: 'overview' as const, features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['q'],
});
const registry = createRegistry({
  spaces: [testSpace({ id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'home' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [menu('home', '/'), menu('prod', '/p/:id')],
});
const list = { menu: registry.menus[0]!, params: {} };
const detail = { menu: registry.menus[1]!, params: { id: 'a b' } };
const absoluteUrl = (url: string) => `https://app.test/base${url}`;
const GLOBAL: GlobalContext = { ...emptyGlobal, scopeId: 'MEM', from: '2026-10-20T09:00:00', to: '2026-10-23T18:00:00', lineNames: ['L1'], selection: ['e1', 'e2'] };
const base = { route: list, global: GLOBAL, page: [['q', 'x']] as [string, string][], absoluteUrl };

describe('buildShareLink', () => {
  it('menu: the absolute canonical path with route params and no query or hash', () => {
    expect(buildShareLink({ ...base, kind: 'menu', route: detail })).toEqual({ ok: true, href: 'https://app.test/base/mars/prod/a%20b' });
    const result = buildShareLink({ ...base, kind: 'menu' });
    expect(result).toEqual({ ok: true, href: 'https://app.test/base/mars/home' });
  });

  it('conditions: path + the v1 query that parses back to exactly the applied state', () => {
    const result = buildShareLink({ ...base, kind: 'conditions', route: detail });
    expect(result.ok).toBe(true);
    const url = new URL((result as { href: string }).href);
    expect(url.pathname).toBe('/base/mars/prod/a%20b');
    expect(url.searchParams.get('v')).toBe('1');
    const parsed = parseQuery(url.search, ['q']);
    expect(parsed.global).toEqual(GLOBAL);
    expect(parsed.page).toEqual([['q', 'x']]);
  });

  it('conditions: returnTo is never written, carried page keys stay', () => {
    const result = buildShareLink({ ...base, kind: 'conditions', page: [['q', 'x'], ['returnTo', '/origin?v=1']] });
    const href = (result as { href: string }).href;
    expect(href).not.toContain('returnTo');
    expect(new URL(href).searchParams.get('q')).toBe('x');
  });

  it.each([
    ['no route', { route: null }, 'no-route'],
    ['a missing route param', { route: { ...detail, params: {} } }, 'missing-param'],
    ['an empty route param', { route: { ...detail, params: { id: '' } } }, 'missing-param'],
    ['a serializer error', { absoluteUrl: () => { throw new Error('boom'); } }, 'serialize'],
    ['an address over the bound', { maxLength: 20 }, 'too-long'],
  ] as const)('conditions with %s is not ok (%s), never a bare path', (_name, over, reason) => {
    expect(buildShareLink({ ...base, kind: 'conditions', ...over })).toEqual({ ok: false, reason });
  });

  it('conditions carry hidden page pairs (the copied link only); the bound counts them', () => {
    const hidden = { ...base, page: [['q', 'x'], ['filter', 'a:1,2'], ['filter', 'b']] as [string, string][] };
    const result = buildShareLink({ ...hidden, kind: 'conditions' });
    expect(result.ok && parseQuery(new URL(result.href).search, ['q', 'filter'], { repeated: ['filter'] }).page).toEqual(hidden.page);
    const short = buildShareLink({ ...base, kind: 'conditions' });
    expect(short.ok).toBe(true);
    const limit = short.ok ? short.href.length + 5 : 0;
    expect(buildShareLink({ ...base, kind: 'conditions', maxLength: limit }).ok).toBe(true);
    expect(buildShareLink({ ...hidden, kind: 'conditions', maxLength: limit })).toEqual({ ok: false, reason: 'too-long' });
    expect(buildShareLink({ ...hidden, kind: 'menu' })).toEqual({ ok: true, href: 'https://app.test/base/mars/home' });
  });

  it('menu over the bound is also refused', () => {
    expect(buildShareLink({ ...base, kind: 'menu', maxLength: 5 })).toEqual({ ok: false, reason: 'too-long' });
  });
});
