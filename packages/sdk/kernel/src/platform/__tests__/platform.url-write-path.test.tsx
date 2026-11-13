import { act, cleanup, render, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineEndpoint, groupId, spaceId, type ApiResponse, type EndpointSpec, type PlatformAdapter } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '../../index';
import { useHostPlatform } from '../../host';
import { useMenuQuery } from '../../query/query';
import { noContext, testAdapter, testSession, testSpace } from '../../testing';

// #1875: the open-redirect check guards the destination PATH; codec-encoded query values (`#`, `\`, `//` once decoded) are not a redirect.
const features = { export: false, savedView: false, annotate: false, compare: false };
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'period' })],
  groups: [{ id: groupId('g'), label: { ko: '그룹', en: 'G' }, icon: House, space: spaceId('mars') }],
  menus: [{
    id: 'period', group: groupId('g'), primary: true, label: { ko: '기간', en: 'Period' }, description: { ko: '', en: '' }, path: '/mars/period', icon: House,
    permission: 'platform:view' as const, requiresScope: false, context: { ...noContext, time: 'apply' as const, lot: 'apply' as const },
    pageType: 'analysis' as const, features, pageKeys: ['q', 'returnTo'],
  }],
});
type Data = { ok: true };
const endpoint: EndpointSpec<Record<string, never>, Data> = defineEndpoint<Record<string, never>, Data>({
  id: 'fixture.period', menuId: 'period', paramKeys: {}, permission: 'platform:view', requiresScope: false,
  context: { time: 'apply', lot: 'apply' }, kinds: ['collection'], mergeTimeDomain: false,
});
const answer: ApiResponse<Data> = { outcome: 'ok', data: { ok: true }, assessments: [{ kind: 'collection', state: 'clear' }], trust: null, correlationId: 'fixture-1' };

let platform: ReturnType<typeof useHostPlatform>;
let status = '';
function Probe() { platform = useHostPlatform(); return null; }
function QueryProbe() { status = useMenuQuery(endpoint, {}).status; return null; }
const session = testSession(['platform:view']);
function mount(url: string, over: Partial<PlatformAdapter> = {}) {
  window.history.replaceState(null, '', url);
  const adapter = testAdapter({ session: () => session, menuQuery: async () => answer, ...over });
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Probe /><QueryProbe /></PlatformProvider></I18nProvider>);
}
const PERIOD = 'from=2026-09-25T09%3A00%3A00&to=2026-09-26T09%3A00%3A00';
const search = () => new URLSearchParams(window.location.search);

afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('URL writes check only the path (#1875)', () => {
  it('setGlobal with a lot id holding `#` changes the address', () => {
    mount(`/mars/period?v=1&${PERIOD}`);
    act(() => platform.setGlobal({ lotIds: ['LOT#1'] }));
    expect(window.location.search).toContain('lotIds=LOT%231');
    expect(platform.global.lotIds).toEqual(['LOT#1']);
  });

  it.each(['a//b', 'a\\b', 'a#b'])('setPage writes q=%s', value => {
    mount(`/mars/period?v=1&${PERIOD}`);
    act(() => platform.setPage({ q: value }));
    expect(search().get('q')).toBe(value);
    expect(platform.pageParam('q')).toBe(value);
  });

  it('an address entered with lotIds=LOT%231 and no period still materializes the default period, the query leaves loading, and a later write works', async () => {
    mount('/mars/period?v=1&lotIds=LOT%231');
    await waitFor(() => expect(search().get('from')).not.toBeNull());
    expect(search().get('lotIds')).toBe('LOT#1');
    await waitFor(() => expect(status).not.toBe('loading'));
    expect(status).toBe('done');
    act(() => platform.setGlobal({ from: '2026-09-20T00:00:00', to: '2026-09-21T00:00:00' }));
    expect(search().get('from')).toBe('2026-09-20T00:00:00');
    expect(search().get('lotIds')).toBe('LOT#1');
  });

  it.each(['//evil.example/x', 'http://x', '/\\evil.example', '/%2F%2Fevil.example', 'javascript:1'])('a non-app-relative path %s is refused and reported', async target => {
    const reportClientError = vi.fn(async () => ({ accepted: true as const }));
    mount(`/mars/period?v=1&${PERIOD}`, { reportClientError });
    const before = window.location.pathname + window.location.search;
    let moved = true;
    act(() => { moved = platform.navigate(target); });
    expect(moved).toBe(false);
    expect(window.location.pathname + window.location.search).toBe(before);
    expect(reportClientError).toHaveBeenCalledTimes(1);
    expect(reportClientError.mock.calls[0]).toMatchObject([{ name: 'NavTargetRefused', menuId: 'period' }]);
  });

  it('a same-address write is a quiet no-op, not a reported refusal', () => {
    const reportClientError = vi.fn(async () => ({ accepted: true as const }));
    mount(`/mars/period?v=1&${PERIOD}`, { reportClientError });
    let moved = true;
    act(() => { moved = platform.navigate(platform.url); });
    expect(moved).toBe(false);
    expect(reportClientError).not.toHaveBeenCalled();
  });

  it('returnTo=//evil is still refused as a way back', () => {
    mount(`/mars/period?v=1&${PERIOD}&returnTo=${encodeURIComponent('//evil.example/x')}`);
    expect(platform.returnOrigin().accepted).toBe(false);
    expect(platform.returnTarget()).not.toContain('evil');
  });
});
