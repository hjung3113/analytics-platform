// @vitest-environment jsdom
import { act, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Settings } from 'lucide-react';
import { contextCapabilities, defineEndpoint, groupId, menuPermission, spaceId, type ApiResponse } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, useMenuQuery, useQueryDraft, type LentPanelProps } from '@ap/kernel';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { registerLentPanel, settleQueries, testAdapter, testMenu, testSession, testSpace, useToastsForTest } from '@ap/kernel/testing';
import type { PageFilterField } from '@ap/components';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { configurationDetailEndpoint, configurationExportEndpoint, configurationTreeEndpoint, DEFAULT_EQUIPMENT, DEFAULT_LEVELS, EXPORT_LIMIT, SAVED_VIEW_SUPPORT, TREE_WINDOW, filterDeclarations, configurationLendingEndpoint, type ConfigHistory, type ConfigurationLending, type HistoryParams, type TreePage, type TreeParams, type TreeRow } from '../endpoints';
import { manifests } from '../index';
import Configuration from './Configuration';
import { OpenHwTimeLink } from './ConfigurationWorkspace';

await vi.hoisted(async () => (await import('@ap/components/testing/engines')).mockEchartsCanvas());
const controls = vi.hoisted(() => ({ fields: [] as readonly PageFilterField[] }));
vi.mock('@ap/components', async original => ({ ...await original<object>(),
  PageFilterBar: ({ fields, actions }: { fields: readonly PageFilterField[]; actions: ReactNode }) => { controls.fields = fields; return <div>{actions}</div>; },
}));
const linkedMotionForItem = (id: string) => {
  const module = { 'cfg-000000': 'LK1', 'cfg-000001': 'LK2' }[id];
  return module ? { moduleType: 'LK', module, motion: 'Pump' } : null;
};
// Bounded transport fixture; real handlers and default hierarchy are covered in mock/index.test.ts.
function windowPage(params: TreeParams): TreePage {
  const totalItems = params.q === 'not-a-synthetic-item' ? 0 : TREE_WINDOW * 3;
  const nodes: TreeRow[] = Array.from({ length: Math.min(TREE_WINDOW, totalItems - params.offset) }, (_, local) => {
    const id = `cfg-${String(params.offset + local).padStart(6, '0')}`;
    const item = { id, linkedMotion: linkedMotionForItem(id), key: id, module: 'PM1', category: 'Gas', item: 'Pressure', filename: 'config.cfg', group: 'PM1 / Gas', coreKnown: true, diff: true, violation: false, missing: false, notComparable: false, source: 'synthetic', collectedAt: '2026-11-17T00:00:00Z', values: Object.fromEntries(params.eq.map(eq => [eq, { value: eq === 'EQ03' ? 125 : 120, state: 'diff' as const }])) };
    return { id, item, label: item.item, level: 2, kind: 'leaf', hasChildren: false, expanded: false, differences: 1 };
  });
  return { nodes, offset: params.offset, totalVisible: totalItems, totalItems, expanded: ['fixture-group'], sameColumns: [], firstItem: nodes[0]?.id ?? null, counts: { all: totalItems, review: totalItems, diff: totalItems, missing: 0, violation: 0 } };
}
const analytics = menuPermission('analytics:view');
const sourcePermission = menuPermission('console:access');
const sourceGroup = groupId('hwTime');
const sourceTitle = { ko: 'HW Time', en: 'HW Time' };
const sourceRuns = defineEndpoint<{ equipment: readonly string[] | null; moduleType: unknown; module: unknown; motion: unknown }, string>({
  id: 'hwTime.runs', menuId: 'hw-time', permission: analytics, requiresScope: true,
  paramKeys: { equipment: true, moduleType: true, module: true, motion: true }, kinds: [], mergeTimeDomain: false,
  context: { time: 'apply', selection: 'apply', roomNames: 'apply', condition: 'apply' },
});
const sourcePageKeys = ['moduleType', 'drillModule', 'drillMotion'];
const sourceMenu = testMenu({
  id: 'hw-time', path: '/hw-time', group: sourceGroup, permission: analytics, requiresScope: true,
  context: contextCapabilities(sourceRuns.context), pageKeys: sourcePageKeys,
  panels: [{
    id: 'trend', title: sourceTitle, grain: 'dailyStat', endpoints: [sourceRuns], displayInputs: {}, outputs: [],
    queryInputs: { context: ['scopeId', 'time', 'selection', 'roomNames', 'condition'], page: sourcePageKeys.map(key => ({ key, required: true })) },
    display: [{ key: 'equipmentLabels' }],
  }],
});
const assembly = {
  permissions: [analytics], spaces: [testSpace({ homeMenuId: 'configuration' })],
  groups: [
    { id: groupId('configuration'), label: { ko: '설정', en: 'Configuration' }, icon: Settings, space: spaceId('mars') },
    { id: sourceGroup, label: sourceTitle, icon: Settings, space: spaceId('mars') },
  ],
};
const registry = createRegistry({ ...assembly, menus: [...manifests, sourceMenu] });
function SourceTrend({ inputs, actions }: LentPanelProps) {
  const query = useMenuQuery(sourceRuns, {
    equipment: inputs.context.selection, moduleType: inputs.page.moduleType, module: inputs.page.drillModule, motion: inputs.page.drillMotion,
  });
  return <>{actions}<output data-test-source-result data-test-equipment-labels={JSON.stringify(inputs.display?.equipmentLabels)}>{query.response?.data}</output></>;
}
let draft: ReturnType<typeof useQueryDraft>;
function DraftProbe() { draft = useQueryDraft(); return null; }
function Toasts() { const toasts = useToastsForTest(); return <output>{JSON.stringify(toasts)}</output>; }
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  window.history.replaceState(null, '', '/mars/configuration?v=1&scopeId=MEM&from=2026-11-16T00:00:00&to=2026-11-18T00:00:00&status=all');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const ok = <T,>(data: T): ApiResponse<T> => ({ outcome: 'ok', data, assessments: [{ kind: 'collection', state: 'unknown', reason: 'source_unavailable' }, { kind: 'coverage', state: 'unknown', reason: 'source_unavailable' }], trust: null, correlationId: 'configuration-test' });
async function mount(menuQuery = vi.fn(async ({ params: query }: { endpoint: string; params: unknown }): Promise<ApiResponse<unknown>> => ok(windowPage(query as TreeParams))), testRegistry = registry) {
  const session = testSession(['analytics:view']);
  const adapter = testAdapter({ session: () => session, menuQuery });
  await act(async () => root.render(<I18nProvider><PlatformProvider adapter={adapter} registry={testRegistry}><Configuration /><Toasts /><DraftProbe /></PlatformProvider></I18nProvider>));
  await settleQueries();
  await vi.waitFor(() => expect(host.querySelector('[data-matrix-viewport]'), host.textContent ?? '').not.toBeNull());
  return menuQuery;
}
function lendingFixture({ itemId, equipment }: HistoryParams): ConfigurationLending {
  return {
    linkedMotion: linkedMotionForItem(itemId),
    equipmentColumns: equipment.map(id => ({
      id, label: id, equipmentId: { EQ01: 'MEM-PHOTO-0103', EQ03: 'MEM-PHOTO-0108' }[id] ?? `MEM-FIXTURE-${id}`,
    })),
  };
}
function withLending<T extends { endpoint: string; params: unknown }>(
  respond: (request: T, signal?: AbortSignal) => Promise<ApiResponse<unknown>>,
) {
  return vi.fn(async (request: T, signal?: AbortSignal): Promise<ApiResponse<unknown>> => {
    if (request.endpoint === configurationLendingEndpoint.id) return ok(lendingFixture(request.params as HistoryParams));
    return respond(request, signal);
  });
}
function picker() {
  const field = controls.fields.find(field => field.key === 'equipment');
  if (!field || field.kind !== 'custom') throw new Error('Missing equipment picker');
  return field.content as ReactElement<{ values: string[]; onValuesChange: (values: string[]) => void }>;
}
function typeSearch(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Configuration lifecycle regressions', () => {
  it('FIX3 keeps summary, trust, search, filters and tools in one wrapping toolbar', async () => {
    await mount(vi.fn(async ({ params: query }: { params: unknown }): Promise<ApiResponse<unknown>> => ({
      ...ok(windowPage(query as TreeParams)),
      trust: { updatedAt: '2026-11-18T00:00:00Z', dataThrough: null, coverage: null, provisional: true, source: 'synthetic' },
    })));
    const toolbar = host.querySelector<HTMLElement>('[data-configuration-toolbar]');
    expect(toolbar).not.toBeNull();
    expect(toolbar!.classList.contains('flex-wrap')).toBe(true);
    const summary = host.querySelector('[data-configuration-summary]')!;
    const search = host.querySelector('input[type="search"]')!;
    expect(summary.closest('[data-configuration-toolbar]')).toBe(toolbar);
    expect(search.closest('[data-configuration-toolbar]')).toBe(toolbar);
    expect(toolbar!.textContent).toContain('잠정');
    for (const label of ['필터 추가', '같은 값 묶기', '차이 없는 설비 숨기기', '단계 순서', '열 선택', '내보내기']) {
      const button = [...host.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === label || node.textContent?.trim() === label);
      expect(button, label).toBeDefined();
      expect(button!.closest('[data-configuration-toolbar]'), label).toBe(toolbar);
    }
    expect(host.querySelector('[role="group"][aria-label="강조"]')).toBeNull();
  });
  it('FIX3 offers every declared filter field from the toolbar 필터 추가', async () => {
    await mount();
    const add = [...host.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === '필터 추가' || node.textContent?.trim() === '필터 추가')!;
    await act(async () => { add.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })); add.click(); });
    const picks = [...document.querySelectorAll('[data-filter-pick]')].map(node => node.getAttribute('data-filter-pick'));
    expect(picks.sort()).toEqual(filterDeclarations(DEFAULT_EQUIPMENT).map(field => field.id).sort());
  });
  it.each(['열 선택', '고급 조건'])('UX-2 names the %s popover for screen readers', async label => {
    await mount();
    const trigger = [...host.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === label || node.textContent?.trim() === label)!;
    expect(trigger).toBeDefined();
    await act(async () => { trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })); trigger.click(); });
    expect(document.querySelector(`[role="dialog"][aria-label="${label}"]`)).not.toBeNull();
  });
  it('FIX3 clears matrix emphasis, selection and grouping on search without replacing the toolbar', async () => {
    const requests = await mount();
    const toolbar = host.querySelector('[data-configuration-toolbar]');
    const input = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => host.querySelector<HTMLElement>('[data-matrix-row="cfg-000000"] [data-matrix-column="EQ03"]')!.focus());
    act(() => [...host.querySelectorAll('button')].find(button => button.textContent === '같은 값 강조')!.click());
    expect(host.querySelector('[role="group"][aria-label="강조"]')).not.toBeNull();
    act(() => [...host.querySelectorAll('button')].find(button => button.textContent === '같은 값 묶기')!.click());
    act(() => input.focus());
    act(() => typeSearch(input, 'Pressure'));
    await settleQueries();
    expect(host.querySelector('[data-configuration-toolbar]')).toBe(toolbar);
    expect(document.activeElement).toBe(input);
    expect(host.querySelector('[role="group"][aria-label="강조"]')).toBeNull();
    expect([...host.querySelectorAll('button')].find(button => button.textContent === '같은 값 묶기')!.getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelector('[data-matrix-column][aria-selected="true"]')).toBeNull();
    expect(requests.mock.calls.at(-1)?.[0].params).toMatchObject({ q: 'Pressure', offset: 0, expanded: [] });
  });
  it('K1 registers the real Apply manifest and loads an applied period', async () => {
    expect(manifests[0].context).toEqual(contextCapabilities({ time: 'apply' }));
    expect(manifests[0].query?.mode).toBe('apply');
    expect(configurationTreeEndpoint.context).toEqual({ time: 'apply' });
    expect(SAVED_VIEW_SUPPORT.contextKeys).toEqual(['time']);
    const requests = await mount();
    expect(requests).toHaveBeenCalled();
    expect(host.textContent).not.toContain('아직 조회하지 않았습니다');
    expect([...host.querySelectorAll('button')].filter(button => button.textContent === '비교 실행')).toHaveLength(0);
    expect(picker().props.values).toEqual(DEFAULT_EQUIPMENT);
    expect(() => createRegistry({ ...assembly, menus: [...manifests, sourceMenu] })).not.toThrow();
  });
  it('loads the matrix with default conditions when only the Scope is provided', async () => {
    window.history.replaceState(null, '', '/mars/configuration?v=1&scopeId=MEM');
    const requests = await mount();
    expect(requests.mock.calls[0]?.[0].params).toMatchObject({ eq: DEFAULT_EQUIPMENT });
    expect(new URLSearchParams(window.location.search).get('from')).toBe('2026-09-25T09:00:00');
  });
  it('C4 retains explicit zero in the kernel draft, then commits two only on Apply', async () => {
    const requests = await mount();
    act(() => picker().props.onValuesChange([]));
    expect(picker().props.values).toEqual([]);
    expect(draft.draft.page).toContainEqual(['equipment', 'none']);
    expect(requests.mock.calls.at(-1)?.[0].params).toMatchObject({ eq: DEFAULT_EQUIPMENT });
    act(() => picker().props.onValuesChange(['EQ03']));
    expect(picker().props.values).toEqual(['EQ03']);
    act(() => picker().props.onValuesChange(['EQ03', 'EQ04']));
    expect(new URLSearchParams(window.location.search).has('equipment')).toBe(false);
    act(() => draft.apply());
    await settleQueries();
    expect(new URLSearchParams(window.location.search).get('equipment')).toBe('EQ03,EQ04');
    expect(requests.mock.calls.at(-1)?.[0].params).toMatchObject({ eq: ['EQ03', 'EQ04'] });
  });
  it('C3 keeps the search input and focus during multi-character queries, including empty results', async () => {
    // Dates let this regression reach the old Apply implementation too.
    window.history.replaceState(null, '', '/mars/configuration?v=1&scopeId=MEM&from=2026-11-16T00:00:00&to=2026-11-18T00:00:00&status=all');
    await mount();
    const input = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => input.focus());
    for (const value of ['P', 'Pr', 'Pressure', 'not-a-synthetic-item']) {
      act(() => typeSearch(input, value));
      await settleQueries();
      expect(host.querySelector('input[type="search"]')).toBe(input);
      expect(document.activeElement).toBe(input);
      expect(input.value).toBe(value);
    }
  });
  it('C1 retains the real matrix, focus and matching columns across a delayed window beyond 80 rows', async () => {
    window.history.replaceState(null, '', '/mars/configuration?v=1&scopeId=MEM&from=2026-11-16T00:00:00&to=2026-11-18T00:00:00&status=all&levels=module,category');
    let complete: ((value: ApiResponse<unknown>) => void) | undefined;
    let pending: TreeParams | undefined;
    const requests = vi.fn(async ({ params: query }: { endpoint: string; params: unknown }): Promise<ApiResponse<unknown>> => {
      const next = query as TreeParams;
      if (next.offset > 0) { pending = next; return new Promise(resolve => { complete = resolve; }); }
      return ok(windowPage(next));
    });
    await mount(requests);
    const viewport = host.querySelector<HTMLElement>('[data-matrix-viewport]')!;
    const cell = host.querySelector<HTMLElement>('[data-matrix-row="cfg-000000"] [data-matrix-column="EQ03"]')!;
    act(() => cell.focus());
    act(() => [...host.querySelectorAll('button')].find(button => button.textContent === '같은 값 강조')!.click());
    act(() => [...host.querySelectorAll('button')].find(button => button.textContent === '이 설비만 보기')!.click());
    const headers = () => [...viewport.querySelectorAll('[role="columnheader"]')].map(node => node.textContent);
    const before = headers();
    expect(before).toContain('EQ03'); expect(before).not.toContain('EQ01');
    act(() => cell.focus());
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 32 * 100 });
    act(() => cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true })));
    await settleQueries();
    expect(pending!.offset).toBeGreaterThanOrEqual(TREE_WINDOW);
    expect(host.querySelector('[data-matrix-viewport]')).toBe(viewport);
    expect(document.activeElement).toBe(cell);
    expect(viewport.getAttribute('aria-busy')).toBe('true');
    expect(headers()).toEqual(before);
    const data: TreePage = windowPage(pending!);
    await act(async () => complete!(ok(data)));
    await settleQueries();
    expect(host.querySelector('[data-matrix-viewport]')).toBe(viewport);
    expect(viewport.getAttribute('aria-busy')).toBe('false');
    expect(viewport.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.getAttribute('data-matrix-column')).toBe('EQ03');
    expect(headers()).toEqual(before);
  });
  it.each(['export', 'row'] as const)('C5 blocks stale %s actions until the requested search arrives', async action => {
    let complete: ((value: ApiResponse<unknown>) => void) | undefined;
    const requests = await mount(vi.fn(async ({ endpoint, params: query }: { endpoint: string; params: unknown }): Promise<ApiResponse<unknown>> => {
      const params = query as TreeParams;
      if (endpoint === configurationTreeEndpoint.id && params.q) return new Promise(resolve => { complete = resolve; });
      if (endpoint === configurationDetailEndpoint.id) return { ...ok(null), outcome: 'error', message: 'Item is outside the filtered result' };
      return ok(windowPage(params));
    }));
    const input = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    const exportButton = host.querySelector<HTMLButtonElement>('button[aria-label="내보내기"]')!;
    expect(exportButton.disabled).toBe(false);
    act(() => typeSearch(input, 'Pressure'));
    await settleQueries();
    expect(complete).toBeDefined();
    expect(host.querySelector('[data-matrix-viewport]')?.getAttribute('aria-busy')).toBe('true');
    if (action === 'export') {
      expect(exportButton.disabled).toBe(true);
    } else {
      const cell = host.querySelector<HTMLElement>('[data-matrix-row="cfg-000000"] [data-matrix-column="EQ03"]')!;
      act(() => { cell.focus(); cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
      await settleQueries();
      expect(requests.mock.calls.map(([request]) => request.endpoint)).not.toContain(configurationDetailEndpoint.id);
      expect(new URLSearchParams(window.location.search).has('trendItem')).toBe(false);
      expect(host.querySelector('[data-matrix-column][aria-selected="true"]')).toBeNull();
    }
    const params = requests.mock.calls.find(([request]) => (request.params as TreeParams).q === 'Pressure')![0].params as TreeParams;
    await act(async () => complete!(ok(windowPage(params))));
    await settleQueries();
    expect(exportButton.disabled).toBe(false);
  });
  it('C5 cancels an in-flight export and ignores its late refusal on a new search', async () => {
    let complete: ((value: ApiResponse<unknown>) => void) | undefined;
    let exportSignal: AbortSignal | undefined;
    await mount(vi.fn(async ({ endpoint, params: query }: { endpoint: string; params: unknown }, signal?: AbortSignal): Promise<ApiResponse<unknown>> => {
      if (endpoint !== configurationExportEndpoint.id) return ok(windowPage(query as TreeParams));
      exportSignal = signal;
      return new Promise(resolve => { complete = resolve; });
    }));
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="내보내기"]')!.click());
    await settleQueries();
    expect(complete).toBeDefined();
    expect(exportSignal?.aborted).toBe(false);
    act(() => typeSearch(host.querySelector<HTMLInputElement>('input[type="search"]')!, 'Pressure'));
    await settleQueries();
    await act(async () => complete!({ outcome: 'error', data: null, assessments: [], trust: null, correlationId: 'stale-export', message: 'Previous search refused' }));
    await settleQueries();
    expect(host.textContent).not.toContain('내보내기를 완료하지 못했습니다');
    expect(host.querySelector('output')?.textContent).not.toContain('stale-export');
    expect(exportSignal?.aborted).toBe(true);
  });
  it.each(['error', 'forbidden'] as const)('C2 retains SDK refusal guidance for %s export envelopes', async outcome => {
    window.history.replaceState(null, '', '/mars/configuration?v=1&scopeId=MEM&from=2026-11-16T00:00:00&to=2026-11-18T00:00:00&status=all');
    const reason = `Export exceeds ${EXPORT_LIMIT} rows`;
    await mount(vi.fn(async ({ endpoint: id, params: query }: { endpoint: string; params: unknown }): Promise<ApiResponse<unknown>> => id.endsWith('export')
      ? { outcome, data: null, assessments: [], trust: null, correlationId: 'cap-reason', message: reason }
      : ok(windowPage(query as TreeParams))));
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="내보내기"]')!.click());
    await settleQueries();
    if (outcome === 'error') {
      expect(host.querySelector('output')!.textContent).toContain(reason);
      expect(host.querySelector('output')!.textContent).toContain('cap-reason');
    } else {
      // The SDK intentionally redacts forbidden server details, retaining its permission guidance.
      expect(host.querySelector('output')!.textContent).toContain('접근 권한');
    }
    expect(host.textContent).toContain('10,000');
    expect(host.textContent).toContain('조건');
  });
  it('K3 pads the emphasis bar to the same inset as the summary', async () => {
    window.history.replaceState(null, '', '/mars/configuration?v=1&scopeId=MEM&from=2026-11-16T00:00:00&to=2026-11-18T00:00:00&status=all');
    await mount();
    act(() => host.querySelector<HTMLElement>('[data-matrix-row="cfg-000000"] [data-matrix-column="EQ03"]')!.focus());
    act(() => [...host.querySelectorAll('button')].find(button => button.textContent === '같은 값 강조')!.click());
    const bar = host.querySelector('[role="group"][aria-label="강조"]')!;
    expect(bar.parentElement!.classList.contains('px-2')).toBe(true);
    const summary = host.querySelector('[data-configuration-summary]')!;
    expect(summary.classList.contains('px-2')).toBe(false);
    expect(summary.closest('[data-configuration-toolbar]')!.classList.contains('px-2')).toBe(true);
  });
});

function SlotHost() { const slot = useDetailPanelSlotHost(); return <aside ref={slot.ref} data-test-slot />; }
describe('Configuration item drawer follows the selection (#2525)', () => {
  const group = { id: 'group:PM1', label: 'PM1', level: 0, kind: 'group', hasChildren: true, expanded: true, differences: 3 } as unknown as TreeRow;
  const named = (row: TreeRow): TreeRow => ({ ...row, item: { ...row.item!, item: `Item ${row.id}` } });
  async function mountDrawer() {
    const menuQuery = vi.fn(async ({ endpoint, params: query }: { endpoint: string; params: unknown }): Promise<ApiResponse<unknown>> => {
      const { focus } = query as { focus?: string };
      if (endpoint === 'configuration.detail') return focus === 'cfg-000001' ? new Promise(() => {}) : ok(named(windowPage({ ...(query as TreeParams), offset: Number(focus!.slice(4)) }).nodes[0]!).item);
      const page = windowPage(query as TreeParams);
      return ok({ ...page, nodes: [group, ...page.nodes.map(named)] });
    });
    const session = testSession(['analytics:view']);
    const adapter = testAdapter({ session: () => session, menuQuery });
    await act(async () => root.render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider><Configuration /><SlotHost /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>));
    await settleQueries();
    await vi.waitFor(() => expect(host.querySelector('[data-matrix-row="cfg-000001"]'), host.textContent ?? '').not.toBeNull());
  }
  const cell = (row: string, column: string) => host.querySelector<HTMLElement>(`[data-matrix-row="${row}"] [data-matrix-column="${column}"]`)!;
  const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent?.trim() === label);
  const slot = () => host.querySelector('[data-test-slot]')!;
  async function openDrawer() {
    act(() => cell('cfg-000000', 'EQ01').focus());
    await act(async () => button('선택 상세 열기')!.click());
    await settleQueries();
    await vi.waitFor(() => expect(slot().textContent).toContain('비교 상세'));
  }
  it('moves the drawer header and «이력» to another selected item while its detail loads', async () => {
    await mountDrawer();
    await openDrawer();
    expect(slot().querySelector('h2')?.textContent).toBe('Item cfg-000000');
    act(() => cell('cfg-000001', 'EQ01').focus());
    await settleQueries();
    // Its detail is still loading: the header already names the selected item, not the row the drawer opened on.
    expect(slot().querySelector('h2')?.textContent).toBe('Item cfg-000001');
    await act(async () => slot().querySelector<HTMLElement>('[role="tab"][id$="-trigger-history"]')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
    await act(async () => button('추세 열기')!.click());
    expect(new URLSearchParams(window.location.search).get('trendItem')).toBe('cfg-000001');
  });
  it('closes the drawer when a group row is selected, so «이력» never opens a group', async () => {
    await mountDrawer();
    await openDrawer();
    act(() => cell('group:PM1', 'identity').focus());
    await settleQueries();
    expect(slot().textContent).not.toContain('비교 상세');
    expect(button('추세 열기')).toBeUndefined();
    expect(new URLSearchParams(window.location.search).get('trendItem')).toBeNull();
  });
});

describe('Configuration trend workspace', () => {
  beforeEach(() => {
    const context = {
      setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(),
      beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), save: vi.fn(), restore: vi.fn(),
      rect: vi.fn(), clip: vi.fn(), setLineDash: vi.fn(), measureText: vi.fn(() => ({ width: 40 })),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  });
  afterEach(() => vi.restoreAllMocks());
  const trend = () => host.querySelector('[data-configuration-trend]');
  const currentTrend = () => new URLSearchParams(window.location.search).get('trendItem');
  const leaf = () => host.querySelector<HTMLElement>('[data-matrix-row="cfg-000000"] [data-matrix-column="identity"]')!;
  function mountTrend() {
    return mount(vi.fn(async ({ endpoint, params: query }) => {
      if (endpoint !== 'configuration.history') return ok(windowPage(query as TreeParams));
      const { itemId, equipment } = query as { itemId: string; equipment: string[] };
      const string = itemId === 'cfg-000001';
      return ok({ item: string ? 'Valve Mode' : 'Pressure', valueType: string ? 'string' : 'number', series: equipment.map(eq => ({
        equipment: eq, points: [{ at: '2026-11-16T00:00:00Z', value: string ? 'AUTO' : 120 }],
      })) });
    }));
  }
  it.each(['dblclick', 'Enter'])('opens the numeric panel below the matrix with %s and closes it', async gesture => {
    await mountTrend();
    await act(async () => {
      leaf().focus();
      if (gesture === 'Enter') leaf().dispatchEvent(new KeyboardEvent('keydown', { key: gesture, bubbles: true }));
      else leaf().dispatchEvent(new MouseEvent(gesture, { bubbles: true }));
    });
    await settleQueries();
    await vi.waitFor(() => expect(trend()?.textContent).toContain('Pressure'));
    expect(leaf().compareDocumentPosition(trend()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(currentTrend()).toBe('cfg-000000');
    await vi.waitFor(() => expect(trend()?.querySelector('[data-configuration-numeric] [role="img"]')).toBeTruthy());
    expect(trend()?.textContent).toContain('나머지 12대 · 동일');
    await act(async () => trend()?.querySelector<HTMLButtonElement>('[aria-label="추세 닫기"]')!.click());
    expect(trend()).toBeNull();
    expect(currentTrend()).toBeNull();
    expect(leaf()).not.toBeNull();
  });
  it('restores a string trend from a saved-view page key and reads all applied equipment', async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('trendItem', 'cfg-000001');
    url.searchParams.set('equipment', 'EQ01,EQ03');
    url.searchParams.set('hideSameCols', '1');
    window.history.replaceState(null, '', url);
    const calls = await mountTrend();
    await vi.waitFor(() => expect(trend()?.querySelector('[data-lane-scroll]')).toBeTruthy());
    expect(trend()?.textContent).toContain('AUTO');
    expect(SAVED_VIEW_SUPPORT.pageKeys).toContain('trendItem');
    expect(calls).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: 'configuration.history', params: { itemId: 'cfg-000001', equipment: ['EQ01', 'EQ03'] },
      context: expect.objectContaining({ from: '2026-11-16T00:00:00', to: '2026-11-18T00:00:00' }),
    }), expect.anything());
  });

  it('clears the chart on equipment Apply and ignores a late history reply', async () => {
    window.history.replaceState(null, '', `${window.location.href}&trendItem=cfg-000000&equipment=EQ01,EQ02`);
    const reply = (item: string, equipment: string[]): ApiResponse<ConfigHistory> => ok({
      item, valueType: 'string', series: equipment.map(eq => ({
        equipment: eq, points: [{ at: '2026-11-16T00:00:00Z', value: item }],
      })),
    });
    let finishEarlier!: (response: ApiResponse<ConfigHistory>) => void;
    let finishCurrent!: (response: ApiResponse<ConfigHistory>) => void;
    const requests = await mount(vi.fn(async ({ endpoint, params: query }) => {
      if (endpoint !== 'configuration.history') return ok(windowPage(query as TreeParams));
      const { equipment } = query as HistoryParams;
      if (equipment.includes('EQ04')) return new Promise<ApiResponse<ConfigHistory>>(resolve => { finishCurrent = resolve; });
      if (equipment.includes('EQ03')) return new Promise<ApiResponse<ConfigHistory>>(resolve => { finishEarlier = resolve; });
      return reply('Original', equipment);
    }));
    await vi.waitFor(() => expect(trend()?.querySelector('[data-lane-scroll]')).toBeTruthy());
    expect(trend()?.querySelector('h2')?.textContent).toBe('Original');
    const historyRequested = (equipment: string[]) => expect(requests).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'configuration.history', params: { itemId: 'cfg-000000', equipment } }), expect.anything(),
    );
    const applyEquipment = (equipment: string[]) => {
      act(() => picker().props.onValuesChange(equipment));
      act(() => draft.apply());
    };
    applyEquipment(['EQ01', 'EQ03']);
    expect(trend()?.querySelector('[data-lane-scroll]')).toBeNull();
    await vi.waitFor(() => historyRequested(['EQ01', 'EQ03']));
    applyEquipment(['EQ01', 'EQ04']);
    await vi.waitFor(() => historyRequested(['EQ01', 'EQ04']));
    expect(trend()?.querySelector('[data-lane-scroll]')).toBeNull();
    await act(async () => finishCurrent(reply('Applied', ['EQ01', 'EQ04'])));
    await vi.waitFor(() => expect(trend()?.querySelector('[data-lane-scroll]')).toBeTruthy());
    await act(async () => finishEarlier(reply('Late', ['EQ01', 'EQ03'])));
    await settleQueries();
    expect(trend()?.querySelector('[data-lane-scroll]')).toBeTruthy();
    expect(trend()?.querySelector('h2')?.textContent).toBe('Applied');
    expect(trend()?.textContent).not.toContain('Late');
  });
});

describe('Configuration equipment axis', () => {
  let restoreGeometry: () => void;
  beforeEach(() => { restoreGeometry = stubCompactTableGeometry(); });
  afterEach(() => { restoreGeometry(); });
  const switchAxis = async (label: string) => {
    await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === label)!.click());
    await settleQueries();
  };
  const button = (label: string) => [...host.querySelectorAll('button')].find(node => node.textContent?.trim() === label || node.getAttribute('aria-label') === label);
  const swapped = () => host.querySelector('[role="grid"][aria-label="Configuration"]');
  const axisStatus = () => [...host.querySelectorAll('[role="status"]')].find(node => node.textContent?.includes('설비 기준'));
  const requestParams = (requests: ReturnType<typeof vi.fn>) => requests.mock.calls.filter(([input]) => input.endpoint === 'configuration.pivot').at(-1)?.[0].params;
  const pivot = (params: TreeParams, count = 2) => {
    const items = windowPage({ ...params, offset: 0 }).nodes.slice(0, count).map(node => node.item!);
    const columns = items.map(({ values: _values, ...metadata }, index) => {
      const item = index === 0 ? 'Pressure' : 'Vacuum';
      return { ...metadata, item, key: `PM1 / Gas / ${item} / ${metadata.filename}` };
    });
    const rows = params.eq.map(id => ({ id, values: Object.fromEntries(items.map(item => [item.id, item.values[id]])) }));
    return { over: false, count, columns, rows };
  };

  it('preserves the query draft and uses the applied equipment and filters on axis switch and Back', async () => {
    const requests = await mount(vi.fn(async ({ endpoint, params: query }) => {
      const params = query as TreeParams;
      return ok(endpoint === 'configuration.pivot' ? pivot(params) : windowPage(params));
    }));
    await act(async () => picker().props.onValuesChange(['EQ02', 'EQ03']));
    const pending = draft.draft.page.find(([key]) => key === 'equipment');
    await switchAxis('설비 기준');
    expect(draft.draft.page.find(([key]) => key === 'equipment')).toEqual(pending);
    expect(draft.dirty).toContain('equipment');
    expect(requestParams(requests)?.eq).toEqual(DEFAULT_EQUIPMENT);
    expect(new URLSearchParams(window.location.search).get('axis')).toBe('equipment');
    await act(async () => window.history.back());
    await vi.waitFor(() => expect(new URLSearchParams(window.location.search).get('axis')).toBeNull());
    expect(host.querySelector('[data-matrix-viewport]')).not.toBeNull();
    expect(picker().props.values).toEqual(['EQ02', 'EQ03']);
  });

  it('restores a shared axis and filter, and announces the refused item count and axis', async () => {
    const requests = await mount(vi.fn(async ({ endpoint, params: query }) => {
      const params = query as TreeParams;
      return ok(endpoint === 'configuration.pivot' ? { over: true, count: 201 } : windowPage(params));
    }));
    await act(async () => {
      const url = new URL(window.location.href);
      url.searchParams.set('axis', 'equipment');
      url.searchParams.append('filter', 'module:equals:PM1');
      window.history.pushState(null, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await settleQueries();
    await vi.waitFor(() => expect(axisStatus()?.textContent).toBe('설비 기준'));
    expect([...host.querySelectorAll('[role="status"]')].some(node => node.textContent?.includes('항목 201개 · 최대 200개'))).toBe(true);
    expect(requestParams(requests)?.filters).toEqual([{ id: 'module', op: 'equals', value: 'PM1' }]);
    expect(swapped()).toBeNull();
  });

  it('rejects an unknown axis and leaves its URL intact for recovery', async () => {
    await mount();
    await act(async () => {
      window.history.pushState(null, '', window.location.href + '&axis=bogus');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(host.textContent).toContain('보기 축');
    expect(host.querySelector('[data-matrix-viewport]')).toBeNull();
    expect(new URLSearchParams(window.location.search).get('axis')).toBe('bogus');
  });

  it.each(['loading', 'error', 'empty'] as const)('shows the %s state for the pivot while retaining the toolbar', async state => {
    await mount(vi.fn(async ({ endpoint, params: query }) => {
      if (endpoint !== 'configuration.pivot') return ok(windowPage(query as TreeParams));
      if (state === 'loading') return new Promise(() => {});
      const result = state === 'empty' ? { over: false, count: 0, rows: [], columns: [] } : null;
      return { ...ok(result), outcome: state };
    }));
    await switchAxis('설비 기준');
    const text = { loading: '불러오는 중', error: '데이터를 불러오지 못했습니다', empty: '조건에 맞는 결과가 없습니다' };
    await vi.waitFor(() => expect(host.textContent).toContain(text[state]));
    expect(button('단계 순서')).toBeDefined();
    expect(swapped()).toBeNull();
  });

  it('labels the last item cell in full and keeps hidden item-axis settings out of the pivot', async () => {
    const requests = await mount(vi.fn(async ({ endpoint, params: query }) => {
      const params = query as TreeParams;
      return ok(endpoint === 'configuration.pivot' ? pivot(params) : { ...windowPage(params), sameColumns: ['EQ02'] });
    }));
    await act(async () => button('차이 없는 설비 숨기기')!.click());
    await act(async () => button('열 선택')!.click());
    const hidden = [...document.querySelectorAll('label')].find(label => label.textContent === 'EQ03')?.querySelector('button');
    await act(async () => hidden!.click());
    await act(async () => hidden!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await act(async () => button('같은 값 묶기')!.click());
    await switchAxis('설비 기준');
    await vi.waitFor(() => expect(swapped()?.querySelector('[aria-label="EQ01 · PM1 › Gas · Vacuum (config.cfg) · 120 · 일치"]')).toBeTruthy());
    const last = swapped()?.querySelector('[data-row-id="EQ01"]')?.lastElementChild;
    expect(last?.getAttribute('aria-label')).toBe('EQ01 · PM1 › Gas · Vacuum (config.cfg) · 120 · 일치');
    expect(last?.hasAttribute('title')).toBe(false);
    expect(swapped()?.querySelector('[data-row-id="EQ02"]')).not.toBeNull();
    expect(swapped()?.querySelector('[data-row-id="EQ03"]')).not.toBeNull();
    expect(requestParams(requests)).toEqual({
      eq: DEFAULT_EQUIPMENT, mode: 'all', ref: 'EQ01', asOf: 'latest', status: 'all', q: '', coreOnly: false, levels: DEFAULT_LEVELS, filters: [],
    });
    for (const label of ['같은 값 묶기', '차이 없는 설비 숨기기', '열 선택', '내보내기']) expect(button(label)).toBeUndefined();
    await act(async () => typeSearch(host.querySelector<HTMLInputElement>('input[type="search"]')!, 'Pressure'));
    await settleQueries();
    expect(requestParams(requests)).toMatchObject({ q: 'Pressure' });
    await switchAxis('항목 기준');
    expect(button('같은 값 묶기')?.getAttribute('aria-pressed')).toBe('true');
    expect(button('차이 없는 설비 숨기기')?.getAttribute('aria-pressed')).toBe('true');
    await act(async () => button('같은 값 묶기')!.click());
    expect(host.querySelector('[data-matrix-column="EQ02"]')).toBeNull();
    expect(host.querySelector('[data-matrix-column="EQ03"]')).toBeNull();
  });

  it('keeps same-named categories under distinct module paths in the equipment headers', async () => {
    await mount(vi.fn(async ({ endpoint, params: query }) => {
      const params = query as TreeParams;
      if (endpoint !== 'configuration.pivot') return ok(windowPage(params));
      const result = pivot(params);
      const last = result.columns[1];
      return ok({ ...result, columns: [result.columns[0], { ...last, module: 'PM2', key: last.key.replace('PM1', 'PM2') }] });
    }));
    await switchAxis('설비 기준');
    await vi.waitFor(() => expect(swapped()).not.toBeNull());
    const headers = [...swapped()!.querySelectorAll('[role="columnheader"][aria-colspan]')];
    const categories = headers.filter(header => header.textContent === 'Gas');
    expect(categories).toHaveLength(2);
    expect(categories.map(header => header.getAttribute('data-column'))).toEqual(['group:["PM1","Gas"]', 'group:["PM2","Gas"]']);
  });

  it('opens detail and trend for the same item and equipment in both axes, clearing selection on switch', async () => {
    const menuQuery = vi.fn(async ({ endpoint, params: query }: { endpoint: string; params: unknown }): Promise<ApiResponse<unknown>> => {
      const params = query as TreeParams;
      if (endpoint === 'configuration.pivot') return ok(pivot(params));
      if (endpoint === 'configuration.detail') return ok(windowPage(params).nodes[0]?.item);
      if (endpoint === 'configuration.history') return { ...ok(null), outcome: 'empty' };
      return ok(windowPage(params));
    });
    const session = testSession(['analytics:view']);
    const adapter = testAdapter({ session: () => session, menuQuery });
    await act(async () => root.render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider><Configuration /><SlotHost /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>));
    await settleQueries();

    async function checkDrawerAndTrend(cell: HTMLElement, gesture: 'dblclick' | 'Enter') {
      await act(async () => { cell.focus(); cell.click(); });
      await act(async () => button('선택 상세 열기')!.click());
      await settleQueries();
      const slot = host.querySelector('[data-test-slot]')!;
      await vi.waitFor(() => expect(slot.textContent).toContain('선택 설비 (EQ03)'));
      expect(slot.querySelector('h2')?.textContent).toBe('Pressure');
      expect(menuQuery).toHaveBeenLastCalledWith(expect.objectContaining({
        endpoint: 'configuration.detail', params: expect.objectContaining({ focus: 'cfg-000000', eq: DEFAULT_EQUIPMENT }),
      }), expect.anything());
      const close = slot.querySelector<HTMLButtonElement>('[aria-label="상세 닫기"]')!;
      await act(async () => close.click());
      await act(async () => cell.dispatchEvent(gesture === 'Enter' ? new KeyboardEvent('keydown', { key: gesture, bubbles: true }) : new MouseEvent(gesture, { bubbles: true })));
      await settleQueries();
      await vi.waitFor(() => expect(host.querySelector('[data-configuration-trend]')).not.toBeNull());
      const lastTrendCall = menuQuery.mock.calls.filter(([request]) => request.endpoint !== configurationLendingEndpoint.id).at(-1);
      expect(lastTrendCall).toEqual([expect.objectContaining({
        endpoint: 'configuration.history', params: { itemId: 'cfg-000000', equipment: DEFAULT_EQUIPMENT },
      }), expect.anything()]);
      await act(async () => button('추세 닫기')!.click());
    }

    await vi.waitFor(() => expect(host.querySelector('[data-matrix-row="cfg-000000"] [data-matrix-column="EQ03"]')).not.toBeNull());
    await checkDrawerAndTrend(host.querySelector('[data-matrix-row="cfg-000000"] [data-matrix-column="EQ03"]')!, 'dblclick');
    await switchAxis('설비 기준');
    await vi.waitFor(() => expect(button('선택 상세 열기')?.disabled).toBe(true));
    await checkDrawerAndTrend(swapped()!.querySelector('[data-row-id="EQ03"] [data-table-focus-column]')!, 'Enter');
    await switchAxis('항목 기준');
    expect(button('선택 상세 열기')?.disabled).toBe(true);
  });

  it('queries the same linked motion from the item and equipment axes', async () => {
    registerLentPanel('hw-time/trend', SourceTrend);
    const requests = await mount(withLending(async ({ endpoint, params: query }) => {
      const params = query as TreeParams;
      if (endpoint === sourceRuns.id) return { ...ok('linked motion'), assessments: [] };
      if (endpoint === 'configuration.pivot') return ok(pivot(params));
      if (endpoint === 'configuration.history') return { ...ok(null), outcome: 'empty' as const };
      return ok(windowPage(params));
    }));
    const itemCell = host.querySelector<HTMLElement>('[data-matrix-row="cfg-000000"] [data-matrix-column="EQ03"]')!;
    await act(async () => { itemCell.focus(); itemCell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    await vi.waitFor(() => expect(host.querySelector('[data-test-source-result]')?.textContent).toBe('linked motion'));
    const previous = requests.mock.calls.find(([request]) => request.endpoint === sourceRuns.id)![0];
    await act(async () => button('HW Time 추세 닫기')!.click());
    await switchAxis('설비 기준');
    await vi.waitFor(() => expect(swapped()).not.toBeNull());
    const equipmentCell = swapped()!.querySelector<HTMLElement>('[data-row-id="EQ03"] [data-table-focus-column]')!;
    await act(async () => { equipmentCell.focus(); equipmentCell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    await vi.waitFor(() => expect(host.querySelector('[data-test-source-result]')?.textContent).toBe('linked motion'));
    expect(requests.mock.calls.filter(([request]) => request.endpoint === sourceRuns.id).map(([request]) => request)).toEqual([previous, previous]);
    await act(async () => button('HW Time 추세 닫기')!.click());
    expect(document.activeElement).toBe(equipmentCell);
  });
});

it('binds a selected Configuration item to its scoped equipment and opens both trends from the shared URL', async () => {
  registerLentPanel('hw-time/trend', SourceTrend);
  window.history.replaceState(null, '', '/mars/configuration?v=1&scopeId=MEM&from=2026-11-16T00:00:00&to=2026-11-18T00:00:00&status=all&equipment=EQ01,EQ03&trendItem=cfg-000000');
  const endpointRequests = await mount(withLending(async ({ endpoint, params }: { endpoint: string; params: unknown }) => {
    if (endpoint === 'configuration.tree') return ok(windowPage(params as TreeParams));
    if (endpoint === 'configuration.history') return { ...ok(null), outcome: 'empty' as const };
    return ok(null);
  }));
  await vi.waitFor(() => expect(host.querySelector('[data-configuration-lent-hwtime]')).not.toBeNull());
  expect(host.querySelector('[data-configuration-trend]')).not.toBeNull();
  expect(JSON.parse(host.querySelector('[data-test-source-result]')!.getAttribute('data-test-equipment-labels')!)).toEqual({
    'MEM-PHOTO-0103': 'EQ01', 'MEM-PHOTO-0108': 'EQ03',
  });
  expect(endpointRequests).toHaveBeenCalledWith(expect.objectContaining({
    endpoint: 'hwTime.runs', params: {
      equipment: ['MEM-PHOTO-0103', 'MEM-PHOTO-0108'], moduleType: 'LK', module: 'LK1', motion: 'Pump',
    },
  }), expect.any(AbortSignal));
  const href = host.querySelector<HTMLAnchorElement>('[data-configuration-lent-hwtime] a')!.href;
  const destination = new URL(href);
  expect(destination.pathname).toBe('/mars/hw-time');
  expect(destination.searchParams.getAll('selectedEquipmentIds')).toEqual(['MEM-PHOTO-0103', 'MEM-PHOTO-0108']);
  expect(destination.searchParams.get('from')).toBe('2026-11-16T00:00:00');
  expect(destination.searchParams.get('to')).toBe('2026-11-18T00:00:00');
  expect(destination.searchParams.get('drillModule')).toBe('LK1');
  expect(destination.searchParams.get('drillMotion')).toBe('Pump');
});

it.each([
  { name: 'all mapped', equipmentId: 'MEM-PHOTO-0122', linkedMotion: { moduleType: 'LK', module: 'LK2', motion: 'Pump' } },
  { name: 'one unmapped', equipmentId: null, linkedMotion: { moduleType: 'LK', module: 'LK2', motion: 'Pump' } },
  { name: 'no linked Motion', equipmentId: 'MEM-PHOTO-0122', linkedMotion: null },
])('uses the Configuration response to decide lending when $name', async ({ equipmentId, linkedMotion }) => {
  registerLentPanel('hw-time/trend', SourceTrend);
  const url = new URL(window.location.href);
  url.searchParams.set('trendItem', 'cfg-000000');
  url.searchParams.set('equipment', 'EQ01,EQ03');
  window.history.replaceState(null, '', url);
  const requests = await mount(vi.fn(async ({ endpoint, params }: { endpoint: string; params: unknown }) => {
    if (endpoint === 'configuration.tree') return ok(windowPage(params as TreeParams));
    if (endpoint === configurationLendingEndpoint.id) return ok({ linkedMotion, equipmentColumns: [
      { id: 'EQ01', label: 'Reference tool', equipmentId: 'MEM-PHOTO-0119' },
      { id: 'EQ03', label: 'Comparison tool', equipmentId },
    ] });
    if (endpoint === sourceRuns.id) return { ...ok('linked motion'), assessments: [] };
    return { ...ok(null), outcome: 'empty' as const };
  }));
  await settleQueries();
  expect(host.querySelector('[data-configuration-trend]')).not.toBeNull();
  if (linkedMotion && equipmentId) {
    await vi.waitFor(() => expect(host.querySelector('[data-test-source-result]')?.textContent).toBe('linked motion'));
    const calls = requests.mock.calls.filter(([request]) => request.endpoint === sourceRuns.id);
    expect(calls.map(([request]) => request.params)).toEqual([{
      equipment: ['MEM-PHOTO-0119', equipmentId], moduleType: 'LK', module: 'LK2', motion: 'Pump',
    }]);
    return;
  }
  const reason = host.querySelector('[data-configuration-bottom] [role="status"]');
  if (linkedMotion) expect(reason?.textContent).toBe('다음 열은 HW Time 설비와 연결되지 않습니다. Comparison tool');
  else expect(reason).toBeNull();
  expect(host.querySelector('[data-configuration-lent-hwtime]')).toBeNull();
  expect(requests.mock.calls.some(([request]) => request.endpoint === sourceRuns.id)).toBe(false);
});

it('keeps the settings trend and shows a reason without querying a separately denied HW Time source', async () => {
  registerLentPanel('hw-time/trend', SourceTrend);
  const denied = createRegistry({ ...assembly, menus: [...manifests, { ...sourceMenu, additionalPermissions: [sourcePermission] }] });
  const requests = await mount(withLending(async ({ endpoint, params }: { endpoint: string; params: unknown }) =>
    endpoint === 'configuration.tree' ? ok(windowPage(params as TreeParams)) : { ...ok(null), outcome: 'empty' as const }), denied);
  const cell = host.querySelector<HTMLElement>('[data-matrix-row="cfg-000000"] [data-matrix-column="EQ03"]')!;
  await act(async () => { cell.focus(); cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
  await vi.waitFor(() => expect(host.querySelector('[data-configuration-trend]')).not.toBeNull());
  // The reason names the lending menu and its declared panel title (Kernel), not a Configuration string.
  await vi.waitFor(() => expect(host.textContent).toContain(`${sourceMenu.label.ko}의 ${sourceTitle.ko} 패널을 볼 권한이 없습니다.`));
  expect(host.querySelector('[data-configuration-lent-hwtime]')).toBeNull();
  expect(requests.mock.calls.some(([request]) => request.endpoint === 'hwTime.runs')).toBe(false);
});

it.each(['no matrix selection', 'a different matrix selection'])('returns focus after closing the restored HW Time trend with %s', async selection => {
  registerLentPanel('hw-time/trend', SourceTrend);
  const load = withLending(async ({ endpoint, params }: { endpoint: string; params: unknown }) =>
    endpoint === 'configuration.tree' ? ok(windowPage(params as TreeParams)) : { ...ok(null), outcome: 'empty' as const });
  const url = new URL(window.location.href);
  url.searchParams.set('trendItem', 'cfg-000000');
  url.searchParams.set('hwTrendItem', 'cfg-000000');
  const withSelection = selection === 'a different matrix selection';
  if (!withSelection) window.history.replaceState(null, '', url);
  const requests = await mount(load);
  let target = host.querySelector<HTMLElement>('[data-platform-page-content]');
  if (withSelection) {
    target = host.querySelector<HTMLElement>('[data-matrix-row="cfg-000001"] [data-matrix-column="EQ03"]');
    await act(async () => target!.focus());
    expect(target?.getAttribute('aria-selected')).toBe('true');
    await act(async () => {
      window.history.pushState(null, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
  } else {
    expect(host.querySelector('[role="gridcell"][aria-selected="true"]')).toBeNull();
  }
  const close = await vi.waitFor(() => {
    const button = host.querySelector<HTMLButtonElement>('button[aria-label="HW Time 추세 닫기"]');
    expect(button).not.toBeNull();
    return button!;
  });
  const sourceQueryCount = requests.mock.calls.filter(([request]) => request.endpoint === sourceRuns.id).length;
  await act(async () => { close!.focus(); close!.click(); });
  expect(new URLSearchParams(window.location.search).get('hwTrendItem')).toBe('off');
  expect(host.querySelector('[data-configuration-lent-hwtime]')).toBeNull();
  expect(host.querySelector('[data-configuration-trend]')).not.toBeNull();
  expect(document.activeElement).toBe(target);
  expect(requests.mock.calls.filter(([request]) => request.endpoint === sourceRuns.id)).toHaveLength(sourceQueryCount);
});

it('renders a disabled destination with a reason when registered and hides an unregistered destination', async () => {
  await act(async () => root.render(<I18nProvider><OpenHwTimeLink link={{
    kind: 'link', href: '/mars/hw-time', allowed: false, droppedPageKeys: [],
  }} /></I18nProvider>));
  const disabled = host.querySelector<HTMLButtonElement>('button')!;
  expect(disabled.disabled).toBe(true);
  expect(disabled.getAttribute('aria-description')).toBeTruthy();
  expect(host.querySelector('a')).toBeNull();
  await act(async () => root.render(<I18nProvider><OpenHwTimeLink link={{
    kind: 'none', href: null, allowed: false, droppedPageKeys: [],
  }} /></I18nProvider>));
  expect(host.children).toHaveLength(0);
});

it('follows a second linked item and ignores the late HW Time result after selecting an unbound item', async () => {
  registerLentPanel('hw-time/trend', SourceTrend);
  let complete: ((response: ApiResponse<unknown>) => void) | undefined;
  let sourceSignal: AbortSignal | undefined;
  const requests = await mount(withLending(async ({ endpoint, params }: { endpoint: string; params: unknown }, signal?: AbortSignal) => {
    if (endpoint === 'configuration.tree') return ok(windowPage(params as TreeParams));
    if (endpoint !== sourceRuns.id) return { ...ok(null), outcome: 'empty' as const };
    if ((params as { module: string }).module === 'LK1') {
      sourceSignal = signal;
      return new Promise<ApiResponse<unknown>>(resolve => { complete = resolve; });
    }
    return { ...ok('second motion'), assessments: [] };
  }));
  const cell = (item: string) => host.querySelector<HTMLElement>(`[data-matrix-row="${item}"] [data-matrix-column="EQ03"]`)!;
  const first = cell('cfg-000000');
  await act(async () => { first.focus(); first.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
  await vi.waitFor(() => expect(complete).toBeDefined());
  await settleQueries();
  const second = cell('cfg-000001');
  await act(async () => { second.focus(); second.click(); });
  await vi.waitFor(() => expect(host.querySelector('[data-test-source-result]')?.textContent).toBe('second motion'));
  expect(second.getAttribute('aria-selected'), window.location.search).toBe('true');
  expect(new URLSearchParams(window.location.search).get('hwTrendItem'), window.location.search).toBe('cfg-000001');
  expect(requests).toHaveBeenCalledWith(expect.objectContaining({ endpoint: sourceRuns.id, params: expect.objectContaining({ module: 'LK2' }) }), expect.any(AbortSignal));
  const unbound = cell('cfg-000002');
  await act(async () => { unbound.focus(); unbound.click(); });
  await vi.waitFor(() => expect(host.querySelector('[data-configuration-lent-hwtime]')).toBeNull());
  await act(async () => complete!({ ...ok('late first motion'), assessments: [] }));
  expect(sourceSignal?.aborted).toBe(true);
  expect(host.querySelector('[data-configuration-lent-hwtime]')).toBeNull();
  expect(host.querySelector('[data-configuration-trend]')).not.toBeNull();
  await act(async () => { first.focus(); first.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
  const close = await vi.waitFor(() => {
    const button = host.querySelector<HTMLButtonElement>('button[aria-label="HW Time 추세 닫기"]');
    expect(button).not.toBeNull();
    return button!;
  });
  await act(async () => { close.focus(); close.click(); });
  expect(document.activeElement).toBe(first);
  expect(host.querySelector('[data-configuration-lent-hwtime]')).toBeNull();
});

it('follows the latest selection while a previous lending mapping is still loading', async () => {
  registerLentPanel('hw-time/trend', SourceTrend);
  const url = new URL(window.location.href);
  url.searchParams.set('trendItem', 'cfg-000000');
  url.searchParams.set('equipment', 'EQ01,EQ03');
  window.history.replaceState(null, '', url);
  let complete: (() => void) | undefined;
  const requests = await mount(vi.fn(async ({ endpoint, params }: { endpoint: string; params: unknown }) => {
    if (endpoint === 'configuration.tree') return ok(windowPage(params as TreeParams));
    if (endpoint === configurationLendingEndpoint.id) {
      const data = lendingFixture(params as HistoryParams);
      if ((params as HistoryParams).itemId === 'cfg-000001') {
        return new Promise<ApiResponse<unknown>>(resolve => { complete = () => resolve(ok(data)); });
      }
      return ok(data);
    }
    if (endpoint === sourceRuns.id) return { ...ok('linked motion'), assessments: [] };
    return { ...ok(null), outcome: 'empty' as const };
  }));
  await vi.waitFor(() => expect(host.querySelector('[data-test-source-result]')?.textContent).toBe('linked motion'));
  const select = (itemId: string) => {
    const cell = host.querySelector<HTMLElement>(`[data-matrix-row="${itemId}"] [data-matrix-column="EQ03"]`)!;
    return act(async () => { cell.focus(); cell.click(); });
  };
  await select('cfg-000001');
  await vi.waitFor(() => expect(complete).toBeDefined());
  expect(host.querySelector('[data-configuration-lent-hwtime]')).toBeNull();
  await select('cfg-000002');
  await act(async () => complete!());
  await settleQueries();
  expect(new URLSearchParams(window.location.search).get('hwTrendItem')).toBe('off');
  expect(host.querySelector('[data-configuration-lent-hwtime]')).toBeNull();
  expect(requests.mock.calls.filter(([request]) => request.endpoint === sourceRuns.id)).toHaveLength(1);
});

it.each(['explicit activation', 'restored URL'])('C2 follows successive selections before the first mapping completes from %s', async entry => {
  registerLentPanel('hw-time/trend', SourceTrend);
  const url = new URL(window.location.href);
  url.searchParams.set('equipment', 'EQ01,EQ03');
  if (entry === 'restored URL') url.searchParams.set('trendItem', 'cfg-000000');
  window.history.replaceState(null, '', url);
  const completions = new Map<string, () => void>();
  const requests = await mount(vi.fn(async ({ endpoint, params }: { endpoint: string; params: unknown }): Promise<ApiResponse<unknown>> => {
    if (endpoint === 'configuration.tree') return ok(windowPage(params as TreeParams));
    if (endpoint === configurationLendingEndpoint.id) {
      const request = params as HistoryParams;
      return new Promise(resolve => { completions.set(request.itemId, () => resolve(ok(lendingFixture(request)))); });
    }
    if (endpoint === sourceRuns.id) return { ...ok('linked motion'), assessments: [] };
    return { ...ok(null), outcome: 'empty' };
  }));
  const cell = (itemId: string) => host.querySelector<HTMLElement>(`[data-matrix-row="${itemId}"] [data-matrix-column="EQ03"]`)!;
  if (entry === 'explicit activation') {
    const first = cell('cfg-000000');
    await act(async () => { first.focus(); first.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
  }
  await vi.waitFor(() => expect(completions.has('cfg-000000')).toBe(true));
  const second = cell('cfg-000001');
  await act(async () => { second.focus(); second.click(); });
  expect(new URLSearchParams(window.location.search).get('hwTrendItem')).toBe('cfg-000001');
  await vi.waitFor(() => expect(completions.has('cfg-000001')).toBe(true));
  const unbound = cell('cfg-000002');
  await act(async () => { unbound.focus(); unbound.click(); });
  await act(async () => { completions.get('cfg-000001')!(); completions.get('cfg-000000')!(); });
  await settleQueries();
  expect(new URLSearchParams(window.location.search).get('hwTrendItem')).toBe('off');
  expect(host.querySelector('[data-configuration-lent-hwtime]')).toBeNull();
  expect(host.querySelector('[data-configuration-trend]')).not.toBeNull();
  expect(requests.mock.calls.filter(([request]) => request.endpoint === sourceRuns.id)).toHaveLength(0);
});

it.each([
  { name: 'timeout', outcome: 'timeout', sourceDenied: false, reason: 'HW Time 연결 정보를 불러오지 못했습니다.' },
  { name: 'mapping forbidden', outcome: 'forbidden', sourceDenied: false, reason: 'HW Time 연결 정보를 볼 권한이 없습니다.' },
  { name: 'source permission denial before timeout', outcome: 'timeout', sourceDenied: true, reason: `${sourceMenu.label.ko}의 ${sourceTitle.ko} 패널을 볼 권한이 없습니다.` },
] as const)('C3 shows the lending reason for $name', async ({ outcome, sourceDenied, reason }) => {
  registerLentPanel('hw-time/trend', SourceTrend);
  const testRegistry = sourceDenied
    ? createRegistry({ ...assembly, menus: [...manifests, { ...sourceMenu, additionalPermissions: [sourcePermission] }] })
    : registry;
  const url = new URL(window.location.href);
  url.searchParams.set('trendItem', 'cfg-000000');
  window.history.replaceState(null, '', url);
  const requests = await mount(vi.fn(async ({ endpoint, params }: { endpoint: string; params: unknown }): Promise<ApiResponse<unknown>> => {
    if (endpoint === 'configuration.tree') return ok(windowPage(params as TreeParams));
    return { ...ok(null), outcome: endpoint === configurationLendingEndpoint.id ? outcome : 'empty' };
  }), testRegistry);
  await settleQueries();
  expect(host.querySelector('[data-configuration-bottom] [role="status"]')?.textContent).toBe(reason);
  expect(host.querySelector('[data-configuration-trend]')).not.toBeNull();
  expect(host.querySelector('[data-configuration-lent-hwtime]')).toBeNull();
  expect(requests.mock.calls.filter(([request]) => request.endpoint === sourceRuns.id)).toHaveLength(0);
});
