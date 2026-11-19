// Provider-less chart consumption from the release tarballs (#1953): a consumer that has no platform at all (no PlatformProvider, no Registry, no
// menu manifest) renders `LaneTimeline`, `AnalysisChart` and `AnalysisChartFrame` inside `I18nProvider` alone, and their export actions (CSV `내보내기`,
// `이미지 복사`, `인쇄`) stay off until the consumer opts in with `exportActions`. The same specs, written against the workspace source, are in
// packages/sdk/components (chartImageCopy.button.test.tsx and the provider-less chart tests); this one proves it for the packed, installed packages.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AnalysisChart, AnalysisChartFrame, LaneTimeline } from '@ap/components';
import { I18nProvider } from '@ap/kernel';

// The first AnalysisChart render loads the chart engine (ECharts) lazily, which took 20 s on a busy machine; later renders reuse it.
vi.setConfig({ testTimeout: 60_000 });

const lanes = [{ id: 'lane-1', label: 'Lane 1', segments: [{ id: 'seg-1', start: 0, end: 10 }, { id: 'seg-2', start: 12, end: 30 }] }];

beforeEach(() => {
  // jsdom has no layout engine, frame loop or 2D canvas: the chart's own drawing is not what this checks.
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  // A drawing context that accepts every call: the chart takes its real path (canvas layers, axis, controls) instead of its engine-unavailable state.
  const context = new Proxy({}, { get: (_target, key) => (key === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('LaneTimeline renders inside I18nProvider alone, with no PlatformProvider', () => {
  render(<I18nProvider><LaneTimeline lanes={lanes} ariaLabel="Provider-less timeline" /></I18nProvider>);
  expect(screen.getAllByLabelText('Provider-less timeline').length).toBeGreaterThan(0);
  // The zoom controls are the chart's own; they are drawn without any platform.
  expect(screen.getByRole('button', { name: '확대' })).toBeTruthy();
});

it('the image actions stay off by default: imageCopy and imagePrint alone draw no button without a platform', () => {
  render(<I18nProvider><LaneTimeline lanes={lanes} ariaLabel="Provider-less timeline" imageCopy imagePrint /></I18nProvider>);
  expect(screen.getAllByLabelText('Provider-less timeline').length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: '이미지 복사' })).toBeNull();
  expect(screen.queryByRole('button', { name: '인쇄' })).toBeNull();
});

it('LaneTimeline: exportActions opens the image actions, and nothing else about the chart changes', () => {
  render(<I18nProvider><LaneTimeline lanes={lanes} ariaLabel="Provider-less timeline" imageCopy imagePrint exportActions={{ exportAllowed: true }} /></I18nProvider>);
  expect(screen.getByRole('button', { name: '이미지 복사' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '인쇄' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '확대' })).toBeTruthy();
});

const donut = { kind: 'donut' as const, slices: [{ id: 'a', label: 'A', value: 3 }, { id: 'b', label: 'B', value: 1 }] };
const series = [{ id: 's1', name: 'S1', color: 'chart-blue' as const, points: [['2026-09-01T00:00:00', 1], ['2026-09-02T00:00:00', 2]] as [string, number][] }];
const exportButtons = () => ['내보내기', '이미지 복사', '인쇄'].filter((name) => screen.queryByRole('button', { name }) !== null);

it('AnalysisChart renders inside I18nProvider alone and opens no export action by default', () => {
  render(<I18nProvider><AnalysisChart chartId="kit-donut" title="Provider-less donut" unit="ea" spec={donut} imageCopy imagePrint /></I18nProvider>);
  expect(screen.getAllByText('Provider-less donut').length).toBeGreaterThan(0);
  expect(exportButtons()).toEqual([]);
});

it('AnalysisChart: exportActions opens CSV and the image actions', () => {
  render(<I18nProvider><AnalysisChart chartId="kit-donut" title="Provider-less donut" unit="ea" spec={donut} imageCopy imagePrint exportActions={{ exportAllowed: true }} /></I18nProvider>);
  expect(exportButtons()).toEqual(['내보내기', '이미지 복사', '인쇄']);
});

it('AnalysisChartFrame renders inside I18nProvider alone and opens no export action by default', () => {
  render(<I18nProvider><AnalysisChartFrame chartId="kit-frame" title="Provider-less frame" series={series} unit="ea" imageCopy imagePrint /></I18nProvider>);
  expect(screen.getAllByText('Provider-less frame').length).toBeGreaterThan(0);
  expect(exportButtons()).toEqual([]);
});

it('AnalysisChartFrame: exportActions opens the export actions, Compare stays out and Annotate is disabled with its reason in a platform-less frame', () => {
  render(<I18nProvider><AnalysisChartFrame chartId="kit-frame" title="Provider-less frame" series={series} unit="ea" imageCopy imagePrint exportActions={{ exportAllowed: true }} /></I18nProvider>);
  // The Frame groups its export actions behind one «내보내기» button (#2538): CSV, image copy and print open in that popover.
  fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
  const group = within(screen.getByRole('dialog', { name: '내보내기' }));
  expect(group.getAllByRole('button').map((b) => b.textContent)).toEqual(['내보내기 CSV', '이미지 복사', '인쇄']);
  expect(screen.queryByRole('button', { name: '비교' })).toBeNull();
  // Outside a platform Annotate stays visible but disabled, and says why (#2538, docs/contract/chart.md §16).
  const annotate = screen.getByRole('button', { name: '주석' }) as HTMLButtonElement;
  expect(annotate.disabled).toBe(true);
  expect(screen.getByText('이 화면에서 주석을 남길 수 없습니다.')).toBeTruthy();
});
