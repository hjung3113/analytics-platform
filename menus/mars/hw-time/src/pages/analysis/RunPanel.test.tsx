// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import type { AnalysisChartFrameProps } from '@ap/components';
import type { HtmJudgement, HwTimeRuns } from '../../endpoints';
import { RunPanel } from './RunPanel';

const frames = vi.hoisted(() => vi.fn());
vi.mock('@ap/components', async importOriginal => ({
  ...await importOriginal<typeof import('@ap/components')>(),
  AnalysisChartFrame: (props: AnalysisChartFrameProps) => { frames(props); return <div data-testid={props.chartId} />; },
}));
afterEach(() => { cleanup(); frames.mockClear(); vi.unstubAllGlobals(); });
const row = (equipmentId: string, at: string, status: HtmJudgement['status']) => {
  const judgement: HtmJudgement = { value: 3, lower: 2, upper: 4, status };
  return { id: `${equipmentId}/${at}`, equipmentId, at, moduleId: 'LK1', motion: 'Pump', seconds: 3,
    judgement, motions: { Pump: judgement }, module: judgement };
};
const data: HwTimeRuns = { points: [], daily: [row('EQ-001', '2026-09-19T00:00:00', 'over'), row('EQ-002', '2026-09-20T00:00:00', 'under')], bounds: [], shown: 0, total: 0 };
function mount(runs = data) { render(<I18nProvider><RunPanel kind="trend" data={runs} moduleId="LK1" motionId="Pump" motions={['Pump']} /></I18nProvider>); }
it('passes daily categories and stacked verdict bars, and omits empty bounds for multiple equipment', () => {
  mount();
  const line = frames.mock.calls.find(([p]) => p.chartId === 'hw-overview-runs-trend')![0] as AnalysisChartFrameProps;
  expect(line.bounds).toBeUndefined();
  expect(line.xType).toBe('category');
  expect(line.series[0]!.points).toEqual([['09-19', 3], ['09-20', null]]);
  const bars = frames.mock.calls.find(([p]) => p.chartId === 'hw-overview-runs-trend-verdicts')?.[0] as AnalysisChartFrameProps;
  expect(bars).toMatchObject({ xType: 'category', stacked: true });
  expect(bars.series.map(s => [s.id, s.kind, s.points])).toEqual([
    ['over', 'bar', [['09-19', 1], ['09-20', 0]]], ['under', 'bar', [['09-19', 0], ['09-20', 1]]],
  ]);
});
it.each([{ daily: [] }, { daily: data.daily.slice(0, 1) }])('shows only the short empty-state line for fewer than two dates', ({ daily }) => {
  mount({ ...data, daily });
  expect(screen.getByText('일 평균 추세는 2일 이상 기간에서 보임')).toBeTruthy();
  expect(frames).not.toHaveBeenCalled();
});

it('recounts the same daily domain after the panel equipment filter', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  mount({ ...data, daily: [
    row('EQ-001', '2026-09-19T00:00:00', 'over'), row('EQ-002', '2026-09-19T00:00:00', 'over'),
    row('EQ-001', '2026-09-20T00:00:00', 'under'), row('EQ-002', '2026-09-20T00:00:00', 'normal'),
  ] });
  const bars = () => frames.mock.calls.filter(([p]) => p.chartId === 'hw-overview-runs-trend-verdicts').at(-1)![0] as AnalysisChartFrameProps;
  expect(bars().series[0]!.points).toEqual([['09-19', 2], ['09-20', 0]]);
  fireEvent.click(screen.getByText('패널 표시 설정'));
  fireEvent.click(within(screen.getByRole('group', { name: '이 패널만' })).getByRole('button', { name: '필터 추가' }));
  fireEvent.click(await screen.findByRole('button', { name: '설비' }));
  const dialog = await screen.findByRole('dialog', { name: '설비' });
  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'EQ-001' }));
  fireEvent.click(within(dialog).getByRole('button', { name: '적용' }));
  expect(bars().series[0]!.points).toEqual([['09-19', 1], ['09-20', 0]]);
  expect(bars().series[1]!.points).toEqual([['09-19', 0], ['09-20', 1]]);
});
