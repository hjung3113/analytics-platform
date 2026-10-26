import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, useQueryDraft, usePlatform } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId, type ApiResponse, type GlobalContext } from '@ap/contracts';
import { PlatformDataTable, type PageQuery, type PageResult } from '../PlatformDataTable';
import { readXlsx } from './xlsxTestReader';

// Server-paged tables and their export follow the applied Condition preset (06 §6.4/§15, ADR-0083, #819):
// the table's Context identity and the export header use the narrowed Condition, never the raw global one.
afterEach(cleanup);

const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const downloads: Blob[] = [];
// Without these stubs the virtualizer paints no row checkbox (same metrics as PlatformDataTable.test.tsx).
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return (this as Element).getAttribute('role') === 'row' ? 32 : 420; } });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 800; } });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const height = this.getAttribute('role') === 'row' ? 32 : 420;
    return { height, width: 800, top: 0, left: 0, right: 800, bottom: height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
  URL.createObjectURL = (blob: Blob) => { downloads.push(blob); return 'blob:test'; };
  URL.revokeObjectURL = () => {};
  vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(() => {});
});
afterAll(() => {
  vi.restoreAllMocks();
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
  if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth);
});

const axes = [
  { id: 'stgroup', label: { ko: 'StGroup', en: 'StGroup' }, membershipHistory: false },
  { id: 'maker', label: { ko: 'Maker', en: 'Maker' }, membershipHistory: false },
];
const presets = [
  { id: 'eqp', label: { ko: '설비 기준', en: 'By equipment' }, axes: ['maker'] },
  { id: 'org', label: { ko: '조직 기준', en: 'By organization' }, axes: ['stgroup'] },
];
const baseMenu = {
  id: 'home', group: groupId('overview'), primary: true, path: '/', icon: House,
  label: { ko: '조회', en: 'Query' }, description: { ko: '', en: '' }, permission: 'platform:view' as const,
  requiresScope: false, pageType: 'analysis' as const, features: { export: true, savedView: false, annotate: false, compare: false },
  pageKeys: ['view'], conditionPresets: presets, conditionPreset: { key: 'view', default: 'eqp' },
};
const registryFor = (menu: Record<string, unknown>) => createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: baseMenu.label, icon: House, space: spaceId('analytics') }],
  menus: [{ ...baseMenu, ...menu } as never],
});
const liveRegistry = registryFor({ context: { ...noContext, condition: 'apply' as const } });
const applyRegistry = registryFor({ context: { ...noContext, time: 'apply' as const, condition: 'apply' as const }, query: { mode: 'apply' as const } });
const period = 'from=2026-09-25T09%3A00%3A00&to=2026-09-26T09%3A00%3A00';
const url = (condition: Record<string, string[]>, view?: string) =>
  `/?v=1&${period}&equipmentGroup=${encodeURIComponent(JSON.stringify(condition))}${view ? `&view=${view}` : ''}`;

type Row = { id: string };
const columns = [{ id: 'id', header: 'Id', cell: (row: Row) => row.id }];
const ok = <T,>(data: T): ApiResponse<T> => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'c' });

let draft: ReturnType<typeof useQueryDraft>;
let platform: ReturnType<typeof usePlatform>;
function Controls() { draft = useQueryDraft(); platform = usePlatform(); return null; }

function mount(registry: ReturnType<typeof registryFor>, at: string, filterKey = 'f') {
  window.history.replaceState(null, '', at);
  const loadPage = vi.fn(async (_query: PageQuery): Promise<ApiResponse<PageResult<Row>>> => ok({ rows: [{ id: 'r1' }, { id: 'r2' }], total: 2 }));
  const exportRows = vi.fn(async () => ok([{ id: 'r1' }]));
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider registry={registry} equipmentAxes={axes} adapter={testAdapter({ session: () => session })}>
    <PlatformDataTable<Row> title="T" ariaLabel="table" columns={columns} getRowId={r => r.id}
      loadPage={loadPage} filterKey={filterKey} preferenceKey="preset-table" pageSize={25} height={200} exportRows={exportRows} />
    <Controls />
  </PlatformProvider></I18nProvider>);
  return { loadPage };
}
const settle = async () => { await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };
const whole = (condition: Record<string, string[]>): GlobalContext['condition'] => condition;

describe('server-paged table identity follows the applied Condition preset (#819)', () => {
  it('apply mode: an unapplied preset switch does not reload; Apply does', async () => {
    const { loadPage } = mount(applyRegistry, url({ maker: ['M1'], stgroup: ['S1'] }, 'eqp'));
    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(1));
    act(() => draft.setDraftPage({ view: 'org' }));
    await settle();
    expect(loadPage).toHaveBeenCalledTimes(1);
    act(() => draft.apply());
    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(2));
  });

  it('an out-of-preset axis change neither reloads nor drops the selection; a page-key preset switch reloads and does', async () => {
    const { loadPage } = mount(liveRegistry, url({ maker: ['M1'], stgroup: ['S1'] }, 'eqp'));
    await screen.findByRole('checkbox', { name: '선택 r1' });
    fireEvent.click(screen.getByRole('checkbox', { name: '선택 r1' }));
    expect(screen.getByTestId('selected-count').textContent).toBe('1행 선택');
    act(() => platform.setGlobal({ condition: whole({ maker: ['M1'], stgroup: ['S2'] }) }));
    await settle();
    expect(loadPage).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('selected-count').textContent).toBe('1행 선택');
    act(() => platform.setPage({ view: 'org' }));
    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByTestId('selected-count')?.textContent ?? '').not.toBe('1행 선택'));
  });

  it('without a page key, a Condition edit that changes the inferred preset reloads', async () => {
    const { loadPage } = mount(liveRegistry, url({ maker: ['M1'] }));
    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(1));
    act(() => platform.setGlobal({ condition: whole({ stgroup: ['S1'] }) }));
    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(2));
  });

  it('a menu without presets still reloads on any Condition change (identity unchanged)', async () => {
    const { loadPage } = mount(registryFor({ context: { ...noContext, condition: 'apply' as const }, conditionPresets: undefined, conditionPreset: undefined, pageKeys: [] }), url({ maker: ['M1'] }));
    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(1));
    act(() => platform.setGlobal({ condition: whole({ maker: ['M1'], stgroup: ['S1'] }) }));
    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(2));
  });
});

describe('table export header follows the applied Condition preset (#819)', () => {
  it('writes the preset\'s axes as conditions and leaves out-of-preset axes out', async () => {
    mount(liveRegistry, url({ maker: ['M1'], stgroup: ['S1'] }, 'eqp'));
    await screen.findByText(/1\/1/);
    fireEvent.keyDown(screen.getByRole('button', { name: /^내보내기/ }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: '필터 결과 전체 2행을 Excel(.xlsx)로 내보내기' }));
    await waitFor(() => expect(downloads.length).toBe(1));
    const { sheets: [, info] } = await readXlsx(downloads[0]!);
    const text = Object.values(info as Record<string, unknown>).map(String).join('\n');
    expect(text).toContain('Maker: M1');
    expect(text).not.toContain('StGroup');
    expect(text).not.toContain('S1');
  });
});
