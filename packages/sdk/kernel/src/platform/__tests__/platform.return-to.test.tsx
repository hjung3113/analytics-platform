import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import { PlatformProvider, useHostPlatform, type LinkOptions, type ReturnOrigin } from '../platform';
import { createRegistry } from '../../registry/registry';
import { stripReturnToFromUrl } from '../../links/return-to';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '../../testing';
import { carrySetId, groupId, spaceId } from '@ap/contracts';

const noFeatures = { export: false, savedView: false, annotate: false, compare: false };
const entry = (id: string, group: string, path: string, pageKeys: string[], extra: object = {}) => ({
  id, group: groupId(group), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const, requiresScope: false, context: noContext, pageType: 'analysis' as const, features: noFeatures, pageKeys, ...extra,
});
// `carry` carries `returnTo` (like a feature space); `plain` carries nothing; `g-detail` is a global menu that accepts a way back.
const registry = createRegistry({
  carrySets: [{ id: carrySetId('carry'), pageKeys: ['m', 'returnTo'] }],
  spaces: [
    testSpace({ id: spaceId('carry'), label: { ko: '피드백', en: 'Feedback' }, homeMenuId: 'carry-a' }),
    testSpace({ id: spaceId('plain'), label: { ko: '분석', en: 'Analysis' }, homeMenuId: 'origin' }),
  ],
  groups: [
    { id: groupId('carry'), label: { ko: '피드백', en: 'Feedback' }, icon: House, space: spaceId('carry') },
    { id: groupId('plain'), label: { ko: '분석', en: 'Analysis' }, icon: House, space: spaceId('plain') },
    { id: groupId('global'), label: { ko: '전역', en: 'Global' }, icon: House, space: null },
  ],
  menus: [
    entry('carry-a', 'carry', '/carry/a', ['m', 'returnTo'], { primary: true, carrySet: carrySetId('carry') }),
    entry('carry-b', 'carry', '/carry/b', ['m', 'returnTo'], { carrySet: carrySetId('carry') }),
    entry('origin', 'plain', '/origin', [], { primary: true }),
    entry('p-detail', 'plain', '/plain/detail', ['returnTo']),
    entry('g-detail', 'global', '/g/detail', ['returnTo'], { primary: true }),
  ],
});

const ORIGIN = '/origin?v=1&from=2026-10-01T00:00:00&to=2026-10-02T00:00:00';
const withOrigin = (path: string) => `${path}${path.includes('?') ? '&' : '?'}returnTo=${encodeURIComponent(ORIGIN)}`;
const query = (href: string) => new URLSearchParams(href.slice(href.indexOf('?') + 1));

let host: ReturnType<typeof useHostPlatform> | null = null;
function Probe() {
  host = useHostPlatform();
  return <p data-testid="ready">ready</p>;
}
function mountAt(url: string) {
  window.history.replaceState(null, '', url);
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
  screen.getByTestId('ready');
  return host!;
}
const linkFrom = (url: string, menuId: string, options?: LinkOptions) => mountAt(url).resolveLink(menuId, options).href;
const originFrom = (url: string): ReturnOrigin => mountAt(url).returnOrigin();

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
});
afterEach(() => { cleanup(); host = null; vi.unstubAllGlobals(); });

describe('returnTo in a space that carries it (#760, ADR-0081 UX-10)', () => {
  it('(a) a same-space link keeps the carried returnTo exactly once, whatever options.returnTo says', () => {
    const href = linkFrom(withOrigin('/carry/a?v=1&m=x'), 'carry-b', { returnTo: true });
    expect(query(href).getAll('returnTo')).toEqual([ORIGIN]);
    expect(query(href).get('m')).toBe('x');
  });

  it("(a') a same-space link with no carried returnTo never mints one", () => {
    expect(query(linkFrom('/carry/a?v=1&m=x', 'carry-b', { returnTo: true })).has('returnTo')).toBe(false);
  });

  it.each([
    { name: 'carrying screen with a carried returnTo → a plain-space detail', url: withOrigin('/carry/a?v=1&m=x'), target: 'p-detail' },
    { name: 'carrying screen without a returnTo → a plain-space detail', url: '/carry/a?v=1&m=x', target: 'p-detail' },
    { name: 'carrying screen → a global detail', url: withOrigin('/carry/a?v=1'), target: 'g-detail' },
  ])('(b) $name: returnTo is the current URL', ({ url, target }) => {
    const href = linkFrom(url, target, { returnTo: true });
    expect(query(href).getAll('returnTo')).toEqual([window.location.pathname + window.location.search]);
  });

  it('(b) a caller outside the carrying space keeps appending its own URL', () => {
    const href = linkFrom('/plain/origin?v=1', 'p-detail', { returnTo: true });
    expect(query(href).getAll('returnTo')).toEqual(['/plain/origin?v=1']);
  });

  it('(c) leaving the carrying space drops returnTo', () => {
    expect(query(linkFrom(withOrigin('/carry/a?v=1'), 'origin')).has('returnTo')).toBe(false);
    cleanup();
    expect(query(linkFrom(withOrigin('/carry/a?v=1'), 'g-detail')).has('returnTo')).toBe(false);
  });

  it.each([
    { name: 'an accepted origin in another space', url: withOrigin('/carry/a?v=1'), accepted: true, spaceLabel: { ko: '분석', en: 'Analysis' } },
    { name: 'an accepted global-menu origin', url: `/carry/a?v=1&returnTo=${encodeURIComponent('/g/detail?v=1')}`, accepted: true, spaceLabel: null },
    { name: 'an unknown path', url: `/carry/a?v=1&returnTo=${encodeURIComponent('/nowhere?v=1')}`, accepted: false, spaceLabel: null },
    { name: 'an absolute URL', url: `/carry/a?v=1&returnTo=${encodeURIComponent('https://evil.test/origin')}`, accepted: false, spaceLabel: null },
    { name: 'no returnTo', url: '/carry/a?v=1', accepted: false, spaceLabel: null },
  ])('(d) ReturnOrigin for $name', ({ url, accepted, spaceLabel }) => {
    const origin = originFrom(url);
    expect(origin.accepted).toBe(accepted);
    expect(origin.spaceLabel).toEqual(spaceLabel);
  });

  it('(e) the last-screen and recents stores never keep returnTo, and keep the canonical address of an alias entry', async () => {
    mountAt(withOrigin('/carry/b?v=1&m=x'));
    await waitFor(() => expect(sessionStorage.getItem('platform:space-last:u1')).not.toBeNull());
    expect(JSON.parse(sessionStorage.getItem('platform:space-last:u1')!)).toEqual({ carry: '/carry/carry-b?v=1&m=x' });
    await waitFor(() => expect(localStorage.getItem('platform:recent:u1')).not.toBeNull());
    expect(JSON.parse(localStorage.getItem('platform:recent:u1')!).map((r: { url: string }) => r.url)).toEqual(['/carry/carry-b?v=1&m=x']);
  });
});

describe('stripReturnToFromUrl', () => {
  it.each([
    ['/carry/b?v=1&returnTo=%2Forigin%3Fv%3D1&m=x', '/carry/b?v=1&m=x'],
    ['/carry/b?returnTo=%2Forigin', '/carry/b'],
    ['/carry/b?v=1&m=a%20b', '/carry/b?v=1&m=a%20b'],
    ['/carry/b', '/carry/b'],
  ])('%s → %s', (input, expected) => expect(stripReturnToFromUrl(input)).toBe(expected));
});

// Reload / Back / Forward across a carry set that spans two spaces and a global menu (#1099b): the first accepted origin must ride the real history entries.
describe('a carry set across spaces and a global menu survives Back, Forward and reload (#1099b)', () => {
  const SPAN = carrySetId('span');
  const member = (id: string, group: string, path: string, extra: object = {}) => entry(id, group, path, ['k', 'returnTo'], { carrySet: SPAN, ...extra });
  const spanRegistry = createRegistry({
    carrySets: [{ id: SPAN, pageKeys: ['k', 'returnTo'] }],
    spaces: [
      testSpace({ id: spaceId('left'), label: { ko: '왼쪽', en: 'Left' }, homeMenuId: 'l1' }),
      testSpace({ id: spaceId('right'), label: { ko: '오른쪽', en: 'Right' }, homeMenuId: 'origin' }),
    ],
    groups: [
      { id: groupId('left'), label: { ko: '왼쪽', en: 'Left' }, icon: House, space: spaceId('left') },
      { id: groupId('right'), label: { ko: '오른쪽', en: 'Right' }, icon: House, space: spaceId('right') },
      { id: groupId('global'), label: { ko: '전역', en: 'Global' }, icon: House, space: null },
    ],
    menus: [
      member('l1', 'left', '/l/one', { primary: true }),
      member('r1', 'right', '/r/one'),
      member('g1', 'global', '/g/one', { primary: true }),
      entry('origin', 'right', '/origin', [], { primary: true }),
      entry('locked', 'right', '/locked', [], { permission: 'console:access' as const }),
    ],
  });
  let spanHost: ReturnType<typeof useHostPlatform> | null = null;
  function SpanProbe() {
    spanHost = useHostPlatform();
    return <p data-testid="ready">{spanHost.url}</p>;
  }
  function mountSpan(url: string) {
    window.history.replaceState(null, '', url);
    const session = testSession(['platform:view']);
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={spanRegistry}><SpanProbe /></PlatformProvider></I18nProvider>);
  }
  const at = (url: string) => waitFor(() => expect(screen.getByTestId('ready').textContent).toBe(url));
  const carried = () => ({ k: spanHost!.pageParam('k'), returnTo: spanHost!.pageParam('returnTo') });

  it('keeps k and the first accepted origin through every step, and the return row still points at the origin', async () => {
    const start = `/left/l1?v=1&k=x&returnTo=${encodeURIComponent(ORIGIN)}`;
    mountSpan(start);
    await at(start);
    const toRight = spanHost!.resolveLink('r1').href;
    act(() => { spanHost!.navigate(toRight); });
    await at(toRight);
    expect(spanHost!.route?.menu.id).toBe('r1');
    const toGlobal = spanHost!.resolveLink('g1', { returnTo: true }).href;
    act(() => { spanHost!.navigate(toGlobal); });
    await at(toGlobal);
    expect(spanHost!.route?.menu.id).toBe('g1');
    expect(carried()).toEqual({ k: 'x', returnTo: ORIGIN });

    act(() => { window.history.back(); });
    await at(toRight);
    expect(spanHost!.route?.menu.id).toBe('r1');
    expect(carried()).toEqual({ k: 'x', returnTo: ORIGIN });
    act(() => { window.history.back(); });
    await at(start);
    act(() => { window.history.forward(); });
    await at(toRight);
    expect(carried()).toEqual({ k: 'x', returnTo: ORIGIN });

    // Reload: a fresh mount at the address the browser kept.
    cleanup();
    const reloaded = window.location.pathname + window.location.search;
    mountSpan(reloaded);
    await at(reloaded);
    expect(carried()).toEqual({ k: 'x', returnTo: ORIGIN });
    const origin = spanHost!.returnOrigin();
    expect(origin.accepted).toBe(true);
    expect(origin.href).toBe(ORIGIN);
  });

  it.each([
    { name: 'a retired path', origin: '/nowhere?v=1' },
    { name: 'a menu the user may not open', origin: '/locked?v=1' },
  ])('$name: the origin crosses spaces as data but is never accepted, before or after reload', async ({ origin }) => {
    const start = `/left/l1?v=1&k=x&returnTo=${encodeURIComponent(origin)}`;
    mountSpan(start);
    await at(start);
    expect(spanHost!.returnOrigin().accepted).toBe(false);
    const toRight = spanHost!.resolveLink('r1').href;
    act(() => { spanHost!.navigate(toRight); });
    await at(toRight);
    expect(spanHost!.route?.menu.id).toBe('r1');
    expect(spanHost!.returnOrigin().accepted).toBe(false);
    expect(spanHost!.returnOrigin().href).not.toBe(origin);
    act(() => { window.history.back(); });
    await at(start);
    cleanup();
    mountSpan(window.location.pathname + window.location.search);
    await at(start);
    expect(carried().k).toBe('x');
    expect(spanHost!.returnOrigin().accepted).toBe(false);
  });

  it('an absolute-URL origin is never accepted on the source screen, whatever the link carries', async () => {
    mountSpan(`/left/l1?v=1&k=x&returnTo=${encodeURIComponent('https://evil.test/origin')}`);
    await waitFor(() => expect(spanHost!.route?.menu.id).toBe('l1'));
    expect(spanHost!.returnOrigin().accepted).toBe(false);
  });
});
