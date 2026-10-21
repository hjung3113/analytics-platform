// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Activity } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider, usePlatform } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../../index';
import { type CatalogData } from '../../endpoints';
import ChartCatalog from './ChartCatalog';

// Canvas is an external rendering boundary; keep the real public chart components and controls.
const canvas = vi.hoisted(() => ({ init: vi.fn(), dispose: vi.fn(), options: [] as unknown[] }));
vi.mock('../../../../../../packages/components/node_modules/echarts/core.js', () => ({ use: vi.fn(), init: (...args: unknown[]) => {
  canvas.init(...args);
  return { setOption: (option: unknown) => canvas.options.push(option), on: vi.fn(), off: vi.fn(), dispose: canvas.dispose, resize: vi.fn(), dispatchAction: vi.fn(), getWidth: () => 800, getHeight: () => 300, getModel: () => ({ getComponent: () => null }) };
} }));
const registry = createRegistry({
  spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, description: { ko: '분석 목적', en: 'Analysis purpose' }, permission: 'analytics:view', homeMenuId: 'productivity-overview' }],
  groups: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, icon: Activity, space: 'analytics' }], menus: manifests,
});
const fixture: CatalogData = {
  current: [{ at: '2026-09-25T09:00:00', sourceAt: '2026-09-25T09:00:00', value: 24 }, { at: '2026-09-25T21:00:00', sourceAt: '2026-09-25T21:00:00', value: 32 }],
  previous: [{ at: '2026-09-25T09:00:00', sourceAt: '2026-09-24T09:00:00', value: 21 }, { at: '2026-09-25T21:00:00', sourceAt: '2026-09-24T21:00:00', value: 29 }],
  previousFrom: '2026-09-24T09:00:00', previousTo: '2026-09-25T09:00:00',
  heatmap: { xLabels: ['09', '21'], yLabels: ['PHOTO'], cells: [{ x: '09', y: 'PHOTO', value: 24 }, { x: '21', y: 'PHOTO', value: null }] },
  donut: [{ id: 'EQ-1', label: 'EQ-1', value: 24 }, { id: 'EQ-2', label: 'EQ-2', value: 32 }],
  scatter: [{ id: 'EQ-1', x: 24, y: 32, group: 'PHOTO' }, { id: 'EQ-2', x: null, y: 40, group: 'PHOTO' }],
  boxPlot: [{ id: 'EQ-1', label: 'EQ-1', stats: { min: 10, q1: 20, median: 25, q3: 30, max: 40, n: 18 } }],
  pareto: Array.from({ length: 6 }, (_, i) => ({ id: `EQ-${i + 1}`, label: `EQ-${i + 1}`, value: 40 - i * 5 })),
};
const session = testSession(['analytics:view', 'platform:view']);
const query = vi.fn(async () => ({ outcome: 'ok' as const, data: fixture, assessments: [{ kind: 'collection' as const, state: 'confirmed' as const }, { kind: 'coverage' as const, state: 'confirmed' as const }], trust: null, correlationId: 'catalog' }));
function ContextControls() {
  const { setGlobal } = usePlatform();
  return <><button onClick={() => setGlobal({ from: '2026-09-24T09:00:00' })}>Change time</button><button onClick={() => setGlobal({ scopeId: 'FDRY' })}>Change Scope</button></>;
}
function mount(kind: string = 'line') {
  window.history.replaceState(null, '', `/analytics/chart-catalog?v=1&scopeId=MEM&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&kind=${kind}`);
  const adapter = testAdapter({ session: () => session, menuQuery: query });
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><ChartCatalog /><ContextControls /></PlatformProvider></I18nProvider>);
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
async function table() { click('표로 보기'); return screen.findByRole('table', { name: /차트/ }); }
const summary = () => screen.getByRole('region', { name: '선택 요약' });
beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); query.mockClear(); canvas.init.mockClear(); canvas.dispose.mockClear(); canvas.options.length = 0; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('chart catalog route and lifetime', () => {
  it('restores a kind, uses shared tab keyboard navigation, and falls back safely for unknown values', async () => {
    mount('nonsense');
    const tab = await screen.findByRole('tab', { name: /^선 / });
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('status', { name: '차트 종류 안내' }).textContent).toContain('nonsense');
    tab.focus(); fireEvent.keyDown(tab, { key: 'ArrowRight' });
    await waitFor(() => expect(screen.getByRole('tab', { name: /^막대 / }).getAttribute('aria-selected')).toBe('true'));
    expect(new URLSearchParams(window.location.search).get('kind')).toBe('bar');
    const state = window.location.href;
    cleanup(); mount(new URL(state).searchParams.get('kind')!);
    expect((await screen.findByRole('tab', { name: /^막대 / })).getAttribute('aria-selected')).toBe('true');
  });
  it('opens/closes the rail with focus return, supports separator keys, and keeps the width while the page stays open', async () => {
    mount(); await screen.findByRole('img');
    click('동작·지원 열기');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '동작·지원 접기' }));
    const separator = screen.getByRole('separator');
    fireEvent.keyDown(separator, { key: 'ArrowLeft' }); expect(separator.getAttribute('aria-valuenow')).toBe('316');
    fireEvent.keyDown(separator, { key: 'ArrowRight' }); expect(separator.getAttribute('aria-valuenow')).toBe('300');
    fireEvent.keyDown(separator, { key: 'End' }); expect(separator.getAttribute('aria-valuenow')).toBe('420');
    fireEvent.keyDown(separator, { key: 'Home' }); expect(separator.getAttribute('aria-valuenow')).toBe('240');
    fireEvent.keyDown(separator, { key: 'Enter' }); expect(separator.getAttribute('aria-valuenow')).toBe('300');
    fireEvent.keyDown(separator, { key: 'End' });
    click('동작·지원 접기');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '동작·지원 열기' }));
    click('동작·지원 열기'); expect(screen.getByRole('separator').getAttribute('aria-valuenow')).toBe('420');
    click('너비 초기화'); expect(screen.getByRole('separator').getAttribute('aria-valuenow')).toBe('300');
  });
  it('clamps to actual content width, stacks support when narrow and restores the saved preferred width', async () => {
    mount(); await screen.findByRole('img'); click('동작·지원 열기');
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'End' });
    const workspace = screen.getByRole('region', { name: '차트 카탈로그 작업 영역' });
    let width = 800;
    vi.spyOn(workspace, 'getBoundingClientRect').mockImplementation(() => ({ width, top: 126, left: 0, right: width, bottom: 800, height: 674, x: 0, y: 126, toJSON: () => ({}) }));
    fireEvent(window, new Event('resize'));
    expect(screen.getByRole('separator').getAttribute('aria-valuenow')).toBe('296');
    width = 650; fireEvent(window, new Event('resize'));
    expect(screen.queryByRole('separator')).toBeNull();
    expect(screen.getByRole('complementary', { name: '동작·지원' }).className).toContain('catalog-support-stacked');
    width = 1100; fireEvent(window, new Event('resize'));
    expect(screen.getByRole('separator').getAttribute('aria-valuenow')).toBe('420');
  });
  it('pointer resizing changes only support width', async () => {
    mount('donut'); await screen.findByRole('img'); click('동작·지원 열기');
    const separator = screen.getByRole('separator');
    separator.setPointerCapture = vi.fn(); separator.releasePointerCapture = vi.fn();
    vi.stubGlobal('PointerEvent', MouseEvent);
    const count = query.mock.calls.length;
    fireEvent.pointerDown(separator, { button: 0, clientX: 900, pointerId: 1 });
    fireEvent.pointerMove(separator, { clientX: 860, pointerId: 1 });
    fireEvent.pointerUp(separator, { pointerId: 1 });
    expect(separator.getAttribute('aria-valuenow')).toBe('340');
    expect(query.mock.calls.length).toBe(count);
  });
  it.each(['heatmap', 'donut', 'scatter', 'boxPlot', 'pareto'] as const)('%s keeps selection/table/instance through layout changes, Details only on explicit actions, Reset clears', async kind => {
    mount(kind); await screen.findByRole('img');
    const dataTable = await table();
    const checkbox = within(dataTable).getAllByRole('checkbox')[0];
    fireEvent.click(checkbox);
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByRole('status', { name: '상세 결과' })).toBeNull();
    fireEvent.click(within(summary()).getByRole('button', { name: '상세' }));
    expect(screen.getByRole('status', { name: '상세 결과' }).textContent).toContain(kind === 'heatmap' ? 'PHOTO' : 'EQ-1');
    const init = canvas.init.mock.calls.length; expect(init).toBeGreaterThan(0); const fetches = query.mock.calls.length;
    click('동작·지원 열기');
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'End' });
    click('동작·지원 접기'); click('집중');
    expect(within(dataTable).getAllByRole('checkbox')[0].getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('table', { name: /차트/ })).toBe(dataTable);
    expect(canvas.init.mock.calls.length).toBe(init); expect(query.mock.calls.length).toBe(fetches);
    click('집중'); click('초기화');
    expect(checkbox.getAttribute('aria-checked')).toBe('false');
    expect(within(summary()).queryByRole('button', { name: '상세' })).toBeNull();
    fireEvent.click(within(dataTable).getAllByRole('button', { name: '상세' })[0]);
    expect(screen.getByRole('status', { name: '상세 결과' }).textContent).toContain(kind === 'heatmap' ? 'PHOTO' : 'EQ-1');
  });
  it('does not offer Details for the generated Pareto remainder', async () => {
    mount('pareto'); await screen.findByRole('img'); const dataTable = await table();
    const remainder = within(dataTable).getByRole('row', { name: /기타/ });
    expect(within(remainder).queryByRole('button', { name: '상세' })).toBeNull();
    fireEvent.click(within(remainder).getByRole('checkbox'));
    expect(within(summary()).queryByRole('button', { name: '상세' })).toBeNull();
  });
  it.each(['Change time', 'Change Scope'])('%s clears chart selection and detail output', async action => {
    mount('donut'); await screen.findByRole('img'); const dataTable = await table();
    fireEvent.click(within(dataTable).getAllByRole('checkbox')[0]);
    fireEvent.click(within(summary()).getByRole('button', { name: '상세' }));
    click(action);
    await waitFor(() => expect(screen.queryByRole('status', { name: '상세 결과' })).toBeNull());
    await screen.findByRole('img');
    const currentTable = screen.queryByRole('table', { name: /차트/ }) ?? await table();
    expect(within(currentTable).getAllByRole('checkbox')[0].getAttribute('aria-checked')).toBe('false');
  });
  it('changing kind clears kind-specific selection and Details', async () => {
    mount('donut'); await screen.findByRole('img'); const dataTable = await table(); fireEvent.click(within(dataTable).getAllByRole('checkbox')[0]);
    fireEvent.click(within(summary()).getByRole('button', { name: '상세' }));
    fireEvent.mouseDown(screen.getByRole('tab', { name: /^산점도 / }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(screen.queryByRole('status', { name: '상세 결과' })).toBeNull());
    expect(within(summary()).queryByRole('button', { name: '상세' })).toBeNull();
  });
  it.each(['line', 'bar'] as const)('%s exposes Compare with a visible previous period', async kind => {
    mount(kind); await screen.findByRole('img'); click('비교');
    expect(screen.getAllByText(/이전 동일 기간/).length).toBeGreaterThan(0);
  });
  it.each(['line', 'bar'] as const)('%s preserves zoom, legend, table, selection and unaffected focus across layout', async kind => {
    mount(kind); await screen.findByRole('img');
    click('비교'); click('확대'); click('선택'); click('더보기'); click('같은 데이터를 표로 보기');
    // Close the More popover before changing layout.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    const dataTable = screen.getByRole('table', { name: /차트/ });
    const previousLegend = screen.getByRole('checkbox', { name: /이전 동일 기간/ }) as HTMLInputElement;
    fireEvent.click(previousLegend);
    const selection = summary().textContent;
    const init = canvas.init.mock.calls.length; expect(init).toBeGreaterThan(0);
    const fetches = query.mock.calls.length;
    click('동작·지원 열기');
    const rangeStart = screen.getByRole('combobox', { name: '구간 시작' }); rangeStart.focus();
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'End' });
    expect(document.activeElement).toBe(rangeStart);
    click('동작·지원 접기'); click('집중'); click('집중');
    expect(screen.getByRole('table', { name: /차트/ })).toBe(dataTable);
    expect(previousLegend.checked).toBe(false);
    expect(summary().textContent).toBe(selection);
    const lastOption = canvas.options.at(-1) as { dataZoom: { start: number; end: number }[] };
    expect(lastOption.dataZoom[0]).toMatchObject({ start: 25, end: 75 });
    expect(canvas.init.mock.calls.length).toBe(init); expect(query.mock.calls.length).toBe(fetches);
  });
  it('Escape respects an inner handler and otherwise restores focus mode to its toggle', async () => {
    mount(); await screen.findByRole('img'); click('집중');
    const control = screen.getByRole('button', { name: '집중' });
    control.addEventListener('keydown', event => event.preventDefault(), { once: true });
    fireEvent.keyDown(control, { key: 'Escape' }); expect(control.getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(control, { key: 'Escape' }); expect(control.getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(control);
  });
});
