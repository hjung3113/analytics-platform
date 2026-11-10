import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, useMenuAction } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { defineAction, defineEndpoint, groupId, spaceId, type ActionResponse, type MenuAction, type TableQuery } from '@ap/contracts';
import { stubCompactTableGeometry } from '../../testing';
import { PlatformDataTable, type TableLoadPage } from '../PlatformDataTable';

// #1672: a table re-reads the endpoints it lists in `refreshOn` after a write that invalidates them; page, selection and rows stay.
type Row = { id: string; n: number };
const endpoint = (id: string) => defineEndpoint<{ page: number }, Row>({ id, menuId: 'home', paramKeys: { page: true }, permission: 'platform:view', requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false });
const list = endpoint('fx.list');
const other = endpoint('fx.other');
const save = (invalidates: (typeof list)[]) => defineAction<{ text: string }, { id: string }>({ id: 'fx.save', menuId: 'home', inputKeys: { text: true }, permission: 'platform:view', requiresScope: false, concurrency: 'none', invalidates });
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const session = testSession(['platform:view'], { user: { id: 'user-a' } });
const columns = [{ id: 'n', header: 'N', sortable: false, cell: (r: Row) => r.id }];
let restore: (() => void) | undefined;
beforeEach(() => { restore = stubCompactTableGeometry(800); });
afterEach(() => { cleanup(); restore?.(); vi.unstubAllGlobals(); });

function Harness({ loadPage, refreshOn, invalidates, run }: { loadPage: TableLoadPage<Row>; refreshOn?: readonly { id: string }[]; invalidates: (typeof list)[]; run: { current: () => Promise<unknown> } }) {
  const action = useMenuAction(save(invalidates));
  run.current = () => action.run({ text: 'x' });
  return <PlatformDataTable<Row> title="T" ariaLabel="table" columns={columns} getRowId={r => r.id} loadPage={loadPage} refreshOn={refreshOn}
    preferenceKey="refresh-table" pageSize={2} height={200} bulkActions={ids => <span data-testid="ids">{ids.join(',')}</span>} />;
}
function setup(refreshOn: readonly { id: string }[] | undefined, invalidates: (typeof list)[]) {
  const pending: ((rows: Row[]) => void)[] = [];
  const queries: TableQuery[] = [];
  const loadPage = vi.fn((q: TableQuery) => new Promise<Awaited<ReturnType<TableLoadPage<Row>>>>(resolve => {
    queries.push(q);
    pending.push(rows => resolve({ outcome: 'ok', data: { rows, total: 6 }, assessments: [], trust: null, correlationId: 'c' }));
  }));
  const writes: ((r: ActionResponse<{ id: string }>) => void)[] = [];
  const adapter = testAdapter({
    session: () => session,
    menuAction: vi.fn((_r: MenuAction) => new Promise<ActionResponse<unknown>>(resolve => { writes.push(resolve as never); })),
  });
  const run = { current: () => Promise.resolve() as Promise<unknown> };
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Harness loadPage={loadPage} refreshOn={refreshOn} invalidates={invalidates} run={run} /></PlatformProvider></I18nProvider>);
  const rowsOf = (page: number) => [{ id: `p${page}a`, n: page }, { id: `p${page}b`, n: page }];
  return {
    loadPage, queries, rowsOf,
    answer: async (rows: Row[]) => { await act(async () => { pending.shift()!(rows); }); },
    write: async () => { let done!: Promise<unknown>; act(() => { done = run.current(); }); await act(async () => { writes.shift()!({ outcome: 'ok', data: null, version: null, fieldErrors: [], replayed: false, correlationId: 'w' }); await done; }); },
  };
}
async function toPageTwoWithSelection(t: ReturnType<typeof setup>) {
  await t.answer(t.rowsOf(1));
  await waitFor(() => expect(screen.getByRole('button', { name: '다음' })).not.toHaveAttribute('aria-disabled'));
  fireEvent.click(screen.getByRole('button', { name: '다음' }));
  await t.answer(t.rowsOf(2));
  fireEvent.click(screen.getByRole('checkbox', { name: '선택 p2a' }));
  expect(screen.getByTestId('ids')).toHaveTextContent('p2a');
}

describe('PlatformDataTable refreshOn', () => {
  it('reads the same page again after a listed endpoint is invalidated, keeping page, selection and old rows while loading', async () => {
    const t = setup([list], [list]);
    await toPageTwoWithSelection(t);
    expect(t.loadPage).toHaveBeenCalledTimes(2);
    await t.write();
    expect(t.loadPage).toHaveBeenCalledTimes(3);
    expect(t.queries[2].page).toBe(1);
    expect(screen.getByRole('table', { name: 'table' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('ids')).toHaveTextContent('p2a');
    await t.answer([{ id: 'p2a', n: 9 }, { id: 'p2c', n: 9 }]);
    expect(screen.getByRole('table', { name: 'table' })).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByText('p2c')).toBeTruthy();
    expect(screen.getByTestId('ids')).toHaveTextContent('p2a');
  });

  it('does not read again for an endpoint that is not listed', async () => {
    const t = setup([list], [other]);
    await toPageTwoWithSelection(t);
    await t.write();
    expect(t.loadPage).toHaveBeenCalledTimes(2);
  });

  it('does not read again without refreshOn', async () => {
    const t = setup(undefined, [list]);
    await toPageTwoWithSelection(t);
    await t.write();
    expect(t.loadPage).toHaveBeenCalledTimes(2);
  });
});
void memoryStorage;
