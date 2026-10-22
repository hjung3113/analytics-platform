import { type ReactElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnnotationInput, ApiResponse, AnnotationRef, ChartAnnotation, PlatformAdapter } from '@ap/contracts';
import { parseDateTime } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import userEvent from '@testing-library/user-event';
import { AnalysisSectionContext } from './AnalysisSectionContext';
import { AnalysisChartFrame, type AnalysisChartFrameProps, type ChartSeries } from './AnalysisChartFrame';
import { assignNoteLevels } from './annotationLayout';
import type { EChartProps } from './EChart';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';

vi.mock('./EChartImpl', () => ({ default: FakePlot }));
// Wraps the overlap pass so a test can count how often the frame recomputes it (#399 F4).
vi.mock('./annotationLayout', async importOriginal => {
  const actual = await importOriginal<typeof import('./annotationLayout')>();
  return { ...actual, assignNoteLevels: vi.fn(actual.assignNoteLevels) };
});

type CapturedSeries = {
  id?: string;
  type?: string;
  lineStyle?: { color?: string; type?: string | number[] };
  itemStyle?: { color?: string };
  markLine?: { lineStyle?: { color?: string }; label?: { color?: string; position?: string } };
  markArea?: { data?: [{ name?: string; label?: { position?: string } }, unknown][] };
};
let plottedSeries: CapturedSeries[] = [];
/** The props the frame last gave the plot, so a test can play the instance's ready and resize reports. */
let plotProps: EChartProps | null = null;
let plottedBrush: { brushStyle?: { color?: string; borderColor?: string } } | undefined;
/** Per-test Brush coordRange. Null keeps the historical whole-series range so existing tests stay put. */
let brushRangeOverride: [number, number] | null = null;
const defaultBrushRange = (): [number, number] => [parseDateTime('2026-09-01T00:00:00', 'x').getTime(), parseDateTime('2026-09-02T00:00:00', 'x').getTime()];
const atMs = (value: string) => parseDateTime(value, 'x').getTime();

const invalidChartSeries = (): ChartSeries => ({
  id: 'invalid',
  name: 'Invalid',
  // @ts-expect-error ChartSeries colours must be names from the public theme contract.
  color: 'not-a-token',
  points: [],
});
void invalidChartSeries;

/** Stand-in plot: one button plays a Brush selection over the whole series. */
function FakePlot(props: EChartProps): ReactElement {
  plotProps = props;
  plottedSeries = (props.option as unknown as { series?: CapturedSeries[] }).series ?? [];
  plottedBrush = (props.option as unknown as { brush?: { brushStyle?: { borderColor?: string } } }).brush;
  const range = brushRangeOverride ?? defaultBrushRange();
  return <div role="img" aria-label={props.ariaLabel}>
    <button type="button" onClick={() => props.onEvents?.brushEnd?.({ areas: [{ coordRange: range }] }, { dispatchAction: () => {} } as never)}>fake-brush</button>
  </div>;
}

const off = { export: false, savedView: false, annotate: false, compare: false };
const on = { export: true, savedView: false, annotate: true, compare: true };
const registryWith = (features: typeof off) => createRegistry({
  spaces: [testSpace()],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
  menus: [{ id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features, pageKeys: [] }],
});

const envelope = { data: null, assessments: [], trust: null, correlationId: 'fixture' };
function none_<T>(outcome: 'empty' | 'forbidden'): ApiResponse<T> { return { ...envelope, outcome }; }
function fixture() {
  const session = testSession(['platform:view']);
  const rows: ChartAnnotation[] = [];
  const list = vi.fn(async (ref: AnnotationRef): Promise<ApiResponse<{ items: readonly ChartAnnotation[] }>> => {
    const items = rows.filter(r => r.chartId === ref.chartId && r.scopeId === ref.scopeId);
    return items.length ? { ...envelope, outcome: 'ok', data: { items } } : none_('empty');
  });
  const save = vi.fn(async (input: AnnotationInput): Promise<ApiResponse<ChartAnnotation>> => {
    const row: ChartAnnotation = { id: `a${rows.length + 1}`, chartId: input.chartId, scopeId: input.scopeId as string, from: input.from, to: input.to, text: input.text, at: '2026-09-29T10:00', mine: true };
    rows.push(row);
    return { ...envelope, outcome: 'ok', data: row };
  });
  const del = vi.fn(async (ref: AnnotationRef & { id: string }): Promise<ApiResponse<{ id: string }>> => {
    const index = rows.findIndex(r => r.id === ref.id);
    if (index < 0) return none_('empty');
    rows.splice(index, 1);
    return { ...envelope, outcome: 'ok', data: { id: ref.id } };
  });
  const adapter = testAdapter({
    session: () => session,
    getEntity: async () => none_('empty'),
    listAnnotations: list,
    saveAnnotation: save,
    deleteAnnotation: del,
  });
  return { adapter, rows, list, save, del };
}

const series: ChartSeries[] = [{ id: 's1', name: 'S1', color: 'chart-blue', points: [['2026-09-01T00:00:00', 1], ['2026-09-02T00:00:00', 2]] }];
const compareSeries: ChartSeries[] = [{ id: 's2', name: 'S2', color: 'chart-purple', points: series[0].points }];

function ToastProbe() {
  const { toasts } = usePlatform();
  return <output aria-label="토스트">{toasts.map(t => <span key={t.id}>{t.text}</span>)}</output>;
}
function SwitchRooms() {
  const { setGlobal } = usePlatform();
  return <button type="button" onClick={() => setGlobal({ roomNames: ['PHOTO'] })}>to-photo</button>;
}
function SwitchScope() {
  const { setGlobal } = usePlatform();
  return <button type="button" onClick={() => setGlobal({ scopeId: 'FDRY' })}>to-fdry</button>;
}
function mount(
  adapter: PlatformAdapter,
  features: typeof off,
  url = '/?v=1&scopeId=MEM',
  chart: { series?: ChartSeries[]; compareSeries?: ChartSeries[]; markLines?: { y: number; label: string }[]; size?: 'fill'; valueFormat?: (value: number) => string } = {},
) {
  window.history.replaceState(null, '', url);
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registryWith(features)}>
    <SwitchScope />
    <SwitchRooms />
    <ToastProbe />
    <AnalysisChartFrame chartId="chart-1" title="Chart" series={chart.series ?? series} compareSeries={chart.compareSeries ?? compareSeries} markLines={chart.markLines} unit="ea" size={chart.size} valueFormat={chart.valueFormat} />
  </PlatformProvider></I18nProvider>);
}
const brushAndOpenNote = async () => {
  fireEvent.click(await screen.findByText('fake-brush'));
  fireEvent.click(await screen.findByRole('button', { name: '주석' }));
};

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { brushRangeOverride = null; errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); errorSpy.mockRestore(); });

describe('AnalysisChartFrame follows the menu manifest features (06 §16, issue #103)', () => {
  it('offers no Compare, Annotate or Export when the menu declares none, and never reads annotations', async () => {
    const f = fixture();
    mount(f.adapter, off);
    await screen.findByRole('button', { name: '구간 선택' });
    expect(screen.queryByRole('button', { name: '비교' })).toBeNull();
    expect(screen.queryByRole('button', { name: '주석' })).toBeNull();
    expect(screen.queryByRole('button', { name: '내보내기' })).toBeNull();
    // 확대·구간 선택·초기화는 manifest 게이트가 아니다.
    expect(screen.getByRole('button', { name: '구간 선택' })).toBeTruthy();
    expect(f.list).not.toHaveBeenCalled();
  });

  it('the sunken selection summary keeps secondary text before any brush (DESIGN.md pairing)', async () => {
    mount(fixture().adapter, off);
    const summary = await screen.findByRole('region', { name: '선택 요약' });
    expect(summary.className).toContain('bg-surface-sunken');
    const hint = within(summary).getByText(/선택 구간 없음/);
    expect(hint.className).toContain('text-text-secondary');
    expect(hint.className).not.toContain('text-text-muted');
  });

  it('keeps same-data table column headers readable on sunken', async () => {
    mount(fixture().adapter, off);
    fireEvent.click(await screen.findByRole('button', { name: '더보기' }));
    fireEvent.click(await screen.findByRole('button', { name: '같은 데이터를 표로 보기' }));
    const headers = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(headers).toHaveLength(2);
    for (const header of headers) {
      expect(header.closest('thead')?.className).toContain('bg-surface-sunken');
      expect(header.className).toContain('text-text-secondary');
      expect(header.className).not.toContain('text-text-muted');
    }
  });

  it('offers all three when the menu declares them', async () => {
    mount(fixture().adapter, on);
    expect(await screen.findByRole('button', { name: '비교' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '주석' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '내보내기' })).toBeTruthy();
  });
});

describe('chart stroke aliases (#203)', () => {
  it('uses a stroke alias for line series and keeps the chart fill on bars', async () => {
    const root = document.documentElement;
    const names = ['--chart-blue', '--chart-blue-stroke'];
    const previous = new Map(names.map(name => [name, root.style.getPropertyValue(name)]));
    root.style.setProperty('--chart-blue', '59 156 255');
    root.style.setProperty('--chart-blue-stroke', '37 119 204');
    plottedSeries = [];
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM');

    try {
      render(<I18nProvider><PlatformProvider adapter={fixture().adapter} registry={registryWith(off)}>
        <AnalysisChartFrame chartId="chart-strokes" title="Chart strokes" unit="ea" series={[
          { id: 'line', name: 'Line', color: 'chart-blue', points: [['2026-09-01T00:00:00', 1]] },
          { id: 'bar', name: 'Bar', color: 'chart-blue', kind: 'bar', points: [['2026-09-01T00:00:00', 1]] },
        ]} />
      </PlatformProvider></I18nProvider>);

      await screen.findByText('fake-brush');
      expect(plottedSeries.find(item => item.id === 'line')?.lineStyle?.color).toBe('rgb(37,119,204)');
      expect(plottedSeries.find(item => item.id === 'line')?.itemStyle?.color).toBe('rgb(59,156,255)');
      expect(plottedSeries.find(item => item.id === 'bar')?.itemStyle?.color).toBe('rgb(59,156,255)');
      // Legend swatches follow their mark: a stroke-colored line or a filled bar square with stroke outline.
      const swatch = (name: string) => screen.getByText(name, { selector: 'label' });
      expect(swatch('Line').querySelector('svg line')?.getAttribute('stroke')).toBe('rgb(37,119,204)');
      const barSwatch = swatch('Bar').querySelector('span[aria-hidden]') as HTMLElement;
      expect(barSwatch.style.backgroundColor).toBe('rgb(59, 156, 255)');
      expect(barSwatch.style.borderColor).toBe('rgb(37, 119, 204)');
      // The brush outline is a thin line mark too.
      expect(plottedBrush?.brushStyle?.borderColor).toBe('rgb(37,119,204)');
    } finally {
      for (const [name, value] of previous) {
        if (value) root.style.setProperty(name, value); else root.style.removeProperty(name);
      }
    }
  });

  it('derives the brush fill from the chart-blue token and keeps the border on the stroke alias (#297)', async () => {
    const root = document.documentElement;
    const names = ['--chart-blue', '--chart-blue-stroke'];
    const previous = new Map(names.map(name => [name, root.style.getPropertyValue(name)]));
    // Channels off the historical rgba(59,156,255,…) literal: reverting the fill to that literal must fail here.
    root.style.setProperty('--chart-blue', '10 20 30');
    root.style.setProperty('--chart-blue-stroke', '37 119 204');
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
    try {
      render(<I18nProvider><PlatformProvider adapter={fixture().adapter} registry={registryWith(off)}>
        <AnalysisChartFrame chartId="chart-brush-fill" title="Brush fill" unit="ea" series={series} />
      </PlatformProvider></I18nProvider>);
      await screen.findByText('fake-brush');
      expect(plottedBrush?.brushStyle?.color).toBe('rgba(10,20,30,0.12)');
      expect(plottedBrush?.brushStyle?.borderColor).toBe('rgb(37,119,204)');
    } finally {
      for (const [name, value] of previous) {
        if (value) root.style.setProperty(name, value); else root.style.removeProperty(name);
      }
    }
  });
});

describe('data table and CSV share one x-union row projection (#297)', () => {
  const spread: ChartSeries[] = [
    { id: 'a', name: 'rate, %', color: 'chart-blue', points: [['2026-10-02T00:00:00', 10]] },
    { id: 'b', name: 'say "hi"', color: 'chart-teal', points: [['2026-10-01T00:00:00', 20]] },
    { id: 'c', name: '행\n분리', color: 'chart-purple', points: [['2026-10-03T00:00:00', null]] },
  ];
  // jsdom Blob has no .text(); readAsText goes through the UTF-8 decoder and consumes the BOM, so the BOM is
  // asserted from raw leading bytes — same approach as PlatformDataTable.test.tsx.
  const blobText = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
  const blobStartsWithBom = (blob: Blob) => new Promise<boolean>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer).slice(0, 3).toString() === '239,187,191');
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });

  it('shows each series under its own date instead of the first series indexes', async () => {
    mount(fixture().adapter, off, '/?v=1&scopeId=MEM', { series: spread });
    fireEvent.click(await screen.findByRole('button', { name: '더보기' }));
    fireEvent.click(await screen.findByRole('button', { name: '같은 데이터를 표로 보기' }));
    const rows = within(await screen.findByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(4);
    const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map(cell => cell.textContent);
    expect(cells(rows[1])).toEqual(['2026-10-01 00:00', '—', '20', '—']);
    expect(cells(rows[2])).toEqual(['2026-10-02 00:00', '10', '—', '—']);
    // A null point is unknown, never 0.
    expect(cells(rows[3])).toEqual(['2026-10-03 00:00', '—', '—', '—']);
  });

  it('exports the same projection with RFC 4180 cells and bare numbers', async () => {
    const blobs: Blob[] = [];
    const create = URL.createObjectURL;
    const revoke = URL.revokeObjectURL;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    URL.createObjectURL = (blob: Blob) => { blobs.push(blob); return 'blob:test'; };
    URL.revokeObjectURL = () => {};
    try {
      mount(fixture().adapter, on, '/?v=1&scopeId=MEM', { series: spread });
      fireEvent.click(await screen.findByRole('button', { name: '내보내기' }));
      expect(blobs).toHaveLength(1);
      await expect(blobStartsWithBom(blobs[0])).resolves.toBe(true);
      await expect(blobText(blobs[0])).resolves.toBe(
        '# Chart · scopeId=MEM · from= · to= · unit=ea\r\n'
        + 'x,"rate, %","say ""hi""","행\n분리"\r\n'
        + '2026-10-01T00:00:00,,20,\r\n'
        + '2026-10-02T00:00:00,10,,\r\n'
        + '2026-10-03T00:00:00,,,\r\n',
      );
    } finally {
      URL.createObjectURL = create;
      URL.revokeObjectURL = revoke;
      click.mockRestore();
    }
  });

  it('follows series visibility: hidden series lose their column and their x joins the union', async () => {
    const sparse: ChartSeries[] = [
      { id: 'a', name: 'A', color: 'chart-blue', points: [['2026-10-01T00:00:00', 0]] },
      { id: 'b', name: 'B', color: 'chart-teal', points: [['2026-10-01T00:00:00', null], ['2026-10-02T00:00:00', 3]] },
    ];
    mount(fixture().adapter, off, '/?v=1&scopeId=MEM', { series: sparse });
    fireEvent.click(await screen.findByRole('button', { name: '더보기' }));
    fireEvent.click(await screen.findByRole('button', { name: '같은 데이터를 표로 보기' }));
    const table = await screen.findByRole('table');
    expect(table).toHaveAccessibleName('Chart'); // aria-labelledby → the chart title id (06 §26 table access path)
    expect(within(table).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['시각', 'A', 'B']);
    // 0 is a value; only null renders as —.
    expect(within(table).getAllByRole('row')[1].textContent).toContain('0');
    fireEvent.click(within(screen.getByRole('group', { name: '범례' })).getByRole('checkbox', { name: 'A' }));
    await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['시각', 'B']));
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['2026-10-01 00:00', '—']);
    expect(within(rows[2]).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['2026-10-02 00:00', '3']);
  });

  it('collapses duplicate axis categories to one row in categories order (F2)', async () => {
    const dupes: ChartSeries[] = [{ id: 'h', name: 'H', color: 'chart-blue', points: [['b', 3], ['a', 2], ['a', 1]] }];
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
    render(<I18nProvider><PlatformProvider adapter={fixture().adapter} registry={registryWith(off)}>
      <AnalysisChartFrame chartId="chart-cat" title="Categories" unit="ea" xType="category" series={dupes} />
    </PlatformProvider></I18nProvider>);
    fireEvent.click(await screen.findByRole('button', { name: '더보기' }));
    fireEvent.click(await screen.findByRole('button', { name: '같은 데이터를 표로 보기' }));
    const rows = within(await screen.findByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(3);
    // Each distinct x once, in categories order; the repeated 'a' keeps its first-seen value.
    expect(within(rows[1]).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['b', '3']);
    expect(within(rows[2]).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['a', '2']);
  });
});

describe('range apply confirmation stays an inline named group (#297)', () => {
  it('opens as a named group, never an alertdialog, and cancels in place', async () => {
    mount(fixture().adapter, off);
    fireEvent.click(await screen.findByText('fake-brush'));
    const summary = screen.getByRole('region', { name: '선택 요약' });
    fireEvent.click(within(summary).getByRole('button', { name: '분석 구간 적용…' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    const confirmRow = within(summary).getByRole('group', { name: '구간 적용 확인' });
    expect(confirmRow).toBeTruthy();
    fireEvent.click(within(confirmRow).getByRole('button', { name: '취소' }));
    expect(within(summary).queryByRole('group', { name: '구간 적용 확인' })).toBeNull();
  });

  it('returns keyboard focus when the confirm row closes: cancel to the apply button, apply to the brush toggle', async () => {
    mount(fixture().adapter, off);
    fireEvent.click(await screen.findByText('fake-brush'));
    const summary = screen.getByRole('region', { name: '선택 요약' });
    const openConfirm = async () => {
      fireEvent.click(within(summary).getByRole('button', { name: '분석 구간 적용…' }));
      return within(summary).getByRole('group', { name: '구간 적용 확인' });
    };
    fireEvent.click(within(await openConfirm()).getByRole('button', { name: '취소' }));
    expect(document.activeElement).toBe(within(summary).getByRole('button', { name: '분석 구간 적용…' }));
    // Apply rewrites the global period, so the selection (and with it this row) disappears; the toolbar's
    // brush toggle is the stable anchor then.
    fireEvent.click(within(await openConfirm()).getByRole('button', { name: '적용' }));
    expect(within(summary).queryByRole('group', { name: '구간 적용 확인' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '구간 선택' }));
  });
});

describe('toolbar speaks the UI language (#302, #297)', () => {
  it('labels the chart actions and the popover terms in Korean in Korean mode', async () => {
    mount(fixture().adapter, on);
    const toolbar = await screen.findByRole('toolbar', { name: '차트 동작' });
    for (const name of ['확대', '구간 선택', '초기화', '비교', '주석', '내보내기', '더보기']) {
      expect(within(toolbar).getByRole('button', { name })).toBeTruthy();
    }
    // No selection yet: the annotate hint names the Brush action in Korean too.
    expect(within(toolbar).getByRole('button', { name: '주석' })).toHaveAttribute('title', '구간 선택으로 구간을 먼저 선택하세요');
    fireEvent.click(within(toolbar).getByRole('button', { name: '더보기' }));
    expect(await screen.findByText(/확대·구간 선택·시리즈 표시·비교는/)).toBeTruthy();
    // The last sentence follows the same vocabulary as the toolbar (초기화), never the English term.
    expect(await screen.findByText(/초기화 후에도 유지됩니다/)).toBeTruthy();
    expect(screen.queryByText(/Reset/)).toBeNull();
    expect(within(screen.getByRole('region', { name: '선택 요약' })).getByText(/구간 선택으로 구간을 선택하면/)).toBeTruthy();
  });
});

describe('chart card sizing and toolbar wrapping (#297 FIX1 UX)', () => {
  it('lets the card shrink in its cell and wraps the toolbar line-by-line with the tail buttons bundled', async () => {
    mount(fixture().adapter, on);
    const card = await screen.findByRole('region', { name: 'Chart' });
    // The plot canvas owns a fixed px width; min-w-0 keeps it from becoming the card's min-content, so a
    // one-column → two-column switch can shrink the card and the ResizeObserver sees the new width.
    expect(card.className).toContain('min-w-0');
    const toolbar = within(card).getByRole('toolbar', { name: '차트 동작' });
    expect(toolbar.className).toContain('flex-wrap');
    // The tail (Export + More) is one wrap unit, so it never strands alone on its own line.
    const tail = toolbar.querySelector('[data-chart-toolbar-tail]') as HTMLElement;
    expect(tail).toBeTruthy();
    expect(within(tail).getByRole('button', { name: '내보내기' })).toBeTruthy();
    expect(within(tail).getByRole('button', { name: '더보기' })).toBeTruthy();
    // The core action row wraps in source order ahead of the bundled tail.
    const front = tail.previousElementSibling as HTMLElement;
    expect(front.className).toContain('flex-wrap');
    expect(within(front).getByRole('button', { name: '구간 선택' })).toBeTruthy();
    expect(within(front).getByRole('button', { name: '초기화' })).toBeTruthy();
    expect(within(front).getByRole('button', { name: '비교' })).toBeTruthy();
  });
});

describe('chart legend and comparison encoding (#207)', () => {
  it('keeps a plain legend with Compare off and groups current and previous series when Compare is on', async () => {
    mount(fixture().adapter, on);
    await screen.findByRole('button', { name: '비교' });

    const legend = screen.getByRole('group', { name: '범례' });
    expect(within(legend).queryByText('현재 기간')).toBeNull();
    expect(within(legend).queryByText('이전 기간')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '비교' }));
    const current = await screen.findByRole('group', { name: '현재 기간' });
    const previous = screen.getByRole('group', { name: '이전 기간' });
    const currentHeading = within(current).getByText('현재 기간');
    const previousHeading = within(previous).getByText('이전 기간');
    expect.soft(current.getAttribute('aria-label')).toBeNull();
    expect.soft(current.getAttribute('aria-labelledby')).toBe(currentHeading.id);
    expect.soft(previous.getAttribute('aria-label')).toBeNull();
    expect.soft(previous.getAttribute('aria-labelledby')).toBe(previousHeading.id);
    expect(within(current).getByText('S1', { selector: 'label' })).toBeTruthy();
    expect(within(previous).getByText('S2', { selector: 'label' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '비교' }));
    await waitFor(() => {
      expect(screen.queryByRole('group', { name: '현재 기간' })).toBeNull();
      expect(screen.queryByRole('group', { name: '이전 기간' })).toBeNull();
    });
    expect(screen.getByText('S1', { selector: 'label' })).toBeTruthy();
    expect(screen.queryByText('S2', { selector: 'label' })).toBeNull();
  });

  it('removes a previous-period series from the plot when its legend checkbox is cleared', async () => {
    mount(fixture().adapter, on);
    fireEvent.click(await screen.findByRole('button', { name: '비교' }));
    await waitFor(() => expect(plottedSeries.some(item => item.id === 's2')).toBe(true));

    fireEvent.click(within(screen.getByRole('group', { name: '이전 기간' })).getByRole('checkbox', { name: 'S2' }));
    await waitFor(() => expect(plottedSeries.some(item => item.id === 's2')).toBe(false));
  });

  it('does not render period headings when Compare is unavailable or has no previous series', async () => {
    mount(fixture().adapter, off);
    await screen.findByRole('button', { name: '구간 선택' });
    expect(screen.queryByText('현재 기간')).toBeNull();
    expect(screen.queryByText('이전 기간')).toBeNull();

    cleanup();
    mount(fixture().adapter, on, '/?v=1&scopeId=MEM', { compareSeries: [] });
    await screen.findByRole('button', { name: '구간 선택' });
    expect(screen.queryByRole('button', { name: '비교' })).toBeNull();
    expect(screen.queryByText('현재 기간')).toBeNull();
    expect(screen.queryByText('이전 기간')).toBeNull();
  });

  it('keeps wrapping period rows when more than four corresponding series are present', async () => {
    const many: ChartSeries[] = Array.from({ length: 5 }, (_, index) => ({
      id: `current-${index}`,
      name: `Current ${index + 1}`,
      color: 'chart-blue',
      points: series[0].points,
    }));
    const previous = many.slice(0, 2).map((item, index) => ({ ...item, id: `previous-${index}`, name: `Previous ${index + 1}` }));
    mount(fixture().adapter, on, '/?v=1&scopeId=MEM', { series: many, compareSeries: previous });
    fireEvent.click(await screen.findByRole('button', { name: '비교' }));

    const legend = screen.getByRole('group', { name: '범례' });
    expect(legend.querySelector('[data-period-legend-grid]')).toBeNull();
    const current = within(legend).getByRole('group', { name: '현재 기간' });
    expect(current.className).toContain('flex-wrap');
    for (const item of many) expect(within(current).getByText(item.name, { selector: 'label' })).toBeTruthy();
  });

  it('derives previous line patterns, matches their legend swatches, outlines bars, and neutralizes reference lines', async () => {
    const root = document.documentElement;
    const values = {
      '--chart-blue': '59 156 255', '--chart-blue-stroke': '37 119 204',
      '--chart-teal': '0 163 181', '--chart-teal-stroke': '0 128 144',
      '--chart-purple': '161 116 245', '--chart-purple-stroke': '129 84 206',
      '--cat-amber': '217 119 6', '--cat-amber-stroke': '180 83 9',
      '--border-control': '95 105 115', '--text-secondary': '35 45 55',
    };
    const previous = new Map(Object.keys(values).map(name => [name, root.style.getPropertyValue(name)]));
    for (const [name, value] of Object.entries(values)) root.style.setProperty(name, value);

    try {
      mount(fixture().adapter, on, '/?v=1&scopeId=MEM', {
        series: [
          { id: 'p50', name: 'P50', color: 'chart-blue', points: series[0].points },
          { id: 'p95', name: 'P95', color: 'chart-teal', points: series[0].points, dashed: true },
          { id: 'runs', name: 'Run count', color: 'chart-purple', kind: 'bar', points: series[0].points },
        ],
        compareSeries: [
          { id: 'p50-prev', name: 'P50 previous', color: 'chart-purple', points: series[0].points },
          { id: 'p95-prev', name: 'P95 previous', color: 'cat-amber', points: series[0].points, dashed: true },
        ],
        markLines: [{ y: 12, label: 'P95 reference' }],
      });
      fireEvent.click(await screen.findByRole('button', { name: '비교' }));
      await screen.findByText('fake-brush');

      const plotted = (id: string) => plottedSeries.find(item => item.id === id);
      expect.soft(plotted('p50')?.lineStyle?.type).toBe('solid');
      expect.soft(plotted('p95')?.lineStyle?.type).toEqual([8, 4]);
      expect.soft(plotted('p50-prev')?.lineStyle?.type).toEqual([2, 2]);
      expect.soft(plotted('p95-prev')?.lineStyle?.type).toEqual([8, 3, 2, 3]);
      expect(plotted('p95-prev')?.lineStyle?.color).toBe('rgb(180,83,9)');

      const legend = screen.getByRole('group', { name: '범례' });
      const swatch = (name: string) => within(legend).getByText(name, { selector: 'label' });
      expect.soft(swatch('P50').querySelector('svg line')?.getAttribute('stroke-dasharray')).toBeNull();
      expect.soft(swatch('P95').querySelector('svg line')?.getAttribute('stroke-dasharray')).toBe('8 4');
      expect.soft(swatch('P50 previous').querySelector('svg line')?.getAttribute('stroke-dasharray')).toBe('2 2');
      expect.soft(swatch('P95 previous').querySelector('svg line')?.getAttribute('stroke-dasharray')).toBe('8 3 2 3');
      expect(swatch('P95 previous').querySelector('svg line')?.getAttribute('stroke')).toBe('rgb(180,83,9)');

      const grid = screen.getByRole('group', { name: '범례' }).querySelector('[data-period-legend-grid]') as HTMLElement | null;
      expect.soft(grid?.style.gridTemplateColumns).toBe('repeat(4, max-content)');
      if (grid) {
        const gridColumn = (id: string) => (grid.querySelector(`[data-legend-series-id="${id}"]`) as HTMLElement).style.gridColumn;
        expect.soft(gridColumn('p50')).toBe(gridColumn('p50-prev'));
        expect.soft(gridColumn('p95')).toBe(gridColumn('p95-prev'));
      }

      const barSwatch = swatch('Run count').querySelector('[aria-hidden="true"]') as HTMLElement;
      expect(barSwatch.tagName).toBe('SPAN');
      expect(barSwatch.className).toContain('size-3');
      expect(barSwatch.className).toContain('border-2');
      expect(barSwatch.style.backgroundColor).toBe('rgb(161, 116, 245)');
      expect(barSwatch.style.borderColor).toBe('rgb(129, 84, 206)');

      const markLine = plotted('__overlay')?.markLine;
      expect(markLine?.lineStyle?.color).toBe('rgb(35,45,55)');
      expect(markLine?.label?.color).toBe('rgb(35,45,55)');
      // The label sits inside the plot end so the right grid edge does not clip it.
      expect(markLine?.label?.position).toBe('insideEndTop');
    } finally {
      for (const [name, value] of previous) {
        if (value) root.style.setProperty(name, value); else root.style.removeProperty(name);
      }
    }
  });
});

describe('chart annotations are keyed by chart and Scope (06 §16 layer 4)', () => {
  it('saves under the current Scope, then shows the row from the server', async () => {
    const f = fixture();
    mount(f.adapter, on);
    await waitFor(() => expect(f.list).toHaveBeenCalledWith({ chartId: 'chart-1', scopeId: 'MEM' }, expect.anything()));
    await brushAndOpenNote();
    fireEvent.change(screen.getByLabelText('주석 내용'), { target: { value: 'PM 작업' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(f.save).toHaveBeenCalledTimes(1));
    expect(f.save.mock.calls[0][0]).toEqual({ chartId: 'chart-1', scopeId: 'MEM', from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00', text: 'PM 작업' });
    expect(await screen.findByText(/PM 작업/)).toBeTruthy();
  });

  it('keeps the selection label clear of a note saved over the same range (#320)', async () => {
    const f = fixture();
    mount(f.adapter, on);
    await brushAndOpenNote();
    fireEvent.change(screen.getByLabelText('주석 내용'), { target: { value: 'PM 작업' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByText(/PM 작업/);
    const areas = plottedSeries.find(s => s.id === '__overlay')?.markArea?.data ?? [];
    // markArea labels default to `top`: same range + same position = the two labels draw on top of each other.
    const position = (name: string) => areas.find(([start]) => start.name === name)?.[0].label?.position ?? 'top';
    expect(areas.map(([start]) => start.name)).toEqual(['선택', 'PM 작업']);
    expect(position('선택')).not.toBe(position('PM 작업'));
  });

  it('a site switch hides the previous site’s notes and reads the new site’s', async () => {
    const f = fixture();
    f.rows.push({ id: 'x1', chartId: 'chart-1', scopeId: 'MEM', from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00', text: 'MEM 전용 메모', at: '2026-09-29T09:00', mine: false });
    mount(f.adapter, on);
    expect(await screen.findByText(/MEM 전용 메모/)).toBeTruthy();
    fireEvent.click(screen.getByText('to-fdry'));
    await waitFor(() => expect(f.list).toHaveBeenLastCalledWith({ chartId: 'chart-1', scopeId: 'FDRY' }, expect.anything()));
    await waitFor(() => expect(screen.queryByText(/MEM 전용 메모/)).toBeNull());
  });

  it('with no Scope selected it neither reads nor writes: Annotate is disabled', async () => {
    const f = fixture();
    mount(f.adapter, on, '/?v=1');
    fireEvent.click(await screen.findByText('fake-brush'));
    expect((await screen.findByRole('button', { name: '주석' })).hasAttribute('disabled')).toBe(true);
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
    fireEvent.click(screen.getByRole('button', { name: '주석' }));
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
    f.rows.push({ id: 'r1', chartId: 'chart-1', scopeId: 'MEM', from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00', text: '재시도 후 보이는 메모', at: '2026-09-29T09:00', mine: false });
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText(/재시도 후 보이는 메모/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('keyboard range, bar snap, and compare clip (06 §16, #307)', () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  beforeAll(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
  afterAll(() => {
    if (originalScrollIntoView) HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  });

  const hour = (day: string, h: number) => `${day}T${String(h).padStart(2, '0')}:00:00`;
  const hourly = (day: string, from: number, toInclusive: number, id: string, name: string): ChartSeries => ({
    id, name, color: id === 's1' ? 'chart-blue' : 'chart-purple',
    points: Array.from({ length: toInclusive - from + 1 }, (_, i) => [hour(day, from + i), 1]),
  });
  const currentDay = hourly('2026-10-16', 16, 22, 's1', 'S1');
  const previousDay = hourly('2026-10-15', 16, 22, 'prev', 'Prev');
  const period = '/?v=1&scopeId=MEM&from=2026-10-16T16:00:00&to=2026-10-16T23:00:00';
  const summary = () => screen.getByRole('region', { name: '선택 요약' });
  const pick = async (combobox: string, option: string) => {
    fireEvent.click(screen.getByRole('combobox', { name: combobox }));
    fireEvent.click(await screen.findByRole('option', { name: option }));
  };

  it('a quick range fills the selection summary and does not change the URL', async () => {
    mount(fixture().adapter, off, period, { series: [currentDay], compareSeries: [] });
    const before = window.location.search;
    fireEvent.click(await screen.findByRole('button', { name: '1시간' }));
    expect(summary().textContent).toContain('선택 구간: 2026-10-16 22:00 – 2026-10-16 23:00');
    expect(summary().textContent).toContain('n=1');
    expect(window.location.search).toBe(before);
    expect(within(summary()).getByRole('button', { name: '분석 구간 적용…' })).toBeTruthy();
  });

  it('says there are no values to summarize when the selection covers only empty bars', async () => {
    const withEmptyLast: ChartSeries = { id: 's1', name: 'S1', color: 'chart-blue', points: currentDay.points.map(([x], i, all) => [x, i === all.length - 1 ? null : 1]) };
    mount(fixture().adapter, off, period, { series: [withEmptyLast], compareSeries: [] });
    fireEvent.click(await screen.findByRole('button', { name: '1시간' }));
    expect(summary().textContent).toContain('선택 구간에 요약할 값이 없습니다. 시작·끝을 바꾸거나 더 넓은 구간을 선택하세요.');
    // 기존 n=0 표기는 그대로 둔다.
    expect(summary().textContent).toContain('n=0');
  });

  it('does not show the empty-range note while the selection has values', async () => {
    mount(fixture().adapter, off, period, { series: [currentDay], compareSeries: [] });
    fireEvent.click(await screen.findByRole('button', { name: '1시간' }));
    expect(summary().textContent).toContain('n=1');
    expect(summary().textContent).not.toContain('선택 구간에 요약할 값이 없습니다');
  });

  it('start and end plus 선택 produce the same summary as the matching quick range', async () => {
    mount(fixture().adapter, off, period, { series: [currentDay], compareSeries: [] });
    fireEvent.click(await screen.findByRole('button', { name: '4시간' }));
    const viaPreset = summary().textContent;
    expect(viaPreset).toContain('선택 구간: 2026-10-16 19:00 – 2026-10-16 23:00');
    expect(viaPreset).toContain('n=4');
    fireEvent.click(within(summary()).getByRole('button', { name: '지우기' }));
    await pick('구간 시작', '2026-10-16 19:00');
    await pick('구간 끝', '2026-10-16 23:00');
    fireEvent.click(within(summary()).getByRole('button', { name: '선택' }));
    expect(summary().textContent).toContain('선택 구간: 2026-10-16 19:00 – 2026-10-16 23:00');
    expect(summary().textContent).toContain('n=4');
  });

  it('전체 and the last bar both end at the query end so the last bar stays in the summary', async () => {
    mount(fixture().adapter, off, period, { series: [currentDay], compareSeries: [] });
    fireEvent.click(await screen.findByRole('button', { name: '전체' }));
    expect(summary().textContent).toContain('선택 구간: 2026-10-16 16:00 – 2026-10-16 23:00');
    expect(summary().textContent).toContain('n=7');
    fireEvent.click(within(summary()).getByRole('button', { name: '지우기' }));
    await pick('구간 시작', '2026-10-16 22:00');
    await pick('구간 끝', '2026-10-16 23:00');
    fireEvent.click(within(summary()).getByRole('button', { name: '선택' }));
    expect(summary().textContent).toContain('선택 구간: 2026-10-16 22:00 – 2026-10-16 23:00');
    expect(summary().textContent).toContain('n=1');
  });

  it('a single bar can be selected, and a quick range longer than the data is not offered', async () => {
    const one: ChartSeries = { id: 's1', name: 'S1', color: 'chart-blue', points: [['2026-10-16T16:00:00', 5]] };
    mount(fixture().adapter, off, '/?v=1&scopeId=MEM&from=2026-10-16T16:00:00&to=2026-10-16T17:00:00', { series: [one], compareSeries: [] });
    expect(await screen.findByRole('button', { name: '1시간' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '4시간' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '전체' }));
    expect(summary().textContent).toContain('선택 구간: 2026-10-16 16:00 – 2026-10-16 17:00');
    expect(summary().textContent).toContain('n=1');
  });

  it('includes a query start that is earlier than the first bar', async () => {
    const bars: ChartSeries = { id: 's1', name: 'S1', color: 'chart-blue', points: [['2026-10-16T16:00:00', 1], ['2026-10-16T17:00:00', 1]] };
    mount(fixture().adapter, off, '/?v=1&scopeId=MEM&from=2026-10-16T15:30:00&to=2026-10-16T18:00:00', { series: [bars], compareSeries: [] });
    await screen.findByRole('button', { name: '전체' });
    expect(screen.queryByRole('button', { name: '4시간' })).toBeNull();
    fireEvent.click(screen.getByRole('combobox', { name: '구간 시작' }));
    expect(await screen.findByRole('option', { name: '2026-10-16 15:30' })).toBeTruthy();
    // The open list hides the rest of the page; close it before using the quick range.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: '전체' }));
    expect(summary().textContent).toContain('선택 구간: 2026-10-16 15:30 – 2026-10-16 18:00');
    expect(summary().textContent).toContain('n=2');
  });

  it('offers no keyboard range when the query has no end', async () => {
    mount(fixture().adapter, off);
    await screen.findByRole('button', { name: '구간 선택' });
    expect(screen.queryByRole('group', { name: '빠른 구간 선택' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: '구간 시작' })).toBeNull();
    expect(screen.queryByRole('button', { name: '1시간' })).toBeNull();
    expect(screen.queryByRole('button', { name: '전체' })).toBeNull();
  });

  it('keeps the raw second-precision brush when the query has no end', async () => {
    const bars: ChartSeries = { id: 's1', name: 'S1', color: 'chart-blue', points: [['2026-10-16T16:00:00', 1], ['2026-10-16T17:00:00', 1], ['2026-10-16T18:00:00', 1]] };
    brushRangeOverride = [atMs('2026-10-16T16:14:48'), atMs('2026-10-16T17:41:39')];
    mount(fixture().adapter, off, undefined, { series: [bars], compareSeries: [] });
    fireEvent.click(await screen.findByText('fake-brush'));
    // 06 §16: 조회 끝이 없으면 막대 경계로 맞추지 않고 초 단위 원래 구간을 쓴다.
    expect(summary().textContent).toContain('선택 구간: 2026-10-16 16:14 – 2026-10-16 17:41');
    expect(screen.queryByRole('combobox', { name: '구간 시작' })).toBeNull();
    expect(screen.queryByRole('group', { name: '빠른 구간 선택' })).toBeNull();
  });

  it('snaps a time brush outward onto hourly bar boundaries', async () => {
    brushRangeOverride = [atMs('2026-10-16T16:14:48'), atMs('2026-10-16T22:41:39')];
    mount(fixture().adapter, off, period, { series: [currentDay], compareSeries: [] });
    fireEvent.click(await screen.findByText('fake-brush'));
    expect(summary().textContent).toContain('선택 구간: 2026-10-16 16:00 – 2026-10-16 23:00');
  });

  it('clips a brush that crosses the previous period and the apply confirmation uses the clipped range', async () => {
    brushRangeOverride = [atMs('2026-10-15T20:30:00'), atMs('2026-10-16T18:30:00')];
    mount(fixture().adapter, on, period, { series: [currentDay], compareSeries: [previousDay] });
    fireEvent.click(await screen.findByRole('button', { name: '비교' }));
    fireEvent.click(screen.getByRole('combobox', { name: '구간 시작' }));
    expect(screen.queryByRole('option', { name: /2026-10-15/ })).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    fireEvent.click(screen.getByText('fake-brush'));
    expect(summary().textContent).not.toContain('2026-10-15');
    expect(summary().textContent).toContain('선택 구간: 2026-10-16 16:00 – 2026-10-16 19:00');
    expect(summary().textContent).toContain('비교 중인 이전 기간에 걸친 부분을 현재 기간으로 잘랐습니다.');
    fireEvent.click(within(summary()).getByRole('button', { name: '분석 구간 적용…' }));
    const confirmRow = within(summary()).getByRole('group', { name: '구간 적용 확인' });
    expect(confirmRow.textContent).toContain('2026-10-16 16:00:00 → 2026-10-16 19:00:00');
    expect(confirmRow.textContent).not.toContain('2026-10-15');
  });

  it('selects nothing and says why when the brush is entirely in the previous period', async () => {
    brushRangeOverride = [atMs('2026-10-15T17:10:00'), atMs('2026-10-15T20:40:00')];
    mount(fixture().adapter, on, period, { series: [currentDay], compareSeries: [previousDay] });
    fireEvent.click(await screen.findByRole('button', { name: '비교' }));
    fireEvent.click(screen.getByText('fake-brush'));
    expect(summary().textContent).not.toContain('선택 구간:');
    expect(summary().textContent).toContain('고른 구간이 모두 이전 기간이라 선택하지 않았습니다.');
    expect(within(summary()).queryByRole('button', { name: '분석 구간 적용…' })).toBeNull();
  });

  it('clips an open apply confirmation when Compare turns on, including the URL it writes', async () => {
    brushRangeOverride = [atMs('2026-10-15T20:00:00'), atMs('2026-10-16T18:30:00')];
    mount(fixture().adapter, on, period, { series: [currentDay], compareSeries: [previousDay] });
    fireEvent.click(await screen.findByText('fake-brush'));
    expect(summary().textContent).toContain('2026-10-15 20:00');
    fireEvent.click(within(summary()).getByRole('button', { name: '분석 구간 적용…' }));
    expect(within(summary()).getByRole('group', { name: '구간 적용 확인' }).textContent).toContain('2026-10-15 20:00:00');
    fireEvent.click(screen.getByRole('button', { name: '비교' }));
    expect(summary().textContent).not.toContain('2026-10-15');
    const confirmRow = within(summary()).getByRole('group', { name: '구간 적용 확인' });
    expect(confirmRow.textContent).toContain('2026-10-16 16:00:00 → 2026-10-16 19:00:00');
    expect(confirmRow.textContent).not.toContain('2026-10-15');
    fireEvent.click(within(confirmRow).getByRole('button', { name: '적용' }));
    const query = new URLSearchParams(window.location.search);
    expect(query.get('from')).toBe('2026-10-16T16:00:00');
    expect(query.get('to')).toBe('2026-10-16T19:00:00');
    expect(window.location.search).not.toContain('2026-10-15');
  });
});

describe('author-only annotation delete (#399, ADR-0041)', () => {
  const note = (id: string, text: string, mine: boolean, over: Partial<ChartAnnotation> = {}): ChartAnnotation =>
    ({ id, chartId: 'chart-1', scopeId: 'MEM', from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00', text, at: '2026-09-29T09:00', mine, ...over });

  it('draws a delete button only on the viewer’s own notes, named after the note without the Annotate word', async () => {
    const f = fixture();
    f.rows.push(note('x1', '내 메모', true), note('x2', '남의 메모', false));
    mount(f.adapter, on);
    const mineButton = await screen.findByRole('button', { name: '삭제: 내 메모' });
    expect(mineButton).toBeTruthy();
    expect(screen.queryByRole('button', { name: /삭제: 남의 메모/ })).toBeNull();
    // The annotate control keeps its exact name: a substring query for it must still resolve to one button.
    expect(screen.getAllByRole('button', { name: '주석' })).toHaveLength(1);
  });

  it('asks once in the page, then deletes, refetches and says so; cancel keeps the note and its button focused', async () => {
    const f = fixture();
    f.rows.push(note('x1', '내 메모', true));
    mount(f.adapter, on);
    fireEvent.click(await screen.findByRole('button', { name: '삭제: 내 메모' }));
    expect(f.del).not.toHaveBeenCalled();
    const group = screen.getByRole('group', { name: '삭제 확인: 내 메모' });
    fireEvent.click(within(group).getByRole('button', { name: '취소' }));
    expect(f.del).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '삭제: 내 메모' })));
    fireEvent.click(screen.getByRole('button', { name: '삭제: 내 메모' }));
    fireEvent.click(within(screen.getByRole('group', { name: '삭제 확인: 내 메모' })).getByRole('button', { name: '삭제 확정' }));
    await waitFor(() => expect(f.del).toHaveBeenCalledWith({ chartId: 'chart-1', scopeId: 'MEM', id: 'x1' }));
    await waitFor(() => expect(screen.queryByText(/내 메모/)).toBeNull());
  });

  it('moves focus to the next own note’s delete button after a delete, else to the chart toolbar', async () => {
    const f = fixture();
    f.rows.push(note('x1', '첫째', true), note('x2', '남의', false), note('x3', '셋째', true));
    mount(f.adapter, on);
    fireEvent.click(await screen.findByRole('button', { name: '삭제: 첫째' }));
    const confirm = within(screen.getByRole('group', { name: '삭제 확인: 첫째' })).getByRole('button', { name: '삭제 확정' });
    confirm.focus();
    fireEvent.click(confirm);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '삭제: 셋째' })));
    fireEvent.click(screen.getByRole('button', { name: '삭제: 셋째' }));
    fireEvent.click(await screen.findByText('삭제 확정'));
    await screen.findByText('주석을 삭제했습니다.');
    await waitFor(() => expect(screen.queryByText(/셋째/)).toBeNull());
    // Annotate is disabled without a brushed range, so the chart's next control (Brush) takes focus.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '구간 선택' })));
  });

  it('does not steal focus the user already moved away from the confirm row', async () => {
    const f = fixture();
    f.rows.push(note('x1', '첫째', true), note('x3', '셋째', true));
    mount(f.adapter, on);
    fireEvent.click(await screen.findByRole('button', { name: '삭제: 첫째' }));
    const confirm = within(screen.getByRole('group', { name: '삭제 확인: 첫째' })).getByRole('button', { name: '삭제 확정' });
    confirm.focus();
    fireEvent.click(confirm);
    const elsewhere = screen.getByRole('button', { name: '내보내기' });
    elsewhere.focus();
    await waitFor(() => expect(f.del).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(/첫째/)).toBeNull());
    expect(document.activeElement).toBe(elsewhere);
  });

  it('keeps the note and says so when the server refuses the delete', async () => {
    const f = fixture();
    f.rows.push(note('x1', '내 메모', true));
    f.del.mockResolvedValueOnce({ ...envelope, outcome: 'forbidden', message: 'Only the author can delete a note' });
    mount(f.adapter, on);
    fireEvent.click(await screen.findByRole('button', { name: '삭제: 내 메모' }));
    fireEvent.click(within(screen.getByRole('group', { name: '삭제 확인: 내 메모' })).getByRole('button', { name: '삭제 확정' }));
    expect(await screen.findByText('주석을 삭제하지 못했습니다.')).toBeTruthy();
    expect(screen.queryByText(/Only the author/)).toBeNull();
    expect(await screen.findByRole('button', { name: '삭제: 내 메모' })).toBeTruthy();
    expect(screen.getByText(/내 메모/)).toBeTruthy();
  });

  it('staggers the labels of notes over the same range and truncates them to their area', async () => {
    const f = fixture();
    f.rows.push(note('x1', '첫 메모', true), note('x2', '둘째 메모는 아주 길다'.repeat(8), false), note('x3', '떨어진 메모', false, { from: '2026-09-01T00:00:00', to: '2026-09-01T00:00:00' }));
    mount(f.adapter, on);
    await screen.findByText(/첫 메모/);
    const areas = (plottedSeries.find(s => s.id === '__overlay')?.markArea?.data ?? []) as unknown as [{ label?: { offset?: [number, number]; width?: number; overflow?: string } }, unknown][];
    const labels = areas.map(([start]) => start.label);
    expect(labels.map(l => l?.offset?.[1])).toEqual([0, 12, 24]);
    for (const l of labels) { expect(l?.overflow).toBe('truncate'); expect(l?.width).toBeGreaterThan(0); }
  });

  const labelWidths = () => ((plottedSeries.find(s => s.id === '__overlay')?.markArea?.data ?? []) as unknown as [{ label?: { width?: number } }, unknown][]).map(([start]) => start.label?.width);
  const plotInstance = (width: number) => ({ getWidth: () => width, dispatchAction: () => {} }) as never;

  // F2: a Context change resets the whole delete operation, so the frame stays usable while still mounted.
  it('lets the next delete run after a Context change lands between the accepted delete and the refetch', async () => {
    const f = fixture();
    f.rows.push(note('x1', '첫째', true), note('x2', '둘째', true));
    mount(f.adapter, on);
    await screen.findByRole('button', { name: '삭제: 첫째' });
    let release: () => void = () => {};
    f.list.mockImplementationOnce(() => new Promise(resolve => {
      release = () => resolve({ ...envelope, outcome: 'ok', data: { items: f.rows.filter(r => r.chartId === 'chart-1' && r.scopeId === 'MEM') } });
    }));
    fireEvent.click(screen.getByRole('button', { name: '삭제: 첫째' }));
    fireEvent.click(within(screen.getByRole('group', { name: '삭제 확인: 첫째' })).getByRole('button', { name: '삭제 확정' }));
    await screen.findByText('주석을 삭제했습니다.');
    fireEvent.click(screen.getByRole('button', { name: 'to-photo' }));
    await act(async () => { release(); });
    await waitFor(() => expect(screen.queryByText(/첫째/)).toBeNull());
    fireEvent.click(await screen.findByRole('button', { name: '삭제: 둘째' }));
    fireEvent.click(within(screen.getByRole('group', { name: '삭제 확인: 둘째' })).getByRole('button', { name: '삭제 확정' }));
    await waitFor(() => expect(f.del).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/둘째/)).toBeNull());
  });

  it('ignores a delete that finishes after the Context changed', async () => {
    const f = fixture();
    f.rows.push(note('x1', '첫째', true));
    let finish: () => void = () => {};
    f.del.mockImplementationOnce(async () => { await new Promise<void>(resolve => { finish = resolve; }); return { ...envelope, outcome: 'ok', data: { id: 'x1' } }; });
    mount(f.adapter, on);
    fireEvent.click(await screen.findByRole('button', { name: '삭제: 첫째' }));
    fireEvent.click(within(screen.getByRole('group', { name: '삭제 확인: 첫째' })).getByRole('button', { name: '삭제 확정' }));
    fireEvent.click(screen.getByRole('button', { name: 'to-photo' }));
    await act(async () => { finish(); });
    expect(screen.queryByText('주석을 삭제했습니다.')).toBeNull();
    // R2: the server removed the note, so the list reloads even though the toast and focus move are skipped.
    await waitFor(() => expect(f.list).toHaveBeenCalledTimes(2));
  });

  // F3: the label budget follows the plot width, with no other chart interaction.
  it('recomputes the label widths when the plot narrows', async () => {
    const f = fixture();
    f.rows.push(note('x1', '긴 주석 '.repeat(20), false));
    mount(f.adapter, on);
    await screen.findByText(/긴 주석/);
    act(() => plotProps?.onReady?.(plotInstance(640)));
    const wide = labelWidths()[0]!;
    act(() => plotProps?.onResize?.(320));
    const narrow = labelWidths()[0]!;
    expect(wide).toBe(568);
    expect(narrow).toBe(248);
  });

  // F4: static label work is cached across unrelated renders and skipped without notes.
  it('does not redo the overlap pass for renders that change no note, and skips it without notes', async () => {
    const calls = vi.mocked(assignNoteLevels);
    calls.mockClear();
    const none = fixture();
    mount(none.adapter, on);
    await screen.findByRole('button', { name: '구간 선택' });
    expect(calls).not.toHaveBeenCalled();
    cleanup();
    const f = fixture();
    f.rows.push(note('x1', '내 메모', true), note('x2', '둘째', true));
    mount(f.adapter, on);
    fireEvent.click(await screen.findByRole('button', { name: '삭제: 내 메모' }));
    const settledCalls = calls.mock.calls.length;
    expect(settledCalls).toBeGreaterThan(0);
    fireEvent.click(within(screen.getByRole('group', { name: '삭제 확인: 내 메모' })).getByRole('button', { name: '취소' }));
    fireEvent.click(screen.getByText('fake-brush'));
    fireEvent.click(await screen.findByRole('button', { name: '주석' }));
    expect(calls.mock.calls.length).toBe(settledCalls);
  });

  // F5: a blur that lands on body is a real focus departure.
  it('does not pull focus back after the user blurred the confirm button to the page', async () => {
    const f = fixture();
    f.rows.push(note('x1', '첫째', true), note('x3', '셋째', true));
    let finish: () => void = () => {};
    f.del.mockImplementationOnce(async () => {
      await new Promise<void>(resolve => { finish = resolve; });
      f.rows.splice(0, 1);
      return { ...envelope, outcome: 'ok', data: { id: 'x1' } };
    });
    mount(f.adapter, on);
    fireEvent.click(await screen.findByRole('button', { name: '삭제: 첫째' }));
    const confirm = within(screen.getByRole('group', { name: '삭제 확인: 첫째' })).getByRole('button', { name: '삭제 확정' });
    confirm.focus();
    fireEvent.click(confirm);
    confirm.blur();
    expect(document.activeElement).toBe(document.body);
    await act(async () => { finish(); });
    await waitFor(() => expect(screen.queryByText(/첫째/)).toBeNull());
    expect(document.activeElement).toBe(document.body);
  });
});


const sizeSession = testSession(['platform:view']);
const sizeAdapter = testAdapter({ session: () => sizeSession });
function sizedFrame(props: Partial<AnalysisChartFrameProps> = {}, context: React.ContextType<typeof AnalysisSectionContext> = null) {
  return <I18nProvider><PlatformProvider adapter={sizeAdapter} registry={registryWith(on)}>
    <AnalysisSectionContext.Provider value={context}><AnalysisChartFrame chartId="sized" title="Sized" unit="ea" series={series} compareSeries={compareSeries} {...props} /></AnalysisSectionContext.Provider>
  </PlatformProvider></I18nProvider>;
}
it.each([[undefined, 260], ['regular', 260], ['compact', 200], ['hero', 360]] as const)('uses %s frame plot height %s', async (size, height) => {
  render(sizedFrame({ size })); await screen.findByRole('img'); expect(plotProps?.height).toBe(height);
});
it.each([
  [{ kind: 'chart', density: 'compact' }, {}, 200, true],
  [{ kind: 'chart', density: 'compact', span: 'full' }, {}, 360, false],
  [{ kind: 'chart', density: 'compact' }, { size: 'regular' }, 260, false],
  [{ kind: 'chart', span: 'full' }, { size: 'compact' }, 200, true],
  [{ kind: 'chart', density: 'compact' }, { height: 333 }, 333, true],
  [{ kind: 'breakdown', density: 'compact' }, {}, 260, false],
] as const)('resolves frame context %j and overrides %j', async (context, props, height, compact) => {
  render(sizedFrame({ description: 'Details', ...props }, { title: 'Section', collapse() {}, ...context }));
  await screen.findByRole('img'); expect(plotProps?.height).toBe(height);
  expect(screen.queryByRole('button', { name: '차트 설명' }) !== null).toBe(compact);
});
it('reveals compact string descriptions on keyboard focus and retains version and action names', async () => {
  window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
  render(sizedFrame({ size: 'compact', description: 'String details', metricVersion: 'v1', extraActions: <button>Custom action</button> }));
  await screen.findByRole('img'); const user = userEvent.setup(); await user.tab();
  expect(screen.getByRole('button', { name: '차트 설명' })).toHaveFocus();
  expect(await screen.findByRole('tooltip')).toHaveTextContent('String details');
  expect(screen.getByText(/Metric|지표 버전/)).toBeVisible();
  for (const name of ['Custom action', '비교', '주석', '내보내기', '더보기', '구간 선택']) expect(screen.getByRole('button', { name })).toBeVisible();
});
it('keeps compare, hidden series, brush selection, annotation draft and focus across size changes', async () => {
  window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
  const f = fixture();
  const node = (size: 'regular' | 'compact') => <I18nProvider><PlatformProvider adapter={f.adapter} registry={registryWith(on)}>
    <AnalysisChartFrame chartId="sized" title="Sized" unit="ea" series={series} compareSeries={compareSeries} size={size} />
  </PlatformProvider></I18nProvider>;
  const view = render(node('regular')); await screen.findByRole('img');
  fireEvent.click(screen.getByRole('button', { name: '비교' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'S1' }));
  await brushAndOpenNote();
  const input = screen.getByRole('textbox'); fireEvent.change(input, { target: { value: 'Draft' } }); input.focus();
  view.rerender(node('compact'));
  expect(input).toHaveFocus(); expect(input).toHaveValue('Draft');
  expect(screen.getByRole('button', { name: '비교' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('checkbox', { name: 'S1' })).not.toBeChecked();
  const legend = screen.getByRole('group', { name: '범례' });
  for (const label of legend.querySelectorAll('label, strong')) expect(label).toHaveClass('text-tiny');
});

it.each([undefined, 'Details', <em key="rich">Details</em>])('keeps frame version visible with description %j in every size', async description => {
  const view = render(sizedFrame({ description, metricVersion: 'v1' })); await screen.findByRole('img');
  expect(screen.getByText(/지표 버전/)).toBeVisible();
  if (description) expect(screen.getByText(/Details/)).toBeVisible();
  view.rerender(sizedFrame({ size: 'compact', description, metricVersion: 'v1', height: 321 }));
  expect(plotProps?.height).toBe(321);
  expect(screen.getByText(/지표 버전/)).toBeVisible();
  const info = screen.queryByRole('button', { name: '차트 설명' });
  expect(info !== null).toBe(Boolean(description));
  if (info) {
    info.focus();
    const tooltip = await screen.findByRole('tooltip'); expect(tooltip).toHaveTextContent('Details');
    if (typeof description !== 'string') expect(tooltip.querySelector('em')).toBeTruthy();
  }
});
it('keeps a focused frame action and consumer actions mounted across size changes', async () => {
  window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
  const props = { extraActions: <button>Custom</button>, selectionActions: () => <button>Selected custom</button> };
  const view = render(sizedFrame(props)); await screen.findByRole('img');
  fireEvent.click(screen.getByText('fake-brush'));
  const action = screen.getByRole('button', { name: 'Selected custom' }); action.focus();
  view.rerender(sizedFrame({ ...props, size: 'compact' }));
  expect(action).toHaveFocus(); expect(screen.getByRole('button', { name: 'Custom' })).toBeVisible();
});


it.each([['Export title', 'Export title'], [<strong>Rich title</strong>, 'sized']] as const)('exports applied context, metric version and unit with title %s', async (title, expectedTitle) => {
  const blobs: Blob[] = [];
  class DownloadURL extends URL {
    static createObjectURL(blob: Blob) { blobs.push(blob); return 'blob:metadata'; }
    static revokeObjectURL = vi.fn();
  }
  vi.stubGlobal('URL', DownloadURL);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  try {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM&from=2026-10-01T00:00:00&to=2026-10-02T00:00:00');
    render(sizedFrame({ title, metricVersion: 'v2', unit: 'kg' }));
    fireEvent.click(await screen.findByRole('button', { name: '내보내기' }));
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsText(blobs[0]);
    });
    expect(text.split('\r\n')[0]).toBe(`# ${expectedTitle} · scopeId=MEM · from=2026-10-01T00:00:00 · to=2026-10-02T00:00:00 · metricVersion=v2 · unit=kg`);
    expect(DownloadURL.revokeObjectURL).toHaveBeenCalledWith('blob:metadata');
  } finally { vi.unstubAllGlobals(); }
});

describe('fill card: the start/end range form is on demand (ADR-0067 decision 21)', () => {
  const hour = (h: number) => `2026-10-16T${String(h).padStart(2, '0')}:00:00`;
  const hourly: ChartSeries = { id: 's1', name: 'S1', color: 'chart-blue', points: [16, 17, 18, 19, 20, 21, 22].map(h => [hour(h), 1] as [string, number]) };
  const period = '/?v=1&scopeId=MEM&from=2026-10-16T16:00:00&to=2026-10-16T23:00:00';
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  beforeAll(() => { HTMLElement.prototype.scrollIntoView = () => {}; });
  afterAll(() => { HTMLElement.prototype.scrollIntoView = originalScrollIntoView; });

  it('a fill chart has no selection summary or range fields until brush mode is on or a range exists; other sizes always have them', async () => {
    mount(fixture().adapter, off, period, { series: [hourly], compareSeries: [], size: 'fill' });
    const toggle = await screen.findByRole('button', { name: '구간 선택' });
    expect(screen.queryByRole('region', { name: '선택 요약' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: '구간 시작' })).toBeNull();
    fireEvent.click(toggle);
    expect(await screen.findByRole('combobox', { name: '구간 시작' })).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.queryByRole('combobox', { name: '구간 시작' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '1시간' }));
    expect(screen.getByRole('region', { name: '선택 요약' }).textContent).toContain('선택 구간:');
    cleanup();
    mount(fixture().adapter, off, period, { series: [hourly], compareSeries: [] });
    expect(await screen.findByRole('combobox', { name: '구간 시작' })).toBeTruthy();
  });

  it('opening brush mode from the keyboard puts focus on the first field; a pointer click leaves it on the button', async () => {
    mount(fixture().adapter, off, period, { series: [hourly], compareSeries: [], size: 'fill' });
    const toggle = await screen.findByRole('button', { name: '구간 선택' });
    fireEvent.click(toggle, { detail: 1 });
    await screen.findByRole('combobox', { name: '구간 시작' });
    expect(document.activeElement).not.toBe(screen.getByRole('combobox', { name: '구간 시작' }));
    fireEvent.click(toggle, { detail: 1 });
    fireEvent.click(toggle, { detail: 0 });
    const start = await screen.findByRole('combobox', { name: '구간 시작' });
    await waitFor(() => { expect(document.activeElement).toBe(start); });
  });
});

describe('valueFormat is read when the tooltip needs it (C2)', () => {
  it('a new valueFormat from the consumer takes effect without rebuilding the option', async () => {
    const formatter = () => (plotProps!.option as unknown as { tooltip: { valueFormatter: (value: number) => string } }).tooltip.valueFormatter(3);
    const { adapter } = fixture();
    const view = mount(adapter, off, '/?v=1&scopeId=MEM', { valueFormat: value => `A${value}` });
    await screen.findByRole('img');
    expect(formatter()).toBe('A3 ea');
    const optionBefore = plotProps!.option;
    view.rerender(<I18nProvider><PlatformProvider adapter={adapter} registry={registryWith(off)}>
      <SwitchScope />
      <SwitchRooms />
      <ToastProbe />
      <AnalysisChartFrame chartId="chart-1" title="Chart" series={series} compareSeries={compareSeries} unit="ea" valueFormat={value => `B${value}`} />
    </PlatformProvider></I18nProvider>);
    await waitFor(() => { expect(formatter()).toBe('B3 ea'); });
    expect(plotProps!.option).toBe(optionBefore);
  });
});
