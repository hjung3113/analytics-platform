/**
 * #1175: the table's error/empty result takes part in the page's OutcomeScope (by its `ariaLabel`), like a QueryView:
 * two widgets with the same response → one banner + compact widget states; alone (or without a scope) → today's full state.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, type QueryState } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId, type ApiResponse, type PageResult } from '@ap/contracts';
import { OutcomeBanners, OutcomeScope } from '../../filters/OutcomeScope';
import { QueryView } from '../../StateView';
import { PlatformDataTable, type PlatformDataTableProps } from '../PlatformDataTable';

// jsdom reports zero layout; the same fixed metrics as the other table suites keep the table rendering.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return (this as Element).getAttribute('role') === 'row' ? 32 : 420; } });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 800; } });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const height = this.getAttribute('role') === 'row' ? 32 : 420;
    return { height, width: 800, top: 0, left: 0, right: 800, bottom: height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
});
afterAll(() => { vi.restoreAllMocks(); delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight; delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetWidth; });
afterEach(cleanup);

const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const session = testSession(['platform:view'], { user: { id: 'user-a' } });
const adapter = testAdapter({ session: () => session });
const equipmentAxes = [{ id: 'stgroup', label: { ko: 'StGroup', en: 'StGroup' }, membershipHistory: false }];
type Row = { id: string };
const columns: PlatformDataTableProps<Row>['columns'] = [{ id: 'id', header: 'ID', cell: row => row.id }];

const failure = (outcome: 'error' | 'empty', message = 'Same response'): ApiResponse<PageResult<Row>> =>
  ({ outcome, message, data: outcome === 'empty' ? { rows: [], total: 0 } : null, assessments: [], trust: null, correlationId: 'corr-table' });
const query = (outcome: 'error' | 'empty', refetch = vi.fn(), message = 'Same response'): QueryState<unknown> =>
  ({ response: failure(outcome, message), refetch, missing: [], completedAt: null, status: 'done' });

function Page({ loadPage, sibling, scoped = true }: { loadPage: PlatformDataTableProps<Row>['loadPage']; sibling?: QueryState<unknown>; scoped?: boolean }) {
  const body = <>
    {scoped && <OutcomeBanners />}
    {sibling && <QueryView query={sibling} widgetName="Sibling">{() => <p>Success</p>}</QueryView>}
    <PlatformDataTable title="T" ariaLabel="지표 표" columns={columns} getRowId={r => r.id} loadPage={loadPage} filterKey="f" preferenceKey="scope-table" pageSize={25} height={200} />
  </>;
  return <I18nProvider><PlatformProvider equipmentAxes={equipmentAxes} adapter={adapter} registry={registry}>{scoped ? <OutcomeScope>{body}</OutcomeScope> : body}</PlatformProvider></I18nProvider>;
}

describe('PlatformDataTable in an OutcomeScope (#1175)', () => {
  it.each(['error', 'empty'] as const)('groups its %s with a sibling QueryView: one banner, compact table state', async outcome => {
    const loadPage = vi.fn(async () => failure(outcome));
    render(<Page loadPage={loadPage} sibling={query(outcome)} />);
    const banner = await screen.findByRole('group', { name: '위젯 상태 요약' });
    expect(banner).toHaveTextContent('위젯 2개에서 같은 응답');
    expect(screen.getAllByRole('group', { name: '위젯 상태 요약' })).toHaveLength(1);
    // Grouped table state: named group (name line hidden — the toolbar title names the table), no live region of its own.
    const state = await screen.findByRole('group', { name: '지표 표' });
    expect(state).toHaveAttribute('data-widget-state');
    expect(within(state).queryByText('지표 표')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('group', { name: 'Sibling' })).toBeInTheDocument();
  });

  it('banner retry refetches the table too', async () => {
    const loadPage = vi.fn(async () => failure('error'));
    const siblingRefetch = vi.fn();
    render(<Page loadPage={loadPage} sibling={query('error', siblingRefetch)} />);
    const banner = await screen.findByRole('group', { name: '위젯 상태 요약' });
    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(1));
    await act(async () => { fireEvent.click(within(banner).getByRole('button', { name: '다시 시도' })); });
    expect(siblingRefetch).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(2));
  });

  it.each(['error', 'empty'] as const)('alone in a scope, %s keeps the full state and no banner', async outcome => {
    render(<Page loadPage={async () => failure(outcome)} />);
    await screen.findByText(outcome === 'error' ? '데이터를 불러오지 못했습니다' : '조회는 성공했고 결과가 0건입니다. 조건을 바꿔 다시 조회하세요.');
    expect(screen.queryByRole('group', { name: '위젯 상태 요약' })).toBeNull();
    expect(document.querySelector('[data-widget-state]')).toBeNull();
  });

  it('a different sibling response does not group the table', async () => {
    render(<Page loadPage={async () => failure('error')} sibling={query('error', vi.fn(), 'Other')} />);
    await screen.findByRole('alert');
    expect(screen.queryByRole('group', { name: '위젯 상태 요약' })).toBeNull();
  });

  it('without a scope it keeps the full state', async () => {
    render(<Page scoped={false} loadPage={async () => failure('error')} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('데이터를 불러오지 못했습니다');
    expect(document.querySelector('[data-widget-state]')).toBeNull();
  });
});
