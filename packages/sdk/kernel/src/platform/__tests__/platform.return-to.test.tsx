import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import { PlatformProvider, useHostPlatform, type LinkOptions, type ReturnOrigin } from '../platform';
import { createRegistry } from '../../registry/registry';
import { stripReturnToFromUrl } from '../../links/return-to';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '../../testing';
import { groupId, spaceId } from '@ap/contracts';

const noFeatures = { export: false, savedView: false, annotate: false, compare: false };
const entry = (id: string, group: string, path: string, pageKeys: string[], extra: object = {}) => ({
  id, group: groupId(group), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const, requiresScope: false, context: noContext, pageType: 'analysis' as const, features: noFeatures, pageKeys, ...extra,
});
// `fo` carries `returnTo` (like the FeedbackOps space); `plain` carries nothing; `g-detail` is a global menu that accepts a way back.
const registry = createRegistry({
  spaces: [
    testSpace({ id: spaceId('fo'), label: { ko: '피드백', en: 'Feedback' }, homeMenuId: 'fo-a', carriedPageKeys: ['m', 'returnTo'] }),
    testSpace({ id: spaceId('plain'), label: { ko: '분석', en: 'Analysis' }, homeMenuId: 'origin' }),
  ],
  groups: [
    { id: groupId('fo'), label: { ko: '피드백', en: 'Feedback' }, icon: House, space: spaceId('fo') },
    { id: groupId('plain'), label: { ko: '분석', en: 'Analysis' }, icon: House, space: spaceId('plain') },
    { id: groupId('global'), label: { ko: '전역', en: 'Global' }, icon: House, space: null },
  ],
  menus: [
    entry('fo-a', 'fo', '/fo/a', ['m', 'returnTo'], { primary: true }),
    entry('fo-b', 'fo', '/fo/b', ['m', 'returnTo']),
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
    const href = linkFrom(withOrigin('/fo/a?v=1&m=x'), 'fo-b', { returnTo: true });
    expect(query(href).getAll('returnTo')).toEqual([ORIGIN]);
    expect(query(href).get('m')).toBe('x');
  });

  it("(a') a same-space link with no carried returnTo never mints one", () => {
    expect(query(linkFrom('/fo/a?v=1&m=x', 'fo-b', { returnTo: true })).has('returnTo')).toBe(false);
  });

  it.each([
    { name: 'FO screen with a carried returnTo → a plain-space detail', url: withOrigin('/fo/a?v=1&m=x'), target: 'p-detail' },
    { name: 'FO screen without a returnTo → a plain-space detail', url: '/fo/a?v=1&m=x', target: 'p-detail' },
    { name: 'FO screen → a global detail', url: withOrigin('/fo/a?v=1'), target: 'g-detail' },
  ])('(b) $name: returnTo is the current FO URL', ({ url, target }) => {
    const href = linkFrom(url, target, { returnTo: true });
    expect(query(href).getAll('returnTo')).toEqual([window.location.pathname + window.location.search]);
  });

  it('(b) a caller outside the FO space keeps appending its own URL', () => {
    const href = linkFrom('/plain/origin?v=1', 'p-detail', { returnTo: true });
    expect(query(href).getAll('returnTo')).toEqual(['/plain/origin?v=1']);
  });

  it('(c) leaving the FO space drops returnTo', () => {
    expect(query(linkFrom(withOrigin('/fo/a?v=1'), 'origin')).has('returnTo')).toBe(false);
    cleanup();
    expect(query(linkFrom(withOrigin('/fo/a?v=1'), 'g-detail')).has('returnTo')).toBe(false);
  });

  it.each([
    { name: 'an accepted origin in another space', url: withOrigin('/fo/a?v=1'), accepted: true, spaceLabel: { ko: '분석', en: 'Analysis' } },
    { name: 'an accepted global-menu origin', url: `/fo/a?v=1&returnTo=${encodeURIComponent('/g/detail?v=1')}`, accepted: true, spaceLabel: null },
    { name: 'an unknown path', url: `/fo/a?v=1&returnTo=${encodeURIComponent('/nowhere?v=1')}`, accepted: false, spaceLabel: null },
    { name: 'an absolute URL', url: `/fo/a?v=1&returnTo=${encodeURIComponent('https://evil.test/origin')}`, accepted: false, spaceLabel: null },
    { name: 'no returnTo', url: '/fo/a?v=1', accepted: false, spaceLabel: null },
  ])('(d) ReturnOrigin for $name', ({ url, accepted, spaceLabel }) => {
    const origin = originFrom(url);
    expect(origin.accepted).toBe(accepted);
    expect(origin.spaceLabel).toEqual(spaceLabel);
  });

  it('(e) the last-screen and recents stores never keep returnTo, and keep the canonical address of an alias entry', async () => {
    mountAt(withOrigin('/fo/b?v=1&m=x'));
    await waitFor(() => expect(sessionStorage.getItem('platform:space-last:u1')).not.toBeNull());
    expect(JSON.parse(sessionStorage.getItem('platform:space-last:u1')!)).toEqual({ fo: '/fo/fo-b?v=1&m=x' });
    await waitFor(() => expect(localStorage.getItem('platform:recent:u1')).not.toBeNull());
    expect(JSON.parse(localStorage.getItem('platform:recent:u1')!).map((r: { url: string }) => r.url)).toEqual(['/fo/fo-b?v=1&m=x']);
  });
});

describe('stripReturnToFromUrl', () => {
  it.each([
    ['/fo/b?v=1&returnTo=%2Forigin%3Fv%3D1&m=x', '/fo/b?v=1&m=x'],
    ['/fo/b?returnTo=%2Forigin', '/fo/b'],
    ['/fo/b?v=1&m=a%20b', '/fo/b?v=1&m=a%20b'],
    ['/fo/b', '/fo/b'],
  ])('%s → %s', (input, expected) => expect(stripReturnToFromUrl(input)).toBe(expected));
});
