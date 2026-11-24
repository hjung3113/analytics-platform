import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { LaneTimeline } from '../LaneTimeline';
import { useImageActionGate } from '../ChartImageCopyButton';
import { OrderedIntervalTrack } from '../OrderedIntervalTrack';
import { exportRegistry } from './test-support';

// #2792: the canvas charts get the Frame tool row's `표로 보기` and `내보내기` (one row per interval: lane, start, end, state, length).
const H = 3_600_000;
const lanes = [
  { id: 'a', label: 'Pump', segments: [{ id: 's1', start: 0, end: H + 5 * 60_000, rank: 'Run' }, { id: 's2', start: 2 * H, end: 3 * H, endBoundary: 'open' as const }] },
  { id: 'b', label: 'Chuck', segments: Array.from({ length: 24 }, (_, i) => ({ id: `c${i}`, start: i * H, end: i * H + 1_000, startBoundary: i === 0 ? 'orphan' as const : 'closed' as const })) },
];
const track = {
  ariaLabel: 'Track', domain: [0, 100] as [number, number],
  lanes: [{ laneKey: 'a', label: 'A' }],
  states: { ok: { label: '완료', colorToken: 'chart-series-1' as const } },
  items: [{ id: '1', laneKey: 'a', orderStart: 2, orderEnd: 7, state: 'ok', label: 'first' }, { id: '2', laneKey: 'a', orderStart: 9, state: 'ok', label: 'open' }],
};
let csv: Blob[] = []; let downloads: string[] = [];
const readCsv = (blob: Blob | undefined) => new Promise<string[]>(resolve => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).replace(/^\uFEFF/, '').trim().split(/\r?\n/)); reader.readAsText(blob!);
});

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1); vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
  URL.createObjectURL = (blob: Blob) => { csv.push(blob); return 'blob:x'; }; URL.revokeObjectURL = () => {};
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); csv = []; downloads = []; });

const bare = (element: React.ReactElement) => render(<I18nProvider>{element}</I18nProvider>);
const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent));
const exportCsv = () => {
  fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: '내보내기' })).getByRole('button', { name: '내보내기 CSV' }));
};

describe('LaneTimeline table and export (#2792)', () => {
  it('shows one row per interval with lane, start, end, state and length, twenty to a page', () => {
    bare(<LaneTimeline lanes={lanes} ariaLabel="Timeline" />);
    expect(screen.queryByRole('table')).toBeNull();
    const toggle = screen.getByRole('button', { name: '표로 보기' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('table')).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['줄', '시작', '끝', '상태', '길이']);
    expect(rows().slice(0, 3)).toEqual([
      ['Pump', '1970-01-01 00:00:00', '1970-01-01 01:05:00', 'Run', '1시간 5분'],
      ['Pump', '1970-01-01 02:00:00', '1970-01-01 03:00:00', '종료 미확인', '1시간'],
      ['Chuck', '1970-01-01 00:00:00', '1970-01-01 00:00:01', '시작 미확인', '1초'],
    ]);
    expect(rows()).toHaveLength(20);
    expect(screen.getByText('구간 목록 · 1/2')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '다음 쪽' }));
    expect(rows()).toHaveLength(6);
    expect(rows()[5]).toEqual(['Chuck', '1970-01-01 23:00:00', '1970-01-01 23:00:01', '—', '1초']);
  });

  it('keeps the rank in the state cell when only formatTooltip is given', () => {
    bare(<LaneTimeline lanes={lanes.slice(0, 1)} ariaLabel="Timeline" formatTooltip={() => '작업 구간'} />);
    fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
    expect(rows().map(row => row[3])).toEqual(['Run', '종료 미확인']);
  });

  it('names each interval with the consumer formatState text in the table and the CSV (C4)', async () => {
    const label = (segment: { id: string }) => (segment.id === 's1' ? '42.5 °C' : '미수집');
    bare(<LaneTimeline lanes={lanes.slice(0, 1)} ariaLabel="Timeline" formatState={label} exportActions={{ exportAllowed: true }} />);
    fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
    expect(rows().map(row => row[3])).toEqual(['42.5 °C', '미수집 · 종료 미확인']);
    exportCsv();
    expect((await readCsv(csv[0])).slice(2).map(line => line.split(',')[3])).toEqual(['42.5 °C', '미수집 · 종료 미확인']);
  });

  it('follows quiet: the table and export tools become named icon buttons like the zoom controls', () => {
    bare(<LaneTimeline quiet lanes={lanes} ariaLabel="Timeline" exportActions={{ exportAllowed: true }} />);
    for (const name of ['표로 보기', '내보내기']) {
      const button = screen.getByRole('button', { name });
      expect(button.textContent).toBe('');
      expect(button).toHaveAttribute('title', name);
    }
  });

  it('starts again at the first page when the lanes change, and keeps the page for the same lanes (C6)', () => {
    const view = bare(<LaneTimeline lanes={lanes} ariaLabel="Timeline" />);
    fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
    fireEvent.click(screen.getByRole('button', { name: '다음 쪽' }));
    expect(screen.getByText('구간 목록 · 2/2')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
    fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
    expect(screen.getByText('구간 목록 · 2/2')).toBeVisible();
    // Only density instants change: same lanes, same page.
    view.rerender(<I18nProvider><LaneTimeline lanes={lanes} densityInstants={[5]} ariaLabel="Timeline" /></I18nProvider>);
    expect(screen.getByText('구간 목록 · 2/2')).toBeVisible();
    view.rerender(<I18nProvider><LaneTimeline lanes={[...lanes]} ariaLabel="Timeline" /></I18nProvider>);
    expect(screen.getByText('구간 목록 · 1/2')).toBeVisible();
  });

  it('exports every interval as CSV only where export is allowed', async () => {
    bare(<LaneTimeline lanes={lanes} ariaLabel="Timeline" />);
    expect(screen.queryByRole('button', { name: '내보내기' })).toBeNull();
    cleanup();
    bare(<LaneTimeline lanes={lanes} ariaLabel="Timeline" exportActions={{ exportAllowed: true }} />);
    exportCsv();
    const lines = await readCsv(csv[0]);
    expect(lines[0]).toBe('# Timeline · scopeId= · from= · to=');
    expect(lines[1]).toBe('줄,시작,끝,상태,길이 (ms)');
    // Wall-clock digits with ms and no zone suffix: the lane times are not UTC instants (ADR-0064, C3).
    expect(lines[2]).toBe('Pump,1970-01-01T00:00:00.000,1970-01-01T01:05:00.000,Run,3900000');
    expect(lines).toHaveLength(2 + 26);
    expect(await screen.findByText('Timeline.csv 내보냄')).toBeTruthy();
  });

  it('keeps the ms of an extended year in the wall-clock CSV (C3)', async () => {
    const far = Date.UTC(10000, 0, 1, 12, 34, 56, 789);
    const past = Date.UTC(-1, 0, 1);
    bare(<LaneTimeline lanes={[{ id: 'x', label: 'Far', segments: [{ id: 'f', start: far, end: far + 1 }] }, { id: 'y', label: '=Past', segments: [{ id: 'p', start: past, end: past }] }]} ariaLabel="Timeline" exportActions={{ exportAllowed: true }} />);
    exportCsv();
    // SDK-built times keep their sign and ms with no formula prefix (C2); consumer text keeps the guard.
    expect((await readCsv(csv[0])).slice(2)).toEqual(['Far,+010000-01-01T12:34:56.789,+010000-01-01T12:34:56.790,,1', "'=Past,-000001-01-01T00:00:00.000,-000001-01-01T00:00:00.000,,0"]);
    // The table keeps the seconds of an extended year (C10).
    fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
    expect(rows()[0].slice(1, 3)).toEqual(['+010000-01-01 12:34:56', '+010000-01-01 12:34:56']);
  });

  it('downloads under the same Korean name the result text gives (C5)', async () => {
    bare(<LaneTimeline lanes={lanes} ariaLabel="설비별 값" exportActions={{ exportAllowed: true }} />);
    exportCsv();
    expect(downloads).toEqual(['설비별 값.csv']);
    expect(await screen.findByText('설비별 값.csv 내보냄')).toBeTruthy();
  });

  it('clears the standalone result line when the data or the permission changes (C9)', async () => {
    const lane = (props: Partial<React.ComponentProps<typeof LaneTimeline>>) => <I18nProvider><LaneTimeline lanes={lanes} ariaLabel="Timeline" exportActions={{ exportAllowed: true }} {...props} /></I18nProvider>;
    const view = render(lane({}));
    exportCsv();
    expect(await screen.findByText('Timeline.csv 내보냄')).toBeTruthy();
    view.rerender(lane({ lanes: [...lanes] }));
    expect(screen.queryByText('Timeline.csv 내보냄')).toBeNull();
    exportCsv();
    expect(await screen.findByText('Timeline.csv 내보냄')).toBeTruthy();
    view.rerender(lane({ exportActions: { exportAllowed: false } }));
    view.rerender(lane({ exportActions: { exportAllowed: true } }));
    expect(screen.queryByText('Timeline.csv 내보냄')).toBeNull();
  });

  it('drops a result said for an older generation instead of replacing the current line (C1)', () => {
    const gate = renderHook(({ n }) => useImageActionGate({ exportAllowed: true }, n), { initialProps: { n: 0 } });
    const slowImageCopy = gate.result.current.say;
    gate.rerender({ n: 1 });
    act(() => gate.result.current.say('B.csv 내보냄'));
    act(() => slowImageCopy('이미지를 내려받았습니다'));
    expect(gate.result.current.status).toBe('B.csv 내보냄');
  });

  it('reports a throwing formatState as a failed export and writes no file (C12)', async () => {
    bare(<LaneTimeline lanes={lanes} ariaLabel="Timeline" formatState={() => { throw new Error('bad'); }} exportActions={{ exportAllowed: true }} />);
    exportCsv();
    expect(await screen.findByText('Timeline.csv를 내보내지 못했습니다')).toBeTruthy();
    expect(csv).toHaveLength(0);
  });

  it('inside a platform the menu manifest decides', () => {
    const session = testSession(['platform:view']);
    const adapter = testAdapter({ session: () => session });
    window.history.replaceState(null, '', '/?v=1');
    for (const canExport of [false, true]) {
      render(<I18nProvider><PlatformProvider adapter={adapter} registry={exportRegistry(canExport)}><LaneTimeline lanes={lanes} ariaLabel="Timeline" exportActions={{ exportAllowed: !canExport }} /></PlatformProvider></I18nProvider>);
      expect(!!screen.queryByRole('button', { name: '내보내기' })).toBe(canExport);
      cleanup();
    }
  });
});

// A range loader whose answers the test resolves; `Probe` records, before passive effects run, whether CSV is offered.
function deferredRange() {
  const pending: ((items: typeof track.items) => void)[] = []; const seen: boolean[] = [];
  const onRangeRequest = vi.fn(() => new Promise<typeof track.items>((resolve) => { pending.push(resolve); }));
  function Probe() { useLayoutEffect(() => { seen.push(!!screen.queryByRole('button', { name: '내보내기' })); }); return null; }
  return { pending, onRangeRequest, seen, Probe };
}
const exportedTrack = async () => { exportCsv(); await waitFor(() => expect(screen.getByText('Track.csv 내보냄')).toBeTruthy()); };
const trackView = (props: Partial<React.ComponentProps<typeof OrderedIntervalTrack>>) => <I18nProvider><OrderedIntervalTrack {...track} exportActions={{ exportAllowed: true }} {...props} /></I18nProvider>;

describe('OrderedIntervalTrack export (#2792)', () => {
  it('exports the visible-range table as CSV, with blank end and length for an open interval', async () => {
    bare(<OrderedIntervalTrack {...track} />);
    expect(screen.queryByRole('button', { name: '내보내기' })).toBeNull();
    cleanup();
    bare(<OrderedIntervalTrack {...track} exportActions={{ exportAllowed: true }} />);
    exportCsv();
    const lines = await readCsv(csv[0]);
    expect(lines.slice(1)).toEqual([
      '줄,항목,시작,끝,상태,길이',
      'A,first,2,7,완료,5',
      'A,open,9,,완료 · 종료 미확인 · 불완전,',
    ]);
    await waitFor(() => expect(screen.getByText('Track.csv 내보냄')).toBeTruthy());
  });

  it('exports only the answer for the current range: not while a new range loads, not after it fails (C2)', async () => {
    const pending: { resolve: (items: typeof track.items) => void; reject: (error: Error) => void }[] = [];
    const onRangeRequest = vi.fn(() => new Promise<typeof track.items>((resolve, reject) => { pending.push({ resolve, reject }); }));
    bare(<OrderedIntervalTrack {...track} onRangeRequest={onRangeRequest} exportActions={{ exportAllowed: true }} />);
    await waitFor(() => expect(onRangeRequest).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: '내보내기' })).toBeNull();
    await act(async () => { pending[0].resolve(track.items); });
    expect(screen.getByRole('button', { name: '내보내기' })).toBeTruthy();
    // Zoom in: the previous answer belongs to the wider range, so no CSV until the new range answers.
    fireEvent.click(screen.getByRole('button', { name: '확대' }));
    await waitFor(() => expect(onRangeRequest).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('button', { name: '내보내기' })).toBeNull();
    await act(async () => { pending[1].reject(new Error('down')); });
    expect(screen.queryByRole('button', { name: '내보내기' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(onRangeRequest).toHaveBeenCalledTimes(3));
    await act(async () => { pending[2].resolve([{ id: '3', laneKey: 'a', orderStart: 40, orderEnd: 45, state: 'ok', label: 'mid' }]); });
    exportCsv();
    expect((await readCsv(csv[0])).slice(2)).toEqual(['A,mid,40,45,완료,5']);
  });

  it('a restored permission on the same range waits for the new answer before CSV (PR2 C2)', async () => {
    const { pending, onRangeRequest, seen, Probe } = deferredRange();
    const view = (state?: { kind: 'forbidden'; title: string }) => <I18nProvider><OrderedIntervalTrack {...track} state={state} onRangeRequest={onRangeRequest} exportActions={{ exportAllowed: true }} /><Probe /></I18nProvider>;
    const { rerender } = render(view());
    await waitFor(() => expect(onRangeRequest).toHaveBeenCalledTimes(1));
    await act(async () => { pending[0](track.items); });
    expect(screen.getByRole('button', { name: '내보내기' })).toBeTruthy();
    rerender(view({ kind: 'forbidden', title: '권한 없음' }));
    expect(screen.queryByRole('button', { name: '내보내기' })).toBeNull();
    seen.length = 0; rerender(view());
    expect(seen[0]).toBe(false);
    await waitFor(() => expect(onRangeRequest).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('button', { name: '내보내기' })).toBeNull();
    await act(async () => { pending[1]([{ id: '9', laneKey: 'a', orderStart: 50, orderEnd: 52, state: 'ok', label: 'new' }]); });
    exportCsv();
    expect((await readCsv(csv[0])).slice(2)).toEqual(['A,new,50,52,완료,2']);
  });

  it('clears the standalone result line when permission, title or rows change, and hides it when restricted (PR2 C3)', async () => {
    const { rerender } = render(trackView({}));
    await exportedTrack();
    rerender(trackView({ state: { kind: 'forbidden', title: '권한 없음' } }));
    expect(screen.queryByText('Track.csv 내보냄')).toBeNull();
    rerender(trackView({}));
    expect(screen.queryByText('Track.csv 내보냄')).toBeNull();
    await exportedTrack();
    rerender(trackView({ exportActions: { exportAllowed: false } })); rerender(trackView({}));
    expect(screen.queryByText('Track.csv 내보냄')).toBeNull();
    await exportedTrack();
    rerender(trackView({ items: [track.items[0]] }));
    expect(screen.queryByText('Track.csv 내보냄')).toBeNull();
  });

  it('a wider domain re-requests the same range and offers no CSV until the new answer (PR2 round 2 C2)', async () => {
    const { pending, onRangeRequest, seen, Probe } = deferredRange();
    const view = (domain: [number, number]) => <I18nProvider><OrderedIntervalTrack {...track} domain={domain} initialView={[0, 100]} onRangeRequest={onRangeRequest} exportActions={{ exportAllowed: true }} /><Probe /></I18nProvider>;
    const { rerender } = render(view([0, 100]));
    await waitFor(() => expect(onRangeRequest).toHaveBeenCalledTimes(1));
    await act(async () => { pending[0](track.items); });
    expect(screen.getByRole('button', { name: '내보내기' })).toBeTruthy();
    seen.length = 0; rerender(view([0, 200]));
    expect(seen[0]).toBe(false);
    await waitFor(() => expect(onRangeRequest).toHaveBeenCalledTimes(2));
    expect(onRangeRequest.mock.calls[1].slice(0, 2)).toEqual([0, 100]);
    await act(async () => { pending[1]([{ id: '7', laneKey: 'a', orderStart: 60, orderEnd: 61, state: 'ok', label: 'wide' }]); });
    exportCsv();
    expect((await readCsv(csv[0])).slice(2)).toEqual(['A,wide,60,61,완료,1']);
  });

  it('a lanes change clears the result line (PR2 round 2 C3)', async () => {
    const { rerender } = render(trackView({}));
    await exportedTrack();
    rerender(trackView({ lanes: [...track.lanes, { laneKey: 'b', label: 'B' }] }));
    expect(screen.queryByText('Track.csv 내보냄')).toBeNull();
  });

  it('a partial notice alone keeps the result line (PR2 round 2 C6)', async () => {
    const { rerender } = render(trackView({}));
    await exportedTrack();
    rerender(trackView({ state: { kind: 'partial', title: '일부만 받음' } }));
    expect(screen.getByText('Track.csv 내보냄')).toBeTruthy();
  });

  it('inside a platform the menu manifest decides, whatever exportActions says (PR2 C5)', () => {
    const session = testSession(['platform:view']);
    const adapter = testAdapter({ session: () => session });
    window.history.replaceState(null, '', '/?v=1');
    for (const canExport of [false, true]) {
      render(<I18nProvider><PlatformProvider adapter={adapter} registry={exportRegistry(canExport)}><OrderedIntervalTrack {...track} exportActions={{ exportAllowed: !canExport }} /></PlatformProvider></I18nProvider>);
      expect(!!screen.queryByRole('button', { name: '내보내기' })).toBe(canExport);
      cleanup();
    }
  });

  it.each(['forbidden', 'unsupported', 'empty'] as const)('a %s state takes down the open table, the export trigger and its popover (PR2 C5)', (kind) => {
    const view = (state?: { kind: typeof kind; title: string }) => <I18nProvider><OrderedIntervalTrack {...track} state={state} exportActions={{ exportAllowed: true }} /></I18nProvider>;
    const { rerender } = render(view());
    fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
    expect(screen.getByRole('table')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
    expect(screen.getByRole('dialog', { name: '내보내기' })).toBeTruthy();
    rerender(view({ kind, title: '없음' }));
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: '내보내기' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: '내보내기' })).toBeNull();
    expect(csv).toHaveLength(0);
  });

  it('keeps a fractional length in an integer domain (C7)', () => {
    bare(<OrderedIntervalTrack {...track} domain={[0, 10]} items={[{ id: 'f', laneKey: 'a', orderStart: 1, orderEnd: 1.25, state: 'ok', label: 'short' }]} />);
    fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
    expect(rows()[0].at(-1)).toBe('0.25');
    cleanup();
    bare(<OrderedIntervalTrack {...track} domain={[0, 10]} items={[{ id: 't', laneKey: 'a', orderStart: 0, orderEnd: 1e-7, state: 'ok', label: 'tiny' }]} />);
    fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
    expect(rows()[0].at(-1)).toBe('1e-7');
  });
});
