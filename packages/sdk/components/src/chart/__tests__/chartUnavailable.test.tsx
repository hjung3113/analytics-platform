import { cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { groupId, spaceId } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AnalysisChart } from '../AnalysisChart';
import { AnalysisChartFrame } from '../AnalysisChartFrame';
import { LaneTimeline } from '../LaneTimeline';
import { OrderedIntervalTrack } from '../OrderedIntervalTrack';

// #1862: plain jsdom — no engine mock, no canvas context, no ResizeObserver. Charts degrade to the unavailable state instead of throwing.
const UNAVAILABLE = '이 환경에서는 차트를 그릴 수 없습니다';
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: 'G', en: 'G' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features: { export: false, compare: false, annotate: false, savedView: false }, pageKeys: [] }],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
const wrap = (children: React.ReactNode) => render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>{children}</PlatformProvider></I18nProvider>);

beforeEach(() => {
  window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
  vi.stubGlobal('ResizeObserver', undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('AnalysisChart renders the unavailable state and keeps its frame', async () => {
  wrap(<AnalysisChart chartId="a" title="Chart A" unit="ea" spec={{ kind: 'heatmap', xLabels: ['09'], yLabels: ['A'], cells: [{ x: '09', y: 'A', value: 1 }] }} />);
  expect(await screen.findByText(UNAVAILABLE)).toBeInTheDocument();
  expect(screen.getByText('Chart A')).toBeInTheDocument();
});

it('AnalysisChartFrame renders the unavailable state and keeps its title', async () => {
  wrap(<AnalysisChartFrame chartId="f" title="Chart F" unit="ea" series={[{ id: 's1', name: 'S1', color: 'chart-blue', points: [['2026-09-01T00:00:00', 1], ['2026-09-02T00:00:00', 2]] }]} />);
  expect(await screen.findByText(UNAVAILABLE)).toBeInTheDocument();
  expect(screen.getByText('Chart F')).toBeInTheDocument();
});

it('LaneTimeline renders the unavailable state and keeps its header', () => {
  wrap(<LaneTimeline ariaLabel="Timeline" lanes={[{ id: 'l', label: 'Lane', segments: [{ id: 's', start: 0, end: 10 }] }]} />);
  expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Timeline' })).toBeInTheDocument();
});

it('OrderedIntervalTrack renders the unavailable state', async () => {
  wrap(<OrderedIntervalTrack ariaLabel="Track" lanes={[{ laneKey: 'a', label: 'Lane A' }]} states={{ ok: { label: '완료', colorToken: 'chart-series-1' } }} items={[{ id: '1', laneKey: 'a', orderStart: 1, orderEnd: 2, state: 'ok', label: 'x' }]} domain={[0, 10]} />);
  expect(await screen.findByText(UNAVAILABLE)).toBeInTheDocument();
});
