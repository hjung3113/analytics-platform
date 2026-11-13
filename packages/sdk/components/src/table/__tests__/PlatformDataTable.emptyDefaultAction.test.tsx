import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId, type ApiResponse, type TableQuery } from '@ap/contracts';
import { stubCompactTableGeometry } from '../../testing';
import { PlatformDataTable, type PageResult, type PlatformColumn } from '../PlatformDataTable';

// #1940: an empty table result gets «조건 초기화» by default only while column filters are applied; a menu's `emptyAction` wins.
afterEach(cleanup);
vi.setConfig({ testTimeout: 20000 });

type Row = { id: string; name: string };
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'm' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'm', group: groupId('overview'), primary: true, label: { ko: '메뉴', en: 'Menu' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const session = testSession(['platform:view'], { user: { id: 'user-a' } });
const adapter = testAdapter({ session: () => session });
const axes = [{ id: 'maker', label: { ko: 'Maker', en: 'Maker' }, membershipHistory: false }];
const columns: PlatformColumn<Row>[] = [{ id: 'name', header: '이름', filter: { kind: 'text' } }];
const empty: ApiResponse<PageResult<Row>> = { outcome: 'empty', assessments: [], trust: null, correlationId: 'c', data: { rows: [], total: 0 } };
const rows: ApiResponse<PageResult<Row>> = { outcome: 'ok', assessments: [], trust: null, correlationId: 'c', data: { rows: [{ id: 'r1', name: 'n1' }], total: 1 } };
// Empty only while a filter is applied, like a server that matched nothing.
const makeLoad = (whenUnfiltered: ApiResponse<PageResult<Row>>) => vi.fn(async (q: TableQuery, _s: AbortSignal) => (q.filters?.length ? empty : whenUnfiltered));

function Harness({ loadPage, emptyAction }: { loadPage: (q: TableQuery, s: AbortSignal) => Promise<ApiResponse<PageResult<Row>>>; emptyAction?: ReactNode }) {
  return <I18nProvider><PlatformProvider equipmentAxes={axes} adapter={adapter} registry={registry}>
    <PlatformDataTable<Row> title="T" ariaLabel="table" columns={columns} getRowId={r => r.id} loadPage={loadPage} emptyAction={emptyAction}
      filterKey="f" preferenceKey="test-empty-default" pageSize={25} height={200} />
  </PlatformProvider></I18nProvider>;
}
async function applyText(value: string) {
  fireEvent.click(await screen.findByRole('button', { name: '이름 필터' }));
  fireEvent.change(await screen.findByLabelText('값'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: '적용' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: '적용' })).toBeNull());
}

let restoreGeometry: () => void;
beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.releasePointerCapture = () => {};
  restoreGeometry = stubCompactTableGeometry(800);
});
afterAll(() => { restoreGeometry(); });

describe('PlatformDataTable empty default action (#1940)', () => {
  it('offers «조건 초기화» once a filter produced the empty result, and clearing it reloads without filters', async () => {
    const load = makeLoad(rows);
    render(<Harness loadPage={load} />);
    await applyText('zzz');
    const reset = await screen.findByRole('button', { name: '조건 초기화' });
    fireEvent.click(reset);
    await waitFor(() => expect(load.mock.calls.at(-1)![0]).not.toHaveProperty('filters'));
    await waitFor(() => expect(screen.queryByRole('button', { name: '조건 초기화' })).toBeNull());
  });

  it('draws no button when an empty result has no filter applied', async () => {
    render(<Harness loadPage={makeLoad(empty)} />);
    await screen.findByText('조건에 맞는 결과가 없습니다');
    expect(screen.queryByRole('button', { name: '조건 초기화' })).toBeNull();
  });

  it('shows only the menu\'s own emptyAction when it passes one', async () => {
    render(<Harness loadPage={makeLoad(rows)} emptyAction={<button type="button">메뉴 버튼</button>} />);
    await applyText('zzz');
    expect(await screen.findByRole('button', { name: '메뉴 버튼' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '조건 초기화' })).toBeNull();
  });
});
