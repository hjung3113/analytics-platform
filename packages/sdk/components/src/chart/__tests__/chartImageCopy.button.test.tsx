import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession, useToastsForTest } from '@ap/kernel/testing';
import { AnalysisChart } from '../AnalysisChart';
import { AnalysisChartFrame } from '../AnalysisChartFrame';
import { LaneTimeline } from '../LaneTimeline';
import type { EChartProps } from '../EChart';
import { exportRegistry } from './test-support';

vi.mock('../EChartImpl', () => ({ default: FakePlot }));
let plotted = 0;
function FakePlot(props: EChartProps) { plotted += 1; return <div role="img" aria-label={props.ariaLabel} />; }

const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
const lanes = [{ id: 'l', label: 'Lane', segments: [{ id: 's', start: 0, end: 10 }] }];
const donut = { kind: 'donut' as const, slices: [{ id: 'a', label: 'A', value: 1 }] };
const series = [{ id: 's1', name: 'S1', color: 'chart-blue' as const, points: [['2026-09-01T00:00:00', 1]] as [string, number][] }];
const components = {
  frame: (imageCopy?: boolean) => <AnalysisChartFrame chartId="f" title="F" series={series} unit="ea" imageCopy={imageCopy} />,
  chart: (imageCopy?: boolean) => <AnalysisChart chartId="c" title="C" unit="ea" spec={donut} imageCopy={imageCopy} />,
  lane: (imageCopy?: boolean) => <LaneTimeline lanes={lanes} ariaLabel="Timeline" imageCopy={imageCopy} />,
};
function mount(element: React.ReactElement, canExport: boolean) {
  window.history.replaceState(null, '', '/?v=1');
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={exportRegistry(canExport)}>{element}</PlatformProvider></I18nProvider>);
}
const button = () => screen.queryByRole('button', { name: '이미지 복사' });

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1); vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); plotted = 0; });

describe.each(Object.keys(components) as (keyof typeof components)[])('%s image copy button (#1657)', name => {
  it.each([
    ['prop on and features.export on', true, true, true],
    ['prop on but features.export off', true, false, false],
    ['features.export on but prop absent', undefined, true, false],
  ])('%s -> visible: %s', (_label, imageCopy, canExport, visible) => {
    mount(components[name](imageCopy), canExport);
    expect(!!button()).toBe(visible);
  });
});

const printers = {
  frame: (imagePrint?: boolean) => <AnalysisChartFrame chartId="f" title="F" series={series} unit="ea" imagePrint={imagePrint} />,
  chart: (imagePrint?: boolean) => <AnalysisChart chartId="c" title="C" unit="ea" spec={donut} imagePrint={imagePrint} />,
  lane: (imagePrint?: boolean) => <LaneTimeline lanes={lanes} ariaLabel="Timeline" imagePrint={imagePrint} />,
};
describe.each(Object.keys(printers) as (keyof typeof printers)[])('%s print button (#1665)', name => {
  it.each([
    ['prop on and features.export on', true, true, true],
    ['prop on but features.export off', true, false, false],
    ['features.export on but prop absent', undefined, true, false],
  ])('%s -> visible: %s', (_label, imagePrint, canExport, visible) => {
    mount(printers[name](imagePrint), canExport);
    expect(!!screen.queryByRole('button', { name: '인쇄' })).toBe(visible);
  });
});

it('places the button right after Export in the Frame and AnalysisChart, and last in LaneTimeline', () => {
  for (const name of ['frame', 'chart'] as const) {
    mount(components[name](true), true);
    const labels = screen.getAllByRole('button').map(b => b.textContent);
    expect(labels[labels.indexOf('내보내기') + 1]).toBe('이미지 복사');
    cleanup();
  }
  mount(components.lane(true), true);
  const toolbar = screen.getByRole('toolbar');
  expect(toolbar.lastElementChild?.textContent).toBe('이미지 복사');
});

it('renders LaneTimeline without a PlatformProvider while imageCopy is absent', () => {
  render(<I18nProvider><LaneTimeline lanes={lanes} ariaLabel="Timeline" /></I18nProvider>);
  expect(screen.getByRole('region', { name: 'Timeline' })).toBeTruthy();
  expect(button()).toBeNull();
});

it('toasts the outcome through the platform toast', async () => {
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  URL.createObjectURL = () => 'blob:x'; URL.revokeObjectURL = () => {};
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
  function Toasts() { return <output aria-label="toasts">{useToastsForTest().map(t => <span key={t.id}>{t.text}</span>)}</output>; }
  // The Frame has no ready ECharts instance behind the stand-in plot, so the capture fails and says so.
  mount(<><Toasts />{components.frame(true)}</>, true);
  fireEvent.click(button()!);
  expect(await screen.findByText('이미지를 복사하거나 내려받지 못했습니다')).toBeTruthy();
  expect(plotted).toBeGreaterThan(0);
});

it('LaneTimeline copy composes the axis, data and overlay canvases into one PNG, in that order', async () => {
  const drawn: HTMLCanvasElement[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({ drawImage: (c: HTMLCanvasElement) => drawn.push(c), fillRect() {}, setTransform() {}, clearRect() {}, fillText() {}, measureText: () => ({ width: 10 }), save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, moveTo() {}, lineTo() {}, stroke() {}, strokeRect() {}, setLineDash() {} }) as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(cb => cb(new Blob(['x'], { type: 'image/png' })));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  URL.createObjectURL = () => 'blob:x'; URL.revokeObjectURL = () => {};
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
  mount(components.lane(true), true);
  const data = screen.getByRole('img') as HTMLCanvasElement;
  const overlay = data.parentElement!.querySelector<HTMLCanvasElement>('canvas:not([role])')!;
  const axis = data.closest('[data-lane-scroll]')!.previousElementSibling as HTMLCanvasElement;
  fireEvent.click(button()!);
  await waitFor(() => expect(drawn).toEqual([axis, data, overlay]));
});

describe('LaneTimeline image actions without a PlatformProvider (#1953 A)', () => {
  const bare = (element: React.ReactElement) => render(<I18nProvider>{element}</I18nProvider>);
  const lane = (props: Partial<React.ComponentProps<typeof LaneTimeline>>) => <LaneTimeline lanes={lanes} ariaLabel="Timeline" {...props} />;
  const printButton = () => screen.queryByRole('button', { name: '인쇄' });

  it('renders with I18nProvider alone and shows no image action by default', () => {
    bare(lane({ imageCopy: true, imagePrint: true }));
    expect(button()).toBeNull();
    expect(printButton()).toBeNull();
  });

  it('shows exactly the allowed actions: the prop opts a button in and exportAllowed opens it', () => {
    bare(lane({ imageCopy: true, exportActions: { exportAllowed: true } }));
    expect(button()).not.toBeNull();
    expect(printButton()).toBeNull();
    cleanup();
    bare(lane({ imageCopy: true, imagePrint: true, exportActions: { exportAllowed: false } }));
    expect(button()).toBeNull();
  });

  it('reports the result to the injected notify, and to a status line when there is none', async () => {
    const notify = vi.fn();
    let text = '';
    bare(lane({ imageCopy: true, exportActions: { exportAllowed: true, notify } }));
    fireEvent.click(button()!);
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    text = notify.mock.calls[0]![0] as string;
    expect(screen.queryByText(text)).toBeNull();
    cleanup();
    bare(lane({ imageCopy: true, exportActions: { exportAllowed: true } }));
    fireEvent.click(button()!);
    expect(await screen.findByText(text)).toBeTruthy();
  });

  it('print follows the same standalone gate and reports its failure to notify or the status line', async () => {
    const notify = vi.fn();
    vi.spyOn(window, 'open').mockReturnValue(null);
    bare(lane({ imagePrint: true, exportActions: { exportAllowed: true, notify } }));
    expect(button()).toBeNull();
    fireEvent.click(printButton()!);
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.any(String), 'warning'));
    cleanup();
    bare(lane({ imagePrint: true, exportActions: { exportAllowed: true } }));
    fireEvent.click(printButton()!);
    await waitFor(() => expect(printButton()!.parentElement!.textContent).toMatch(/[^\s]{2,}/));
    expect(printButton()!.parentElement!.querySelectorAll('[role="status"]').length).toBeGreaterThan(0);
  });

  it('inside a platform the menu manifest decides: exportAllowed never opens a closed menu, and notify is not used', async () => {
    const notify = vi.fn();
    mount(lane({ imageCopy: true, imagePrint: true, exportActions: { exportAllowed: true, notify } }), false);
    expect(button()).toBeNull();
    expect(printButton()).toBeNull();
    cleanup();
    mount(lane({ imageCopy: true, exportActions: { exportAllowed: false, notify } }), true);
    expect(button()).not.toBeNull();
    fireEvent.click(button()!);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(notify).not.toHaveBeenCalled();
  });
});
