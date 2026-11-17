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
  it('describes the ⓘ button with the chart description, without opening the tooltip (#2364)', () => {
    mount();
    expect(screen.getByRole('button', { name: '차트 설명' })).toHaveAccessibleDescription('Chart explanation');
  });
  it('keeps the Frame primary actions in one icon row and secondary actions in More with visible legends', () => {
    mount();
    const toolbar = screen.getByRole('toolbar', { name: '차트 동작' });
    for (const name of ['확대', '구간 선택', '차트 초기화', '더보기']) {
      const button = within(toolbar).getByRole('button', { name });
      expect(button.textContent).toBe('');
      expect(button).toHaveAttribute('title');
    }
    expect(screen.getByRole('heading', { name: 'Chart' })).toHaveClass('sr-only');
    expect(screen.getByRole('button', { name: '차트 설명' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '내보내기' })).toBeNull();
    expect(screen.getByRole('group', { name: '범례' })).toBeVisible();
    expect(screen.getByRole('region', { name: '선택 요약' })).toBeVisible();
    fireEvent.click(within(toolbar).getByRole('button', { name: '더보기' }));
    const more = screen.getByRole('dialog');
    expect(within(more).getByRole('button', { name: '내보내기' })).toBeVisible();
    expect(within(more).getByRole('button', { name: '같은 데이터를 표로 보기' })).toBeVisible();
    expect(within(more).queryByRole('checkbox', { name: /Series/ })).toBeNull();
    expect(screen.getByRole('checkbox', { name: /Series/ })).toBeVisible();
    fireEvent.click(within(more).getByRole('button', { name: '같은 데이터를 표로 보기' }));
    expect(screen.getByRole('table')).toBeVisible();
  });
  it('stacks the More tail so the table action and note take the popover width (#2460)', () => {
    mount();
    fireEvent.click(within(screen.getByRole('toolbar', { name: '차트 동작' })).getByRole('button', { name: '더보기' }));
    const more = screen.getByRole('dialog');
    const tail = more.querySelector('[data-chart-toolbar-tail]');
    // A row here squeezed «같은 데이터를 표로 보기» beside Export and the note into one character per line.
    expect(tail).toHaveClass('flex-col', 'w-full');
    expect(tail).not.toHaveClass('items-center');
  });
  it.each<ChartSpec>([
    { kind: 'heatmap', xLabels: ['A'], yLabels: ['B'], cells: [{ x: 'A', y: 'B', value: 2 }] },
    { kind: 'scatter', points: [{ id: 'a', x: 1, y: 2 }], xUnit: 's', xLabel: 'X', yLabel: 'Y' },
    { kind: 'donut', slices: [{ id: 'a', label: 'A', value: 2 }] },
    { kind: 'boxPlot', whisker: 'minMax', groups: [{ id: 'a', label: 'A', stats: { min: 1, q1: 2, median: 3, q3: 4, max: 5 } }] },
    { kind: 'pareto', items: [{ id: 'a', label: 'A', value: 2 }] },
    { kind: 'topNBar', expanded: true, items: [{ id: 'a', label: 'A', value: 2, colorToken: 'chart-blue' }] },
  ])('$kind: keeps named icon tools and discloses table, export, legends and data summary', spec => {
    mount(<AnalysisChart chartId="kind" title="Kind" description="Chart explanation" unit="s" size="fill" spec={spec} exportActions={{ exportAllowed: true }} />);
    const toolbar = screen.getByRole('toolbar', { name: '차트 동작' });
    for (const button of within(toolbar).getAllByRole('button')) {
      expect(button.textContent).toBe('');
      expect(button).toHaveAttribute('aria-label');
      expect(button).toHaveAttribute('title');
    }
    expect(screen.getByRole('heading', { name: 'Kind' })).toHaveClass('sr-only');
    expect(screen.queryByRole('button', { name: '표로 보기' })).toBeNull();
    const region = screen.getByRole('region', { name: 'Kind' });
    expect(document.getElementById(region.getAttribute('aria-describedby')!)).toHaveClass('sr-only');
    expect(screen.getByRole('group', { name: '범례' })).toBeVisible();
    fireEvent.click(within(toolbar).getByRole('button', { name: '더보기' }));
    const more = screen.getByRole('dialog');
    expect(within(more).getByRole('button', { name: '내보내기' })).toBeVisible();
    fireEvent.click(within(more).getByRole('button', { name: '표로 보기' }));
    expect(screen.getByRole('table')).toBeVisible();
  });

  it('keeps feature-gated comparison, annotation, quick ranges and image actions inside More', () => {
    const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: 'G', en: 'G' }, icon: House, space: spaceId('mars') }], menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: 'Home', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features: { export: true, compare: true, annotate: true, savedView: false }, pageKeys: [] }] });
    const session = testSession(['platform:view']);
    const adapter = testAdapter({ session: () => session });
    const timed = [{ ...series[0], points: [['2026-09-01T00:00:00', 1], ['2026-09-01T01:00:00', 2]] as [string, number][] }];
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM&from=2026-09-01T00:00:00&to=2026-09-01T02:00:00');
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><InWorkspacePanelProvider value>
      <AnalysisChartFrame chartId="all" title="All" unit="s" series={timed} compareSeries={timed.map(item => ({ ...item, id: 'previous' }))} size="fill" imageCopy imagePrint />
    </InWorkspacePanelProvider></PlatformProvider></I18nProvider>);
    for (const name of ['비교', '주석', '이미지 복사', '인쇄', '1시간']) expect(screen.queryByRole('button', { name })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    const more = screen.getByRole('dialog');
    for (const name of ['비교', '주석', '내보내기', '이미지 복사', '인쇄', '1시간']) expect(within(more).getByRole('button', { name })).toBeInTheDocument();
    fireEvent.click(within(more).getByRole('button', { name: '비교' }));
    expect(within(more).getByRole('button', { name: '비교' })).toHaveAttribute('aria-pressed', 'true');
    const legend = screen.getByRole('group', { name: '범례' });
    expect(legend).toHaveTextContent('현재 기간');
    expect(legend).toHaveTextContent('이전 기간');
    expect(within(more).queryByRole('group', { name: '범례' })).toBeNull();
    fireEvent.click(within(more).getByRole('button', { name: '1시간' }));
    expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('01:00');
    expect(within(more).getByRole('button', { name: '주석' })).toBeEnabled();
  });

  it('keeps heatmap table selection, activation and Details usable with compact named buttons', () => {
    const onActivate = vi.fn(); const onCellClick = vi.fn();
    mount(<AnalysisChart chartId="heat" title="Heat" unit="s" size="fill" spec={{ kind: 'heatmap', xLabels: ['A'], yLabels: ['B'], cells: [{ x: 'A', y: 'B', value: 2 }], cellActivation: { on: 'click', onActivate }, onCellClick }} />);
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '표로 보기' }));
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
    fireEvent.click(screen.getByRole('checkbox', { name: 'Series' }));
    expect(screen.getByRole('status')).toHaveTextContent('모두 껐습니다');
  });

  it.each([false, 'pane'] as const)('preserves text tools, title and visible legends outside panels (%s)', mode => {
    mount(frame, mode);
    expect(screen.getByRole('button', { name: '차트 초기화' }).textContent).toBe('차트 초기화');
    expect(screen.getByRole('button', { name: '내보내기' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Chart' })).not.toHaveClass('sr-only');
    expect(screen.getByRole('group', { name: '범례' })).toBeVisible();
    expect(screen.getByText('Chart explanation')).toBeVisible();
  });
});
