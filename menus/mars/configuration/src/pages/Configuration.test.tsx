// @vitest-environment jsdom
import { act, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageFilterField, PanelWorkspaceProps, QueryBarExtension, TreeMatrixProps } from '@ap/components';
import { encodeFilterParams, parseQuery, buildQuery, emptyGlobal, type MatrixColumn } from '@ap/contracts';
import { I18nProvider } from '@ap/kernel';
import { DEFAULT_LEVELS, PAGE_KEYS, SAVED_VIEW_SUPPORT, HW_DAYS_KEY, HW_TREND_ITEM_KEY, TREND_ITEM_KEY, equipmentFromKey, equipmentToKey, validEquipmentKey, type TreeRow } from '../endpoints';
import { manifests } from '../index';
import Configuration from './Configuration';

const state = vi.hoisted(() => ({ page: {} as Record<string, string | string[]>, matrix: null as unknown as TreeMatrixProps<TreeRow>, fields: [] as PageFilterField[], setPage: vi.fn(), support: vi.fn(), draftSet: vi.fn(), draftApply: vi.fn(), cancelExport: vi.fn() }));
let extension: QueryBarExtension;
const leaf: TreeRow = { id: 'cfg-000000', label: 'Pressure', level: 4, kind: 'leaf', expanded: false, hasChildren: false, differences: 1, item: { id: 'cfg-000000', key: 'PM1 / Gas / Pressure / config.cfg', module: 'PM1', category: 'Gas', item: 'Pressure', filename: 'config.cfg', group: 'PM1 / Gas', coreKnown: true, diff: true, violation: false, missing: false, notComparable: false, source: 'CFG', collectedAt: '2026-11-17T00:00:00Z', values: { EQ01: { value: 120, state: 'equal' }, EQ02: { value: 125, state: 'diff' } } } };
vi.mock('@ap/kernel', async original => ({ ...await original<object>(),
  useLentPanel: () => ({ allowed: false, reason: { kind: 'not-registered' } }),
  useQueryContext: () => emptyGlobal,
  usePlatform: () => ({ page: Object.entries(state.page), pageParam: (key: string) => state.page[key] ?? null, pageParams: (key: string) => state.page[key] ?? [], setPage: state.setPage, session: { user: { id: 'test' } }, revision: 1, global: { scopeId: null } }),
  useMessages: () => (key: string, values?: Record<string, unknown>) => ({ allIncluding: '일치 포함 전체', hiddenEqual: `일치 ${values?.count}건 숨김`, hideSame: '차이 없는 설비 숨기기', groupValues: '같은 값 묶기', sameValue: '같은 값 강조' }[key] ?? key),
  useSavedViewSupport: (support: unknown) => state.support(support),
  useQueryDraft: () => ({ draft: { page: Object.entries(state.page) }, dirty: [], canApply: true, applying: false, apply: state.draftApply, setDraftPage: state.draftSet }),
  useMenuQuery: (endpoint: { id: string }) => ({ status: 'success', response: { outcome: 'ok', data: endpoint.id.endsWith('detail') ? leaf.item : { nodes: [leaf], offset: 0, totalVisible: 1, totalItems: 10, counts: { all: 100, review: 10, diff: 10, violation: 0, missing: 0 }, sameColumns: ['EQ02'], expanded: [], firstItem: leaf.id }, trust: null, assessments: [] } }),
  useMenuFetch: () => ({ fetch: vi.fn() }),
}));
vi.mock('@ap/components', async original => ({ ...await original<object>(),
  PlatformPage: ({ children, contextExtension, queryBarExtension }: { children: ReactNode; contextExtension: ReactNode; queryBarExtension: QueryBarExtension }) => { extension = queryBarExtension; return <main>{contextExtension}{children}</main>; },
  PanelWorkspace: ({ panels }: Pick<PanelWorkspaceProps, 'panels'>) => panels[0]?.render(),
  PageFilterBar: ({ fields, actions }: { fields: PageFilterField[]; actions: ReactNode }) => { state.fields = fields; return <div>{actions}</div>; },
  QueryView: ({ query, children }: { query: { response: { data: unknown } }; children: (data: unknown, response: unknown) => ReactNode }) => children(query.response.data, query.response),
  TreeMatrix: (props: TreeMatrixProps<TreeRow>) => { state.matrix = props; return <div data-matrix />; },
  usePageKeyRules: () => ({ invalid: false, sentences: [], recover: vi.fn() }),
  useWorkbookExport: () => ({ canExport: false, exporting: false, cancel: state.cancelExport }),
}));
let root: Root;
let host: HTMLDivElement;
const draw = () => act(() => root.render(<I18nProvider><Configuration /></I18nProvider>));
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); state.page = { equipment: 'EQ01,EQ02' }; vi.clearAllMocks(); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
describe('Configuration page', () => {
  it('labels toolbar keys and formats arbitrary history candidates without capturing current values', () => {
    state.page = { equipment: 'EQ01,EQ02', mode: 'reference', ref: 'EQ01', core: '1', levels: 'category,module', hideSameCols: '1', q: 'Pressure', status: 'all', filter: ['module:eq:PM1'] };
    draw();
    expect(extension.appliedPageSummary?.map(item => item.key)).toEqual(expect.arrayContaining(PAGE_KEYS.filter(key => key !== TREND_ITEM_KEY && key !== HW_TREND_ITEM_KEY && key !== HW_DAYS_KEY)));
    expect(extension.appliedPageSummary?.find(item => item.key === 'levels')?.value).toBe('Category › Module');
    expect(extension.appliedPageSummary?.find(item => item.key === 'mode')?.value).toBe('referenceMode');
    expect(extension.appliedPageSummary?.find(item => item.key === 'hideSameCols')).toEqual({ key: 'hideSameCols', label: '차이 없는 설비 숨기기', value: 'enabled' });
    const candidate = extension.historyPageSummary!(emptyGlobal, [['mode', 'all'], ['equipment', 'EQ03,EQ04,EQ05']]);
    expect(candidate.find(item => item.key === 'mode')?.value).toBe('allMode');
    expect(candidate.some(item => item.key === 'hideSameCols')).toBe(false);
    expect(candidate.some(item => item.key === 'ref')).toBe(false);
  });
  it('round-trips intentional zero equipment through the kernel page codec', () => {
    const token = equipmentToKey([]);
    const result = parseQuery(buildQuery(emptyGlobal, [['equipment', token]]), PAGE_KEYS);
    expect(validEquipmentKey(token)).toBe(true);
    expect(equipmentFromKey(result.page[0][1])).toEqual([]);
    expect(equipmentFromKey(null)).toHaveLength(12);
  });
  it('C7 marks a carried reference inactive in applied and history summaries after switching modes', () => {
    state.page = { equipment: 'EQ01,EQ03', mode: 'reference', ref: 'EQ03' };
    const reference = (summary: typeof extension.appliedPageSummary) => summary?.find(item => item.key === 'ref');
    const history = () => extension.historyPageSummary!(emptyGlobal, Object.entries(state.page) as [string, string][]);
    draw();
    expect(reference(extension.appliedPageSummary)).toEqual({ key: 'ref', label: 'referenceEquipment', value: 'EQ03' });
    expect(reference(history())).toEqual(reference(extension.appliedPageSummary));
    state.page.mode = 'all';
    draw();
    expect(reference(extension.appliedPageSummary)).toEqual({ key: 'ref', label: 'inactiveReferenceEquipment', value: 'EQ03' });
    expect(reference(history())).toEqual(reference(extension.appliedPageSummary));
  });
  it('edits the kernel draft without writing applied page keys or adding a Run button', () => {
    draw();
    const equipment = state.fields.find(field => field.key === 'equipment');
    if (!equipment || equipment.kind !== 'custom') throw new Error('Equipment field missing');
    const picker = equipment.content as ReactElement<{ onValuesChange: (values: string[]) => void }>;
    act(() => picker.props.onValuesChange(['EQ01', 'EQ03']));
    expect(state.draftSet).toHaveBeenCalledWith({ equipment: 'EQ01,EQ03' });
    expect(state.setPage).not.toHaveBeenCalled();
    expect([...host.querySelectorAll('button')].find(button => button.textContent === 'apply')).toBeUndefined();
    expect(state.draftApply).not.toHaveBeenCalled();
  });
  it('labels all items including matches and reports hidden matches', () => {
    draw(); expect(host.textContent).toContain('일치 포함 전체'); expect(host.textContent).toContain('일치 90건 숨김');
    state.page.status = 'all'; draw(); expect(host.textContent).not.toContain('일치 90건 숨김');
  });
  it('prints the status and navigation counts in the screen language, not the browser locale (#2181)', () => {
    const locales: unknown[] = [];
    const descriptor = Object.getOwnPropertyDescriptor(Intl.NumberFormat.prototype, 'format')!;
    Object.defineProperty(Intl.NumberFormat.prototype, 'format', { ...descriptor, get(this: Intl.NumberFormat) { locales.push(this.resolvedOptions().locale); return descriptor.get!.call(this); } });
    const toLocaleString = Number.prototype.toLocaleString;
    const spy = vi.spyOn(Number.prototype, 'toLocaleString').mockImplementation(function (this: number, ...args: Parameters<number['toLocaleString']>) { locales.push(args[0]); return toLocaleString.apply(this, args); });
    try {
      state.page.status = 'review'; draw();
      expect(host.textContent).toContain('일치 90건 숨김');
      expect(locales.length).toBeGreaterThan(0);
      expect(new Set(locales)).toEqual(new Set(['ko-KR']));
    } finally {
      Object.defineProperty(Intl.NumberFormat.prototype, 'format', descriptor);
      spy.mockRestore();
    }
  });
  it('browses statuses with arrow keys without re-keying the comparison (#2552)', async () => {
    draw();
    const group = host.querySelector('[aria-label="status"]')!;
    const checked = group.querySelector<HTMLElement>('[aria-checked="true"]')!;
    act(() => { checked.focus(); checked.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); });
    await act(() => new Promise(resolve => setTimeout(resolve, 10)));
    expect(state.setPage).not.toHaveBeenCalled();
    expect(checked.getAttribute('aria-checked')).toBe('true');
  });
  it('passes whole-result unchanged columns only when the page toggle is enabled', () => {
    draw(); expect(state.matrix.hiddenColumns).toEqual([]);
    const toggle = [...host.querySelectorAll('button')].find(button => button.textContent === '차이 없는 설비 숨기기')!;
    act(() => toggle.click()); expect(state.setPage).toHaveBeenCalledWith({ hideSameCols: '1' });
    state.page.hideSameCols = '1'; draw(); expect(state.matrix.hiddenColumns).toEqual(['EQ02']);
    state.page.mode = 'reference'; state.page.ref = 'EQ02'; draw(); expect(state.matrix.hiddenColumns).toEqual([]);
  });
  it('registers saved-view keys with Kernel Apply and round-trips repeated filters and levels', () => {
    // The manifest owns Saved View support (resolved before the screen mounts); the screen does not register it again.
    draw(); expect(manifests[0].savedViewSupport).toBe(SAVED_VIEW_SUPPORT); expect(state.support).not.toHaveBeenCalled();
    expect(manifests[0].pageKeys).toEqual(PAGE_KEYS); expect(manifests[0].repeatedPageKeys).toEqual(['filter']);
    expect(manifests[0].query?.mode).toBe('apply');
    const filters = encodeFilterParams([{ id: 'module', op: 'equals', value: 'PM1' }, { id: 'value.EQ02.number', op: 'gt', value: 120 }]);
    const pairs: [string, string][] = [['levels', 'filename,module'], ['hideSameCols', '1'], ...filters.map(value => ['filter', value] as [string, string])];
    const result = parseQuery(buildQuery(emptyGlobal, pairs), PAGE_KEYS, { repeated: ['filter'] });
    expect(result.page).toEqual(pairs);
    expect(SAVED_VIEW_SUPPORT.pageKeys).toEqual(PAGE_KEYS);
    expect(PAGE_KEYS).not.toContain('focus'); expect(PAGE_KEYS).not.toContain('emphasis');
  });
  it('wires selected-cell same-value emphasis and keeps selection transient', () => {
    draw(); expect(state.matrix.fill).toBe(true); expect(state.matrix.emphasis).toEqual([]);
    expect(state.matrix.valueOf(leaf, { id: 'EQ02' } as MatrixColumn)).toBe(125);
    expect(state.matrix.valueOf(leaf, { id: 'status' } as MatrixColumn)).toBeNull();
    act(() => state.matrix.onSelectCell({ row: leaf.id, column: 'EQ02' }));
    const button = [...host.querySelectorAll('button')].find(button => button.textContent === '같은 값 강조')!;
    act(() => button.click()); expect(state.matrix.emphasis).toEqual([{ row: leaf.id, match: { kind: 'values', values: [125] } }]);
    act(() => state.matrix.onEmphasisChange!([])); expect(state.matrix.emphasis).toEqual([]);
    expect(state.setPage).not.toHaveBeenCalled(); expect(state.matrix.generation).toBeDefined();
    expect(state.matrix.columns.slice(0, 2).map(column => column.pin)).toEqual(['left', 'left']);
    expect(state.matrix.activateOn).toBe('doubleClick'); expect(DEFAULT_LEVELS).toEqual(['module', 'category']);
    act(() => state.matrix.onEmphasisChange!([{ row: leaf.id, match: { kind: 'values', values: [120] } }]));
    state.page.levels = 'filename,module'; draw();
    expect(state.matrix.emphasis).toEqual([]); expect(state.matrix.selectedCell).toBeNull();
  });
});
