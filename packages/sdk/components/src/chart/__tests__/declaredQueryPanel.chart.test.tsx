import { useEffect, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ApiResponse, Trust } from '@ap/contracts';
import { I18nProvider, type QueryState, type QueryStatus } from '@ap/kernel';
import { AnalysisChartFrame } from '../AnalysisChartFrame';
import type { EChartProps } from '../EChart';
import { QueryView } from '../../StateView';
import { DockChartHeadProvider, DockChartPaneId, useDockChartSlot } from '../../dock/DockChartHead';
import { InWorkspacePanelProvider, QueryPanelContentContext } from '../../workspace/panelContext';

vi.mock('../EChartImpl', () => ({ default: Plot }));
const plot = { sets: 0, events: undefined as EChartProps['onEvents'] };
function Plot({ onEvents, option }: EChartProps) {
  plot.events = onEvents;
  useEffect(() => { plot.sets += 1; }, [option]);
  return <div role="img" aria-label="plot" />;
}

const SOURCE = 'mart.productivity_hourly';
const trust: Trust = { updatedAt: '2026-09-26T00:02:00Z', dataThrough: '2026-09-26T08:00:00+09:00', coverage: 0.987, provisional: false, source: SOURCE };
type Data = { label: string };
const ok = (): ApiResponse<Data> => ({ outcome: 'ok', data: { label: 'ok' }, assessments: [], trust, correlationId: 'ok' });
const failed = (): ApiResponse<Data> => ({ outcome: 'error', data: null, assessments: [], trust: null, correlationId: 'err', message: 'failed', recovery: { retryable: true } });
const query = (status: QueryStatus, response: ApiResponse<Data>, extra: Partial<QueryState<Data>> = {}): QueryState<Data> =>
  ({ status, response, refetch: vi.fn(), missing: [], completedAt: 1, ...extra });

function Frame({ trust: chartTrust, visible = ['value'], onPointClick }: { trust: ApiResponse<Data>['trust']; visible?: readonly string[]; onPointClick?: (x: string, seriesId: string) => void }) {
  const points = [['2026-09-01T00:00:00', 1], ['2026-09-02T00:00:00', 3]] as [string, number][];
  return <AnalysisChartFrame chartId="trend" title="추세" unit="s" xType="time" trust={chartTrust} visibleSeriesIds={visible} onPointClick={onPointClick}
    series={[{ id: 'value', name: '값', color: 'chart-blue', points }]} />;
}
function Dock({ children }: { children: ReactNode }) {
  const { ref } = useDockChartSlot('trend', 'toolbar');
  return <><div data-testid="dock-toolbar" ref={ref} /><DockChartPaneId.Provider value="trend">{children}</DockChartPaneId.Provider></>;
}
function Workspace({ value, visible, onPointClick, footerTrust }: { value: QueryState<Data>; visible?: readonly string[]; onPointClick?: (x: string, seriesId: string) => void; footerTrust?: boolean }) {
  return <I18nProvider><DockChartHeadProvider><InWorkspacePanelProvider value><Dock>
    <QueryView query={value} panel={{ title: '추세', kind: 'chart', height: 320, ...(footerTrust && { footerTrust: () => ({ ...trust, source: 'panel-source' }) }) }}>
      {(_data, response) => <Frame trust={response.trust} visible={visible} onPointClick={onPointClick} />}
    </QueryView>
  </Dock></InWorkspacePanelProvider></DockChartHeadProvider></I18nProvider>;
}
const rangeNames = ['확대', '축소', '왼쪽으로 이동', '오른쪽으로 이동', '초기화'] as const;
function expectRangeLocked(root: HTMLElement) {
  for (const name of rangeNames) {
    const button = within(root).getByRole('button', { name });
    expect(button).toBeDisabled();
    expect(document.getElementById(button.getAttribute('aria-describedby') ?? '')).toHaveTextContent(/이전 결과/);
  }
}

beforeEach(() => {
  plot.sets = 0;
  plot.events = undefined;
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('declares one source line, keeps zoom across an equal refresh, and locks the dock range on a previous result', async () => {
  const done = query('done', ok());
  const { rerender } = render(<Workspace value={done} />);
  const toolbar = await screen.findByTestId('dock-toolbar');
  await within(toolbar).findByRole('button', { name: '확대' });
  await screen.findByRole('img', { name: 'plot' });
  expect(screen.getAllByText(SOURCE)).toHaveLength(1);
  expect(screen.queryByText(/원천:/)).toBeNull();
  const drawn = plot.sets;
  rerender(<Workspace value={query('refreshing', ok())} />);
  expect(plot.sets).toBe(drawn);
  expect(within(toolbar).getByRole('button', { name: '확대' })).toBeEnabled();
  fireEvent.click(within(toolbar).getByRole('button', { name: '확대' }));
  expect(within(toolbar).getByRole('button', { name: '축소' })).toBeEnabled();
  const zoomed = plot.sets;
  rerender(<Workspace value={query('refreshing', ok())} visible={[]} />);
  expect(plot.sets).toBe(zoomed + 1);
  rerender(<Workspace value={query('refreshing', ok(), { showingPrevious: true })} visible={['value']} />);
  expectRangeLocked(toolbar);
  rerender(<Workspace value={done} />);
  expect(within(toolbar).getByRole('button', { name: '확대' })).toBeEnabled();
  expect(within(toolbar).getByRole('button', { name: '축소' })).toBeEnabled();
});

it('disables dock zoom, pan and reset on a previous result before any zoom', async () => {
  render(<Workspace value={query('refreshing', ok(), { showingPrevious: true })} />);
  const toolbar = await screen.findByTestId('dock-toolbar');
  await within(toolbar).findByRole('button', { name: '확대' });
  expectRangeLocked(toolbar);
});

it('applies a new point callback during an equal refresh without redrawing', async () => {
  const first = vi.fn();
  const second = vi.fn();
  const { rerender } = render(<Workspace value={query('done', ok())} onPointClick={first} />);
  await screen.findByRole('img', { name: 'plot' });
  const drawn = plot.sets;
  rerender(<Workspace value={query('refreshing', ok())} onPointClick={second} />);
  expect(plot.sets).toBe(drawn);
  act(() => { plot.events?.dblclick?.({ seriesId: 'value', dataIndex: 0 }, {} as never); });
  expect(second).toHaveBeenCalledWith('2026-09-01T00:00:00', 'value');
  expect(first).not.toHaveBeenCalled();
});

it('keeps the chart source when the panel footer Trust differs', async () => {
  render(<Workspace value={query('done', ok())} footerTrust />);
  await screen.findByTestId('dock-toolbar');
  expect(screen.getAllByText(SOURCE)).toHaveLength(1);
  expect(screen.getAllByText('panel-source')).toHaveLength(1);
  expect(screen.getByText(/원천:/)).toBeInTheDocument();
});

it('leaves an undeclared workspace chart redrawing, with its footer and zoom', async () => {
  const frame = () => <I18nProvider><DockChartHeadProvider><InWorkspacePanelProvider value><Dock>
    <QueryPanelContentContext.Provider value="prior">
      <Frame trust={trust} />
    </QueryPanelContentContext.Provider>
  </Dock></InWorkspacePanelProvider></DockChartHeadProvider></I18nProvider>;
  const { rerender } = render(frame());
  const toolbar = await screen.findByTestId('dock-toolbar');
  await within(toolbar).findByRole('button', { name: '확대' });
  expect(screen.getByText(/원천:/)).toBeInTheDocument();
  expect(within(toolbar).getByRole('button', { name: '확대' })).toBeEnabled();
  const drawn = plot.sets;
  rerender(frame());
  expect(plot.sets).toBeGreaterThan(drawn);
});

it('keeps the page flow footer, redraw and zoom, including a previous result', () => {
  const page = (value: QueryState<Data>) => <I18nProvider>
    <QueryView query={value} panel={{ title: '추세', kind: 'chart', height: 320 }}>{(_data, response) => <Frame trust={response.trust} />}</QueryView>
  </I18nProvider>;
  const { rerender } = render(page(query('done', ok())));
  expect(screen.getAllByText(SOURCE)).toHaveLength(2);
  expect(screen.getByText(/원천:/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '확대' })).toBeEnabled();
  const drawn = plot.sets;
  rerender(page(query('refreshing', ok())));
  expect(plot.sets).toBeGreaterThan(drawn);
  expect(screen.getByRole('button', { name: '확대' })).toBeEnabled();
  rerender(page(query('done', failed(), { previousResult: { response: ok(), completedAt: 1 } })));
  expect(screen.getAllByText(SOURCE)).toHaveLength(2);
  expect(screen.getByRole('button', { name: '확대' })).toBeEnabled();
});
