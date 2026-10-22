import { type ReactElement } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { installResizeObserver } from './dock/__tests__/harness';
import { AnalysisChart } from './AnalysisChart';
import { AnalysisChartFrame } from './AnalysisChartFrame';
import { AnalysisLayout } from './AnalysisLayout';
import { analysisChartHeight, fillChartHeight, resolveAnalysisChartSize } from './AnalysisSectionContext';
import type { EChartProps } from './EChart';
import { Panel } from './PlatformPage';
import { InWorkspacePanelProvider } from './workspace/panelContext';

let plotHeight: number | undefined;
vi.mock('./EChartImpl', () => ({ default: FakePlot }));
function FakePlot(props: EChartProps): ReactElement {
  plotHeight = props.height;
  return <div role="img" aria-label={props.ariaLabel} />;
}

const observer = installResizeObserver();
beforeAll(() => { observer.resize(800, 600); });
afterAll(() => { observer.restore(); });
afterEach(() => { cleanup(); plotHeight = undefined; observer.resize(800, 600); });

const features = { export: false, savedView: false, annotate: false, compare: false };
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
  menus: [{ id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features, pageKeys: [] }],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
const shell = (children: ReactElement) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>{children}</PlatformProvider></I18nProvider>;

const frame = (size?: 'fill' | 'regular') => <AnalysisChartFrame chartId="f" title="추세" unit="ea" size={size} series={[{ id: 's', name: 'S', color: 'chart-blue', points: [['2026-09-01T00:00:00', 1], ['2026-09-01T01:00:00', 2]] }]} />;
const donut = (size?: 'fill') => <AnalysisChart chartId="d" title="비중" unit="ea" size={size} spec={{ kind: 'donut', slices: [{ id: 'a', label: 'A', value: 1 }] }} />;
const topN = (size?: 'fill') => <AnalysisChart chartId="t" title="상위" unit="ea" size={size} spec={{ kind: 'topNBar', expanded: true, items: [{ id: 'a', label: 'A', value: 3, colorToken: 'chart-blue' }, { id: 'b', label: 'B', value: 2, colorToken: 'chart-blue' }] }} />;

describe('ChartSize fill', () => {
  it('an explicit fill wins over what a section would give, and fill is 320 until measured', () => {
    expect(resolveAnalysisChartSize('fill', { title: 't', kind: 'chart', span: 'full', collapse() {} })).toBe('fill');
    expect(analysisChartHeight('fill', 260)).toBe(320);
    expect(analysisChartHeight('regular', 260)).toBe(260);
    expect([null, 0, 200, 320, 500].map(fillChartHeight)).toEqual([320, 320, 320, 320, 500]);
  });

  it.each<[string, (size?: 'fill') => ReactElement]>([['AnalysisChartFrame', frame], ['AnalysisChart', donut]])('%s: the plot takes the measured container height, never under 320', async (_name, build) => {
    observer.resize(800, 520);
    render(shell(build('fill')));
    await screen.findByRole('img');
    await waitFor(() => { expect(plotHeight).toBe(520); });
    cleanup();
    observer.resize(800, 200);
    render(shell(build('fill')));
    await screen.findByRole('img');
    await waitFor(() => { expect(plotHeight).toBe(320); });
  });

  it('follows a later resize of the container', async () => {
    observer.resize(800, 520);
    render(shell(frame('fill')));
    await screen.findByRole('img');
    await waitFor(() => { expect(plotHeight).toBe(520); });
    observer.resize(800, 700);
    await waitFor(() => { expect(plotHeight).toBe(700); });
  });

  it.each<[string, (size?: 'fill') => ReactElement]>([['AnalysisChartFrame', frame], ['AnalysisChart', donut]])('%s: the fill card grows below 320 px and its plot box can shrink, so the chart height follows a smaller measure', async (_name, build) => {
    observer.resize(800, 700);
    render(shell(build('fill')));
    const plot = (await screen.findByRole('img')).parentElement!;
    const root = screen.getAllByRole('region')[0]!;
    // Below 320 px the card grows (the container's body scrolls) instead of the plot box scrolling a 320 px canvas: the card is at least as
    // tall as its container, the plot box has a definite zero flex basis (so it never sizes the card) and a 320 px minimum.
    expect(root).toHaveClass('min-h-full');
    expect(root).not.toHaveClass('h-full');
    expect(plot).toHaveClass('grow', 'basis-0', 'min-h-80', 'overflow-hidden');
    expect(plot).not.toHaveClass('overflow-y-auto');
    await waitFor(() => { expect(plotHeight).toBe(700); });
    observer.resize(800, 450);
    await waitFor(() => { expect(plotHeight).toBe(450); });
    observer.resize(800, 100);
    await waitFor(() => { expect(plotHeight).toBe(320); });
  });

  it('a top-N bar keeps its row-count height until it is measured, then fills', async () => {
    observer.resize(800, 640);
    render(shell(topN('fill')));
    await screen.findByRole('img');
    await waitFor(() => { expect(plotHeight).toBe(640); });
    cleanup();
    render(shell(topN()));
    await screen.findByRole('img');
    expect(plotHeight).toBe(120);
  });

  it.each<[string, ReactElement, number]>([['AnalysisChartFrame', frame(), 260], ['AnalysisChartFrame regular', frame('regular'), 260], ['AnalysisChart', donut(), 280]])('%s: every other size keeps its height', async (_name, element, expected) => {
    render(shell(element));
    await screen.findByRole('img');
    expect(plotHeight).toBe(expected);
  });
});

describe('titles inside a workspace panel', () => {
  const titleOf = (name: string) => screen.getByRole('heading', { name });

  it.each<[string, string, ReactElement]>([
    ['AnalysisChartFrame', '추세', frame()],
    ['AnalysisChart', '비중', donut()],
    ['Panel', '표', <Panel title="표" id="panel-title">내용</Panel>],
    ['the AnalysisLayout KPI strip', '핵심 지표', <AnalysisLayout kpi={{ id: 'kpi', title: '핵심 지표', node: <p>값</p> }} charts={[]} />],
  ])('%s: the heading is sr-only and keeps its accessible name; outside a panel it is drawn', (_name, title, element) => {
    render(shell(<InWorkspacePanelProvider value>{element}</InWorkspacePanelProvider>));
    expect(titleOf(title)).toHaveClass('sr-only');
    cleanup();
    render(shell(element));
    expect(titleOf(title)).not.toHaveClass('sr-only');
  });

  it('a chart region keeps its name from the hidden heading', () => {
    render(shell(<InWorkspacePanelProvider value>{frame()}</InWorkspacePanelProvider>));
    expect(screen.getByRole('region', { name: '추세' })).toBeInTheDocument();
  });
});
