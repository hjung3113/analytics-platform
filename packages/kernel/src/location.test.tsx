import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import { createBrowserLocation, createBasePathLocation, type PlatformLocation, I18nProvider, PlatformProvider, PlatformLink, usePlatform, createRegistry } from './index';
import { hasDotSegment, isDotSegment } from './location';
import { noContext, testAdapter, testSession, testSpace } from './testing';

const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: 'overview', label: { ko: '홈', en: 'Home' }, icon: House, space: 'analytics' }],
  menus: [{ id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['tab'] }],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
let platform: ReturnType<typeof usePlatform>;
function Probe() {
  platform = usePlatform();
  return <PlatformLink href="/?v=1&tab=next">next</PlatformLink>;
}
function mount(location?: PlatformLocation) {
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry} location={location}><Probe /></PlatformProvider></I18nProvider>);
}
afterEach(() => { cleanup(); sessionStorage.clear(); });

describe('location boundary (06 §6.4)', () => {
  it('default reads and writes the exact existing bytes, ignoring hash', () => {
    const url = '/?v=1&tab=a%20b&extra=%2f';
    window.history.replaceState(null, '', url + '#ignored');
    const location = createBrowserLocation();
    expect(location.read()).toBe(url);
    expect(location.href(url)).toBe(url);
    expect(location.absoluteUrl(url)).toBe(window.location.origin + url);
    location.push('/?tab=%2F');
    expect(location.read()).toBe('/?tab=%2F');
    location.replace(url);
    expect(location.read()).toBe(url);
    mount();
    expect(platform.url).toBe(url);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/?v=1&tab=next');
    fireEvent.click(screen.getByRole('link'));
    expect(window.location.pathname + window.location.search).toBe('/?v=1&tab=next');
  });

  it.each(['/analytics-platform/demo/', '/analytics-platform/demo'])('strips/adds normalized base %s only at the boundary', base => {
    const prefix = '/analytics-platform/demo';
    window.history.replaceState(null, '', prefix + '/?v=1&scopeId=MEM&tab=a%20b');
    const location = createBasePathLocation(base);
    expect(location.read()).toBe('/?v=1&scopeId=MEM&tab=a%20b');
    location.push('/?v=1&tab=push');
    expect(window.location.pathname + window.location.search).toBe(prefix + '/?v=1&tab=push');
    location.replace('/?v=1&scopeId=MEM&tab=replace');
    mount(location);
    expect(platform.route?.menu.id).toBe('home');
    expect(platform.global.scopeId).toBe('MEM');
    expect(platform.absoluteUrl('/?tab=%2f')).toBe(window.location.origin + prefix + '/?tab=%2f');
    expect(screen.getByRole('link')).toHaveAttribute('href', prefix + '/?v=1&tab=next');
    fireEvent.click(screen.getByRole('link'), { ctrlKey: true });
    expect(platform.pageParam('tab')).toBe('replace');
    fireEvent.click(screen.getByRole('link'));
    expect(platform.url).toBe('/?v=1&tab=next');
    expect(window.location.pathname).toBe(prefix + '/');
    expect(JSON.parse(sessionStorage.getItem('platform:space-last:u1')!)).toEqual({ analytics: '/?v=1&tab=next' });
    act(() => { platform.navigate('/?v=1&tab=replaced', { replace: true }); });
    expect(window.location.search).toBe('?v=1&tab=replaced');
    act(() => { window.history.replaceState(null, '', prefix + '/?v=1&tab=pop'); window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(platform.url).toBe('/?v=1&tab=pop');
  });

  it.each(['/outside/', '/analytics-platform/democracy/', '/analytics-platform/demo'])('does not match paths outside the base: %s', pathname => {
    window.history.replaceState(null, '', pathname);
    mount(createBasePathLocation('/analytics-platform/demo/'));
    expect(platform.route).toBeNull();
  });

  it('root base behaves like the default adapter', () => {
    window.history.replaceState(null, '', '/?x=%20');
    const location = createBasePathLocation('/');
    expect(location.read()).toBe('/?x=%20');
    expect(location.href('/?x=%20')).toBe('/?x=%20');
  });

  it.each([
    ['/../../outside?v=1', '/outside?v=1'],
    ['/%2e%2e/%2e%2e/outside?v=1', '/outside?v=1'],
  ])('folds app-relative dot segments so every write stays inside the base: %s', (url, appUrl) => {
    window.history.replaceState(null, '', '/analytics-platform/demo/inside');
    const location = createBasePathLocation('/analytics-platform/demo/');
    const inside = '/analytics-platform/demo/outside?v=1';
    expect(location.href(url)).toBe(inside);
    location.push(url);
    expect(window.location.pathname + window.location.search).toBe(inside);
    expect(location.read()).toBe(appUrl);
    location.replace(url);
    expect(window.location.pathname + window.location.search).toBe(inside);
    expect(location.absoluteUrl(url)).toBe(window.location.origin + inside);
  });

  it('keeps Provider navigation with dot segments inside the base', () => {
    window.history.replaceState(null, '', '/analytics-platform/demo/inside?v=0');
    mount(createBasePathLocation('/analytics-platform/demo/'));
    act(() => { platform.navigate('/../../?v=1'); });
    expect(platform.url).toBe('/?v=1');
    expect(platform.route?.menu.id).toBe('home');
    expect(window.location.pathname + window.location.search).toBe('/analytics-platform/demo/?v=1');
  });

  it('round-trips a unicode base through its encoded browser pathname', () => {
    window.history.replaceState(null, '', '/%EB%B6%84%EC%84%9D/metrics?v=1');
    const location = createBasePathLocation('/분석/');
    expect(location.read()).toBe('/metrics?v=1');
    expect(location.href('/metrics?v=1')).toBe('/%EB%B6%84%EC%84%9D/metrics?v=1');
    location.push('/inside?v=2');
    expect(window.location.pathname + window.location.search).toBe('/%EB%B6%84%EC%84%9D/inside?v=2');
    expect(location.read()).toBe('/inside?v=2');
    expect(location.absoluteUrl('/inside?v=2')).toBe(window.location.origin + '/%EB%B6%84%EC%84%9D/inside?v=2');
  });

  it.each(['/demo/%2e%2e/app/', '/demo/%2E%2e/app/', '/demo/%2e/app/'])('rejects a base whose dot segments fold to another path: %s', base => {
    expect(() => createBasePathLocation(base)).toThrow();
  });

  it('rejects a base with an invalid percent escape (fail-closed)', () => {
    expect(() => createBasePathLocation('/demo/%zz/app/')).toThrow();
    expect(() => createBasePathLocation('/demo/%E0%A4%A/app/')).toThrow();
  });
});

describe('dot-segment check (one rule for basePath, module paths, routing and board panes)', () => {
  it.each(['.', '..', '%2e', '%2E', '%2e%2e', '%2E%2e', '.%2e', '%2e.'])('treats %s as a dot segment', segment => {
    expect(isDotSegment(segment)).toBe(true);
  });

  it.each(['%', '%zz', '%E0%A4%A', 'a%2'])('treats the invalid escape %s as a dot segment (fail-closed)', segment => {
    expect(isDotSegment(segment)).toBe(true);
  });

  it.each(['', 'a', '...', '.a', '%2e%2e%2e', 'MEM%2DPHOTO', '%EB%B6%84%EC%84%9D'])('passes the ordinary segment %s', segment => {
    expect(isDotSegment(segment)).toBe(false);
  });

  it('checks every segment of a pathname', () => {
    expect(hasDotSegment('/equipment/MEM-PHOTO-0103')).toBe(false);
    expect(hasDotSegment('/')).toBe(false);
    expect(hasDotSegment('/equipment/%2e%2e')).toBe(true);
    expect(hasDotSegment('/a/./b')).toBe(true);
    expect(hasDotSegment('/equipment/%zz')).toBe(true);
  });
});
