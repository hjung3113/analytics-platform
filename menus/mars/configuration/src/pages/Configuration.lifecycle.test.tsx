// @vitest-environment jsdom
import { act, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Settings } from 'lucide-react';
import { contextCapabilities, groupId, menuPermission, spaceId, type ApiResponse } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, useQueryDraft } from '@ap/kernel';
import { settleQueries, testAdapter, testSession, testSpace, useToastsForTest } from '@ap/kernel/testing';
import type { PageFilterField } from '@ap/components';
import { configurationDetailEndpoint, configurationExportEndpoint, configurationTreeEndpoint, DEFAULT_EQUIPMENT, EXPORT_LIMIT, SAVED_VIEW_SUPPORT, TREE_WINDOW, filterDeclarations, type TreePage, type TreeParams, type TreeRow } from '../endpoints';
import { manifests } from '../index';
import Configuration from './Configuration';

const controls = vi.hoisted(() => ({ fields: [] as readonly PageFilterField[] }));
vi.mock('@ap/components', async original => ({ ...await original<object>(),
  PageFilterBar: ({ fields, actions }: { fields: readonly PageFilterField[]; actions: ReactNode }) => { controls.fields = fields; return <div>{actions}</div>; },
}));
// Bounded transport fixture; real handlers and default hierarchy are covered in mock/index.test.ts.
function windowPage(params: TreeParams): TreePage {
  const totalItems = params.q === 'not-a-synthetic-item' ? 0 : TREE_WINDOW * 3;
  const nodes: TreeRow[] = Array.from({ length: Math.min(TREE_WINDOW, totalItems - params.offset) }, (_, local) => {
    const id = `cfg-${String(params.offset + local).padStart(6, '0')}`;
    const item = { id, key: id, module: 'PM1', category: 'Gas', item: 'Pressure', filename: 'config.cfg', group: 'PM1 / Gas', coreKnown: true, diff: true, violation: false, missing: false, notComparable: false, source: 'synthetic', collectedAt: '2026-11-17T00:00:00Z', values: Object.fromEntries(params.eq.map(eq => [eq, { value: eq === 'EQ03' ? 125 : 120, state: 'diff' as const }])) };
    return { id, item, label: item.item, level: 2, kind: 'leaf', hasChildren: false, expanded: false, differences: 1 };
  });
  return { nodes, offset: params.offset, totalVisible: totalItems, totalItems, expanded: ['fixture-group'], sameColumns: [], firstItem: nodes[0]?.id ?? null, counts: { all: totalItems, review: totalItems, diff: totalItems, missing: 0, violation: 0 } };
}
const assembly = { permissions: [menuPermission('analytics:view')], spaces: [testSpace({ homeMenuId: 'configuration' })], groups: [{ id: groupId('configuration'), label: { ko: '설정', en: 'Configuration' }, icon: Settings, space: spaceId('mars') }] };
const registry = createRegistry({ ...assembly, menus: manifests });
let draft: ReturnType<typeof useQueryDraft>;
function DraftProbe() { draft = useQueryDraft(); return null; }
function Toasts() { const toasts = useToastsForTest(); return <output>{JSON.stringify(toasts)}</output>; }
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  window.history.replaceState(null, '', '/mars/configuration?v=1&from=2026-11-16T00:00:00&to=2026-11-18T00:00:00&status=all');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const ok = <T,>(data: T): ApiResponse<T> => ({ outcome: 'ok', data, assessments: [{ kind: 'collection', state: 'unknown', reason: 'source_unavailable' }, { kind: 'coverage', state: 'unknown', reason: 'source_unavailable' }], trust: null, correlationId: 'configuration-test' });
async function mount(menuQuery = vi.fn(async ({ params: query }: { endpoint: string; params: unknown }): Promise<ApiResponse<unknown>> => ok(windowPage(query as TreeParams))), expectData = true) {
  const session = testSession(['analytics:view']);
  const adapter = testAdapter({ session: () => session, menuQuery });
  await act(async () => root.render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Configuration /><Toasts /><DraftProbe /></PlatformProvider></I18nProvider>));
  await settleQueries();
  if (expectData) await vi.waitFor(() => expect(host.querySelector('[data-matrix-viewport]'), host.textContent ?? '').not.toBeNull());
  return menuQuery;
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
    expect(host.querySelector('[aria-selected="true"]')).toBeNull();
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
    expect(() => createRegistry({ ...assembly, menus: manifests })).not.toThrow();
  });
  it('K1 records the SDK bare-route idle gap instead of auto-applying the draft', async () => {
    window.history.replaceState(null, '', '/mars/configuration');
    const requests = await mount(undefined, false);
    expect(requests).not.toHaveBeenCalled();
    expect(host.textContent).toContain('아직 조회하지 않았습니다');
    expect(draft.draft.global.from).not.toBeNull();
    expect(new URLSearchParams(window.location.search).has('from')).toBe(false);
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
    window.history.replaceState(null, '', '/mars/configuration?v=1&from=2026-11-16T00:00:00&to=2026-11-18T00:00:00&status=all');
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
    window.history.replaceState(null, '', '/mars/configuration?v=1&from=2026-11-16T00:00:00&to=2026-11-18T00:00:00&status=all&levels=module,category');
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
      expect(host.querySelector('[aria-selected="true"]')).toBeNull();
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
    window.history.replaceState(null, '', '/mars/configuration?v=1&from=2026-11-16T00:00:00&to=2026-11-18T00:00:00&status=all');
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
    window.history.replaceState(null, '', '/mars/configuration?v=1&from=2026-11-16T00:00:00&to=2026-11-18T00:00:00&status=all');
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
