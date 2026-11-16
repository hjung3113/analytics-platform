import { act, cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId, type TableQuery } from '@ap/contracts';
import { stubCompactTableGeometry } from '../../testing';
import { PlatformDataTable, type TableLoadPage } from '../PlatformDataTable';

// #2380: a table remounted by a tab switch shows the page the Kernel query engine keeps under its cacheKey, with no request and no loading state.
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
const ok = (tab: string, n: number, total = 1) => ({ outcome: 'ok' as const, data: { rows: [{ id: `${tab}${n}` }], total }, assessments: [], trust: null, correlationId: 'c' });
type Opts = { cached?: boolean; total?: number; sizes?: Partial<Record<Tab, number>>; sharedKey?: boolean; keyOnly?: boolean };
function setup({ cached = true, total = 1, sizes = {}, sharedKey = false, keyOnly = false }: Opts = {}) {
  const loads: { tab: Tab; query: TableQuery }[] = [];
  const pending: (() => void)[] = [];
  let calls = 0;
  const loader = (tab: Tab): TableLoadPage<Row> => (query) => new Promise(resolve => { loads.push({ tab, query }); const n = ++calls; pending.push(() => resolve(ok(tab, n, total))); });
  const control: { tab: (t: Tab) => void; version: (v: number) => void } = { tab: () => {}, version: () => {} };
  function Screen() {
    const [tab, setTab] = useState<Tab>('a');
    const [version, setVersion] = useState(0);
    control.tab = setTab; control.version = setVersion;
    // Remounted per tab, like a tabbed screen whose tab owns its table.
    return <PlatformDataTable<Row> key={keyOnly ? tab : `${tab}:${version}`} title={`T ${tab}`} ariaLabel={`table ${tab}`} columns={columns} getRowId={r => r.id} loadPage={loader(tab)}
      preferenceKey={`cache-${tab}`} pageSize={sizes[tab] ?? 10} height={200} {...(cached ? { cacheKey: sharedKey ? 'test:shared' : `test:${tab}:${version}` } : {})} />;
  }
  render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><Screen /></PlatformProvider></I18nProvider>);
  return {
    loads,
    answer: async () => { await act(async () => { pending.shift()!(); }); },
    to: (t: Tab) => act(() => { control.tab(t); }),
    bump: () => act(() => { control.version(1); }),
  };
}
const table = (tab: Tab) => screen.getByRole('table', { name: `table ${tab}` });

describe('PlatformDataTable cacheKey (#2380)', () => {
  it('a revisited table shows its kept page at once: no request, not busy', async () => {
    const t = setup();
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
  it('without cacheKey a revisit reads again (default unchanged)', async () => {
    const t = setup({ cached: false });
    await t.answer();
    t.to('b'); await t.answer();
    t.to('a');
    expect(table('a')).toHaveAttribute('aria-busy', 'true');
    expect(t.loads.map(l => l.tab)).toEqual(['a', 'b', 'a']);
  });
  it('a new key (the screen wrote) reads again', async () => {
    const t = setup();
    await t.answer();
    t.bump();
    expect(table('a')).toHaveAttribute('aria-busy', 'true');
    await t.answer();
    expect(screen.getByText('a2')).toBeTruthy();
    expect(t.loads.map(l => l.tab)).toEqual(['a', 'a']);
  });
  it('a new key on the same mounted table reads again and keeps the rows while it loads', async () => {
    const t = setup({ keyOnly: true });
    await t.answer();
    t.bump();
    expect(table('a')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('a1')).toBeTruthy();
    await t.answer();
    expect(table('a')).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByText('a2')).toBeTruthy();
    expect(t.loads.map(l => l.tab)).toEqual(['a', 'a']);
  });
  it('a new key drops the read started under the old key', async () => {
    const t = setup({ keyOnly: true });
    t.bump();
    await t.answer(); // the first read, started before the write: discarded
    expect(table('a')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('a1')).toBeNull();
    await t.answer();
    expect(screen.getByText('a2')).toBeTruthy();
  });
  it('a page of another size is another answer', async () => {
    // Same key and request identity, other page size: the 10-row answer must not stand for a 25-row page.
    const t = setup({ sizes: { a: 10, b: 25 }, sharedKey: true });
    await t.answer();
    t.to('b');
    expect(table('b')).toHaveAttribute('aria-busy', 'true');
    expect(t.loads.map(l => l.query.pageSize)).toEqual([10, 25]);
  });
  it('after a kept page, the next uncached page keeps showing it while it loads', async () => {
    const t = setup({ total: 30 });
    await t.answer();
    t.to('b'); await t.answer();
    t.to('a');
    expect(screen.getByText('a1')).toBeTruthy();
    await act(async () => { screen.getByRole('button', { name: /다음/ }).click(); });
    expect(table('a')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('a1')).toBeTruthy();
    await t.answer();
    expect(screen.getByText('a3')).toBeTruthy();
  });
  it('a kept page past the end clamps once per mount', async () => {
    // 54 rows of 20 is 3 pages; the consumer ignores the clamp to page 9, so each response is notified exactly once.
    const onChange = vi.fn();
    const loadPage = vi.fn(async () => ok('p', 1, 54));
    const control: { show: (v: boolean) => void } = { show: () => {} };
    function Screen() {
      const [show, setShow] = useState(true);
      control.show = setShow;
      return show ? <PlatformDataTable<Row> title="T" ariaLabel="table" columns={columns} getRowId={r => r.id} preferenceKey="clamp-kept" pageSize={20} height={200}
        loadPage={loadPage} cacheKey="clamp" urlState={{ page: 9, sorting: [], onChange }} /> : null;
    }
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><Screen /></PlatformProvider></I18nProvider>);
    await act(async () => {});
    expect(onChange).toHaveBeenCalledTimes(1);
    act(() => { control.show(false); });
    act(() => { control.show(true); });
    await act(async () => {});
    expect(loadPage).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith({ sorting: [], page: 3 }, 'clamp');
  });
  it('a failed read is not kept', async () => {
    const loads: number[] = [];
    const control: { set: (t: Tab) => void } = { set: () => {} };
    function Screen() {
      const [tab, setTab] = useState<Tab>('a');
      control.set = setTab;
      return <PlatformDataTable<Row> key={tab} title="T" ariaLabel={`table ${tab}`} columns={columns} getRowId={r => r.id} preferenceKey={`f-${tab}`} pageSize={10} height={200}
        loadPage={async () => { loads.push(1); return { outcome: 'error', data: null, assessments: [], trust: null, correlationId: 'e' }; }} cacheKey={`fail:${tab}`} />;
    }
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><Screen /></PlatformProvider></I18nProvider>);
    await act(async () => {});
    act(() => { control.set('b'); });
    await act(async () => {});
    act(() => { control.set('a'); });
    await act(async () => {});
    expect(loads).toHaveLength(3);
    vi.restoreAllMocks();
  });
});
