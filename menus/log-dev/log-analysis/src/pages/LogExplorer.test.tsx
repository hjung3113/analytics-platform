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
import LogExplorer from './LogExplorer';
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
function mount() {
  const registry = createRegistry({ permissions: [menuPermission('explorer:investigate'), menuPermission('explorer:handoff')], spaces: [{ id: spaceId('log-dev'), label: { ko: '로그', en: 'Logs' }, description: { ko: '조사', en: 'Investigations' }, homeMenuId: 'log-explorer' }], groups: [{ id: groupId('logAnalysis'), label: { ko: '로그 분석', en: 'Log analysis' }, icon: ScrollText, space: spaceId('log-dev') }], menus: manifests });
  const session = testSession(['platform:view', menuPermission('explorer:investigate'), menuPermission('explorer:handoff')]);
  const adapter = testAdapter({ session: () => session, menuQuery: read, menuAction: write });
  return render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter}><DetailPanelSlotProvider><LogExplorer params={{}} /><Slot /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
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
    expect(screen.getByRole('menuitem', { name: '지식 초안 · 준비 중' }).getAttribute('aria-disabled')).toBe('true');
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
