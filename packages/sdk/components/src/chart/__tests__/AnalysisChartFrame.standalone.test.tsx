import type { ReactElement } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { parseDateTime } from '@ap/contracts';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession, ToastProbe } from '@ap/kernel/testing';
import { AnalysisChartFrame, type AnalysisChartFrameProps, type ChartSeries } from '../AnalysisChartFrame';
import type { EChartProps } from '../EChart';
import { exportRegistry } from './test-support';

vi.mock('../EChartImpl', () => ({ default: FakePlot }));
const at = (value: string) => parseDateTime(value, 'x').getTime();
/** Stand-in plot: one button plays a Brush selection over the first two hours. */
function FakePlot(props: EChartProps): ReactElement {
  return <div role="img" aria-label={props.ariaLabel}>
    <button type="button" onClick={() => props.onEvents?.brushEnd?.({ areas: [{ coordRange: [at('2026-09-01T00:00:00'), at('2026-09-01T02:00:00')] }] }, { dispatchAction: () => {} } as never)}>fake-brush</button>
  </div>;
}

const hours = ['2026-09-01T00:00:00', '2026-09-01T01:00:00', '2026-09-01T02:00:00', '2026-09-01T03:00:00', '2026-09-01T04:00:00', '2026-09-01T05:00:00'];
const series: ChartSeries[] = [{ id: 'a', name: 'A', color: 'chart-blue', points: hours.map((x, i) => [x, i + 1]) }];
const previous: ChartSeries[] = [{ id: 'p', name: 'P', color: 'chart-teal', points: hours.map((x, i) => [x, i]) }];
const frame = (props: Partial<AnalysisChartFrameProps> = {}) => <AnalysisChartFrame chartId="flow" title="Flow" unit="ea" series={series} compareSeries={previous} {...props} />;
const bare = (element: ReactElement) => render(<I18nProvider>{element}</I18nProvider>);
const button = (name: string) => screen.queryByRole('button', { name });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('AnalysisChartFrame without a PlatformProvider (#1953 C)', () => {
  it('renders the chart behaviour with I18nProvider alone and offers no platform action', () => {
    bare(frame({ imageCopy: true, imagePrint: true }));
    expect(screen.getByRole('region', { name: 'Flow' })).toBeTruthy();
    for (const name of ['확대', '구간 선택', '차트 초기화']) expect(button(name)).not.toBeNull();
    // Compare, Annotate and every export are off by default, even with compareSeries and the image props.
    for (const name of ['비교', '주석', '내보내기', '이미지 복사', '인쇄']) expect(button(name)).toBeNull();
  });

  it('brushes and keeps the selection local: page actions show, `분석 구간 적용` does not', () => {
    bare(frame({ selectionActions: sel => <button type="button">filter {sel.from}</button> }));
    fireEvent.click(button('구간 선택')!);
    fireEvent.click(screen.getByRole('button', { name: 'fake-brush' }));
    expect(screen.getByText(/선택 구간:/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^filter 2026-09-01T00:00:00/ })).toBeTruthy();
    expect(button('분석 구간 적용…')).toBeNull();
    fireEvent.click(button('차트 초기화')!);
    expect(screen.queryByText(/선택 구간:/)).toBeNull();
  });

  it('point activation and the point selector work on their own', () => {
    const onActivate = vi.fn();
    bare(frame({ pointActivation: { on: 'click', onActivate } }));
    fireEvent.click(button('선택 지점 실행')!);
    expect(onActivate).toHaveBeenCalledWith({ x: hours[0], seriesId: 'a', value: 1 });
  });

  it('`period.to` turns on the keyboard range picker; without it there is none', () => {
    bare(frame());
    expect(screen.queryByRole('group', { name: '빠른 구간 선택' })).toBeNull();
    cleanup();
    bare(frame({ period: { from: hours[0], to: '2026-09-01T06:00:00' } }));
    const quick = screen.getByRole('group', { name: '빠른 구간 선택' });
    fireEvent.click(within(quick).getByRole('button', { name: '1시간' }));
    expect(screen.getByText(/선택 구간:/).textContent).toContain('05:00');
  });

  it('the point actions menu works on its own', async () => {
    const onSelect = vi.fn();
    bare(frame({ pointActions: [{ id: 'open', label: '열기', onSelect }] }));
    act(() => { button('지점 동작')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })); });
    fireEvent.click(await screen.findByRole('menuitem', { name: '열기' }));
    expect(onSelect).toHaveBeenCalledWith({ x: hours[0], seriesId: 'a', value: 1 });
  });

  it('a new period resets the local selection; a period in another form is not used', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { rerender } = bare(frame({ period: { to: '2026-09-01T06:00:00' } }));
    fireEvent.click(within(screen.getByRole('group', { name: '빠른 구간 선택' })).getByRole('button', { name: '1시간' }));
    expect(screen.getByText(/선택 구간:/)).toBeTruthy();
    rerender(<I18nProvider>{frame({ period: { to: '2026-09-01T07:00:00' } })}</I18nProvider>);
    expect(screen.queryByText(/선택 구간:/)).toBeNull();
    rerender(<I18nProvider>{frame({ period: { to: '2026-09-01T06:00:00Z' } })}</I18nProvider>);
    expect(screen.queryByRole('group', { name: '빠른 구간 선택' })).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('opens exactly the allowed export actions; results go to notify, else a status line', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const blobs: Blob[] = [];
    const create = vi.fn((blob: Blob) => { blobs.push(blob); return 'blob:csv'; }); const keep = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = create; URL.revokeObjectURL = () => {};
    onTestFinished(() => { URL.createObjectURL = keep.create; URL.revokeObjectURL = keep.revoke; });
    const notify = vi.fn();
    bare(frame({ exportActions: { exportAllowed: true, notify }, period: { from: hours[0], to: '2026-09-01T06:00:00' } }));
    expect(button('이미지 복사')).toBeNull();
    fireEvent.click(button('내보내기')!);
    expect(create).toHaveBeenCalledTimes(1);
    // The period goes into the header as given: wall-clock, not converted (ADR-0064).
    expect((await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsText(blobs[0]!); })).split('\n')[0]).toContain('scopeId= · from=2026-09-01T00:00:00 · to=2026-09-01T06:00:00');
    expect(notify).toHaveBeenCalledWith('flow.csv 내보냄 (보이는 시리즈)');
    cleanup();
    bare(frame({ imageCopy: true, exportActions: { exportAllowed: true } }));
    expect(button('이미지 복사')).not.toBeNull();
    fireEvent.click(button('내보내기')!);
    expect(screen.getByRole('status').textContent).toBe('flow.csv 내보냄 (보이는 시리즈)');
    cleanup();
    bare(frame({ imageCopy: true, exportActions: { exportAllowed: false, notify } }));
    expect(button('내보내기')).toBeNull();
    expect(button('이미지 복사')).toBeNull();
  });
});

describe('AnalysisChartFrame inside a platform keeps the manifest gate (#1953 C)', () => {
  const session = testSession(['platform:view']);
  const adapter = testAdapter({ session: () => session });
  const mount = (element: ReactElement, canExport: boolean) => {
    window.history.replaceState(null, '', '/?v=1');
    return render(<I18nProvider><PlatformProvider adapter={adapter} registry={exportRegistry(canExport)}>{element}</PlatformProvider></I18nProvider>);
  };
  it('exportActions never opens a menu whose features.export is off, and period is ignored', async () => {
    const notify = vi.fn();
    mount(frame({ imageCopy: true, exportActions: { exportAllowed: true, notify }, period: { from: hours[0], to: '2026-09-01T06:00:00' } }), false);
    await screen.findByRole('region', { name: 'Flow' });
    expect(button('내보내기')).toBeNull();
    expect(button('이미지 복사')).toBeNull();
    expect(screen.queryByRole('group', { name: '빠른 구간 선택' })).toBeNull();
    expect(notify).not.toHaveBeenCalled();
  });
  it('a closed policy does not hide what the manifest opens, and Apply stays', async () => {
    mount(frame({ imageCopy: true, exportActions: { exportAllowed: false } }), true);
    await screen.findByRole('region', { name: 'Flow' });
    expect(button('내보내기')).not.toBeNull();
    expect(button('이미지 복사')).not.toBeNull();
    fireEvent.click(button('구간 선택')!);
    fireEvent.click(screen.getByRole('button', { name: 'fake-brush' }));
    expect(button('분석 구간 적용…')).not.toBeNull();
  });

  it('the CSV note inside a platform still names the applied Context', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const keep = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = () => 'blob:csv'; URL.revokeObjectURL = () => {};
    onTestFinished(() => { URL.createObjectURL = keep.create; URL.revokeObjectURL = keep.revoke; });
    mount(<>{frame()}<ToastProbe /></>, true);
    fireEvent.click(await screen.findByRole('button', { name: '내보내기' }));
    expect(await screen.findByText('flow.csv 내보냄 (보이는 시리즈, 현재 적용 Context 기준)')).toBeTruthy();
  });
});
