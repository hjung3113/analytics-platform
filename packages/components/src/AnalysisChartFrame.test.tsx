import { type ReactElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnnotationInput, ApiResponse, AnnotationRef, ChartAnnotation, PlatformAdapter, Session } from '@ap/contracts';
import { parseDateTime } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import { AnalysisChartFrame, type ChartSeries } from './AnalysisChartFrame';
import type { EChartProps } from './EChart';
import { noContext, testAdapter, testSpace } from './test-support';

vi.mock('./EChartImpl', () => ({ default: FakePlot }));

type CapturedSeries = {
  id?: string;
  type?: string;
  lineStyle?: { color?: string; type?: string | number[] };
  itemStyle?: { color?: string };
  markLine?: { lineStyle?: { color?: string }; label?: { color?: string; position?: string } };
  markArea?: { data?: [{ name?: string; label?: { position?: string } }, unknown][] };
};
let plottedSeries: CapturedSeries[] = [];
let plottedBrush: { brushStyle?: { color?: string; borderColor?: string } } | undefined;

/** Stand-in plot: one button plays a Brush selection over the whole series. */
function FakePlot(props: EChartProps): ReactElement {
  plottedSeries = (props.option as unknown as { series?: CapturedSeries[] }).series ?? [];
  plottedBrush = (props.option as unknown as { brush?: { brushStyle?: { borderColor?: string } } }).brush;
  const range = [parseDateTime('2026-09-01T00:00:00', 'x').getTime(), parseDateTime('2026-09-02T00:00:00', 'x').getTime()];
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
  const adapter = testAdapter({
    session: () => session,
    getEntity: async () => none_('empty'),
    listAnnotations: list,
    saveAnnotation: save,
  });
  return { adapter, rows, list, save };
}

const series: ChartSeries[] = [{ id: 's1', name: 'S1', color: 'chart-blue', points: [['2026-09-01T00:00:00', 1], ['2026-09-02T00:00:00', 2]] }];
const compareSeries: ChartSeries[] = [{ id: 's2', name: 'S2', color: 'chart-purple', points: series[0].points }];

function SwitchScope() {
  const { setGlobal } = usePlatform();
  return <button type="button" onClick={() => setGlobal({ scopeId: 'CJU' })}>to-cju</button>;
}
function mount(
  adapter: PlatformAdapter,
  features: typeof off,
  url = '/?v=1&scopeId=ICH',
  chart: { series?: ChartSeries[]; compareSeries?: ChartSeries[]; markLines?: { y: number; label: string }[] } = {},
) {
  window.history.replaceState(null, '', url);
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registryWith(features)}>
    <SwitchScope />
    <AnalysisChartFrame chartId="chart-1" title="Chart" series={chart.series ?? series} compareSeries={chart.compareSeries ?? compareSeries} markLines={chart.markLines} unit="ea" />
  </PlatformProvider></I18nProvider>);
}
const brushAndOpenNote = async () => {
  fireEvent.click(await screen.findByText('fake-brush'));
  fireEvent.click(await screen.findByRole('button', { name: '주석' }));
};

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
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
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH');

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
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH');
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
    mount(fixture().adapter, off, '/?v=1&scopeId=ICH', { series: spread });
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
      mount(fixture().adapter, on, '/?v=1&scopeId=ICH', { series: spread });
      fireEvent.click(await screen.findByRole('button', { name: '내보내기' }));
      expect(blobs).toHaveLength(1);
      await expect(blobStartsWithBom(blobs[0])).resolves.toBe(true);
      await expect(blobText(blobs[0])).resolves.toBe(
        '# Chart · scopeId=ICH · from= · to=\r\n'
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
    mount(fixture().adapter, off, '/?v=1&scopeId=ICH', { series: sparse });
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
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH');
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
    // The front buttons are their own bundle ahead of the tail.
    const front = tail.previousElementSibling as HTMLElement;
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
    mount(fixture().adapter, on, '/?v=1&scopeId=ICH', { compareSeries: [] });
    await screen.findByRole('button', { name: '구간 선택' });
    expect(screen.queryByRole('button', { name: '비교' })).toBeNull();
    expect(screen.queryByText('현재 기간')).toBeNull();
    expect(screen.queryByText('이전 기간')).toBeNull();
  });

  it('keeps wrapping period rows when more than four corresponding series are present', async () => {
    const many = Array.from({ length: 5 }, (_, index) => ({
      id: `current-${index}`,
      name: `Current ${index + 1}`,
      color: 'chart-blue',
      points: series[0].points,
    }));
    const previous = many.slice(0, 2).map((item, index) => ({ ...item, id: `previous-${index}`, name: `Previous ${index + 1}` }));
    mount(fixture().adapter, on, '/?v=1&scopeId=ICH', { series: many, compareSeries: previous });
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
      mount(fixture().adapter, on, '/?v=1&scopeId=ICH', {
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
    await waitFor(() => expect(f.list).toHaveBeenCalledWith({ chartId: 'chart-1', scopeId: 'ICH' }, expect.anything()));
    await brushAndOpenNote();
    fireEvent.change(screen.getByLabelText('주석 내용'), { target: { value: 'PM 작업' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(f.save).toHaveBeenCalledTimes(1));
    expect(f.save.mock.calls[0][0]).toEqual({ chartId: 'chart-1', scopeId: 'ICH', from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00', text: 'PM 작업' });
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
    f.rows.push({ id: 'r1', chartId: 'chart-1', scopeId: 'ICH', from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00', text: '재시도 후 보이는 메모', at: '2026-09-29T09:00' });
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText(/재시도 후 보이는 메모/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
