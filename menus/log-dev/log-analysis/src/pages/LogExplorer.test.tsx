// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScrollText } from 'lucide-react';
import { groupId, menuPermission, spaceId, type ApiResponse, type PlatformAdapter } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { manifests } from '../index';
import type { Investigation, SourceRow, SourceState } from '../endpoints';
import LogExplorer, { InvestigationScreen } from './LogExplorer';
import { RoundSourceView } from '../view';
const id = '14730000-0000-4000-8000-000000000001';
const set = { sourceOwner: 'synthetic-ok', files: [{ fileRef: 'source-b', order: 1, sha256: 'b'.repeat(64) }] };
const row: SourceRow = { fileRef: 'source-b', fileOrder: 1, line: 1, text: '<script>private-source</script>', timestamp: '2026-11-08T09:00:01', truncated: false, timeReversal: true, synthetic: true };
const ok = <T,>(data: T): ApiResponse<T> => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'test' });
let sourceState: SourceState;
let deniedWindow: boolean;
let pause: boolean;
let lastSignal: AbortSignal | undefined;
let pendingSource: ((value: ApiResponse<unknown>) => void) | null;
let investigation: Investigation;
let restore: () => void;
const read = vi.fn<PlatformAdapter['menuQuery']>(async (request, signal) => {
  const base = { state: sourceState, synthetic: true, label: '합성', reason: null };
  if (request.endpoint === 'logExplorer.investigations') return ok({ rows: [{ ...investigation, evidenceCount: investigation.evidence.length }], total: 1 });
  if (request.endpoint === 'logExplorer.investigationDetail') return ok(structuredClone(investigation));
  if (request.endpoint === 'logExplorer.records') { lastSignal = signal; if (pause) return new Promise(resolve => { pendingSource = resolve; }); return ok({ ...base, rows: ['ok', 'partial', 'truncated'].includes(sourceState) ? [row] : [], nextCursor: null, partial: sourceState === 'partial', truncated: sourceState === 'truncated' }); }
  if (request.endpoint === 'logExplorer.window') return ok({ ...base, state: deniedWindow ? 'permission_denied' : sourceState, rows: deniedWindow ? [] : [row], truncated: false });
  if (request.endpoint === 'logExplorer.parsed') return ok({ ...base, extractedFields: { Module: 'private-field' }, parserIn: 'private-parser-in', parserOut: 'private-parser-out', truncated: false });
  return ok({ ...base, rows: [{ fileRef: 'source-b', startLine: 1, endLine: null, state: 'open', incomplete: true, synthetic: true }], nextCursor: null });
});
const write = vi.fn<PlatformAdapter['menuAction']>(async req => {
  const input = req.input as { ref: Investigation['evidence'][number]['ref'] };
  investigation = { ...investigation, version: '2', evidence: [{ ref: input.ref, state: { code: 'available' }, sourceAccess: 'unchecked' }] };
  return { outcome: 'ok', data: { version: '2' }, version: '2', fieldErrors: [], replayed: false, correlationId: 'test' };
});
function Slot() { const slot = useDetailPanelSlotHost(); return <aside aria-label="상세" ref={slot.ref} />; }
function mount(body?: React.ReactNode, hostKeys: string[] = []) {
  const registry = createRegistry({ permissions: [menuPermission('explorer:investigate'), menuPermission('explorer:handoff')], spaces: [{ id: spaceId('log-dev'), label: { ko: '로그', en: 'Logs' }, description: { ko: '조사', en: 'Investigations' }, homeMenuId: 'log-explorer' }], groups: [{ id: groupId('logAnalysis'), label: { ko: '로그 분석', en: 'Log analysis' }, icon: ScrollText, space: spaceId('log-dev') }], menus: hostKeys.length ? manifests.map(m => ({ ...m, pageKeys: [...(m.pageKeys ?? []), ...hostKeys] })) : manifests });
  const session = testSession(['platform:view', menuPermission('explorer:investigate'), menuPermission('explorer:handoff')]);
  const adapter = testAdapter({ session: () => session, menuQuery: read, menuAction: write });
  return render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter}><DetailPanelSlotProvider>{body ?? <LogExplorer params={{}} />}<Slot /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
}
beforeEach(() => {
  restore = stubCompactTableGeometry(800);
  const storage = memoryStorage(); storage.setItem('platform:page-head-collapsed:log-explorer', 'false'); vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(new Proxy({ measureText: () => ({ width: 30 }) }, { get: (target, key) => key in target ? target[key as keyof typeof target] : () => undefined }) as unknown as CanvasRenderingContext2D);
  window.history.replaceState(null, '', '/log/explorer?v=1');
  read.mockClear(); write.mockClear(); sourceState = 'ok'; deniedWindow = false; pause = false; pendingSource = null;
  investigation = { id, title: '합성 샘플', origin: 'standalone', roundId: null, status: 'open', version: '1', createdAt: '2026-11-08T00:00:00Z', updatedAt: '2026-11-08T00:00:00Z', sampleSet: set, sampleSetState: 'inline', canInvestigate: true, handoff: { round: true, knowledgeDraft: false }, filters: {}, evidence: [] };
});
afterEach(() => { cleanup(); restore(); vi.restoreAllMocks(); });
describe('confirmed list + right drawer (#1473, synthetic)', () => {
  it('keeps the picker, source label and basket count visible in the body with the head collapsed', async () => {
    const storage = memoryStorage(); storage.setItem('platform:page-head-collapsed:log-explorer', 'true'); vi.stubGlobal('localStorage', storage);
    mount();
    const basket = await screen.findByRole('button', { name: '근거 위치 바구니 · 0' });
    expect(screen.getByRole('combobox', { name: '샘플 목록' }).classList.contains('h-8')).toBe(true);
    expect(await screen.findByText('합성 데이터')).toBeTruthy();
    expect(screen.getByText('1파일 · 파일 순서 → 줄 번호')).toBeTruthy();
    const tools = basket.parentElement!;
    expect(tools.parentElement?.firstElementChild).toBe(tools);
    expect(tools.classList.contains('shrink-0')).toBe(true);
    fireEvent.click(await screen.findByRole('button', { name: 'source-b:1 상세' }));
    const add = await screen.findByRole('button', { name: '근거 위치 담기' });
    await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(add);
    expect(await screen.findByRole('button', { name: '근거 위치 바구니 · 1' })).toBeTruthy();
  });
  it.each(['empty list', 'missing investigation'])('offers creation without retry for %s', async state => {
    read.mockImplementationOnce(async () => ok({ rows: state === 'empty list' ? [] : [{ ...investigation, evidenceCount: 0 }], total: state === 'empty list' ? 0 : 1 }));
    if (state === 'missing investigation') read.mockImplementationOnce(async () => ok(null));
    mount();
    expect(await screen.findByText(state === 'empty list' ? '저장한 조사가 없습니다.' : '조사를 찾을 수 없습니다.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: '조사 만들기' }).at(-1)!);
    expect(await screen.findByRole('dialog', { name: '조사 만들기' })).toBeTruthy();
  });
  it('keeps selection across raw/sequence tabs and renders source text without executing HTML', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'source-b:1 상세' }));
    expect(await screen.findByRole('heading', { name: '원문 줄' })).toBeTruthy();
    expect(document.querySelector('script')).toBeNull();
    fireEvent.keyDown(screen.getByRole('tab', { name: '시퀀스' }), { key: 'Enter' });
    await screen.findByRole('region', { name: '시퀀스' });
    expect(screen.getByText(/선택 source-b:1/)).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('tab', { name: '원본' }), { key: 'Enter' });
    await screen.findByRole('button', { name: 'source-b:1 상세' });
    expect(screen.getByRole('heading', { name: '레코드 상세' })).toBeTruthy();
  });
  it('shows an export range and limit while keeping the unsupported transport disabled with a reason', async () => {
    mount(); await screen.findByRole('table', { name: '원본 이벤트 목록' });
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    fireEvent.click(await screen.findByRole('button', { name: '현재 범위 내보내기…' }));
    const dialog = await screen.findByRole('dialog', { name: '현재 범위 내보내기' });
    expect(within(dialog).getByText(/행 10,000/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('파일 순서 → 줄 번호 기준 첫 N행'), { target: { value: '10001' } });
    expect(within(dialog).getByRole('alert').textContent).toContain('1–10,000행');
    expect(within(dialog).getByText(/현재 어댑터에서 내보내기를 지원하지 않습니다/)).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: '내보내기' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('shows an unsupported sequence without displaying a fabricated track result', async () => {
    sourceState = 'unsupported'; mount();
    fireEvent.keyDown(await screen.findByRole('tab', { name: '시퀀스' }), { key: 'Enter' });
    expect(await screen.findByText('시퀀스 미지원')).toBeTruthy();
    expect(screen.queryByRole('img', { name: /시퀀스/ })).toBeNull();
  });
  it('aborts an in-flight source read and discards a late reply after cancellation', async () => {
    pause = true; mount();
    fireEvent.click(await screen.findByRole('button', { name: '조회 취소' }));
    expect(lastSignal?.aborted).toBe(true);
    await screen.findByText('조회를 취소했습니다.');
    await act(async () => { pendingSource?.(ok({ state: 'ok', rows: [row], nextCursor: null })); });
    expect(screen.queryByRole('table', { name: '원본 이벤트 목록' })).toBeNull();
  });
  it.each([['partial', '일부 결과'], ['truncated', '원문 잘림'], ['source_absent', '원본 없음'], ['permission_denied', '권한 철회']] as const)('shows %s as an answered state', async (state, label) => {
    sourceState = state; mount();
    expect(await screen.findByText(new RegExp(label))).toBeTruthy();
    if (state === 'source_absent' || state === 'permission_denied') expect(screen.queryByText(row.text)).toBeNull();
  });
  it('hides parser text when the window read refuses source access', async () => {
    deniedWindow = true; mount();
    fireEvent.click(await screen.findByRole('button', { name: 'source-b:1 상세' }));
    await within(screen.getByRole('complementary', { name: '상세' })).findByText(/권한 철회/);
    expect(screen.queryByText('private-field')).toBeNull();
    expect(screen.queryByText('private-parser-in')).toBeNull();
    expect((screen.getByRole('button', { name: '근거 위치 담기' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('removes earlier raw rows when a later source read reports revoked access', async () => {
    deniedWindow = true; mount();
    fireEvent.click(await screen.findByRole('button', { name: 'source-b:1 상세' }));
    await within(screen.getByRole('complementary', { name: '상세' })).findByText(/권한 철회/);
    await waitFor(() => expect(screen.queryByRole('table', { name: '원본 이벤트 목록' })).toBeNull());
  });
  it('sends only a reference with expectedVersion and keeps handoff disabled with a reason', async () => {
    mount(); fireEvent.click(await screen.findByRole('button', { name: 'source-b:1 상세' }));
    const add = await screen.findByRole('button', { name: '근거 위치 담기' });
    await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(add);
    await waitFor(() => expect(write).toHaveBeenCalled());
    expect(write.mock.calls[0][0]).toMatchObject({ expectedVersion: '1', input: { id, ref: { fileRef: 'source-b', line: 1, fileSha256: 'b'.repeat(64) } } });
    expect(JSON.stringify(write.mock.calls[0][0])).not.toContain('private-source');
    fireEvent.click(await screen.findByRole('button', { name: '근거 위치 바구니 · 1' }));
    fireEvent.keyDown(await screen.findByRole('button', { name: '넘기기' }), { key: 'Enter' });
    expect((await screen.findByRole('menuitem', { name: 'Round · Round에서 시작한 조사만' })).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText(/공식 FAIL이나 지식 발행을 확정하지 않습니다/)).toBeTruthy();
  });
  it('resends the same create request after an unknown answer instead of creating again', async () => {
    write.mockResolvedValueOnce({ outcome: 'unknown', data: null, version: null, fieldErrors: [], replayed: false, correlationId: 'lost', message: 'timeout' });
    write.mockResolvedValueOnce({ outcome: 'ok', data: { id: '14730000-0000-4000-8000-000000000009', version: '1' }, version: '1', fieldErrors: [], replayed: false, correlationId: 'again' });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: '조사 만들기' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('조사 이름'), { target: { value: '새 조사' } });
    fireEvent.change(within(dialog).getByLabelText('Source 소유자'), { target: { value: 'synthetic-ok' } });
    fireEvent.change(within(dialog).getByLabelText(/파일 참조/), { target: { value: `source-b\t${'b'.repeat(64)}` } });
    fireEvent.click(within(dialog).getByRole('button', { name: '조사 만들기' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: '같은 요청 다시 시도' }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    expect(write.mock.calls[1]![0].idempotencyKey).toBe(write.mock.calls[0]![0].idempotencyKey);
  });
});

describe('Round evidence handoff dialog (#1474, confirmed prototype A)', () => {
  const ref = { fileRef: 'source-b', line: 1, fileSha256: 'b'.repeat(64) };
  const roundOf = (over: Partial<Investigation> = {}): Investigation => ({ ...investigation, origin: 'round', roundId: '14740000-0000-4000-8000-000000000001', sampleSetState: 'round', evidence: [{ ref, state: { code: 'available' }, sourceAccess: 'unchecked' }], ...over });
  const openMenu = async () => { fireEvent.click(await screen.findByRole('button', { name: /근거 위치 바구니 · / })); fireEvent.keyDown(await screen.findByRole('button', { name: '넘기기' }), { key: 'Enter' }); };
  it.each([
    ['standalone investigation', { origin: 'standalone' as const, roundId: null }, 'Round · Round에서 시작한 조사만'],
    ['no handoff right', { handoff: { round: false, knowledgeDraft: false } }, 'Round · 넘기기 권한 없음'],
    ['empty basket', { evidence: [] }, 'Round · 담은 근거 위치 없음'],
    ['archived investigation', { status: 'archived' as const }, 'Round · 열린 조사만'],
  ])('keeps Round disabled with its reason: %s', async (_name, over, label) => {
    investigation = roundOf(over); mount(); await openMenu();
    expect((await screen.findByRole('menuitem', { name: label })).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('menuitem', { name: '지식 초안 · 넘기기 권한 없음' }).getAttribute('aria-disabled')).toBe('true');
  });
  it('confirms with every basket reference and expectedVersion, shows the counts and returns focus to 넘기기', async () => {
    investigation = roundOf();
    write.mockResolvedValueOnce({ outcome: 'ok', data: { targetKind: 'round', targetId: investigation.roundId, handedOff: 2, alreadyAttached: 1, byStatus: { match: 2, hash_mismatch: 0, unresolved: 3 } }, version: '1', fieldErrors: [], replayed: false, correlationId: 'h' });
    mount(); await openMenu();
    fireEvent.keyDown(await screen.findByRole('menuitem', { name: 'Round' }), { key: 'Enter' });
    const dialog = await screen.findByRole('alertdialog', { name: /Round에 근거 위치/ });
    expect(within(dialog).getByText('Round에 근거 위치 1개 넘기기')).toBeTruthy();
    expect(within(dialog).getByText('참조만 전달됩니다. 공식 FAIL·기술 지식 확정이 아닙니다')).toBeTruthy();
    expect(within(dialog).getByText('fileRef · line · fileSha256만 전달 · 본문 없음')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '참조 전달' }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(write.mock.calls[0]![0]).toMatchObject({ action: 'logExplorer.evidenceHandoff', expectedVersion: '1', input: { id, refs: [ref], target: { kind: 'round', roundId: '14740000-0000-4000-8000-000000000001' } } });
    expect(await screen.findByText('Round에 2개 넘김 · 이미 있던 위치 1개 · 원본 없음 3개')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: /Round에 근거 위치/ })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '넘기기' })));
  });
  it.each([
    ['source_unavailable', '원본 연결을 확인할 수 없어 넘기지 못했습니다'],
    ['source_forbidden', '원본 접근 권한이 없습니다'],
    ['round_closed', '닫힌 Round입니다'],
    ['not_in_sample_set', 'Round 샘플 목록에 없는 파일이 있습니다'],
    ['forbidden', '넘기기 권한이 없습니다'],
  ])('keeps the dialog open with the reason for %s', async (code, text) => {
    investigation = roundOf();
    write.mockResolvedValueOnce({ outcome: 'invalid', data: null, version: null, fieldErrors: [{ path: ['refs'], code }], replayed: false, correlationId: 'h' });
    mount(); await openMenu();
    fireEvent.keyDown(await screen.findByRole('menuitem', { name: 'Round' }), { key: 'Enter' });
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: /Round에 근거 위치/ })).getByRole('button', { name: '참조 전달' }));
    expect((await screen.findByRole('alert')).textContent).toBe(text);
    expect(screen.getByRole('alertdialog', { name: /Round에 근거 위치/ })).toBeTruthy();
  });
  it('explains a conflict and lets the person cancel', async () => {
    investigation = roundOf();
    write.mockResolvedValueOnce({ outcome: 'conflict', data: null, version: '3', fieldErrors: [], replayed: false, correlationId: 'h' });
    mount(); await openMenu();
    fireEvent.keyDown(await screen.findByRole('menuitem', { name: 'Round' }), { key: 'Enter' });
    const dialog = await screen.findByRole('alertdialog', { name: /Round에 근거 위치/ });
    fireEvent.click(within(dialog).getByRole('button', { name: '참조 전달' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe('조사가 바뀌었습니다. 다시 열어 주세요');
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: /Round에 근거 위치/ })).toBeNull());
  });
  const okCounts = { outcome: 'ok' as const, data: { targetKind: 'round' as const, targetId: 'r', handedOff: 2, alreadyAttached: 1, byStatus: { match: 2, hash_mismatch: 0, unresolved: 3 } }, version: '1', fieldErrors: [], replayed: false, correlationId: 'h' };
  const openDialog = async () => { mount(); await openMenu(); fireEvent.keyDown(await screen.findByRole('menuitem', { name: 'Round' }), { key: 'Enter' }); return screen.findByRole('alertdialog', { name: /Round에 근거 위치/ }); };
  it('cannot be dismissed while the request is pending', async () => {
    investigation = roundOf();
    let release: (value: Awaited<ReturnType<PlatformAdapter['menuAction']>>) => void = () => undefined;
    write.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: '참조 전달' }));
    const cancel = await within(dialog).findByRole('button', { name: '취소' });
    await waitFor(() => expect((cancel as HTMLButtonElement).disabled).toBe(true));
    expect(within(dialog).getByRole('button', { name: '전달 중…' })).toBeTruthy();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.getByRole('alertdialog', { name: /Round에 근거 위치/ })).toBeTruthy();
    await act(async () => { release(okCounts); });
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: /Round에 근거 위치/ })).toBeNull());
  });
  it.each([
    ['unknown', '응답을 받지 못했습니다. 넘겨졌는지 확인할 수 없어 같은 요청으로 다시 시도합니다.'],
    ['error', '넘기지 못했습니다. 같은 요청으로 다시 시도할 수 있습니다.'],
  ] as const)('resends the same request (same idempotency key) after %s', async (outcome, text) => {
    investigation = roundOf();
    write.mockResolvedValueOnce({ outcome, data: null, version: null, fieldErrors: [], replayed: false, correlationId: 'lost' });
    write.mockResolvedValueOnce(okCounts);
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: '참조 전달' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe(text);
    fireEvent.click(within(dialog).getByRole('button', { name: '같은 요청 다시 시도' }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    expect(write.mock.calls[1]![0].idempotencyKey).toBe(write.mock.calls[0]![0].idempotencyKey);
    expect(within(dialog).queryByRole('button', { name: '참조 전달' })).toBeNull();
    expect(await screen.findByText('Round에 2개 넘김 · 이미 있던 위치 1개 · 원본 없음 3개')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: /Round에 근거 위치/ })).toBeNull());
  });
});

describe('embedded read-only body (#1475, Round detail tab)', () => {
  const embedded = () => mount(<InvestigationScreen embedded picker={null} investigation={investigation} frame={({ contextExtension, children }) => <div className="flex h-full flex-col">{contextExtension}{children}</div>} />);
  it('shows the Source table and the record drawer but offers no write: no saved conditions, no basket, no add-to-basket', async () => {
    embedded();
    fireEvent.click(await screen.findByRole('button', { name: 'source-b:1 상세' }));
    expect(await screen.findByRole('heading', { name: '원문 줄' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /근거 위치 바구니/ })).toBeNull();
    expect(screen.queryByRole('button', { name: '조건 저장' })).toBeNull();
    expect(screen.queryByRole('button', { name: '근거 위치 담기' })).toBeNull();
    expect(screen.queryByText('조사 쓰기 권한이 없습니다.')).toBeNull();
    expect(write).not.toHaveBeenCalled();
  });
  it('keeps the 원본 ↔ 시퀀스 switch and the selected line', async () => {
    embedded();
    fireEvent.click(await screen.findByRole('button', { name: 'source-b:1 상세' }));
    fireEvent.mouseDown(await screen.findByRole('tab', { name: '시퀀스' }), { button: 0 });
    fireEvent.click(screen.getByRole('tab', { name: '시퀀스' }));
    expect(await screen.findByText(/선택 source-b:1/)).toBeTruthy();
  });
  it('the saved screen still offers basket and save (embedded off by default)', async () => {
    mount();
    expect(await screen.findByRole('button', { name: '근거 위치 바구니 · 0' })).toBeTruthy();
  });
});

describe('RoundSourceView, the Round tab body the app injects (#1475)', () => {
  // The host route (the Round detail) declares these keys in its manifest; here the test route stands in for it.
  const view = () => mount(<RoundSourceView roundId="14750000-0000-4000-8000-000000000001" sampleSet={set} />, ['sourceTab', 'sourceFocus', 'sourceDrawer']);
  it('reads the Round\'s own sample list with no investigation row and no write', async () => {
    view();
    fireEvent.click(await screen.findByRole('button', { name: 'source-b:1 상세' }));
    expect(await screen.findByRole('heading', { name: '원문 줄' })).toBeTruthy();
    const records = read.mock.calls.map(([request]) => request).find(request => request.endpoint === 'logExplorer.records');
    expect((records?.params as { sampleSet: typeof set }).sampleSet).toEqual(set);
    expect(read.mock.calls.some(([request]) => request.endpoint === 'logExplorer.investigationDetail' || request.endpoint === 'logExplorer.investigations')).toBe(false);
    expect(screen.queryByRole('button', { name: /근거 위치 바구니|조건 저장|근거 위치 담기/ })).toBeNull();
    expect(write).not.toHaveBeenCalled();
  });
  it('keeps its address keys apart from the host: sourceFocus and sourceDrawer, never tab, focus or drawer', async () => {
    view();
    fireEvent.click(await screen.findByRole('button', { name: 'source-b:1 상세' }));
    await screen.findByRole('heading', { name: '원문 줄' });
    const query = new URLSearchParams(window.location.search);
    expect(query.get('sourceFocus')).toBe('1:1');
    expect(query.get('sourceDrawer')).toBe('record');
    for (const key of ['tab', 'focus', 'drawer']) expect(query.has(key)).toBe(false);
    fireEvent.mouseDown(screen.getByRole('tab', { name: '시퀀스' }), { button: 0 });
    fireEvent.click(screen.getByRole('tab', { name: '시퀀스' }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('sourceTab')).toBe('sequence'));
    expect(new URLSearchParams(window.location.search).has('tab')).toBe(false);
  });
});

describe('knowledge draft handoff (#1474c, confirmed A)', () => {
  const baseRead = read.getMockImplementation()!;
  const modelId = '14740000-0000-4000-8000-000000000010';
  const draftId = '14740000-0000-4000-8000-000000000020';
  const refs = [1, 2, 3].map(line => ({ fileRef: 'source-b', line, fileSha256: 'b'.repeat(64) }));
  let check: { state: string; refs: { fileRef: string; line: number; status: string }[] };
  let draftCount: number;
  let checkFailed: boolean;
  let checkPaused: boolean;
  let releaseCheck: ((value: ApiResponse<unknown>) => void) | undefined;
  const sent = { outcome: 'ok' as const, data: { targetKind: 'knowledgeDraft', targetId: draftId, handedOff: 2, draftVersion: '8' }, version: '1', fieldErrors: [], replayed: false, correlationId: 'h' };
  beforeEach(() => {
    investigation = { ...investigation, handoff: { round: true, knowledgeDraft: true }, evidence: refs.map(ref => ({ ref, state: { code: 'available' }, sourceAccess: 'unchecked' })) };
    check = { state: 'ok', refs: refs.map((ref, i) => ({ fileRef: ref.fileRef, line: ref.line, status: ['ok', 'hash_mismatch', 'unresolved'][i]! })) };
    draftCount = 4; checkFailed = false; checkPaused = false; releaseCheck = undefined;
    read.mockImplementation(async (request, signal) => {
      if (request.endpoint === 'logExplorer.handoffCheck') {
        if (checkPaused) return new Promise(resolve => { releaseCheck = resolve; });
        if (checkFailed) return { ...ok(null), outcome: 'error' };
        return ok(check);
      }
      if (request.endpoint === 'logExplorer.handoffModels') return ok({ rows: [{ id: modelId, code: 'MX-100', name: '식각 설비', vendorName: '제조사', active: true }], total: 1 });
      if (request.endpoint === 'logExplorer.handoffSoftware') return ok([{ id: `${modelId.slice(0, -1)}1`, name: '제어 SW', versionLabel: '3.2', active: true }]);
      if (request.endpoint === 'logExplorer.handoffDrafts') return ok({ rows: [{ draftId, title: '내 초안', ownerLabel: 'MX-100', status: 'draft', evidenceCount: draftCount, version: '7', updatedAt: '2026-11-08T00:00:00Z' }] });
      return baseRead(request, signal);
    });
  });
  afterEach(() => read.mockImplementation(baseRead));
  async function menu() { mount(); fireEvent.click(await screen.findByRole('button', { name: /근거 위치 바구니 · / })); fireEvent.keyDown(await screen.findByRole('button', { name: '넘기기' }), { key: 'Enter' }); }
  async function open() { await menu(); fireEvent.keyDown(await screen.findByRole('menuitem', { name: '지식 초안' }), { key: 'Enter' }); return screen.findByRole('dialog', { name: '지식 초안으로 넘기기' }); }
  async function fill(dialog: HTMLElement) {
    fireEvent.click(await within(dialog).findByRole('combobox', { name: /소유 대상/ }));
    fireEvent.click(await screen.findByRole('option', { name: /MX-100/ }));
    fireEvent.change(within(dialog).getByLabelText(/제목/), { target: { value: '응답 지연' } });
    fireEvent.change(within(dialog).getByLabelText(/관찰 사실/), { target: { value: '시작 이후 지연을 관찰했습니다.' } });
    await within(dialog).findByText('넘길 2 · 제외 1 · 해시 불일치 1');
  }
  const primary = (d: HTMLElement, append = false) => within(d).getByRole('button', { name: append ? '내 초안에 덧붙이기' : '새 초안으로 넘기기' }) as HTMLButtonElement;
  it.each([
    [{ handoff: { round: true, knowledgeDraft: false } }, '넘기기 권한 없음'],
    [{ status: 'archived' as const }, '열린 조사만'],
    [{ evidence: [] }, '담은 근거 위치 없음'],
  ])('shows the disabled reason %s', async (over, reason) => {
    investigation = { ...investigation, ...over }; await menu();
    expect(screen.getByRole('menuitem', { name: `지식 초안 · ${reason}` }).getAttribute('aria-disabled')).toBe('true');
  });
  it.each(['standalone', 'round'] as const)('allows a %s investigation', async origin => { investigation.origin = origin; if (origin === 'round') investigation.roundId = modelId; await menu(); expect(screen.getByRole('menuitem', { name: '지식 초안' }).getAttribute('aria-disabled')).not.toBe('true'); });
  it('sends only eligible pointers, owner, title, observation and the investigation version; restores focus', async () => {
    write.mockResolvedValueOnce(sent);
    const dialog = await open(); await fill(dialog);
    fireEvent.click(within(dialog).getByText(/위치별 확인 결과/));
    expect(within(dialog).getByText('제외 · 원본 없음')).toBeTruthy();
    fireEvent.click(primary(dialog));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(write.mock.calls[0]![0]).toMatchObject({ expectedVersion: '1', input: { id, refs: refs.slice(0, 2), target: { kind: 'knowledgeDraft', mode: 'create', owner: { modelId }, title: '응답 지연', observation: '시작 이후 지연을 관찰했습니다.' } } });
    expect(await screen.findByText('새 초안에 2개 넘김')).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '넘기기' })));
  });
  it('appends using the selected draft id and version', async () => {
    write.mockResolvedValueOnce(sent);
    const dialog = await open();
    fireEvent.keyDown(within(dialog).getByRole('tab', { name: '내 초안에 덧붙이기' }), { key: 'Enter' });
    fireEvent.click(await within(dialog).findByRole('radio', { name: /내 초안/ }));
    fireEvent.click(primary(dialog, true));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(write.mock.calls[0]![0].input).toMatchObject({ target: { kind: 'knowledgeDraft', mode: 'append', draftId, draftExpectedVersion: '7' }, refs: refs.slice(0, 2) });
    expect(await screen.findByText('내 초안에 근거 위치 2개를 전달했습니다. 이미 있던 위치는 더해지지 않습니다.')).toBeTruthy();
  });
  it('requires owner, title and observation with the confirmed reason', async () => {
    const dialog = await open(); await within(dialog).findByText(/넘길 2/);
    expect(primary(dialog).disabled).toBe(true);
    expect(within(dialog).getByText('소유 대상·제목·관찰 사실을 모두 입력하세요.')).toBeTruthy();
  });
  it.each(['source_forbidden', 'source_unavailable'])('blocks %s', async state => {
    check = { state, refs: [] }; const dialog = await open();
    expect(await within(dialog).findByText(state === 'source_forbidden' ? '원본 접근 권한이 없어 넘길 수 없습니다.' : '원본 연결을 확인할 수 없어 넘길 수 없습니다.')).toBeTruthy();
    expect(primary(dialog).disabled).toBe(true);
  });
  it('retries a failed check', async () => {
    checkFailed = true; const dialog = await open();
    await within(dialog).findByText('원본 연결을 확인할 수 없어 넘길 수 없습니다.');
    checkFailed = false; fireEvent.click(within(dialog).getByRole('button', { name: '다시 확인' }));
    expect(await within(dialog).findByText('넘길 2 · 제외 1 · 해시 불일치 1')).toBeTruthy();
  });
  it('keeps confirm disabled while the check loads', async () => {
    checkPaused = true; const dialog = await open();
    expect(primary(dialog).disabled).toBe(true); expect(within(dialog).getByLabelText('근거 위치 확인 중')).toBeTruthy();
    await act(async () => releaseCheck?.(ok(check)));
    expect(await within(dialog).findByText(/넘길 2/)).toBeTruthy();
  });
  it('blocks when every pointer is excluded', async () => {
    check.refs = check.refs.map(r => ({ ...r, status: 'unresolved' })); const dialog = await open();
    expect(await within(dialog).findByText('넘길 근거 위치가 없습니다.')).toBeTruthy(); expect(primary(dialog).disabled).toBe(true);
  });
  it('blocks new drafts above 20 without trimming', async () => {
    investigation.evidence = Array.from({ length: 21 }, (_, i) => ({ ref: { ...refs[0]!, line: i + 1 }, state: { code: 'available' }, sourceAccess: 'unchecked' }));
    check.refs = investigation.evidence.map(({ ref }) => ({ fileRef: ref.fileRef, line: ref.line, status: 'ok' }));
    const dialog = await open();
    expect(await within(dialog).findByText('초안 근거는 20개까지입니다 (21/20)')).toBeTruthy(); expect(primary(dialog).disabled).toBe(true); expect(write).not.toHaveBeenCalled();
  });
  it('allows the server to deduplicate an uncertain append above the estimated cap', async () => {
    draftCount = 19; const dialog = await open(); fireEvent.keyDown(within(dialog).getByRole('tab', { name: '내 초안에 덧붙이기' }), { key: 'Enter' });
    fireEvent.click(await within(dialog).findByRole('radio', { name: /내 초안/ }));
    expect(await within(dialog).findByText(/최대 21\/20/)).toBeTruthy(); expect(primary(dialog, true).disabled).toBe(false);
    write.mockResolvedValueOnce({ ...sent, outcome: 'invalid', data: null, fieldErrors: [{ path: ['refs'], code: 'too_many' }] });
    fireEvent.click(primary(dialog, true));
    expect((await within(dialog).findByRole('alert')).textContent).toContain('초안 근거는 20개까지입니다');
  });
  it.each(['draft', 'refs'])('blocks append only when %s alone exceeds 20', async over => {
    if (over === 'draft') draftCount = 21;
    else {
      investigation.evidence = Array.from({ length: 21 }, (_, i) => ({ ref: { ...refs[0]!, line: i + 1 }, state: { code: 'available' }, sourceAccess: 'unchecked' }));
      check.refs = investigation.evidence.map(({ ref }) => ({ fileRef: ref.fileRef, line: ref.line, status: 'ok' }));
    }
    const dialog = await open(); fireEvent.keyDown(within(dialog).getByRole('tab', { name: '내 초안에 덧붙이기' }), { key: 'Enter' });
    fireEvent.click(await within(dialog).findByRole('radio', { name: /내 초안/ }));
    expect(primary(dialog, true).disabled).toBe(true); expect(write).not.toHaveBeenCalled();
  });
  it.each(['model', 'software'])('retains a paged %s label and payload across tabs', async kind => {
    const previous = read.getMockImplementation()!;
    const models = Array.from({ length: 21 }, (_, i) => ({ id: `model-${i}`, code: `MX-${i}`, name: `모델 ${i}`, active: true }));
    const software = Array.from({ length: 21 }, (_, i) => ({ id: `software-${i}`, versionLabel: `v${i}`, name: '제어 SW', active: true }));
    read.mockImplementation(async (request, signal) => {
      if (request.endpoint === 'logExplorer.handoffModels') { const page = Number((request.params as { page: number }).page); return ok({ rows: models.slice(page * 20, (page + 1) * 20), total: models.length }); }
      if (request.endpoint === 'logExplorer.handoffSoftware') return ok(software);
      return previous(request, signal);
    });
    write.mockResolvedValueOnce(sent);
    const dialog = await open();
    await within(dialog).findByRole('button', { name: '모델 더 보기' });
    fireEvent.click(within(dialog).getByRole('button', { name: '모델 더 보기' }));
    await waitFor(() => expect(read.mock.calls.some(([r]) => r.endpoint === 'logExplorer.handoffModels' && (r.params as { page: number }).page === 1)).toBe(true));
    fireEvent.click(within(dialog).getByRole('combobox', { name: /소유 대상/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'MX-20 · 모델 20' }));
    if (kind === 'software') {
      fireEvent.click(within(dialog).getByRole('radio', { name: 'SW 버전' }));
      const picker = await within(dialog).findByRole('combobox', { name: 'SW 버전' });
      expect(picker.textContent).toContain('모델을 고른 뒤 SW 버전 선택');
      fireEvent.click(await within(dialog).findByRole('button', { name: 'SW 버전 더 보기' }));
      fireEvent.click(picker); fireEvent.click(await screen.findByRole('option', { name: 'v20 · 제어 SW' }));
    }
    fireEvent.change(within(dialog).getByLabelText(/제목/), { target: { value: '선택 유지' } });
    fireEvent.change(within(dialog).getByLabelText(/관찰 사실/), { target: { value: '관찰 사실' } });
    fireEvent.keyDown(within(dialog).getByRole('tab', { name: '내 초안에 덧붙이기' }), { key: 'Enter' });
    expect(within(dialog).queryByRole('combobox', { name: /소유 대상/ })).toBeNull();
    fireEvent.keyDown(within(dialog).getByRole('tab', { name: '새 초안' }), { key: 'Enter' });
    expect(within(dialog).getByRole('combobox', { name: /소유 대상/ }).textContent).toContain('MX-20 · 모델 20');
    if (kind === 'software') expect(within(dialog).getByRole('combobox', { name: 'SW 버전' }).textContent).toContain('v20 · 제어 SW');
    fireEvent.click(primary(dialog));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(write.mock.calls[0]![0].input).toMatchObject({ target: { owner: kind === 'model' ? { modelId: 'model-20' } : { softwareId: 'software-20' } } });
  });
  it('exposes required controls and linked hints', async () => {
    const dialog = await open();
    for (const control of [within(dialog).getByRole('combobox', { name: /소유 대상/ }), within(dialog).getByLabelText(/제목/), within(dialog).getByLabelText(/관찰 사실/)]) {
      expect(control.getAttribute('aria-required')).toBe('true');
      const ids = control.getAttribute('aria-describedby')?.split(' ') ?? [];
      expect(ids.length).toBeGreaterThan(0);
      for (const hint of ids) expect(document.getElementById(hint)?.textContent).toBeTruthy();
    }
  });
  it('keeps input and shows the amber conflict callout with a list refresh', async () => {
    write.mockResolvedValueOnce({ ...sent, outcome: 'invalid', data: null, fieldErrors: [{ path: ['expectedVersion'], code: 'conflict' }] });
    const dialog = await open(); await fill(dialog); fireEvent.click(primary(dialog));
    expect(await within(dialog).findByText('초안 버전 충돌')).toBeTruthy();
    expect((within(dialog).getByLabelText(/제목/) as HTMLInputElement).value).toBe('응답 지연');
    fireEvent.click(within(dialog).getByRole('button', { name: '목록 다시 확인' }));
    await waitFor(() => expect(read.mock.calls.filter(([r]) => r.endpoint === 'logExplorer.handoffDrafts').length).toBe(2));
  });
  it('refetches the check after an unresolved race', async () => {
    write.mockResolvedValueOnce({ ...sent, outcome: 'invalid', data: null, fieldErrors: [{ path: ['refs', '0'], code: 'unresolved' }] });
    const dialog = await open(); await fill(dialog); fireEvent.click(primary(dialog));
    expect(await within(dialog).findByText('원본을 찾을 수 없는 위치가 생겼습니다. 다시 확인합니다.')).toBeTruthy();
    await waitFor(() => expect(read.mock.calls.filter(([r]) => r.endpoint === 'logExplorer.handoffCheck').length).toBe(2));
  });
  it.each(['title', 'observation', 'target.modelId', 'refs'])('shows a server field refusal for %s', async path => {
    write.mockResolvedValueOnce({ ...sent, outcome: 'invalid', data: null, fieldErrors: [{ path: path.split('.'), code: path === 'refs' ? 'too_many' : 'required' }] });
    const dialog = await open(); await fill(dialog); fireEvent.click(primary(dialog));
    expect((await within(dialog).findByRole('alert')).textContent).toContain(path === 'refs' ? '초안 근거는 20개까지입니다' : path === 'title' ? '제목을 입력하세요.' : path === 'observation' ? '관찰 사실을 입력하세요.' : '소유 대상을 선택하세요.');
  });
  it.each(['title', 'observation', 'target.title', 'target.observation', 'target.owner.modelId', 'target.owner.softwareId', 'target.draftId'])('links and focuses Korean field guidance for %s', async path => {
    write.mockResolvedValueOnce({ ...sent, outcome: 'invalid', data: null, fieldErrors: [{ path: path.split('.'), code: 'not_found' }] });
    const dialog = await open(); await fill(dialog);
    if (path.endsWith('softwareId')) { fireEvent.click(within(dialog).getByRole('radio', { name: 'SW 버전' })); fireEvent.click(within(dialog).getByRole('combobox', { name: 'SW 버전' })); fireEvent.click(await screen.findByRole('option', { name: /3.2/ })); }
    const append = path.endsWith('draftId');
    if (append) { fireEvent.keyDown(within(dialog).getByRole('tab', { name: '내 초안에 덧붙이기' }), { key: 'Enter' }); fireEvent.click(await within(dialog).findByRole('radio', { name: /내 초안/ })); }
    fireEvent.click(primary(dialog, append));
    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).not.toContain(path);
    await waitFor(() => expect(document.activeElement?.getAttribute('aria-invalid')).toBe('true'));
    const descriptions = document.activeElement?.getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(descriptions.some(id => document.getElementById(id)?.textContent === alert.textContent)).toBe(true);
  });
  it.each(['required', 'too_long', 'malformed', 'not_found', 'unmapped'])('never exposes raw paths or %s codes', async code => {
    write.mockResolvedValueOnce({ ...sent, outcome: 'invalid', data: null, fieldErrors: [{ path: ['target', 'title'], code }] });
    const dialog = await open(); await fill(dialog); fireEvent.click(primary(dialog));
    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).not.toMatch(/target|title|required|too_long|malformed|not_found|unmapped/);
    if (code === 'unmapped') expect(alert.textContent).toBe('입력을 확인한 뒤 다시 시도하세요.');
  });
  it('focuses the first invalid control in form order', async () => {
    write.mockResolvedValueOnce({ ...sent, outcome: 'invalid', data: null, fieldErrors: [{ path: ['observation'], code: 'required' }, { path: ['title'], code: 'too_long' }] });
    const dialog = await open(); await fill(dialog); fireEvent.click(primary(dialog));
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByLabelText(/제목/)));
  });
  it('focuses an actionable alert for an unmapped general refusal', async () => {
    write.mockResolvedValueOnce({ ...sent, outcome: 'invalid', data: null, fieldErrors: [{ path: ['private', 'path'], code: 'unknown_code' }] });
    const dialog = await open(); await fill(dialog); fireEvent.click(primary(dialog));
    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toBe('입력을 확인한 뒤 다시 시도하세요.');
    await waitFor(() => expect(document.activeElement).toBe(alert));
  });
  it('focuses the conflict alert when the draft version is refused', async () => {
    write.mockResolvedValueOnce({ ...sent, outcome: 'invalid', data: null, fieldErrors: [{ path: ['expectedVersion'], code: 'conflict' }] });
    const dialog = await open(); await fill(dialog); fireEvent.click(primary(dialog));
    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toContain('초안 버전 충돌');
    await waitFor(() => expect(document.activeElement).toBe(alert));
  });
  it.each(['cancel', 'escape', 'x'])('asks before dirty close via %s', async how => {
    const dialog = await open(); fireEvent.change(within(dialog).getByLabelText(/제목/), { target: { value: '작성 중' } });
    if (how === 'escape') fireEvent.keyDown(dialog, { key: 'Escape' });
    else fireEvent.click(within(dialog).getByRole('button', { name: how === 'x' ? '닫기' : '취소' }));
    const ask = await screen.findByRole('alertdialog', { name: '작성 중인 내용이 사라집니다. 닫을까요?' });
    fireEvent.click(within(ask).getByRole('button', { name: '계속 작성' }));
    expect((within(dialog).getByLabelText(/제목/) as HTMLInputElement).value).toBe('작성 중');
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '지식 초안으로 넘기기' })).toBeNull());
  });
  it('cannot dismiss while pending', async () => {
    let release: (value: typeof sent) => void = () => undefined;
    write.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const dialog = await open(); await fill(dialog); fireEvent.click(primary(dialog));
    await waitFor(() => expect((within(dialog).getByRole('button', { name: '취소' }) as HTMLButtonElement).disabled).toBe(true));
    fireEvent.keyDown(dialog, { key: 'Escape' }); fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('alertdialog')).toBeNull(); expect(screen.getByRole('dialog', { name: '지식 초안으로 넘기기' })).toBeTruthy();
    await act(async () => release(sent)); await waitFor(() => expect(screen.queryByRole('dialog', { name: '지식 초안으로 넘기기' })).toBeNull());
  });
  it.each(['unknown', 'error'] as const)('retries the identical request after %s', async outcome => {
    write.mockResolvedValueOnce({ ...sent, outcome, data: null }); write.mockResolvedValueOnce(sent);
    const dialog = await open(); await fill(dialog); fireEvent.click(primary(dialog));
    fireEvent.click(await within(dialog).findByRole('button', { name: '같은 요청 다시 시도' }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    expect(write.mock.calls[1]![0]).toEqual(write.mock.calls[0]![0]);
  });
});
