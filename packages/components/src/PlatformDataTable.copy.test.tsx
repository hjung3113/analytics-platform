/**
 * Row copy (#174, toolbar D [복사]): gate, labels, aria-disabled + tooltip, the two clipboard paths chosen by feature
 * detection, Ctrl/⌘+C interception rules, reconciliation and the busy guard. jsdom has no `isSecureContext`,
 * `navigator.clipboard` or `ClipboardItem`, so each test installs exactly the environment it describes.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ApiResponse, PageQuery, PageResult, PageSort, PlatformAdapter, Session } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import { PlatformDataTable, type PlatformDataTableProps } from './PlatformDataTable';

const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const registryWith = (exportFeature: boolean) => createRegistry({
  spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'copy-menu' }],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
  menus: [{ id: 'copy-menu', group: 'overview', primary: true, label: { ko: '복사', en: 'Copy' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: none, pageType: 'management', features: { export: exportFeature, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const exportRegistry = registryWith(true);

const session: Session = { user: { id: 'user-a', name: 'a', title: { ko: 'a', en: 'a' }, permissions: ['platform:view'] }, scopes: [] };
const refusedEnvelope = { outcome: 'forbidden' as const, data: null, assessments: [], trust: null, correlationId: 'c' };
const adapter: PlatformAdapter = {
  menuQuery: async () => refusedEnvelope,
  session: () => session,
  validateScope: async () => ({ status: 'valid', grantedRooms: [] }),
  publishedMetrics: () => [],
  defaultRangeTo: () => '2026-09-26T09:00:00',
  contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
  evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
  getEntity: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'c' }),
  auditTrail: async () => refusedEnvelope,
  entityAudit: async () => refusedEnvelope,
  accessDirectory: async () => refusedEnvelope,
  recordUsage: async () => ({ accepted: 0 }),
  usageSummary: async () => refusedEnvelope,
  listAnnotations: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'c' }),
  saveAnnotation: async () => refusedEnvelope,
  reportClientError: async () => ({ accepted: true }),
  subscribe: () => () => {},
};

type Row = { id: string; code: string; note: string };
const columns: PlatformDataTableProps<Row>['columns'] = [
  { id: 'code', header: 'Code' },
  { id: 'note', header: 'Note' },
];
/** Six rows over pages of `pageSize`; `note` of r2 is a formula, r3 holds a tab. */
const ALL: Row[] = [
  { id: 'r1', code: '00123', note: 'plain' },
  { id: 'r2', code: '00456', note: '=1+1' },
  { id: 'r3', code: '00789', note: 'a\tb' },
  { id: 'r4', code: '4', note: 'd' },
  { id: 'r5', code: '5', note: 'e' },
  { id: 'r6', code: '6', note: 'f' },
];
const loadPage = (q: PageQuery): Promise<ApiResponse<PageResult<Row>>> => Promise.resolve({
  outcome: 'ok', data: { rows: ALL.slice(q.page * q.pageSize, (q.page + 1) * q.pageSize), total: ALL.length }, assessments: [], trust: null, correlationId: 'c',
});
const ok = (rows: Row[]): ApiResponse<Row[]> => ({ outcome: 'ok', data: rows, assessments: [], trust: null, correlationId: 'c' });
/** Server read of the selection, returned in descending id order (the "server sort"). */
const serverSelected = vi.fn(async (request: { scope: { kind: 'selected'; ids: string[] } | { kind: 'filtered' }; sorting: PageSort[] }) =>
  ok(request.scope.kind === 'selected' ? ALL.filter(r => (request.scope as { ids: string[] }).ids.includes(r.id)).reverse() : ALL));

function ToastProbe() {
  const { toasts } = usePlatform();
  return <div data-testid="toast-probe">{toasts.map(toast => <p key={toast.id}>{toast.text}</p>)}</div>;
}

function Harness(props: { exportRows?: PlatformDataTableProps<Row>['exportRows']; registry?: typeof exportRegistry; pageSize?: number; sorting?: PageSort[]; filterKey?: string }) {
  return <I18nProvider><PlatformProvider adapter={adapter} registry={props.registry ?? exportRegistry}>
    <input aria-label="outside" />
    <PlatformDataTable<Row> title="T" ariaLabel="table" columns={columns} getRowId={r => r.id}
      loadPage={loadPage} filterKey={props.filterKey ?? 'f'} preferenceKey="test-copy-table" pageSize={props.pageSize ?? 25} height={200}
      exportRows={'exportRows' in props ? props.exportRows : serverSelected}
      urlState={props.sorting ? { page: null, sorting: props.sorting, onChange: () => {} } : undefined} />
    <ToastProbe />
  </PlatformProvider></I18nProvider>;
}

// ---- environment ----
type Written = { items: Record<string, Blob | Promise<Blob>>[] };
let written: Written;
class FakeClipboardItem {
  constructor(public readonly items: Record<string, Blob | Promise<Blob>>) {}
}
function secureClipboard(write?: (items: FakeClipboardItem[]) => Promise<void>) {
  written = { items: [] };
  const clipboard = {
    write: vi.fn(write ?? (async (items: FakeClipboardItem[]) => {
      written.items.push(...items.map(i => i.items));
      await Promise.all(items.flatMap(i => Object.values(i.items))); // a real write resolves after the promised blobs
    })),
    writeText: vi.fn(async () => {}),
  };
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
  vi.stubGlobal('ClipboardItem', FakeClipboardItem);
  return clipboard;
}
function insecure() {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
}
const blobText = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsText(blob);
});
const writtenText = async (type: string) => blobText(await written.items[0][type]);
/**
 * `document.execCommand('copy')` as real Chromium runs it (#174 review P1-1): the copy event starts at the DOM
 * selection's node — none after a checkbox/button click — so it is dispatched on `<body>`, never inside the table.
 * `fires: false` models an environment where the command does nothing and returns false.
 */
function fakeExecCommand({ fires = true }: { fires?: boolean } = {}) {
  const data = new Map<string, string>();
  const execCommand = vi.fn((command: string) => {
    if (command !== 'copy' || !fires) return false;
    const event = new Event('copy', { bubbles: true, cancelable: true }) as Event & { clipboardData: { setData: (t: string, v: string) => void } };
    event.clipboardData = { setData: (t, v) => { data.set(t, v); } };
    document.body.dispatchEvent(event);
    return true;
  });
  Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
  return { data, execCommand };
}

const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
beforeAll(() => {
  // Virtualizer layout stubs (same as the export block): without them no rows render, so no checkboxes.
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return (this as Element).getAttribute('role') === 'row' ? 32 : 420; } });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 800; } });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const height = this.getAttribute('role') === 'row' ? 32 : 420;
    return { height, width: 800, top: 0, left: 0, right: 800, bottom: height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
});
afterEach(() => {
  cleanup();
  serverSelected.mockClear();
  vi.unstubAllGlobals();
  delete (window as { isSecureContext?: boolean }).isSecureContext;
  delete (navigator as { clipboard?: unknown }).clipboard;
  delete (document as { execCommand?: unknown }).execCommand;
});
afterAll(() => {
  vi.restoreAllMocks();
  if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
  if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth);
});

const copyButton = () => screen.getByRole('button', { name: /복사$/ });
const select = (...ids: string[]) => ids.forEach(id => fireEvent.click(screen.getByRole('checkbox', { name: `선택 ${id}` })));
const toasts = () => screen.getByTestId('toast-probe').textContent ?? '';
const ready = () => screen.findByText(/\d+\/\d+ 페이지/);

describe('PlatformDataTable row copy (#174) — button', () => {
  it('appears only with exportRows AND features.export, between [컬럼] and [내보내기]', async () => {
    const view = render(<Harness registry={registryWith(false)} />);
    await ready();
    expect(screen.queryByRole('button', { name: /복사/ })).toBeNull();
    view.unmount();
    const noRows = render(<Harness exportRows={undefined} />);
    await ready();
    expect(screen.queryByRole('button', { name: /복사/ })).toBeNull();
    noRows.unmount();
    render(<Harness />);
    await ready();
    const names = screen.getAllByRole('button').map(b => b.textContent);
    const at = (label: RegExp) => names.findIndex(n => label.test(n ?? ''));
    expect(at(/^컬럼$/)).toBeLessThan(at(/^복사$/));
    expect(at(/^복사$/)).toBeLessThan(at(/^내보내기/));
  });

  it('no selection: "복사", aria-disabled (focusable, not native disabled), tooltip on keyboard focus, click is a no-op', async () => {
    const clipboard = secureClipboard();
    render(<Harness />);
    await ready();
    const button = copyButton();
    expect(button.textContent).toBe('복사');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect((button as HTMLButtonElement).disabled).toBe(false);
    act(() => { button.focus(); });
    expect((await screen.findByRole('tooltip')).textContent).toBe('행을 선택하면 복사할 수 있습니다');
    fireEvent.click(button);
    expect(clipboard.write).not.toHaveBeenCalled();
    expect(serverSelected).not.toHaveBeenCalled();
  });

  it('with a selection: "3행 복사", enabled, the tooltip and aria-keyshortcuts name the shortcut (UX P3-1)', async () => {
    render(<Harness />);
    await ready();
    expect(copyButton().getAttribute('aria-keyshortcuts')).toBeNull(); // disabled: no shortcut advertised
    select('r1', 'r2', 'r3');
    const button = copyButton();
    expect(button.textContent).toBe('3행 복사');
    expect(button.getAttribute('aria-disabled')).toBeNull();
    expect(button.getAttribute('aria-keyshortcuts')).toBe('Control+C Meta+C');
    act(() => { button.focus(); });
    expect((await screen.findByRole('tooltip')).textContent).toBe('Ctrl+C / ⌘C로도 복사할 수 있습니다(표 안에서)');
  });

  it('the tooltip uses the shared FeedbackOps surface (shadow + border), size sm (ADR-0023 C2)', async () => {
    render(<Harness />);
    await ready();
    act(() => { copyButton().focus(); });
    await screen.findByRole('tooltip');
    const content = document.querySelector('[data-radix-popper-content-wrapper] > *');
    // ADR-0023 C2: the platform no longer overrides the tooltip surface (was border + text-xs + shadow-none).
    expect(content?.className).toContain('shadow-md');
    expect(content?.className).toContain('text-xs');
    expect(content?.className).not.toContain('shadow-none');
  });
});

describe('PlatformDataTable row copy (#174) — secure context', () => {
  it('writes a ClipboardItem inside the click: TSV (header, server order, formula guard, quoted tab) + escaped text/html, then toasts', async () => {
    const clipboard = secureClipboard();
    const sorting: PageSort[] = [{ id: 'code', desc: true }];
    render(<Harness sorting={sorting} />);
    await ready();
    select('r1', 'r2', 'r3');
    fireEvent.click(copyButton());
    expect(clipboard.write).toHaveBeenCalledTimes(1); // synchronously, still inside the gesture
    expect(serverSelected).toHaveBeenCalledWith({ scope: { kind: 'selected', ids: ['r1', 'r2', 'r3'] }, sorting }, expect.anything());
    expect(await writtenText('text/plain')).toBe("Code\tNote\n00789\t\"a\tb\"\n00456\t'=1+1\n00123\tplain\n");
    const html = await writtenText('text/html');
    expect(html).toContain('<th style="mso-number-format:\'\\@\'">Code</th>');
    expect(html).toContain('<td style="mso-number-format:\'\\@\'">00123</td>');
    expect(html).toContain(">'=1+1</td>"); // the HTML flavor is guarded too (review P1-2)
    await waitFor(() => expect(toasts()).toContain('선택 3행을 복사했습니다 — 엑셀에 붙여넣을 수 있습니다'));
  });

  it('copies a multi-page selection from the server (rows not on this page included)', async () => {
    secureClipboard();
    render(<Harness pageSize={2} />);
    await ready();
    select('r1');
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByRole('checkbox', { name: '선택 r3' });
    select('r3');
    fireEvent.keyDown(screen.getByRole('checkbox', { name: '선택 r3' }), { key: 'c', ctrlKey: true });
    expect(await writtenText('text/plain')).toBe('Code\tNote\n00789\t"a\tb"\n00123\tplain\n');
  });

  it('busy guard: a second click while the read is pending writes nothing more; aria-busy + status announce', async () => {
    const clipboard = secureClipboard();
    let release: (value: ApiResponse<Row[]>) => void = () => {};
    const exportRows = vi.fn(() => new Promise<ApiResponse<Row[]>>(resolve => { release = resolve; }));
    render(<Harness exportRows={exportRows} />);
    await ready();
    select('r1', 'r2', 'r3');
    fireEvent.click(copyButton());
    fireEvent.click(copyButton());
    expect(clipboard.write).toHaveBeenCalledTimes(1);
    expect(exportRows).toHaveBeenCalledTimes(1);
    expect(copyButton().getAttribute('aria-busy')).toBe('true');
    expect(screen.getByTestId('export-status').textContent).toBe('선택 3행을 복사하는 중입니다');
    release(ok(ALL.slice(0, 3)));
    await waitFor(() => expect(copyButton().getAttribute('aria-busy')).toBeNull());
  });

  it('reconciles like export: rows gone from the result are named, the rest copied', async () => {
    secureClipboard();
    render(<Harness exportRows={async () => ok([ALL[0]])} />);
    await ready();
    select('r1', 'r2');
    fireEvent.click(copyButton());
    await waitFor(() => expect(toasts()).toContain('선택 1행을 복사했습니다'));
    expect(toasts()).toContain('선택 2행 중 1행 — 1행은 현재 결과에 없음');
    expect(await writtenText('text/plain')).toBe('Code\tNote\n00123\tplain\n');
  });

  it('a refusal reuses the export refusal text; a permission rejection names its reason and the permission', async () => {
    secureClipboard();
    const refused = render(<Harness exportRows={async () => ({ outcome: 'too_large', data: null, assessments: [], trust: null, correlationId: 'c' })} />);
    await ready();
    select('r1');
    fireEvent.click(copyButton());
    await waitFor(() => expect(toasts()).toContain('내보내기 결과가 내보내기 상한을 넘었습니다. 필터를 좁혀 주세요.'));
    refused.unmount();

    secureClipboard(async () => { throw new DOMException('Write permission denied.', 'NotAllowedError'); });
    render(<Harness />);
    await ready();
    select('r1');
    fireEvent.click(copyButton());
    await waitFor(() => expect(toasts()).toContain('클립보드에 복사하지 못했습니다(Write permission denied.). 브라우저의 클립보드 권한을 확인하고 다시 시도하세요.'));
  });

  it('a row read that throws (network) says the read failed — never "check the clipboard permission" (review P3-3, UX P2-3)', async () => {
    secureClipboard();
    render(<Harness exportRows={async () => { throw new TypeError('Failed to fetch'); }} />);
    await ready();
    select('r1');
    fireEvent.click(copyButton());
    await waitFor(() => expect(toasts()).toContain('내보내기를 수행하지 못했습니다. 다시 시도하고, 반복되면 관리자에게 문의하세요.'));
    expect(toasts()).not.toContain('클립보드 권한');
  });

  it('a browser that refuses promised ClipboardItem values copies the loaded rows synchronously (review P3-2)', async () => {
    const clipboard = secureClipboard(() => { throw new TypeError('promise values unsupported'); });
    const { data, execCommand } = fakeExecCommand();
    render(<Harness />);
    await ready();
    select('r1');
    fireEvent.click(copyButton());
    expect(execCommand).toHaveBeenCalledWith('copy'); // still inside the click
    expect(data.get('text/plain')).toBe('Code\tNote\n00123\tplain\n');
    expect(clipboard.writeText).not.toHaveBeenCalled();
    expect(toasts()).toContain('선택 1행을 복사했습니다');
  });

  it('a late TypeError from the write (after the gesture) says copying is unavailable here', async () => {
    secureClipboard(async () => { throw new TypeError('promise values unsupported'); });
    render(<Harness />);
    await ready();
    select('r1');
    fireEvent.click(copyButton());
    await waitFor(() => expect(toasts()).toContain('이 환경에서는 복사할 수 없습니다 — 내보내기(CSV·Excel)를 쓰세요'));
  });

  it('copy and export each keep their own status line, in either completion order (review P3-1, UX P2-2)', async () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    let created = 0;
    let revoked = 0;
    URL.createObjectURL = () => { created += 1; return 'blob:test'; };
    URL.revokeObjectURL = () => { revoked += 1; };
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      for (const first of ['copy', 'export'] as const) {
        secureClipboard();
        const pending: Record<string, (value: ApiResponse<Row[]>) => void> = {};
        const exportRows = vi.fn((request: { scope: { kind: string } }) => new Promise<ApiResponse<Row[]>>(resolve => { pending[request.scope.kind === 'selected' && !pending.copy ? 'copy' : 'export'] = resolve; }));
        const view = render(<Harness exportRows={exportRows} />);
        await ready();
        select('r1');
        fireEvent.click(copyButton());
        fireEvent.keyDown(screen.getByRole('button', { name: /^내보내기/ }), { key: 'Enter' });
        fireEvent.click(await screen.findByRole('menuitem', { name: '필터 결과 전체 6행을 CSV로 내보내기' }));
        const status = () => screen.getByTestId('export-status').textContent ?? '';
        await waitFor(() => expect(status()).toContain('복사하는 중입니다'));
        expect(status()).toContain('준비 중입니다');
        pending[first](ok(first === 'copy' ? [ALL[0]] : ALL));
        const other = first === 'copy' ? '준비 중입니다' : '복사하는 중입니다';
        const gone = first === 'copy' ? '복사하는 중입니다' : '준비 중입니다';
        await waitFor(() => expect(status()).not.toContain(gone));
        expect(status()).toContain(other); // the finished one never clears the other's announcement
        pending[first === 'copy' ? 'export' : 'copy'](ok(first === 'copy' ? ALL : [ALL[0]]));
        await waitFor(() => expect(status()).toBe(''));
        view.unmount();
      }
      // The export releases its blob URL on a 1s timer; restoring jsdom's (absent) revokeObjectURL before it fires
      // would throw from the timer in whatever test runs next.
      await waitFor(() => expect(revoked).toBe(created), { timeout: 2000 });
    } finally {
      anchorClick.mockRestore();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
});

describe('PlatformDataTable row copy (#174) — insecure context', () => {
  it('Ctrl+C (keydown only) runs execCommand("copy") with the loaded rows and says so when the selection spans pages', async () => {
    insecure();
    const { data, execCommand } = fakeExecCommand();
    render(<Harness pageSize={2} />);
    await ready();
    select('r1');
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByRole('checkbox', { name: '선택 r3' });
    select('r3');
    const keyDown = fireEvent.keyDown(screen.getByRole('checkbox', { name: '선택 r3' }), { key: 'c', ctrlKey: true });
    expect(keyDown).toBe(false); // the table owns the shortcut on both paths
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(data.get('text/plain')).toBe('Code\tNote\n00789\t"a\tb"\n');
    expect(data.get('text/html')).toContain('00789');
    expect(serverSelected).not.toHaveBeenCalled();
    expect(toasts()).toContain('이 환경에서는 현재 페이지에 보이는 선택 1행만 복사됩니다');
  });

  it('the button copies the loaded rows although Chromium sends the copy event to <body> (review P1-1)', async () => {
    insecure();
    const { data, execCommand } = fakeExecCommand();
    render(<Harness />);
    await ready();
    select('r1', 'r2');
    fireEvent.click(copyButton());
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(data.get('text/plain')).toBe("Code\tNote\n00123\tplain\n00456\t'=1+1\n");
    expect(data.get('text/html')).toContain(">'=1+1</td>");
    expect(toasts()).toContain('선택 2행을 복사했습니다 — 엑셀에 붙여넣을 수 있습니다');
  });

  it('no selected row on this page: the clipboard is untouched and the toast says what to do (UX P2-1)', async () => {
    insecure();
    const { execCommand } = fakeExecCommand();
    render(<Harness pageSize={2} />);
    await ready();
    select('r1');
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByRole('checkbox', { name: '선택 r3' });
    fireEvent.click(copyButton());
    expect(execCommand).not.toHaveBeenCalled();
    expect(toasts()).toContain('현재 페이지에 선택한 행이 없어 복사하지 못했습니다. 선택한 행이 있는 페이지로 이동해 다시 시도하세요.');
    expect(toasts()).not.toContain('복사됩니다');
  });

  it('execCommand that copies nothing says copying is unavailable here and points to export (review P3-3)', async () => {
    insecure();
    fakeExecCommand({ fires: false });
    render(<Harness />);
    await ready();
    select('r1');
    fireEvent.click(copyButton());
    expect(toasts()).toContain('이 환경에서는 복사할 수 없습니다 — 내보내기(CSV·Excel)를 쓰세요');
    expect(toasts()).not.toContain('클립보드 권한');
  });
});

describe('PlatformDataTable row copy (#174) — Ctrl/⌘+C interception', () => {
  it('intercepts only with a selection and focus in the table section', async () => {
    const clipboard = secureClipboard();
    render(<Harness />);
    await ready();
    fireEvent.keyDown(screen.getByRole('checkbox', { name: '선택 r1' }), { key: 'c', metaKey: true });
    expect(clipboard.write).not.toHaveBeenCalled(); // no selection
    select('r1');
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'outside' }), { key: 'c', metaKey: true });
    expect(clipboard.write).not.toHaveBeenCalled(); // outside the table
    const intercepted = fireEvent.keyDown(screen.getByRole('checkbox', { name: '선택 r1' }), { key: 'c', metaKey: true });
    expect(intercepted).toBe(false);
    expect(clipboard.write).toHaveBeenCalledTimes(1);
  });

  it('leaves native copy alone for input focus, a text selection, or an open menu/popover', async () => {
    const clipboard = secureClipboard();
    render(<Harness />);
    await ready();
    select('r1');
    // input inside the table section (the column popover's width slider)
    fireEvent.click(screen.getByRole('button', { name: '컬럼' }));
    const slider = await screen.findByRole('slider', { name: 'Code width' });
    expect(fireEvent.keyDown(slider, { key: 'c', ctrlKey: true })).toBe(true);
    fireEvent.keyDown(screen.getByRole('checkbox', { name: '선택 r1' }), { key: 'c', ctrlKey: true }); // popover still open
    expect(clipboard.write).not.toHaveBeenCalled();
    fireEvent.keyDown(slider, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('slider', { name: 'Code width' })).toBeNull());

    // user dragged over cell text
    const selection = vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => '00123' } as Selection);
    expect(fireEvent.keyDown(screen.getByRole('checkbox', { name: '선택 r1' }), { key: 'c', ctrlKey: true })).toBe(true);
    selection.mockRestore();

    // export menu open
    fireEvent.keyDown(screen.getByRole('button', { name: /^내보내기/ }), { key: 'Enter' });
    const item = await screen.findByRole('menuitem', { name: '선택 1행을 CSV로 내보내기' });
    expect(fireEvent.keyDown(item, { key: 'c', ctrlKey: true })).toBe(true);
    expect(clipboard.write).not.toHaveBeenCalled();
  });

  it('no shortcut without features.export', async () => {
    const clipboard = secureClipboard();
    render(<Harness registry={registryWith(false)} />);
    await ready();
    select('r1');
    expect(fireEvent.keyDown(screen.getByRole('checkbox', { name: '선택 r1' }), { key: 'c', ctrlKey: true })).toBe(true);
    expect(clipboard.write).not.toHaveBeenCalled();
  });
});

describe('PlatformDataTable row copy — only the copy\'s own controller cancels (#186)', () => {
  it('an exportRows that rejects with its own AbortError during the read toasts the export failure advice, not a clipboard error', async () => {
    secureClipboard();
    render(<Harness exportRows={async () => { throw new DOMException('timeout', 'AbortError'); }} />);
    await ready();
    select('r1');
    fireEvent.click(copyButton());
    await waitFor(() => expect(toasts()).toContain('내보내기를 수행하지 못했습니다. 다시 시도하고, 반복되면 관리자에게 문의하세요.'));
    expect(toasts()).not.toContain('클립보드 권한'); // the read failed; it is not a clipboard permission problem
    await waitFor(() => expect(copyButton().getAttribute('aria-busy')).toBeNull());
  });

  it('a filter change mid-read cancels the copy silently: no failure toast and the busy state releases', async () => {
    secureClipboard();
    const exportRows = vi.fn((_request: unknown, signal: AbortSignal) => new Promise<ApiResponse<Row[]>>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const view = render(<Harness exportRows={exportRows} />);
    await ready();
    select('r1');
    fireEvent.click(copyButton());
    expect(copyButton().getAttribute('aria-busy')).toBe('true'); // the read hangs until the table aborts it
    view.rerender(<Harness exportRows={exportRows} filterKey="g" />);
    await waitFor(() => expect(copyButton().getAttribute('aria-busy')).toBeNull()); // the superseded copy released the button
    expect(toasts()).not.toContain('내보내기를 수행하지 못했습니다'); // a table-caused abort is silent
    expect(toasts()).not.toContain('클립보드 권한');
  });
});
