// #2009 MEN-1 / #2044: every chart frame takes the response `Trust` directly and formats it with the shared Trust
// formatter (viewer time zone — vitest pins Asia/Seoul); the old text triple still shows as given; `null` draws no footer.
import type { ReactElement } from 'react';
import { House } from 'lucide-react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId, type Trust } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AnalysisChart } from '../AnalysisChart';
import { AnalysisChartFrame } from '../AnalysisChartFrame';
import { LaneTimeline } from '../LaneTimeline';
import { OrderedIntervalTrack } from '../OrderedIntervalTrack';
import type { ChartTrust } from '../../state/trustFormat';

vi.mock('../EChartImpl', () => ({ default: (props: { ariaLabel?: string }) => <div role="img" aria-label={props.ariaLabel} /> }));

const trust: Trust = { updatedAt: '2026-09-26T00:02:00Z', dataThrough: '2026-09-26T08:00:00+09:00', coverage: 0.987, provisional: false, source: 'mart.productivity_hourly' };

const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: 'G', en: 'G' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features: { export: false, compare: false, annotate: false, savedView: false }, pageKeys: [] }],
});
const session = testSession(['platform:view']);
const mountIn = (element: ReactElement) => {
  window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
  return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}>{element}</PlatformProvider></I18nProvider>);
};

const FRAMES: [string, (t: ChartTrust) => ReactElement][] = [
  ['AnalysisChartFrame', t => <AnalysisChartFrame chartId="c" title="Chart" unit="ea" series={[{ id: 's', name: 'S', color: 'chart-series-1', points: [['2026-09-26T00:00:00', 1]] }]} trust={t} />],
  ['AnalysisChart', t => <AnalysisChart chartId="c" title="Chart" unit="ea" spec={{ kind: 'donut', slices: [{ id: 'a', label: 'A', value: 1 }] }} trust={t} />],
  ['LaneTimeline', t => <LaneTimeline ariaLabel="Timeline" lanes={[{ id: 'l', label: 'L', segments: [{ id: 's', start: 0, end: 10 }] }]} trust={t} />],
  ['OrderedIntervalTrack', t => <OrderedIntervalTrack ariaLabel="Track" lanes={[{ laneKey: 'a', label: 'A' }]} states={{ ok: { label: '완료', colorToken: 'chart-series-1' } }} items={[{ id: '1', laneKey: 'a', orderStart: 0, orderEnd: 2, state: 'ok', label: 'x' }]} domain={[0, 10]} trust={t} />],
];

const context = new Proxy({}, { get: (_, key) => (key === 'measureText' ? () => ({ width: 10 }) : () => undefined) });
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const footer = () => document.querySelector('footer');

describe.each(FRAMES)('%s trust footer', (_name, frame) => {
  it('formats a contracts Trust: viewer-zone MM-DD HH:mm and NN.N%', () => {
    mountIn(frame(trust));
    expect(footer()).toHaveTextContent('원천: mart.productivity_hourly · 갱신: 09-26 09:02 · 커버리지: 98.7%');
  });
  it('says 미확인 for an unknown coverage and 「—」 for an offset-less update time instead of crashing', () => {
    mountIn(frame({ ...trust, updatedAt: '2026-09-26T09:02:00', coverage: null }));
    expect(footer()).toHaveTextContent('갱신: — · 커버리지: 미확인');
  });
  it('draws no footer for a null Trust', () => {
    mountIn(frame(null));
    expect(footer()).toBeNull();
  });
  it('still shows a text triple as given', () => {
    mountIn(frame({ source: 'src', updated: 'as given', coverage: 'Complete' }));
    expect(footer()).toHaveTextContent('원천: src · 갱신: as given · 커버리지: Complete');
  });
});
