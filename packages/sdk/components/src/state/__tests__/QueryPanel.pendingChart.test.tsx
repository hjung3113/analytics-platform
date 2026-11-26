import { useEffect, type ReactNode } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ApiResponse } from '@ap/contracts';
import { I18nProvider, type QueryState, type QueryStatus } from '@ap/kernel';
import { AnalysisChartFrame } from '../../chart/AnalysisChartFrame';
import { QueryView } from '../../StateView';
import { DockChartHeadProvider, DockChartPaneId, useDockChartSlot } from '../../dock/DockChartHead';
import { InWorkspacePanelProvider } from '../../workspace/panelContext';

vi.mock('../../chart/EChartImpl', () => ({ default: Plot }));
function Plot() {
  useEffect(() => {}, []);
  return <div role="img" aria-label="plot" />;
}

type Data = { label: string };
const ok: ApiResponse<Data> = { outcome: 'ok', data: { label: 'ok' }, assessments: [], trust: null, correlationId: 'ok' };
const query = (status: QueryStatus): QueryState<Data> =>
  ({ status, response: status === 'loading' ? null : ok, refetch: vi.fn(), missing: [], completedAt: status === 'loading' ? null : 1 });

afterEach(cleanup);

function Dock({ children }: { children: ReactNode }) {
  const { ref } = useDockChartSlot('pane', 'toolbar');
  return <><div data-testid="dock-toolbar" ref={ref} /><DockChartPaneId.Provider value="pane">{children}</DockChartPaneId.Provider></>;
}
function Chart({ title, value }: { title: string; value: QueryState<Data> }) {
  return <QueryView query={value} panel={{ title, kind: 'chart', height: 240 }}>
    {() => <AnalysisChartFrame chartId={title} title={title} unit="s" xType="category"
      series={[{ id: 'value', name: '값', color: 'chart-blue', points: [['A', 1], ['B', 2]] }]} />}
  </QueryView>;
}
function Pane({ first, second }: { first: QueryStatus; second?: QueryStatus }) {
  return <I18nProvider><DockChartHeadProvider><InWorkspacePanelProvider value><Dock>
    <Chart title="추세" value={query(first)} />
    {second && <Chart title="구성" value={query(second)} />}
  </Dock></InWorkspacePanelProvider></DockChartHeadProvider></I18nProvider>;
}
const merged = () => within(screen.getByTestId('dock-toolbar')).queryByRole('button', { name: '확대' }) !== null;

// The board pane head joined the first chart to answer while a second was still loading, then split again when it drew: the head was rebuilt
// under the user's focus (main red, contract-board «칸 머리의 버튼을 거쳐»). A chart panel that has not drawn yet already counts as a chart.
it('keeps the first drawn chart out of the pane head while another chart panel is still loading', async () => {
  const view = render(<Pane first="done" second="loading" />);
  await screen.findAllByRole('img', { name: 'plot' });
  expect(merged()).toBe(false);
  view.rerender(<Pane first="done" second="done" />);
  await vi.waitFor(() => { expect(screen.getAllByRole('img', { name: 'plot' })).toHaveLength(2); });
  expect(merged()).toBe(false);
});

it('still joins a lone chart panel to the pane head once it draws', async () => {
  const view = render(<Pane first="loading" />);
  expect(merged()).toBe(false);
  view.rerender(<Pane first="done" />);
  await screen.findAllByRole('img', { name: 'plot' });
  await vi.waitFor(() => { expect(merged()).toBe(true); });
});
