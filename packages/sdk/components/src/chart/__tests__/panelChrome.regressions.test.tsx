import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { AnalysisChartFrame } from '../AnalysisChartFrame';
import { AnalysisChart } from '../AnalysisChart';
import userEvent from '@testing-library/user-event';
import { InWorkspacePanelProvider } from '../../workspace/panelContext';

vi.mock('../EChartImpl', () => ({ default: () => <div role="img" aria-label="plot" /> }));
vi.mock('../chartImageCopy', async importOriginal => ({
  ...await importOriginal<typeof import('../chartImageCopy')>(),
  echartImageBlob: () => new Blob(['png'], { type: 'image/png' }),
}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const series = [{ id: 's', name: 'Series', color: 'chart-blue' as const, points: [['A', 1], ['B', 2]] as [string, number][] }];
const heatmap = { kind: 'heatmap' as const, xLabels: ['A'], yLabels: ['B'], cells: [{ x: 'A', y: 'B', value: 2 }] };
const charts = {
  frame: <AnalysisChartFrame chartId="frame" title="Frame" unit="s" series={series} xType="category" size="fill" imageCopy imagePrint exportActions={{ exportAllowed: true }} />,
  heatmap: <AnalysisChart chartId="heat" title="Heat" unit="s" spec={heatmap} size="fill" imageCopy imagePrint exportActions={{ exportAllowed: true }} />,
};
const mount = (element: React.ReactElement) => render(<I18nProvider><InWorkspacePanelProvider value>{element}</InWorkspacePanelProvider></I18nProvider>);

describe('Panel chart regression fixes (#2372)', () => {
  it.each(['frame', 'heatmap'] as const)('%s announces a deferred clipboard outcome after the popover unmounts', async kind => {
    let finish!: () => void;
    const write = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('ClipboardItem', class { constructor(_items: unknown) {} });
    vi.stubGlobal('navigator', { clipboard: { write } });
    mount(charts[kind]);
    await screen.findByRole('img', { name: 'plot' });
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '이미지 복사' }));
    expect(write).toHaveBeenCalledTimes(1);
    const status = screen.queryByRole('status');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(status).toBeInTheDocument();
    expect(screen.getByRole('status')).toBe(status);
    await act(async () => { finish(); });
    await waitFor(() => expect(status).toHaveTextContent('이미지를 복사했습니다'));
    expect(screen.getAllByRole('status')).toEqual([status]);
  });

  it('omits the panel summary Tab stop while the range form is open', () => {
    mount(charts.frame);
    fireEvent.click(screen.getByRole('button', { name: '구간 선택' }));
    const summary = screen.getByRole('region', { name: '선택 요약' });
    expect(within(summary).getByRole('combobox', { name: '구간 시작' })).toBeInTheDocument();
    expect(summary).not.toHaveAttribute('tabindex');
  });

  it('omits the panel summary Tab stop when a heatmap activation button renders', () => {
    mount(<AnalysisChart chartId="heat" title="Heat" unit="s" size="fill" spec={{ ...heatmap, cellActivation: { on: 'click', onActivate: vi.fn() } }} />);
    const summary = screen.getByRole('region', { name: '선택 요약' });
    expect(within(summary).getByRole('button', { name: '선택 지점 실행' })).toBeInTheDocument();
    expect(summary).not.toHaveAttribute('tabindex');
  });

  it('keeps a text-only panel summary in the Tab order', () => {
    mount(charts.heatmap);
    const summary = screen.getByRole('region', { name: '선택 요약' });
    expect(within(summary).queryByRole('button')).toBeNull();
    expect(summary).toHaveAttribute('tabindex', '0');
  });
  it.each(['top', 'bottom', 'side'] as const)('%s fill layout bounds the shrinking plot separately from range/annotation rows', async legendPlacement => {
    mount(<AnalysisChartFrame chartId="layout" title="Layout" unit="s" xType="category" series={series} size="fill" legendPlacement={legendPlacement} />);
    await screen.findByRole('img', { name: 'plot' });
    fireEvent.click(screen.getByRole('button', { name: '구간 선택' }));
    const layout = screen.getByTestId('chart-legend-layout');
    const plot = screen.getByRole('img', { name: 'plot' }).parentElement!;
    const summary = screen.getByRole('region', { name: '선택 요약' });
    expect(layout).toHaveClass('basis-0', 'min-h-0', 'overflow-hidden');
    expect(plot).toHaveClass('min-h-0', 'basis-0', 'overflow-hidden');
    expect(plot).not.toHaveClass('min-h-80');
    expect(layout).not.toContainElement(summary);
    expect(layout.parentElement).toBe(summary.parentElement);
    expect(summary).toHaveClass('shrink-0');
    expect(summary).toContainElement(screen.getByRole('combobox', { name: '구간 시작' }));
  });

  it('opens the heatmap table from the toolbar and lets keyboard selection activate a cell', async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    mount(<AnalysisChart chartId="heat" title="Heat" unit="s" size="fill" legendPlacement="top" spec={{ ...heatmap, cellActivation: { on: 'click', onActivate } }} />);
    await user.click(screen.getByRole('button', { name: '표로 보기' }));
    expect(screen.getByRole('table')).toBeVisible();
    await user.keyboard('{Escape}');
    const cell = within(screen.getByRole('table')).getByRole('checkbox');
    cell.focus();
    await user.keyboard(' ');
    expect(cell).toBeChecked();
    screen.getByRole('button', { name: '선택 지점 실행' }).focus();
    await user.keyboard('{Enter}');
    expect(onActivate).toHaveBeenCalledWith('A', 'B');
    expect(screen.getByRole('table')).toBeVisible();
    const layout = screen.getByTestId('chart-legend-layout');
    expect(layout.firstElementChild).toBe(screen.getByRole('group', { name: '범례' }));
    expect(layout.firstElementChild).toHaveTextContent('2');
  });

});
