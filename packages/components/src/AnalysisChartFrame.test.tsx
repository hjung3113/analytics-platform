import { type ReactElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnnotationInput, ApiResponse, AnnotationRef, ChartAnnotation, PlatformAdapter, Session } from '@ap/contracts';
import { parseDateTime } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import { AnalysisChartFrame, type ChartSeries } from './AnalysisChartFrame';
import type { EChartProps } from './EChart';

vi.mock('./EChartImpl', () => ({ default: FakePlot }));

/** Stand-in plot: one button plays a Brush selection over the whole series. */
function FakePlot(props: EChartProps): ReactElement {
  const range = [parseDateTime('2026-09-01T00:00:00', 'x').getTime(), parseDateTime('2026-09-02T00:00:00', 'x').getTime()];
  return <div role="img" aria-label={props.ariaLabel}>
    <button type="button" onClick={() => props.onEvents?.brushEnd?.({ areas: [{ coordRange: range }] }, { dispatchAction: () => {} } as never)}>fake-brush</button>
  </div>;
}

const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const off = { export: false, savedView: false, annotate: false, compare: false };
const on = { export: true, savedView: false, annotate: true, compare: true };
const registryWith = (features: typeof off) => createRegistry({
  spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'home' }],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
  menus: [{ id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: none, pageType: 'analysis', features, pageKeys: [] }],
});

const envelope = { data: null, assessments: [], trust: null, correlationId: 'fixture' };
function none_<T>(outcome: 'empty' | 'forbidden'): ApiResponse<T> { return { ...envelope, outcome }; }
function fixture() {
  const session: Session = { user: { id: 'u1', name: 'u', title: { ko: 'u', en: 'u' }, permissions: ['platform:view'] }, scopes: [] };
  const rows: ChartAnnotation[] = [];
  const list = vi.fn(async (ref: AnnotationRef): Promise<ApiResponse<{ items: readonly ChartAnnotation[] }>> => {
    const items = rows.filter(r => r.chartId === ref.chartId && r.scopeId === ref.scopeId);
    return items.length ? { ...envelope, outcome: 'ok', data: { items } } : none_('empty');
  });
  const save = vi.fn(async (input: AnnotationInput): Promise<ApiResponse<ChartAnnotation>> => {
    const row: ChartAnnotation = { id: `a${rows.length + 1}`, chartId: input.chartId, scopeId: input.scopeId as string, from: input.from, to: input.to, text: input.text, at: '2026-09-29T10:00' };
    rows.push(row);
    return { ...envelope, outcome: 'ok', data: row };
  });
  const adapter: PlatformAdapter = {
    menuQuery: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    session: () => session,
    validateScope: async () => ({ status: 'valid', grantedRooms: [] }),
    publishedMetrics: () => [],
    defaultRangeTo: () => '2026-09-26T09:00:00',
    contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
    evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
    getEntity: async () => none_('empty'),
    auditTrail: async () => none_('forbidden'), entityAudit: async () => none_('forbidden'),
    accessDirectory: async () => none_('forbidden'), usageSummary: async () => none_('forbidden'),
    recordUsage: async () => ({ accepted: 0 }), reportClientError: async () => ({ accepted: true }),
    listAnnotations: list, saveAnnotation: save,
    subscribe: () => () => {},
  };
  return { adapter, rows, list, save };
}

const series: ChartSeries[] = [{ id: 's1', name: 'S1', color: 'chart-blue', points: [['2026-09-01T00:00:00', 1], ['2026-09-02T00:00:00', 2]] }];
const compareSeries: ChartSeries[] = [{ id: 's2', name: 'S2', color: 'chart-purple', points: series[0].points }];

function SwitchScope() {
  const { setGlobal } = usePlatform();
  return <button type="button" onClick={() => setGlobal({ scopeId: 'CJU' })}>to-cju</button>;
}
function mount(adapter: PlatformAdapter, features: typeof off, url = '/?v=1&scopeId=ICH') {
  window.history.replaceState(null, '', url);
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registryWith(features)}>
    <SwitchScope />
    <AnalysisChartFrame chartId="chart-1" title="Chart" series={series} compareSeries={compareSeries} unit="ea" />
  </PlatformProvider></I18nProvider>);
}
const brushAndOpenNote = async () => {
  fireEvent.click(await screen.findByText('fake-brush'));
  fireEvent.click(await screen.findByRole('button', { name: 'Annotate' }));
};

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); errorSpy.mockRestore(); });

describe('AnalysisChartFrame follows the menu manifest features (06 §16, issue #103)', () => {
  it('offers no Compare, Annotate or Export when the menu declares none, and never reads annotations', async () => {
    const f = fixture();
    mount(f.adapter, off);
    await screen.findByRole('button', { name: 'Brush' });
    expect(screen.queryByRole('button', { name: 'Compare' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Annotate' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
    // Zoom, Brush, Reset are not manifest-gated.
    expect(screen.getByRole('button', { name: 'Brush' })).toBeTruthy();
    expect(f.list).not.toHaveBeenCalled();
  });

  it('offers all three when the menu declares them', async () => {
    mount(fixture().adapter, on);
    expect(await screen.findByRole('button', { name: 'Compare' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Annotate' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy();
  });
});

describe('chart annotations are keyed by chart and Scope (06 §16 layer 4)', () => {
  it('saves under the current Scope, then shows the row from the server', async () => {
    const f = fixture();
    mount(f.adapter, on);
    await waitFor(() => expect(f.list).toHaveBeenCalledWith({ chartId: 'chart-1', scopeId: 'ICH' }, expect.anything()));
    await brushAndOpenNote();
    fireEvent.change(screen.getByLabelText('주석 내용'), { target: { value: 'PM 작업' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(f.save).toHaveBeenCalledTimes(1));
    expect(f.save.mock.calls[0][0]).toEqual({ chartId: 'chart-1', scopeId: 'ICH', from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00', text: 'PM 작업' });
    expect(await screen.findByText(/PM 작업/)).toBeTruthy();
  });

  it('a site switch hides the previous site’s notes and reads the new site’s', async () => {
    const f = fixture();
    f.rows.push({ id: 'x1', chartId: 'chart-1', scopeId: 'ICH', from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00', text: 'ICH 전용 메모', at: '2026-09-29T09:00' });
    mount(f.adapter, on);
    expect(await screen.findByText(/ICH 전용 메모/)).toBeTruthy();
    fireEvent.click(screen.getByText('to-cju'));
    await waitFor(() => expect(f.list).toHaveBeenLastCalledWith({ chartId: 'chart-1', scopeId: 'CJU' }, expect.anything()));
    await waitFor(() => expect(screen.queryByText(/ICH 전용 메모/)).toBeNull());
  });

  it('with no Scope selected it neither reads nor writes: Annotate is disabled', async () => {
    const f = fixture();
    mount(f.adapter, on, '/?v=1');
    fireEvent.click(await screen.findByText('fake-brush'));
    expect((await screen.findByRole('button', { name: 'Annotate' })).hasAttribute('disabled')).toBe(true);
    expect(f.list).not.toHaveBeenCalled();
    expect(f.save).not.toHaveBeenCalled();
  });

  it('a rejected save keeps the typed text and shows no row', async () => {
    const f = fixture();
    f.save.mockResolvedValueOnce(none_('forbidden'));
    mount(f.adapter, on);
    await brushAndOpenNote();
    fireEvent.change(screen.getByLabelText('주석 내용'), { target: { value: '거부될 메모' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '저장' })); });
    await waitFor(() => expect(f.save).toHaveBeenCalledTimes(1));
    expect((screen.getByLabelText('주석 내용') as HTMLInputElement).value).toBe('거부될 메모');
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('a save that finishes after the editor was cancelled and reopened does not clear the newer draft', async () => {
    const f = fixture();
    let release: () => void = () => {};
    const inner = f.save.getMockImplementation()!;
    f.save.mockImplementationOnce(input => new Promise(resolve => { release = () => resolve(inner(input)); }));
    mount(f.adapter, on);
    await brushAndOpenNote();
    fireEvent.change(screen.getByLabelText('주석 내용'), { target: { value: '메모 A' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(f.save).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    fireEvent.click(screen.getByRole('button', { name: 'Annotate' }));
    fireEvent.change(screen.getByLabelText('주석 내용'), { target: { value: '메모 B' } });
    await act(async () => { release(); });
    await waitFor(() => expect(f.list.mock.calls.length).toBeGreaterThan(1));
    expect((screen.getByLabelText('주석 내용') as HTMLInputElement).value).toBe('메모 B');
  });

  it('a failed annotation lookup says so and can be retried, instead of looking like "no annotations"', async () => {
    const f = fixture();
    f.list.mockResolvedValueOnce(none_('forbidden'));
    mount(f.adapter, on);
    expect(await screen.findByRole('alert')).toHaveTextContent('주석을 불러오지 못했습니다');
    f.rows.push({ id: 'r1', chartId: 'chart-1', scopeId: 'ICH', from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00', text: '재시도 후 보이는 메모', at: '2026-09-29T09:00' });
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText(/재시도 후 보이는 메모/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
