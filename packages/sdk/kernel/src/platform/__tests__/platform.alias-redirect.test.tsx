import { act, cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId, type UsageEvent } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createBasePathLocation, createRegistry } from '../../index';
import { useHostPlatform } from '../../host';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '../../testing';

const features = { export: false, savedView: false, annotate: false, compare: false };
const entry = (partial: { id: string; path: string; group: string; pageKeys: string[]; primary?: boolean; aliases?: string[]; context?: typeof noContext; initializesMetric?: boolean }) => ({
  label: { ko: partial.id, en: partial.id }, description: { ko: '', en: '' }, icon: House,
  permission: 'platform:view' as const, requiresScope: false, context: noContext, pageType: 'overview' as const, features,
  ...partial, group: groupId(partial.group),
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'steps' })],
  groups: [
    { id: groupId('mars'), label: { ko: '설비', en: 'Equipment' }, icon: House, space: spaceId('mars') },
    { id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: null },
  ],
  menus: [
    entry({ id: 'steps', group: 'mars', path: '/hw-time/steps', pageKeys: ['returnTo', 'tab'], primary: true }),
    entry({ id: 'timed', group: 'mars', path: '/timed', pageKeys: [], context: { ...noContext, time: 'apply' } }),
    entry({ id: 'equip', group: 'mars', path: '/equipment', pageKeys: ['q'] }),
    entry({ id: 'equipDetail', group: 'mars', path: '/equipment/:id', pageKeys: [] }),
    entry({ id: 'metric', group: 'mars', path: '/metric', pageKeys: [], context: { ...noContext, metric: 'apply' }, initializesMetric: true }),
    entry({ id: 'home', group: 'overview', path: '/home', aliases: ['/'], pageKeys: [], primary: true }),
  ],
  platformHomeMenuId: 'home',
});

let platform: ReturnType<typeof useHostPlatform>;
function Probe() {
  platform = useHostPlatform();
  return <p data-testid="ready">{platform.pathname}</p>;
}
function mount(url: string, events: UsageEvent[] = [], base?: string, publishedMetrics: () => { metricId: string; publishedVersion: string }[] = () => []) {
  const session = testSession(['platform:view']);
  const adapter = testAdapter({ publishedMetrics, session: () => session, recordUsage: async batch => { events.push(...batch); return { accepted: batch.length }; } });
  const location = base ? createBasePathLocation(base) : undefined;
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry} location={location}><Probe /></PlatformProvider></I18nProvider>);
}
const here = () => window.location.pathname + window.location.search + window.location.hash;

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('alias entry redirects to the canonical path (ADR-0093)', () => {
  const search = '?v=1&unknown=%2f%20x&tab=a&focus=EQ-1&returnTo=%2Fequipment%3Fv%3D1';

  it('replaces the legacy path once, keeping search and hash byte for byte, with no new history entry', () => {
    window.history.replaceState(null, '', `/hw-time/steps${search}#frag`);
    const length = window.history.length;
    const replace = vi.spyOn(window.history, 'replaceState');
    const push = vi.spyOn(window.history, 'pushState');
    mount('');
    expect(here()).toBe(`/mars/steps${search}#frag`);
    expect(window.history.length).toBe(length);
    expect(push).not.toHaveBeenCalled();
    expect(platform.route?.viaAlias).toBe(false);
    expect(screen.getByTestId('ready').textContent).toBe('/mars/steps');
    // Every write moved to the canonical path: nothing was written on the legacy one.
    expect(replace.mock.calls.every(call => String(call[2]).startsWith('/mars/steps'))).toBe(true);
  });

  it('does not write at all when the canonical URL is opened', () => {
    window.history.replaceState(null, '', `/mars/steps${search}`);
    const replace = vi.spyOn(window.history, 'replaceState');
    mount('');
    expect(replace).not.toHaveBeenCalled();
    expect(here()).toBe(`/mars/steps${search}`);
  });

  it('materializes the default period on the canonical path, never on the legacy one', () => {
    window.history.replaceState(null, '', '/timed?v=1');
    const replace = vi.spyOn(window.history, 'replaceState');
    mount('');
    const targets = replace.mock.calls.map(call => String(call[2]));
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every(target => target.startsWith('/mars/timed'))).toBe(true);
    expect(here()).toMatch(/^\/mars\/timed\?v=1&.*from=/);
  });

  it('opens / on the platform home /home', () => {
    window.history.replaceState(null, '', '/');
    mount('');
    expect(here()).toBe('/home');
    expect(platform.route?.menu.id).toBe('home');
    expect(registry.platformHome?.id).toBe('home');
  });

  it('counts one usage entry for the stay, under the canonical path', async () => {
    window.history.replaceState(null, '', `/hw-time/steps${search}`);
    const events: UsageEvent[] = [];
    mount('', events);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    const entries = events.filter(event => event.name === 'entry');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ menuId: 'steps', path: '/mars/steps' });
  });

  it('records the canonical address as the visit, not the legacy one', () => {
    window.history.replaceState(null, '', '/hw-time/steps?v=1');
    mount('');
    expect(JSON.parse(sessionStorage.getItem('platform:space-last:u1') ?? 'null')).toEqual({ mars: '/mars/steps?v=1' });
    expect(JSON.parse(localStorage.getItem('platform:recent:u1') ?? '[]').map((r: { url: string }) => r.url)).toEqual(['/mars/steps?v=1']);
  });

  it('works under a base path: the base stays at the boundary', () => {
    window.history.replaceState(null, '', `/analytics-platform/demo/hw-time/steps${search}#frag`);
    const length = window.history.length;
    mount('', [], '/analytics-platform/demo/');
    expect(here()).toBe(`/analytics-platform/demo/mars/steps${search}#frag`);
    expect(platform.url).toBe(`/mars/steps${search}`);
    expect(window.history.length).toBe(length);
  });

  it('keeps a query value and a route param that the return-link guard rejects (decoded # and :), ending on the canonical URL with an actual page', () => {
    window.history.replaceState(null, '', '/equipment?v=1&scopeId=MEM&q=C%23');
    const length = window.history.length;
    mount('');
    expect(here()).toBe('/mars/equip?v=1&scopeId=MEM&q=C%23');
    expect(platform.route).toMatchObject({ menu: { id: 'equip' }, viaAlias: false });
    expect(window.history.length).toBe(length);
    cleanup();
    window.history.replaceState(null, '', '/equipment/EQ%3A1?v=1&scopeId=MEM');
    mount('');
    expect(here()).toBe('/mars/equip-detail/EQ%3A1?v=1&scopeId=MEM');
    expect(platform.route).toMatchObject({ menu: { id: 'equipDetail' }, params: { id: 'EQ:1' }, viaAlias: false });
  });

  it('writes the alias path change as one history call and keeps the fragment through the default-period materialization', () => {
    window.history.replaceState(null, '', '/timed?v=1#frag');
    const replace = vi.spyOn(window.history, 'replaceState');
    mount('');
    const targets = replace.mock.calls.map(call => String(call[2]));
    expect(targets.filter(target => !target.includes('from='))).toEqual(['/mars/timed?v=1#frag']);
    expect(targets.length).toBe(2);
    expect(targets.every(target => target.endsWith('#frag'))).toBe(true);
    expect(here()).toMatch(/^\/mars\/timed\?v=1&.*from=.*#frag$/);
  });

  it('keeps the fragment through the metric-version materialization', () => {
    window.history.replaceState(null, '', '/metric?v=1&metricId=cycle#frag');
    mount('', [], undefined, () => [{ metricId: 'cycle', publishedVersion: '3' }]);
    expect(here()).toMatch(/^\/mars\/metric\?.*metricVersion=3.*#frag$/);
  });

  it('keeps the fragment of the materialization under a base path', () => {
    window.history.replaceState(null, '', '/analytics-platform/demo/timed?v=1#frag');
    mount('', [], '/analytics-platform/demo/');
    expect(here()).toMatch(/^\/analytics-platform\/demo\/mars\/timed\?v=1&.*from=.*#frag$/);
  });
});
