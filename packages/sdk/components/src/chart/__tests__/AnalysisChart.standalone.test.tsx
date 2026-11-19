import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { AnalysisChart, type AnalysisChartProps, type ChartSpec } from '../AnalysisChart';
import { downloadChartCsv } from '../analysisChartCsv';
import type { EChartProps } from '../EChart';
import { exportRegistry } from './test-support';

vi.mock('../analysisChartCsv', () => ({ downloadChartCsv: vi.fn() }));
vi.mock('../EChartImpl', () => ({ default: (props: EChartProps) => <div role="img" aria-label={props.ariaLabel} /> }));

// AnalysisChart outside a platform (#1953 B): I18nProvider alone, every action opt-in, the menu manifest wins inside a platform.
const specs: Record<string, ChartSpec> = {
  topNBar: { kind: 'topNBar', items: [{ id: 'a', label: 'A', value: 3, colorToken: 'chart-series-1' }] },
  donut: { kind: 'donut', slices: [{ id: 'a', label: 'A', value: 1 }, { id: 'b', label: 'B', value: 2 }] },
  scatter: { kind: 'scatter', points: [{ id: 'p', x: 1, y: 2 }], xUnit: 'ea', xLabel: 'X', yLabel: 'Y' },
  pareto: { kind: 'pareto', items: [{ id: 'a', label: 'A', value: 5 }, { id: 'b', label: 'B', value: 1 }] },
  heatmap: { kind: 'heatmap', xLabels: ['x'], yLabels: ['y'], cells: [{ x: 'x', y: 'y', value: 1 }] },
  boxPlot: { kind: 'boxPlot', groups: [{ id: 'g', label: 'G', stats: { min: 1, q1: 2, median: 3, q3: 4, max: 5 } }], whisker: 'minMax' },
};
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
const chart = (spec: ChartSpec, extra: Partial<AnalysisChartProps> = {}) => <AnalysisChart chartId="c" title="C" unit="ea" spec={spec} {...extra} />;
const bare = (element: React.ReactElement) => render(<I18nProvider>{element}</I18nProvider>);
const exportButton = () => screen.queryByRole('button', { name: '내보내기' });
const copyButton = () => screen.queryByRole('button', { name: '이미지 복사' });
const printButton = () => screen.queryByRole('button', { name: '인쇄' });

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1); vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.mocked(downloadChartCsv).mockClear(); });

describe('without a PlatformProvider', () => {
  it.each(Object.keys(specs))('renders the %s chart with I18nProvider alone and shows no export or image action', kind => {
    bare(chart(specs[kind]!, { imageCopy: true, imagePrint: true }));
    expect(screen.getByRole('heading', { name: 'C' })).toBeTruthy();
    expect(exportButton()).toBeNull();
    expect(copyButton()).toBeNull();
    expect(printButton()).toBeNull();
  });

  it('opens exactly the allowed actions: the prop opts a button in and exportAllowed opens it', () => {
    bare(chart(specs.donut!, { imageCopy: true, exportActions: { exportAllowed: true } }));
    expect(exportButton()).not.toBeNull();
    expect(copyButton()).not.toBeNull();
    expect(printButton()).toBeNull();
    cleanup();
    bare(chart(specs.donut!, { imageCopy: true, imagePrint: true, exportActions: { exportAllowed: false } }));
    expect(exportButton()).toBeNull();
    expect(copyButton()).toBeNull();
  });

  it('downloads the CSV with an empty context and reports to the injected notify, else to a status line', async () => {
    const notify = vi.fn();
    bare(chart(specs.topNBar!, { exportActions: { exportAllowed: true, notify } }));
    fireEvent.click(exportButton()!);
    fireEvent.click(screen.getByRole('button', { name: '내보내기 CSV' }));
    expect(downloadChartCsv).toHaveBeenCalledTimes(1);
    expect(vi.mocked(downloadChartCsv).mock.calls[0]![0].context).toEqual({});
    expect(notify).toHaveBeenCalledTimes(1);
    const text = notify.mock.calls[0]![0] as string;
    expect(screen.queryByText(text)).toBeNull();
    cleanup();
    bare(chart(specs.topNBar!, { exportActions: { exportAllowed: true } }));
    fireEvent.click(exportButton()!);
    fireEvent.click(screen.getByRole('button', { name: '내보내기 CSV' }));
    expect(await screen.findByText(text)).toBeTruthy();
  });

  it('reports a failed CSV download to notify as a warning and not as a success', () => {
    vi.mocked(downloadChartCsv).mockImplementationOnce(() => { throw new Error('blocked'); });
    const notify = vi.fn();
    bare(chart(specs.topNBar!, { exportActions: { exportAllowed: true, notify } }));
    fireEvent.click(exportButton()!);
    fireEvent.click(screen.getByRole('button', { name: '내보내기 CSV' }));
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('내보내지 못했습니다'), 'warning');
    fireEvent.click(exportButton()!);
    fireEvent.click(screen.getByRole('button', { name: '내보내기 CSV' }));
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify.mock.lastCall![0]).toContain('내보냄');
    expect(notify.mock.lastCall![1]).toBeUndefined();
  });

  it('keeps a topNBar selection local across rerenders without a Context to reset it', () => {
    const spec = { ...specs.topNBar!, defaultExpanded: true } as ChartSpec;
    const view = bare(chart(spec));
    fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '선택 A' }));
    expect(screen.getByRole('checkbox', { name: '선택 A' }).getAttribute('aria-checked')).toBe('true');
    const summary = screen.getByRole('region', { name: '선택 요약' }).textContent;
    view.rerender(<I18nProvider>{chart(spec)}</I18nProvider>);
    expect(screen.getByRole('checkbox', { name: '선택 A' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('region', { name: '선택 요약' }).textContent).toBe(summary);
  });
});

describe('inside a PlatformProvider the menu manifest decides', () => {
  const mount = (element: React.ReactElement, canExport: boolean) => {
    window.history.replaceState(null, '', '/?v=1');
    return render(<I18nProvider><PlatformProvider adapter={adapter} registry={exportRegistry(canExport)}>{element}</PlatformProvider></I18nProvider>);
  };

  it('exportAllowed never opens a closed menu, and notify is not used', () => {
    const notify = vi.fn();
    mount(chart(specs.donut!, { imageCopy: true, imagePrint: true, exportActions: { exportAllowed: true, notify } }), false);
    expect(exportButton()).toBeNull();
    expect(copyButton()).toBeNull();
    expect(printButton()).toBeNull();
    expect(notify).not.toHaveBeenCalled();
  });

  it('an open menu shows the export button as before, with the platform Context (not an empty one) in the CSV and no notify', async () => {
    const notify = vi.fn();
    mount(chart(specs.donut!, { exportActions: { exportAllowed: false, notify } }), true);
    fireEvent.click(exportButton()!);
    await waitFor(() => expect(downloadChartCsv).toHaveBeenCalledTimes(1));
    expect(vi.mocked(downloadChartCsv).mock.calls[0]![0].context).toHaveProperty('scopeId', null);
    expect(notify).not.toHaveBeenCalled();
  });
});
