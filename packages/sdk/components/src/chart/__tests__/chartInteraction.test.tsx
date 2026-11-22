import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { groupId, spaceId, wallClockEpochMs, type AnnotationInput, type ApiResponse, type ChartAnnotation } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { noContext, testAdapter, testMenu, testSession, testSpace, ToastProbe } from '@ap/kernel/testing';
import { House } from 'lucide-react';
import { afterEach, expect, it, vi } from 'vitest';
import { AnalysisChartFrame } from '../AnalysisChartFrame';
import { AnalysisChart } from '../AnalysisChart';
import type { EChartProps } from '../EChart';

let plot: EChartProps;
vi.mock('../EChartImpl', () => ({ default: (props: EChartProps) => {
  plot = props;
  return <div role="img" aria-label={props.ariaLabel} />;
} }));
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

it.each(['full', 'standard'] as const)('keeps table and More accessible during a range in %s chrome', async chrome => {
  render(<I18nProvider><AnalysisChartFrame chartId="trend" title="Trend" chrome={chrome} xType="category" unit="s"
    series={[{ id: 's', name: 'Series', color: 'chart-blue', unit: 's', points: [['A', 1], ['B', 2]] }]} /></I18nProvider>);
  await screen.findByRole('img');
  const toolbar = screen.getByRole('toolbar', { name: '차트 동작' });
  expect(within(toolbar).getAllByRole('button').map(button => button.getAttribute('aria-label') ?? button.textContent)).toEqual(
    ['확대', '구간 선택', '초기화', '주석', '표로 보기', '더보기'],
  );
  fireEvent.click(within(toolbar).getByRole('button', { name: '구간 선택' }));
  act(() => plot.onEvents?.brushEnd?.({ areas: [{ coordRange: [0, 1] }] }, { dispatchAction: vi.fn() } as never));
  expect(screen.getByRole('button', { name: '주석 남기기' })).toHaveProperty('disabled', true);
  const apply = screen.getByRole('button', { name: '분석 구간으로 적용' });
  expect(apply).toHaveProperty('disabled', true);
  expect(apply).toHaveAccessibleDescription('시간축에서만 분석 구간으로 적용할 수 있습니다.');
  fireEvent.click(within(toolbar).getByRole('button', { name: '더보기' }));
  expect(await screen.findByRole('dialog', { name: '더보기' })).toBeTruthy();
});

it('retains tied first place, selects a ranking bar, adds with Shift and drills with Enter', async () => {
  const onItemClick = vi.fn();
  render(<I18nProvider><AnalysisChart chartId="ranking" title="Ranking" unit="min"
    spec={{ kind: 'topNBar', topN: 1, defaultExpanded: true, onItemClick, items: [
      { id: 'a', label: 'Alpha', value: 2, colorToken: 'chart-blue' },
      { id: 'b', label: 'Beta', value: 2, colorToken: 'chart-purple' },
    ] }} /></I18nProvider>);
  await screen.findByRole('img');
  const click = (dataIndex: number, shiftKey = false) => act(() => plot.onEvents?.click?.(
    { componentType: 'series', seriesIndex: 0, dataIndex, event: { event: { shiftKey } } }, {} as never,
  ));
  click(0);
  click(1, true);
  expect(screen.getByText(/Alpha, Beta/)).toBeTruthy();
  expect(onItemClick).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole('group', { name: '차트 지점' }), { key: 'Enter' });
  expect(onItemClick).toHaveBeenCalledWith('b');
});

const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [testMenu({ pageType: 'analysis', context: { ...noContext, time: 'apply' }, features: { annotate: true, compare: true, export: true } })],
});
const start = '2026-09-25T10:00:00';
const end = '2026-09-25T11:00:00';

it('saves a range annotation and applies the selected period after confirmation', async () => {
  const saveAnnotation = vi.fn(async (input: AnnotationInput): Promise<ApiResponse<ChartAnnotation>> => ({
    outcome: 'ok', assessments: [], trust: null, correlationId: 'fixture',
    data: { ...input, scopeId: 'MEM', id: 'note', at: end, mine: true },
  }));
  const listAnnotations = async () => ({ outcome: 'empty' as const, assessments: [], trust: null, correlationId: 'fixture', data: null });
  const session = testSession(['platform:view', 'analytics:view']);
  const adapter = testAdapter({ session: () => session, saveAnnotation, listAnnotations });
  window.history.replaceState(null, '', '/?v=1&scopeId=MEM&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
    <AnalysisChartFrame chartId="timed" title="Timed" unit="ea" compareSeries={[{ id: 'previous', name: 'Previous', color: 'chart-purple', unit: 'ea', points: [[start, 1], [end, 2]] }]}
      series={[{ id: 's', name: 'Series', color: 'chart-blue', unit: 'ea', points: [[start, 1], [end, 2]] }]} />
  </PlatformProvider></I18nProvider>);
  await screen.findByRole('img');
  fireEvent.click(screen.getByRole('button', { name: '구간 선택' }));
  act(() => plot.onEvents?.brushEnd?.({ areas: [{ coordRange: [wallClockEpochMs(start), wallClockEpochMs(end)] }] }, { dispatchAction: vi.fn() } as never));
  const toolbar = screen.getByRole('toolbar', { name: '차트 동작' });
  expect(within(toolbar).getAllByRole('button').map(button => button.getAttribute('aria-label') ?? button.textContent))
    .toEqual(['확대', '구간 선택', '초기화', '비교', '주석', '표로 보기', '내보내기', '더보기']);
  const annotate = screen.getByRole('button', { name: '주석 남기기' });
  expect(annotate).toHaveProperty('disabled', false);
  fireEvent.click(annotate);
  fireEvent.change(screen.getByLabelText('주석 내용'), { target: { value: 'PM 작업' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(saveAnnotation).toHaveBeenCalledWith({ chartId: 'timed', scopeId: 'MEM', from: start, to: end, text: 'PM 작업' }));
  const apply = screen.getByRole('button', { name: '분석 구간으로 적용' });
  expect(apply).toHaveProperty('disabled', false);
  fireEvent.click(apply);
  fireEvent.click(screen.getByRole('button', { name: '적용' }));
  await waitFor(() => expect(new URLSearchParams(window.location.search).get('from')).toBe(start));
  expect(new URLSearchParams(window.location.search).get('to')).toBe(end);
});

const points = [['2026-09-25T20:00:00', 1], ['2026-09-25T23:00:00', 2], ['2026-09-26T00:00:00', 3]] as const;
const timeSeries = [{ id: 'time', name: 'Jobs', color: 'chart-blue' as const, unit: 'ea', points: points.map(([x, y]): [string, number] => [x, y]) }];
const period = { from: points[0][0], to: points[2][0] };

const categorySeries = { id: 's', name: 'Series', color: 'chart-blue' as const, unit: 's', points: [['A', 1], ['B', 2], ['C', 3]] as [string, number][] };

it('ignores a rejected time sample even when a selectable sample shares its timestamp', async () => {
  const onDrill = vi.fn();
  const pointActions = vi.fn(() => [{ id: 'inspect', label: 'Inspect', onSelect: vi.fn() }]);
  render(<I18nProvider><AnalysisChartFrame chartId="duplicate-time" title="Trend" unit="ea"
    series={[{ ...timeSeries[0], points: [[start, 1], [start, 2]] }]}
    isPointSelectable={point => point.value === 1} pointActivation={{ on: 'click', onActivate: onDrill }} pointActions={pointActions} /></I18nProvider>);
  await screen.findByRole('img');
  const rejected = { seriesId: 'time', dataIndex: 1, event: { event: { preventDefault: vi.fn() } } };
  act(() => plot.onEvents?.click?.(rejected, {} as never));
  expect(screen.queryByText(/Jobs · 1 ea/, { selector: 'p' })).toBeNull();
  act(() => plot.onEvents?.dblclick?.(rejected, {} as never));
  expect(onDrill).not.toHaveBeenCalled();
  pointActions.mockClear();
  act(() => plot.onEvents?.contextmenu?.(rejected, {} as never));
  expect(pointActions).not.toHaveBeenCalled();
  expect(rejected.event.event.preventDefault).not.toHaveBeenCalled();
  expect(screen.queryByRole('menuitem', { name: 'Inspect' })).toBeNull();
  act(() => plot.onEvents?.dblclick?.({ seriesId: 'time', dataIndex: 0 }, {} as never));
  expect(onDrill).toHaveBeenCalledExactlyOnceWith({ x: start, seriesId: 'time', value: 1 });
});

it('reapplies the controlled row and retires the old point menu when the chart is replaced', async () => {
  const onDrill = vi.fn();
  const pointActions = [{ id: 'inspect', label: 'Inspect', onSelect: vi.fn() }];
  const tree = (chartId: string, value: number) => <I18nProvider><AnalysisChartFrame
    chartId={chartId} title="Rows" orientation="horizontal" xType="category" unit="s" activeCategory="B"
    series={[{ ...categorySeries, points: [['A', 1], ['B', value]] }]} pointActivation={{ on: 'click', onActivate: onDrill }}
    pointActions={pointActions} /></I18nProvider>;
  const view = render(tree('original', 2));
  await screen.findByRole('img');
  const chart = screen.getByRole('group', { name: '차트 지점' });
  act(() => plot.onEvents?.click?.({ seriesId: 's', dataIndex: 1 }, {} as never));
  expect(screen.getByText('B · Series · 2 s', { selector: 'p' })).toBeInTheDocument();
  act(() => plot.onEvents?.contextmenu?.({ seriesId: 's', dataIndex: 1 }, {} as never));
  expect(await screen.findByRole('menuitem', { name: 'Inspect' })).toBeInTheDocument();
  view.rerender(tree('replacement', 20));
  fireEvent.keyDown(chart, { key: 'Enter' });
  expect(onDrill).toHaveBeenCalledExactlyOnceWith({ x: 'B', seriesId: 's', value: 20 });
  expect(screen.getByRole('combobox', { name: '차트 지점 선택' })).toHaveDisplayValue('B · Series · 20 s');
  expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('활성 행: B');
  expect(screen.queryByText('B · Series · 20 s', { selector: 'p' })).toBeNull();
  expect(screen.queryByRole('menuitem', { name: 'Inspect' })).toBeNull();
});

it('selects and adds with the inline picker without submitting a surrounding form', async () => {
  const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
  render(<I18nProvider><form onSubmit={submit}><AnalysisChartFrame chartId="inline" title="Inline"
    xType="category" unit="s" series={[categorySeries]} onPointClick={vi.fn()} /></form></I18nProvider>);
  await screen.findByRole('img');
  fireEvent.click(screen.getByRole('button', { name: '이 지점만 선택' }));
  fireEvent.change(screen.getByRole('combobox', { name: '차트 지점 선택' }), { target: { value: JSON.stringify(['s', 'B']) } });
  fireEvent.click(screen.getByRole('button', { name: '선택에 지점 추가' }));
  expect(screen.getByText('A · Series · 1 s / B · Series · 2 s')).toBeInTheDocument();
  expect(submit).not.toHaveBeenCalled();
});

it.each(['full', 'standard'] as const)('selects and adds points with the keyboard in a plain %s frame', async chrome => {
  const user = userEvent.setup();
  render(<I18nProvider><AnalysisChartFrame chartId="plain" title="Plain" chrome={chrome} xType="category" unit="s" series={[categorySeries]} /></I18nProvider>);
  await screen.findByRole('img');
  screen.getByRole('button', { name: '더보기' }).focus();
  await user.keyboard('{Enter}');
  const tools = await screen.findByRole('dialog', { name: '더보기' });
  const picker = within(tools).getByRole('combobox', { name: '차트 지점 선택' });
  expect(picker).toHaveFocus();
  await user.tab();
  expect(screen.getByRole('button', { name: '이 지점만 선택' })).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByText('A · Series · 1 s', { selector: 'p' })).toBeInTheDocument();
  await user.tab({ shift: true });
  expect(picker).toHaveFocus();
  // jsdom cannot open the native select popup. Commit the next option through its change path.
  await user.selectOptions(picker, within(picker).getByRole('option', { name: 'B · Series · 2 s' }));
  await user.tab();
  await user.tab();
  expect(screen.getByRole('button', { name: '선택에 지점 추가' })).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByText('A · Series · 1 s / B · Series · 2 s')).toBeInTheDocument();
  await user.tab({ shift: true });
  expect(screen.getByRole('button', { name: '이 지점만 선택' })).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByText('B · Series · 2 s', { selector: 'p' })).toBeInTheDocument();
  expect(screen.queryByText(/A · Series · 1 s/, { selector: 'p' })).toBeNull();
});

it('keeps the first preset focused after Enter and reaches Apply by Tab', async () => {
  const user = userEvent.setup();
  const session = testSession(['platform:view', 'analytics:view']);
  const adapter = testAdapter({ session: () => session });
  window.history.replaceState(null, '', `/?v=1&scopeId=MEM&from=${period.from}&to=${period.to}`);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
    <AnalysisChartFrame chartId="window" title="Window" unit="ea" series={timeSeries} />
  </PlatformProvider></I18nProvider>);
  await screen.findByRole('img');
  const preset = screen.getByRole('button', { name: '1시간' });
  preset.focus();
  await user.keyboard('{Enter}');
  expect(preset).toHaveFocus();
  for (const name of ['4시간', '전체', '주석 남기기', '분석 구간으로 적용']) {
    await user.tab();
    expect(screen.getByRole('button', { name })).toHaveFocus();
  }
});

it.each(['scatter', 'heatmap'] as const)('keeps %s click selection during Brush', async kind => {
  const onActivate = vi.fn();
  render(<I18nProvider><AnalysisChart chartId={kind} title={kind} unit="s" spec={kind === 'scatter'
    ? { kind, xLabel: 'X', yLabel: 'Y', xUnit: 's', points: [{ id: 'a', label: 'Alpha', x: 1, y: 2 }] }
    : { kind, xLabels: ['X'], yLabels: ['Y'], cells: [{ x: 'X', y: 'Y', value: 2 }], cellActivation: { on: 'click', onActivate } }} /></I18nProvider>);
  await screen.findByRole('img');
  const summary = screen.getByRole('region', { name: '선택 요약' });
  const click = () => act(() => plot.onEvents?.click?.({ componentType: 'series', seriesIndex: 0, dataIndex: 0 }, {} as never));
  fireEvent.click(screen.getByRole('button', { name: '구간 선택' }));
  click();
  expect(summary).toHaveTextContent(kind === 'scatter' ? 'Alpha · 1개 선택' : '1칸 선택');
  expect(onActivate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '구간 선택' }));
  click();
  expect(summary).toHaveTextContent('선택 없음');
  if (kind === 'heatmap') expect(onActivate).toHaveBeenCalledExactlyOnceWith('X', 'Y');
});

it('hides accepted notes and discards the draft and delete confirmation when Annotate is turned off', async () => {
  const session = testSession(['platform:view', 'analytics:view']);
  const listAnnotations = vi.fn(async (): Promise<ApiResponse<{ items: readonly ChartAnnotation[] }>> => ({
    outcome: 'ok', assessments: [], trust: null, correlationId: 'fixture',
    data: { items: [{ chartId: 'window', scopeId: 'MEM', id: 'note', from: points[0][0], to: points[2][0], text: 'Accepted note', at: end, mine: true }] },
  }));
  const pendingSaves: (() => void)[] = [];
  const saveAnnotation = vi.fn((input: AnnotationInput) => new Promise<ApiResponse<ChartAnnotation>>(resolve => {
    pendingSaves.push(() => resolve({
      outcome: 'ok', assessments: [], trust: null, correlationId: 'fixture',
      data: { ...input, scopeId: 'MEM', id: input.text, at: end, mine: true },
    }));
  }));
  const deleteAnnotation = vi.fn();
  const adapter = testAdapter({ session: () => session, listAnnotations, saveAnnotation, deleteAnnotation });
  const disabledRegistry = createRegistry({
    spaces: [testSpace()],
    groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
    menus: [testMenu({ pageType: 'analysis', context: { ...noContext, time: 'apply' }, features: { annotate: false, compare: true, export: true } })],
  });
  window.history.replaceState(null, '', `/?v=1&scopeId=MEM&from=${period.from}&to=${period.to}`);
  const tree = (chartRegistry: typeof registry) => <I18nProvider><PlatformProvider adapter={adapter} registry={chartRegistry}>
    <ToastProbe />
    <AnalysisChartFrame chartId="window" title="Window" unit="ea" series={timeSeries} />
  </PlatformProvider></I18nProvider>;
  const view = render(tree(registry));
  await screen.findByRole('img');
  const deleteNote = await screen.findByRole('button', { name: '삭제: Accepted note' });
  expect(JSON.stringify(plot.option)).toContain('Accepted note');
  fireEvent.click(screen.getByRole('button', { name: '1시간' }));
  fireEvent.click(screen.getByRole('button', { name: '주석 남기기' }));
  fireEvent.change(screen.getByRole('textbox', { name: '주석 내용' }), { target: { value: 'Draft' } });
  fireEvent.click(deleteNote);
  expect(screen.getByRole('group', { name: /Accepted note/ })).toBeInTheDocument();
  view.rerender(tree(disabledRegistry));
  expect(screen.queryByText(/Accepted note/)).toBeNull();
  expect(JSON.stringify(plot.option)).not.toContain('Accepted note');
  expect(screen.queryByRole('button', { name: /삭제/ })).toBeNull();
  expect(screen.queryByRole('textbox', { name: '주석 내용' })).toBeNull();
  view.rerender(tree(registry));
  expect(await screen.findByRole('button', { name: '삭제: Accepted note' })).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: '주석 내용' })).toBeNull();
  expect(saveAnnotation).not.toHaveBeenCalled();
  expect(deleteAnnotation).not.toHaveBeenCalled();

  const saveDraft = (text: string) => {
    fireEvent.click(screen.getByRole('button', { name: '주석 남기기' }));
    fireEvent.change(screen.getByRole('textbox', { name: '주석 내용' }), { target: { value: text } });
    const save = screen.getByRole('button', { name: '저장' });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(save).toBeDisabled();
  };
  saveDraft('Earlier draft');
  view.rerender(tree(disabledRegistry));
  view.rerender(tree(registry));
  saveDraft('New draft');
  expect(saveAnnotation.mock.calls.map(([input]) => input.text)).toEqual(['Earlier draft', 'New draft']);
  await act(async () => pendingSaves[0]!());
  expect(screen.getByRole('textbox', { name: '주석 내용' })).toHaveValue('New draft');
  expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  expect(screen.queryByText('주석을 저장했습니다.')).toBeNull();
  await act(async () => pendingSaves[1]!());
  expect(screen.queryByRole('textbox', { name: '주석 내용' })).toBeNull();
  expect(screen.getByText('주석을 저장했습니다.')).toBeInTheDocument();
});

it.each(['chart identity', 'missing data', 'unselectable data'] as const)('clears a point from the plot and summary after %s changes', async change => {
  const tree = (chartId: string, series = categorySeries, isPointSelectable?: (point: { x: string }) => boolean) =>
    <I18nProvider><AnalysisChartFrame chartId={chartId} title="Plain" xType="category" unit="s" series={[series]} isPointSelectable={isPointSelectable} /></I18nProvider>;
  const view = render(tree('plain'));
  await screen.findByRole('img');
  act(() => plot.onEvents?.click?.({ seriesId: 's', dataIndex: 1 }, {} as never));
  const optionData = () => (plot.option as { series: { data: unknown[] }[] }).series[0].data;
  expect(screen.getByText('B · Series · 2 s', { selector: 'p' })).toBeInTheDocument();
  expect(optionData()[1]).toMatchObject({ label: { show: true } });
  if (change === 'chart identity') view.rerender(tree('replacement'));
  else if (change === 'missing data') view.rerender(tree('plain', { ...categorySeries, points: [['A', 1], ['C', 3]] }));
  else view.rerender(tree('plain', categorySeries, point => point.x !== 'B'));
  expect(screen.queryByText('B · Series · 2 s', { selector: 'p' })).toBeNull();
  expect(optionData()).not.toContainEqual(expect.objectContaining({ label: expect.objectContaining({ show: true }) }));
  view.rerender(tree('plain'));
  expect(screen.queryByText('B · Series · 2 s', { selector: 'p' })).toBeNull();
  expect(optionData()).not.toContainEqual(expect.objectContaining({ label: expect.objectContaining({ show: true }) }));
});

it('prunes a removed point while keeping another selection on the same category axis', async () => {
  const secondary = { ...categorySeries, id: 'secondary', name: 'Secondary' };
  const tree = (series: typeof secondary) => <I18nProvider><AnalysisChartFrame
    chartId="plain" title="Plain" xType="category" unit="s" series={[categorySeries, series]} /></I18nProvider>;
  const view = render(tree(secondary));
  await screen.findByRole('img');
  act(() => plot.onEvents?.click?.({ seriesId: 's', dataIndex: 0 }, {} as never));
  act(() => plot.onEvents?.click?.({ seriesId: 'secondary', dataIndex: 1, event: { event: { shiftKey: true } } }, {} as never));
  expect(screen.getByText('A · Series · 1 s / B · Secondary · 2 s')).toBeInTheDocument();
  view.rerender(tree({ ...secondary, points: [['A', 1], ['C', 3]] }));
  expect(screen.getByText('A · Series · 1 s', { selector: 'p' })).toBeInTheDocument();
  expect(screen.queryByText(/B · Secondary/, { selector: 'p' })).toBeNull();
  view.rerender(tree(secondary));
  expect(screen.queryByText(/B · Secondary/, { selector: 'p' })).toBeNull();
});

it('uses the selected series formatter and unit for the horizontal min/max summary', async () => {
  render(<I18nProvider><AnalysisChartFrame chartId="extrema" title="Extrema" orientation="horizontal" xType="category" minMax
    unit="min" valueFormat={value => value.toFixed(2)} onPointClick={vi.fn()} series={[categorySeries]} /></I18nProvider>);
  await screen.findByRole('img');
  expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('Series: 최소 A 1.00 · 최대 C 3.00 s');
});

it('keeps quick ranges at rest and after selection beside the summary while More is open', async () => {
  render(<I18nProvider><AnalysisChartFrame chartId="window" title="Window" period={period} unit="ea" series={timeSeries} chrome="standard" summary="quiet" size="fill" /></I18nProvider>);
  await screen.findByRole('img');
  const summary = screen.getByRole('region', { name: '선택 요약' });
  const quick = within(summary).getByRole('group', { name: '빠른 구간 선택' });
  expect(within(quick).getAllByRole('button').map(button => button.textContent)).toEqual(['1시간', '4시간', '전체']);
  expect(summary.classList.contains('sr-only')).toBe(false);
  fireEvent.click(within(quick).getByRole('button', { name: '1시간' }));
  expect(within(summary).getByText(/선택 구간:/)).toBeTruthy();
  expect(within(summary).getByRole('button', { name: '4시간' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '더보기' }));
  const more = await screen.findByRole('dialog', { name: '더보기' });
  expect(within(more).queryByRole('group', { name: '빠른 구간 선택' })).toBeNull();
});

it.each([true, false])('applies the annotation feature gate (%s) before the write permission gate', async annotate => {
  const session = testSession(['platform:view']);
  const listAnnotations = vi.fn();
  const adapter = testAdapter({ session: () => session, listAnnotations });
  const chartRegistry = createRegistry({
    spaces: [testSpace()],
    groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
    menus: [testMenu({ pageType: 'analysis', context: { ...noContext, time: 'apply' }, features: { annotate } })],
  });
  window.history.replaceState(null, '', `/?v=1&scopeId=MEM&from=${period.from}&to=${period.to}`);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={chartRegistry}>
    <AnalysisChartFrame chartId="window" title="Window" unit="ea" series={timeSeries} />
  </PlatformProvider></I18nProvider>);
  await screen.findByRole('img');
  fireEvent.click(screen.getByRole('button', { name: '1시간' }));
  const toolbar = screen.getByRole('toolbar', { name: '차트 동작' });
  const leaveNote = screen.queryByRole('button', { name: '주석 남기기' });
  const annotateButton = within(toolbar).queryByRole('button', { name: '주석' });
  if (annotate) {
    expect(annotateButton).toHaveProperty('disabled', true);
    expect(leaveNote).toHaveProperty('disabled', true);
    expect(screen.getAllByText('주석을 남길 권한이 없습니다(분석 쓰기 권한 필요).')).toHaveLength(2);
  } else {
    expect(annotateButton).toBeNull();
    expect(leaveNote).toBeNull();
  }
  const apply = screen.getByRole('button', { name: '분석 구간으로 적용' });
  expect(apply).toHaveProperty('disabled', true);
  expect(apply).toHaveAccessibleDescription('분석 권한이 필요합니다.');
  expect(listAnnotations).not.toHaveBeenCalled();
});

it.each([
  { drill: false, brushing: false, hint: '클릭으로 선택 · ⌘/Shift+클릭으로 추가 · 구간 선택을 켠 뒤 끌기' },
  { drill: true, brushing: false, hint: '클릭으로 선택 · ⌘/Shift+클릭으로 추가 · 더블클릭/Enter로 안쪽 단계 · 구간 선택을 켠 뒤 끌기' },
  { drill: true, brushing: true, hint: '끌어서 구간 선택' },
])('shows only the available gestures ($drill, $brushing)', async ({ drill, brushing, hint }) => {
  render(<I18nProvider><AnalysisChartFrame chartId="window" title="Window" unit="ea" series={timeSeries} onPointClick={drill ? vi.fn() : undefined} /></I18nProvider>);
  await screen.findByRole('img');
  if (brushing) fireEvent.click(screen.getByRole('button', { name: '구간 선택' }));
  expect(screen.getByText(hint)).toBeTruthy();
});

// Vite inlines MODE for jsdom transforms. Run these tests under its test, development and production modes.
const runMode = (import.meta as { env?: { MODE?: string } }).env?.MODE;
const expectUnitWarning = runMode === 'development';

it('falls back to the frame unit and warns only in development when a series unit is missing', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    render(<I18nProvider><AnalysisChartFrame chartId="window" title="Window" unit="ea"
      series={[{ ...timeSeries[0], id: 'missing', unit: undefined }]} /></I18nProvider>);
    await screen.findByRole('img');
    const messages = warn.mock.calls.filter(([message]) => String(message).includes('has no unit'));
    expect(messages).toEqual(expectUnitWarning ? [[expect.stringContaining('series "missing" has no unit')]] : []);
    expect(screen.getByRole('checkbox', { name: 'Jobs (ea)' })).toBeTruthy();
  } finally {
    warn.mockRestore();
  }
});

it('uses warning severity only in development for both missing-unit paths', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const messages = (calls: unknown[][]) => calls.filter(([message]) => String(message).includes('has no unit'));
  try {
    render(<I18nProvider>
      <AnalysisChartFrame chartId="frame" title="Frame" unit="ea" series={[{ ...timeSeries[0], id: 'missing', unit: undefined }]} />
      <AnalysisChart chartId="ranking" title="Ranking" unit=" " spec={{ kind: 'topNBar', defaultExpanded: true, items: [{ id: 'a', label: 'Alpha', value: 2, colorToken: 'chart-blue' }] }} />
    </I18nProvider>);
    await screen.findAllByRole('img');
    expect(messages(error.mock.calls)).toEqual([]);
    expect(messages(warn.mock.calls)).toHaveLength(expectUnitWarning ? 2 : 0);
  } finally {
    warn.mockRestore();
    error.mockRestore();
  }
});
