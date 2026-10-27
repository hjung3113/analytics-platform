import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace, useToastsForTest } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { useWorkbookExport, WorkbookRefusal, type WorkbookExportResult } from '../useWorkbookExport';
import { WORKBOOK_LIMITS, type WorkbookSheet } from '../workbook';

const DONE = 'info:Excel 파일로 내보냈습니다';

function ToastProbe() {
  const toasts = useToastsForTest();
  return <div data-testid="toasts">{toasts.map(toast => <p key={toast.id}>{toast.tone}:{toast.text}</p>)}</div>;
}

type Build = (signal: AbortSignal) => readonly WorkbookSheet[] | Promise<readonly WorkbookSheet[]>;
let build: Build;
let options: Parameters<ReturnType<typeof useWorkbookExport>['exportWorkbook']>[1];
let results: WorkbookExportResult[];

function Harness() {
  const workbook = useWorkbookExport();
  return <>
    <button type="button" onClick={() => { void workbook.exportWorkbook(build, options).then(result => results.push(result)); }}>export</button>
    <button type="button" onClick={workbook.cancel}>cancel</button>
    <p data-testid="state">{`${workbook.canExport}/${workbook.exporting}`}</p>
    <ToastProbe />
  </>;
}

const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });

function mount(canExport: boolean) {
  window.history.replaceState(null, '', '/?v=1');
  const registry = createRegistry({
    spaces: [testSpace({ homeMenuId: 'hw-time' })],
    groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
    menus: [{ id: 'hw-time', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features: { export: canExport, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
  });
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Harness /></PlatformProvider></I18nProvider>);
}

const toasts = () => screen.getByTestId('toasts').textContent ?? '';
let downloads: string[];

beforeEach(() => {
  build = () => [{ name: '요약', rows: [[1]] }];
  options = undefined;
  results = [];
  downloads = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('useWorkbookExport (#860)', () => {
  it('downloads <menu id>-<stamp>.xlsx and announces it', async () => {
    mount(true);
    expect(screen.getByTestId('state').textContent).toBe('true/false');
    fireEvent.click(screen.getByText('export'));
    // The first export loads the write-excel-file chunk (≈1 s in jsdom): the #741 lazy-chunk wait.
    await waitFor(() => expect(toasts()).toContain(DONE), { timeout: 8000 });
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatch(/^hw-time-\d{8}-\d{4}\.xlsx$/);
    expect(screen.getByTestId('state').textContent).toBe('true/false');
  });

  it('keeps a Korean menu file name, replaces characters no OS accepts, and marks provisional data', async () => {
    options = { fileName: 'HW Time/가동률', trust: { provisional: true, dataThrough: '2026-09-25T09:00:00' } as never };
    mount(true);
    fireEvent.click(screen.getByText('export'));
    await waitFor(() => expect(downloads).toHaveLength(1), { timeout: 8000 });
    expect(downloads[0]).toMatch(/^HW Time-가동률-\d{8}-\d{4}-provisional\.xlsx$/);
    expect(toasts()).toContain('Excel 파일로 내보냈습니다 — 잠정 데이터(데이터 기준 시각 2026-09-25 09:00)');
    expect(results).toEqual(['done']);
  });

  it('does nothing without features.export', async () => {
    const spy = vi.fn(build);
    build = spy;
    mount(false);
    expect(screen.getByTestId('state').textContent).toBe('false/false');
    fireEvent.click(screen.getByText('export'));
    await act(async () => {});
    expect(results).toEqual(['ignored']);
    expect(spy).not.toHaveBeenCalled();
    expect(downloads).toHaveLength(0);
  });

  it('ignores a second export while one runs, and a cancel ends it silently', async () => {
    let release!: (sheets: WorkbookSheet[]) => void;
    const spy = vi.fn((signal: AbortSignal) => { void signal; return new Promise<WorkbookSheet[]>(resolve => { release = resolve; }); });
    build = spy;
    mount(true);
    fireEvent.click(screen.getByText('export'));
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('true/true'));
    fireEvent.click(screen.getByText('export'));
    expect(spy).toHaveBeenCalledTimes(1);
    const signal = spy.mock.calls[0][0];
    fireEvent.click(screen.getByText('cancel'));
    expect(signal.aborted).toBe(true);
    expect(screen.getByTestId('state').textContent).toBe('true/false');
    await act(async () => release([{ name: 'a', rows: [] }]));
    expect(downloads).toHaveLength(0);
    expect(toasts()).toBe('');
    expect(results).toEqual(['ignored', 'cancelled']);
  });

  it('a cancelled export that settles later does not touch the next one', async () => {
    const releases: ((sheets: WorkbookSheet[]) => void)[] = [];
    build = () => new Promise<WorkbookSheet[]>(resolve => { releases.push(resolve); });
    mount(true);
    fireEvent.click(screen.getByText('export'));
    await waitFor(() => expect(releases).toHaveLength(1));
    fireEvent.click(screen.getByText('cancel'));
    fireEvent.click(screen.getByText('export'));
    await waitFor(() => expect(releases).toHaveLength(2));
    await act(async () => releases[0]([{ name: 'old', rows: [] }]));
    expect(screen.getByTestId('state').textContent).toBe('true/true');
    await act(async () => releases[1]([{ name: 'new', rows: [[1]] }]));
    await waitFor(() => expect(downloads).toHaveLength(1), { timeout: 8000 });
    expect(results).toEqual(['cancelled', 'done']);
    expect(screen.getByTestId('state').textContent).toBe('true/false');
  });

  it('shows a refused server read with its cause and detail, and a build timeout as a timeout', async () => {
    build = () => { throw new WorkbookRefusal({ outcome: 'forbidden', data: null, trust: null, message: 'no scope', correlationId: 'c-1' } as never); };
    mount(true);
    fireEvent.click(screen.getByText('export'));
    await waitFor(() => expect(toasts()).toContain('warning:서버가 이 조건의 내보내기를 거부했습니다'));
    expect(results).toEqual(['refused']);
    cleanup();
    build = () => Promise.reject(new DOMException('timeout', 'AbortError'));
    mount(true);
    fireEvent.click(screen.getByText('export'));
    await waitFor(() => expect(toasts()).toContain('warning:내보내기 요청이 시간 초과되었습니다'));
    cleanup();
    build = () => Promise.reject(new DOMException('signal timed out', 'TimeoutError'));
    options = { fileName: '  ' };
    mount(true);
    fireEvent.click(screen.getByText('export'));
    await waitFor(() => expect(toasts()).toContain('warning:내보내기 요청이 시간 초과되었습니다'));
    expect(results).toEqual(['refused', 'refused', 'refused']);
    expect(downloads).toHaveLength(0);
  });

  it('aborts the build on unmount', async () => {
    const spy = vi.fn((signal: AbortSignal) => { void signal; return new Promise<WorkbookSheet[]>(() => {}); });
    build = spy;
    const view = mount(true);
    fireEvent.click(screen.getByText('export'));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    view.unmount();
    expect(spy.mock.calls[0][0].aborted).toBe(true);
  });

  it('tells the user to narrow the filter when the data is over the limits', async () => {
    build = () => [{ name: 'a', rows: Array.from({ length: WORKBOOK_LIMITS.rowsPerSheet + 1 }, () => [1]) }];
    mount(true);
    fireEvent.click(screen.getByText('export'));
    await waitFor(() => expect(toasts()).toContain('warning:내보낼 데이터가 브라우저 내보내기 상한'));
    expect(downloads).toHaveLength(0);
    expect(results).toEqual(['too-large']);
  });

  it('reports a bad sheet name, a sheet-count overflow or a failed build as the generic failure (dev logs it)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    build = () => [{ name: 'a/b', rows: [] }];
    mount(true);
    fireEvent.click(screen.getByText('export'));
    await waitFor(() => expect(toasts()).toContain('warning:내보내기를 수행하지 못했습니다'));
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ code: 'sheet-name-invalid' }));
    cleanup();
    build = () => Array.from({ length: WORKBOOK_LIMITS.sheets + 1 }, (_, i) => ({ name: `s${i}`, rows: [] }));
    mount(true);
    fireEvent.click(screen.getByText('export'));
    await waitFor(() => expect(toasts()).toContain('warning:내보내기를 수행하지 못했습니다'));
    cleanup();
    build = () => Promise.reject(new Error('boom'));
    mount(true);
    fireEvent.click(screen.getByText('export'));
    await waitFor(() => expect(toasts()).toContain('warning:내보내기를 수행하지 못했습니다'));
    expect(results).toEqual(['failed', 'failed', 'failed']);
    expect(downloads).toHaveLength(0);
  });
});
