import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { groupId, spaceId } from '@ap/contracts';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { House } from 'lucide-react';
import { AnalysisChartFrame } from '../AnalysisChartFrame';
import { AnalysisChart, type ChartSpec } from '../AnalysisChart';
import { InWorkspacePanelProvider } from '../../workspace/panelContext';

vi.mock('../EChartImpl', () => ({ default: () => <div role="img" aria-label="plot" /> }));
afterEach(cleanup);

const series = [{ id: 's', name: 'Series', color: 'chart-blue' as const, points: [['A', 1], ['B', 2]] as [string, number][] }];
const frame = <AnalysisChartFrame chartId="panel" title="Chart" description="Chart explanation" unit="s" xType="category" series={series} size="fill" exportActions={{ exportAllowed: true }} />;
const mount = (element = frame, mode: boolean | 'pane' = true) => render(<I18nProvider><InWorkspacePanelProvider value={mode}>{element}</InWorkspacePanelProvider></I18nProvider>);

describe('Panel chart chrome', () => {
  it('describes the ⓘ button with the chart description and gestures, without opening the tooltip (#2364)', () => {
    mount();
    expect(screen.getByRole('button', { name: '차트 설명' })).toHaveAccessibleDescription(
      'Chart explanation 클릭으로 선택 · ⌘/Shift+클릭으로 추가 · 구간 선택을 켠 뒤 끌기',
    );
  });
  it('keeps the Frame primary actions in one icon row and secondary actions in More with visible legends', () => {
    mount();
    const toolbar = screen.getByRole('toolbar', { name: '차트 동작' });
    for (const name of ['확대', '구간 선택', '초기화', '주석', '표로 보기', '내보내기', '더보기']) {
      const button = within(toolbar).getByRole('button', { name });
      expect(button.textContent).toBe('');
      expect(button).toHaveAttribute('title');
    }
    expect(screen.getByRole('heading', { name: 'Chart' })).toHaveClass('sr-only');
    expect(screen.getByRole('button', { name: '차트 설명' })).toBeVisible();
    expect(within(toolbar).getByRole('button', { name: '내보내기' })).toBeVisible();
    expect(screen.getByRole('group', { name: '범례' })).toBeVisible();
    expect(screen.queryByRole('region', { name: '선택 요약' })).toBeNull();
    fireEvent.click(within(toolbar).getByRole('button', { name: '더보기' }));
    const more = screen.getByRole('dialog');
    expect(within(more).queryByRole('button', { name: '내보내기' })).toBeNull();
    expect(within(more).queryByRole('button', { name: '표로 보기' })).toBeNull();
    expect(within(more).queryByRole('checkbox', { name: /Series/ })).toBeNull();
    expect(screen.getByRole('checkbox', { name: /Series/ })).toBeVisible();
    fireEvent.keyDown(more, { key: 'Escape' });
    fireEvent.click(within(toolbar).getByRole('button', { name: '표로 보기' }));
    expect(screen.getByRole('table')).toBeVisible();
  });
  it('keeps the grouped actions separate from the full-width More note (#2460)', () => {
    mount();
    const toolbar = screen.getByRole('toolbar', { name: '차트 동작' });
    const tail = toolbar.querySelector<HTMLElement>('[data-chart-toolbar-tail]')!;
    expect(within(tail).getByRole('button', { name: '표로 보기' })).toBeVisible();
    expect(within(tail).getByRole('button', { name: '내보내기' })).toBeVisible();
    fireEvent.click(within(tail).getByRole('button', { name: '더보기' }));
    const more = screen.getByRole('dialog', { name: '더보기' });
    expect(within(more).getByText(/^확대·구간 선택/).parentElement).toHaveClass('flex-col');
    expect(within(more).queryByRole('button', { name: '표로 보기' })).toBeNull();
  });
  it('puts toolbarStart on the plot tool row in panel chrome, outside More, and opens the full toolbar with it (#2459)', () => {
    const withStart = (chrome?: 'full') => <AnalysisChartFrame chartId="panel" title="Chart" description="Chart explanation" unit="s" xType="category" series={series} size="fill" chrome={chrome}
      toolbarStart={<button type="button">정렬: 원래 순서</button>} />;
    mount(withStart());
    const option = screen.getByRole('button', { name: '정렬: 원래 순서' });
    const tools = screen.getByRole('toolbar', { name: '차트 동작' });
    const start = option.closest('[data-chart-toolbar-start]')!;
    expect(start.parentElement).toBe(tools.parentElement);
    expect(start.compareDocumentPosition(tools) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: '차트 설명' }).compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(within(tools).getByRole('button', { name: '더보기' }));
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: '정렬: 원래 순서' })).toBeNull();
    expect(screen.getAllByRole('button', { name: '정렬: 원래 순서' })).toHaveLength(1);
    cleanup();
    mount(withStart('full'), false);
    const full = screen.getByRole('toolbar', { name: '차트 동작' });
    expect(full.previousElementSibling).toHaveAttribute('data-chart-toolbar-start');
    expect(within(full.previousElementSibling as HTMLElement).getByRole('button', { name: '정렬: 원래 순서' })).toBeVisible();
    cleanup();
    mount();
    expect(document.querySelector('[data-chart-toolbar-start]')).toBeNull();
  });
  it.each<ChartSpec>([
    { kind: 'heatmap', xLabels: ['A'], yLabels: ['B'], cells: [{ x: 'A', y: 'B', value: 2 }] },
    { kind: 'scatter', points: [{ id: 'a', x: 1, y: 2 }], xUnit: 's', xLabel: 'X', yLabel: 'Y' },
    { kind: 'donut', slices: [{ id: 'a', label: 'A', value: 2 }] },
    { kind: 'boxPlot', whisker: 'minMax', groups: [{ id: 'a', label: 'A', stats: { min: 1, q1: 2, median: 3, q3: 4, max: 5 } }] },
    { kind: 'pareto', items: [{ id: 'a', label: 'A', value: 2 }] },
    { kind: 'topNBar', expanded: true, items: [{ id: 'a', label: 'A', value: 2, colorToken: 'chart-blue' }] },
  ])('$kind: keeps named icon tools, table and export on the toolbar, and discloses legends and data summary', spec => {
    mount(<AnalysisChart chartId="kind" title="Kind" description="Chart explanation" unit="s" size="fill" spec={spec} exportActions={{ exportAllowed: true }} />);
    const toolbar = screen.getByRole('toolbar', { name: '차트 동작' });
    for (const button of within(toolbar).getAllByRole('button')) {
      expect(button.textContent).toBe('');
      expect(button).toHaveAttribute('aria-label');
      expect(button).toHaveAttribute('title');
    }
    expect(screen.getByRole('heading', { name: 'Kind' })).toHaveClass('sr-only');
    const region = screen.getByRole('region', { name: 'Kind' });
    expect(document.getElementById(region.getAttribute('aria-describedby')!)).toHaveClass('sr-only');
    expect(screen.getByRole('group', { name: '범례' })).toBeVisible();
    // Every kind keeps Show as table and Export on the icon toolbar, like Top N and the Frame (#2736).
    expect(within(toolbar).getByRole('button', { name: '내보내기' })).toBeVisible();
    fireEvent.click(within(toolbar).getByRole('button', { name: '표로 보기' }));
    expect(screen.getByRole('table')).toBeVisible();
  });

  it('keeps comparison and annotation on the toolbar, quick ranges in Brush, and images in Export', () => {
    const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: 'G', en: 'G' }, icon: House, space: spaceId('mars') }], menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: 'Home', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', query: { mode: 'live' as const }, features: { export: true, compare: true, annotate: true, savedView: false }, pageKeys: [] }] });
    const session = testSession(['platform:view', 'analytics:view']);
    const adapter = testAdapter({ session: () => session });
    const timed = [{ ...series[0], points: [['2026-09-01T00:00:00', 1], ['2026-09-01T01:00:00', 2]] as [string, number][] }];
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM&from=2026-09-01T00:00:00&to=2026-09-01T02:00:00');
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><InWorkspacePanelProvider value>
      <AnalysisChartFrame chartId="all" title="All" unit="s" series={timed} compareSeries={timed.map(item => ({ ...item, id: 'previous' }))} size="fill" imageCopy imagePrint />
    </InWorkspacePanelProvider></PlatformProvider></I18nProvider>);
    const toolbar = screen.getByRole('toolbar', { name: '차트 동작' });
    const compare = within(toolbar).getByRole('button', { name: '비교' });
    const annotate = within(toolbar).getByRole('button', { name: '주석' });
    expect(annotate).toBeDisabled();
    for (const name of ['이미지 복사', '인쇄']) expect(screen.queryByRole('button', { name })).toBeNull();
    fireEvent.click(within(toolbar).getByRole('button', { name: '내보내기' }));
    const exports = screen.getByRole('dialog', { name: '내보내기' });
    for (const name of ['내보내기 CSV', '이미지 복사', '인쇄']) expect(within(exports).getByRole('button', { name })).toBeVisible();
    fireEvent.keyDown(exports, { key: 'Escape' });
    fireEvent.click(compare);
    expect(compare).toHaveAttribute('aria-pressed', 'true');
    const legend = screen.getByRole('group', { name: '범례' });
    expect(legend).toHaveTextContent('현재 기간');
    expect(legend).toHaveTextContent('이전 기간');
    fireEvent.click(within(toolbar).getByRole('button', { name: '더보기' }));
    const more = screen.getByRole('dialog', { name: '더보기' });
    expect(within(more).queryByRole('group', { name: '범례' })).toBeNull();
    expect(within(more).queryByRole('button', { name: '1시간' })).toBeNull();
    fireEvent.keyDown(more, { key: 'Escape' });
    fireEvent.click(within(toolbar).getByRole('button', { name: '구간 선택' }));
    const editor = screen.getByRole('dialog', { name: '시작과 끝으로 구간 선택' });
    fireEvent.click(within(editor).getByRole('button', { name: '1시간' }));
    expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('01:00');
    expect(annotate).toBeEnabled();
  });

  it('keeps heatmap table selection, activation and Details usable with compact named buttons', () => {
    const onActivate = vi.fn(); const onCellClick = vi.fn();
    mount(<AnalysisChart chartId="heat" title="Heat" unit="s" size="fill" spec={{ kind: 'heatmap', xLabels: ['A'], yLabels: ['B'], cells: [{ x: 'A', y: 'B', value: 2 }], cellActivation: { on: 'click', onActivate }, onCellClick }} />);
    fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
    fireEvent.click(screen.getByRole('checkbox'));
    const summary = screen.getByRole('region', { name: '선택 요약' });
    const activate = within(summary).getByRole('button', { name: '선택 지점 실행' });
    expect(activate.textContent).toBe('');
    fireEvent.click(activate);
    expect(onActivate).toHaveBeenCalledWith('A', 'B');
    fireEvent.click(within(summary).getByRole('button', { name: '상세' }));
    expect(onCellClick).toHaveBeenCalledWith('A', 'B');
    expect(summary).not.toHaveAttribute('tabindex');
  });

  it('opens panel point actions from the keyboard even with More closed', async () => {
    const onSelect = vi.fn();
    mount(<AnalysisChartFrame chartId="point" title="Point" unit="s" xType="category" series={series} size="fill" pointActions={[{ id: 'open', label: 'Open point', onSelect }]} />);
    const plot = screen.getByRole('group', { name: '차트 지점' });
    plot.focus();
    fireEvent.keyDown(plot, { key: 'ContextMenu' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Open point' }));
    expect(onSelect).toHaveBeenCalledWith({ x: 'A', seriesId: 's', value: 1 });
  });

  it('keeps keyboard point activation in More and series toggles beside the plot', async () => {
    const onActivate = vi.fn();
    mount(<AnalysisChartFrame chartId="point" title="Point" unit="s" xType="category" series={series} size="fill" pointActivation={{ on: 'click', onActivate }} />);
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    const more = screen.getByRole('dialog');
    fireEvent.change(within(more).getByRole('combobox', { name: '차트 지점 선택' }), { target: { value: JSON.stringify(['s', 'B']) } });
    fireEvent.click(within(more).getByRole('button', { name: '선택 지점 실행' }));
    expect(onActivate).toHaveBeenCalledWith({ x: 'B', seriesId: 's', value: 2 });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Series (s)' }));
    expect(screen.getByRole('status')).toHaveTextContent('모두 껐습니다');
  });

  it.each([false, 'pane'] as const)('preserves text tools, title and visible legends outside panels (%s)', mode => {
    mount(frame, mode);
    expect(screen.getByRole('button', { name: '초기화' }).textContent).toBe('초기화');
    expect(screen.getByRole('button', { name: '내보내기' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Chart' })).not.toHaveClass('sr-only');
    expect(screen.getByRole('group', { name: '범례' })).toBeVisible();
    expect(screen.getByText('Chart explanation')).toBeVisible();
  });
});
