import { act, cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId, type TableQuery } from '@ap/contracts';
import { stubCompactTableGeometry } from '../../testing';
import { PlatformDataTable, type TableLoadPage } from '../PlatformDataTable';
import { useTableResultCache, type TableResultCache } from '../tableResultCache';

// #2380: a table remounted by a tab switch shows the page its screen's cache already holds, with no request and no loading state.
type Row = { id: string };
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const session = testSession(['platform:view'], { user: { id: 'user-a' } });
const columns = [{ id: 'id', header: 'ID', sortable: false, cell: (r: Row) => r.id }];
let restore: (() => void) | undefined;
beforeEach(() => { restore = stubCompactTableGeometry(800); });
afterEach(() => { cleanup(); restore?.(); });

type Tab = 'a' | 'b';
const ok = (tab: string, n: number) => ({ outcome: 'ok' as const, data: { rows: [{ id: `${tab}${n}` }], total: 1 }, assessments: [], trust: null, correlationId: 'c' });
function setup(cached: boolean) {
  const loads: { tab: Tab; query: TableQuery }[] = [];
  const pending: (() => void)[] = [];
  let calls = 0;
  const loader = (tab: Tab): TableLoadPage<Row> => (query) => new Promise(resolve => { loads.push({ tab, query }); const n = ++calls; pending.push(() => resolve(ok(tab, n))); });
  const control: { tab: (t: Tab) => void; cache: TableResultCache | null } = { tab: () => {}, cache: null };
  function Screen() {
    const [tab, setTab] = useState<Tab>('a');
    const cache = useTableResultCache();
    control.tab = setTab; control.cache = cache;
    // Remounted per tab, like a tabbed screen whose tab owns its table.
    return <PlatformDataTable<Row> key={tab} title={`T ${tab}`} ariaLabel={`table ${tab}`} columns={columns} getRowId={r => r.id} loadPage={loader(tab)}
      preferenceKey={`cache-${tab}`} pageSize={10} height={200} {...(cached ? { resultCache: { cache, key: tab } } : {})} />;
  }
  render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><Screen /></PlatformProvider></I18nProvider>);
  return {
    loads, control,
    answer: async () => { await act(async () => { pending.shift()!(); }); },
    to: (t: Tab) => act(() => { control.tab(t); }),
  };
}
const table = (tab: Tab) => screen.getByRole('table', { name: `table ${tab}` });

describe('PlatformDataTable resultCache (#2380)', () => {
  it('a revisited table shows its held page at once: no request, not busy', async () => {
    const t = setup(true);
    await t.answer();
    expect(screen.getByText('a1')).toBeTruthy();
    t.to('b');
    expect(table('b')).toHaveAttribute('aria-busy', 'true');
    await t.answer();
    expect(screen.getByText('b2')).toBeTruthy();
    t.to('a');
    expect(table('a')).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByText('a1')).toBeTruthy();
    expect(t.loads.map(l => l.tab)).toEqual(['a', 'b']);
  });
  it('without resultCache a revisit reads again (default unchanged)', async () => {
    const t = setup(false);
    await t.answer();
    t.to('b'); await t.answer();
    t.to('a');
    expect(table('a')).toHaveAttribute('aria-busy', 'true');
    expect(t.loads.map(l => l.tab)).toEqual(['a', 'b', 'a']);
  });
  it('clear() drops held pages: the next visit reads again', async () => {
    const t = setup(true);
    await t.answer();
    t.to('b'); await t.answer();
    t.control.cache!.clear();
    t.to('a');
    expect(table('a')).toHaveAttribute('aria-busy', 'true');
    await t.answer();
    expect(screen.getByText('a3')).toBeTruthy();
    expect(t.loads.map(l => l.tab)).toEqual(['a', 'b', 'a']);
  });
  it('a failed read is not held', async () => {
    const loads: number[] = [];
    function Screen() {
      const [tab, setTab] = useState<Tab>('a');
      const cache = useTableResultCache();
      (Screen as unknown as { set: (t: Tab) => void }).set = setTab;
      return <PlatformDataTable<Row> key={tab} title="T" ariaLabel={`table ${tab}`} columns={columns} getRowId={r => r.id} preferenceKey={`f-${tab}`} pageSize={10} height={200}
        loadPage={async () => { loads.push(1); return { outcome: 'error', data: null, assessments: [], trust: null, correlationId: 'e' }; }} resultCache={{ cache, key: tab }} />;
    }
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><Screen /></PlatformProvider></I18nProvider>);
    await act(async () => {});
    act(() => { (Screen as unknown as { set: (t: Tab) => void }).set('b'); });
    await act(async () => {});
    act(() => { (Screen as unknown as { set: (t: Tab) => void }).set('a'); });
    await act(async () => {});
    expect(loads).toHaveLength(3);
    vi.restoreAllMocks();
  });
});
