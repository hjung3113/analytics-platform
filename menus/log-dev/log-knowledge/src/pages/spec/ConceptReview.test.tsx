// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { type ApiResponse, type ActionResponse, type MenuAction } from '@ap/contracts';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { stubCompactTableGeometry } from '@ap/components/testing';
import type { ConceptMappingRow, ConceptSuggestion, ItemDetail as ItemDetailData, ModelSpecData } from '../../endpoints';
import SpecScreen from './SpecScreen';
import { SubjectPicker, SubjectChips } from '../items/ItemSubjects';
import ItemDetailScreen from '../items/ItemDetail';
import { ItemWriteDrawer } from '../items/ItemWriteDrawer';
import type { SubjectPick } from '../items/subjectModel';
import { useState } from 'react';
import { knowledgeRegistry, mountWith } from '../test-support';
const modelId = '00000003-0000-4000-8000-000000000008', other = '00000003-0000-4000-8000-000000000009';
const registry = knowledgeRegistry(['knowledge:catalog-manage', 'knowledge:spec-publish', 'knowledge:item-publish'], { description: { ko: '로그', en: 'Log' }, homeMenuId: 'log-knowledge-models' });
const spec: ModelSpecData = { revision: { id: 'r', modelId, revisionNo: 1, state: 'published', schemaVersion: 1, sourceDocRef: { docLabel: 'Spec', docVersion: '1' }, contentSha256: null, publishedAt: null, publishedBy: null }, modules: [{ id: 'm', moduleKey: 'ROBOT', name: 'Robot', parentModuleId: null }], events: [{ id: 'e', moduleId: 'm', eventKey: 'MOVE', name: 'Move', fields: [], triggerRule: '이동 요청 시', detailDocRef: null }], relations: [] };
const row = (id: string, patch: Partial<ConceptMappingRow> = {}): ConceptMappingRow => ({ id, conceptId: 'c', conceptLabel: '로봇 이동', kind: 'event', modelId, modelName: 'A-100', targetKind: 'event', targetKey: 'ROBOT/MOVE', targetName: 'Move', targetState: 'present', relationKind: 'equivalent', reviewState: 'proposed', origin: 'similarity', similarityScore: 0.9, similarityBasis: { name_trgm: 0.9 }, rejectReason: null, proposedBy: 'admin', proposedAt: '2026-11-01T00:00:00Z', reviewedBy: null, reviewedAt: null, version: 1, ...patch });
const ok = (data: unknown) => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'test' }) as ApiResponse<never>;
let itemReadFailure = false;
let suggestionRows: ConceptSuggestion[] = [], specFailure: string | null = null, relatedFailure: string | null = null, actionFailure: string | null = null;
let rows: ConceptMappingRow[], writes: MenuAction[], allowed: boolean, conflict: boolean, failure: string | null, restore: () => void;
beforeEach(() => { rows = [row('a'), row('b', { modelId: other, modelName: 'B-10' }), row('unrelated', { targetKey: 'ARM/STOP', conceptId: 'd', conceptLabel: '다른 제안' })]; itemReadFailure = false; suggestionRows = []; specFailure = null; relatedFailure = null; actionFailure = null; writes = []; allowed = true; conflict = false; failure = null; restore = stubCompactTableGeometry(); HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { cleanup(); restore(); vi.restoreAllMocks(); });
function mount(search = '&tab=concept', child?: React.ReactNode) {
  window.history.replaceState(null, '', `/logDev/log-knowledge-spec/${modelId}?v=1&scopeId=MEM${search}`);
  const session = testSession(['platform:view', ...(allowed ? ['knowledge:spec-publish' as const, 'knowledge:item-publish' as const] : [])]);
  const adapter = testAdapter({ session: () => session, menuQuery: async req => {
    if (req.endpoint === 'logKnowledge.itemDetail') return itemReadFailure ? { ...ok(null), outcome: 'error' } as ApiResponse<never> : ok(detail);
    if (req.endpoint === 'logKnowledge.modelSpec') { if (specFailure === 'loading') return new Promise(() => {}); return specFailure === 'empty' ? ok(null) : specFailure ? { ...ok(null), outcome: specFailure } as ApiResponse<never> : ok(spec); }
    if (req.endpoint === 'logKnowledge.conceptSuggestions') return ok({ rows: suggestionRows, total: suggestionRows.length });
    if (req.endpoint === 'logKnowledge.conceptMappings') { if (failure === 'loading') return new Promise(() => {}); if (failure) return { ...ok(null), outcome: failure } as ApiResponse<never>; return ok({ rows, total: rows.length }); }
    if (req.endpoint === 'logKnowledge.specSubjectItems' && relatedFailure) return relatedFailure === 'empty' ? ok({ rows: [], total: 0 }) : { ...ok(null), outcome: relatedFailure } as ApiResponse<never>;
    if (req.endpoint === 'logKnowledge.specSubjectItems') return ok({ rows: [{ id: '00000005-0000-4000-8000-000000000001', itemNo: 1, title: '관련 사례', subjectRelation: 'about' }], total: 1 });
    return ok({ rows: [], total: 0 });
  }, menuAction: async req => { writes.push(req); if (actionFailure) return { outcome: actionFailure, fieldErrors: [] } as unknown as ActionResponse<never>;
    if (req.action === 'logKnowledge.conceptPropose') { rows = [...rows, row('new-a', { conceptId: 'new-c' }), row('new-b', { conceptId: 'new-c', modelId: other, modelName: 'B-10' })]; return { outcome: 'ok', data: { conceptId: 'new-c', mappingId: 'new-a', pairMappingId: 'new-b' }, fieldErrors: [] } as unknown as ActionResponse<never>; }
    if (req.action.startsWith('logKnowledge.item')) return { outcome: 'ok', data: { id: '00000005-0000-4000-8000-000000000001' }, fieldErrors: [] } as unknown as ActionResponse<never>;
    if (conflict) { conflict = false; rows = rows.map(r => ({ ...r, version: 2 })); return { outcome: 'conflict', fieldErrors: [] } as unknown as ActionResponse<never>; } const input = req.input as { mappingId: string; reason?: string }; rows = rows.map(r => r.id === input.mappingId ? { ...r, reviewState: req.action.endsWith('Reject') ? 'rejected' : 'confirmed', rejectReason: input.reason ?? null, version: r.version + 1 } : r); return { outcome: 'ok', data: {}, version: '2', fieldErrors: [] } as unknown as ActionResponse<never>; } });
  return mountWith({ registry, adapter, ui: child ?? <SpecScreen params={{ modelId }} />, slot: true });
}
describe('production concept review', () => {
  it('opens the concept tab and filters exactly one Event, with a removable chip', async () => {
    mount('&tab=concept&event=ROBOT%2FMOVE');
    const card = await screen.findByRole('article', { name: '검토 a' });
    expect(within(card).getByText('제안 · 사람이 확정하기 전')).toBeTruthy();
    expect(within(card).getByText(/A-100/)).toBeTruthy(); expect(within(card).getByText(/B-10/)).toBeTruthy();
    await waitFor(() => expect(within(card).getAllByText('이동 요청 시')).toHaveLength(2));
    expect(screen.queryByText('다른 제안')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '필터 해제' }));
    expect(await screen.findByText('다른 제안')).toBeTruthy(); expect(window.location.search).toContain('scopeId=MEM');
  });
  it('confirms using the mapping version and human relation copy', async () => {
    mount(); const card = await screen.findByRole('article', { name: '검토 a' });
    const confirm = within(card).getByRole('button', { name: '같은 개념으로 확정' }), reject = within(card).getByRole('button', { name: '거절' });
    expect(confirm.className).toBe(reject.className); expect(within(card).queryByLabelText(/거절 사유/)).toBeNull();
    fireEvent.click(confirm); await waitFor(() => expect(writes[0]?.expectedVersion).toBe('1'));
    expect(await screen.findByText('확정됨')).toBeTruthy();
  });
  it('requires a rejection reason and keeps it while recovering a conflict', async () => {
    conflict = true; mount(); const card = await screen.findByRole('article', { name: '검토 a' });
    fireEvent.click(within(card).getByRole('button', { name: '거절' }));
    fireEvent.click(within(card).getByRole('button', { name: '거절하기' })); expect(writes).toHaveLength(0);
    const reason = within(card).getByLabelText(/거절 사유/); fireEvent.change(reason, { target: { value: '조건 다름' } });
    fireEvent.click(within(card).getByRole('button', { name: '거절하기' })); await within(card).findByRole('button', { name: '최신 불러오기' });
    fireEvent.click(within(card).getByRole('button', { name: '최신 불러오기' }));
    await waitFor(() => expect((screen.getByLabelText(/거절 사유/) as HTMLInputElement).value).toBe('조건 다름'));
    fireEvent.click(screen.getByRole('button', { name: '거절하기' })); await waitFor(() => expect(writes.at(-1)?.expectedVersion).toBe('2'));
    expect(await screen.findByText('거절됨')).toBeTruthy(); expect(screen.getByText('조건 다름')).toBeTruthy();
  });
  it.each([['loading', '개념 제안을 불러오는 중…'], ['error', '개념 제안을 불러오지 못했습니다'], ['forbidden', '개념 매핑을 볼 권한이 없습니다']])('shows %s distinctly', async (state, text) => { failure = state; mount(); expect(await screen.findByText(text)).toBeTruthy(); if (state === 'error') expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy(); });
  it('explains write permission and the empty entry', async () => { rows = []; allowed = false; mount(); expect(await screen.findByText('개념 제안이 없습니다')).toBeTruthy(); expect(screen.getByRole('button', { name: 'Event에서 제안하기' })).toBeTruthy(); expect(screen.getAllByText(/명세 관리 권한.*관리자/).length).toBeGreaterThan(0); });
  it('links Event rows and the drawer to the filtered tab and related Item', async () => { mount('&tab=spec&event=ROBOT%2FMOVE'); expect(await screen.findByRole('link', { name: /관련 사례/ })).toBeTruthy(); fireEvent.click(within(screen.getByRole('complementary')).getByRole('button', { name: /이 Event의 개념 제안/ })); expect(window.location.search).toContain('tab=concept'); expect(window.location.search).toContain('event=ROBOT%2FMOVE'); });
});
function Picker({ initial = [] }: { initial?: SubjectPick[] }) { const [picks, set] = useState(initial); return <SubjectPicker modelId={modelId} picks={picks} onChange={set} />; }
describe('additional concept review states', () => {
  it('pages the queue without dropping later proposals', async () => { rows = Array.from({ length: 11 }, (_, i) => row(`p${i}`, { conceptId: `c${i}` })); mount(); await screen.findByRole('article', { name: '검토 p0' }); expect(screen.getAllByRole('article')).toHaveLength(10); fireEvent.click(screen.getByRole('button', { name: '다음' })); expect(await screen.findByRole('article', { name: '검토 p9' })).toBeTruthy(); expect(screen.getAllByRole('article')).toHaveLength(1); });
  it('shows related confirmation copy and gone history without confirmation', async () => { rows = [row('related', { relationKind: 'related' }), row('gone', { targetState: 'target_gone', targetName: null })]; mount(); expect(await screen.findByRole('button', { name: '관련 개념으로 확정' })).toBeTruthy(); const gone = screen.getByRole('article', { name: '검토 gone' }); expect(within(gone).getByText('대상 사라짐', { selector: 'span' })).toBeTruthy(); expect(within(gone).queryByRole('button', { name: /으로 확정/ })).toBeNull(); });
  it('materializes a computed proposal and confirms both compared targets with their versions', async () => { rows = []; suggestionRows = [{ kind: 'event', source: { modelId, targetKey: 'ROBOT/MOVE', name: 'Move' }, candidate: { modelId: other, modelName: 'B-10', targetKey: 'ROBOT/MOVE', name: 'Move' }, score: 0.8, basis: { name_trgm: 1 }, proposal: true }]; mount(); fireEvent.click(await screen.findByRole('button', { name: '같은 개념으로 확정' })); await waitFor(() => expect(writes.map(w => w.action)).toEqual(['logKnowledge.conceptPropose', 'logKnowledge.conceptConfirm', 'logKnowledge.conceptConfirm'])); expect(writes.slice(1).map(w => w.expectedVersion)).toEqual(['1', '1']); });
  it('does not duplicate stored pairs with computed proposals', async () => { suggestionRows = [{ kind: 'event', source: { modelId, targetKey: 'ROBOT/MOVE', name: 'Move' }, candidate: { modelId: other, modelName: 'B-10', targetKey: 'ROBOT/MOVE', name: 'Move' }, score: 0.8, basis: { name_trgm: 1 }, proposal: true }]; mount('&tab=concept&event=ROBOT%2FMOVE'); await screen.findByRole('article', { name: '검토 a' }); expect(screen.getAllByRole('article')).toHaveLength(1); });
  it('adds a new concept from the fixed Event footer', async () => { mount('&tab=spec&event=ROBOT%2FMOVE'); fireEvent.click(await screen.findByRole('button', { name: '개념 제안' })); fireEvent.change(screen.getByLabelText(/새 개념 이름/), { target: { value: '새 이동' } }); fireEvent.click(screen.getByRole('button', { name: '제안 추가' })); await waitFor(() => expect(writes[0]?.input).toMatchObject({ modelId, target: { module: 'ROBOT', event: 'MOVE' }, canonicalLabel: '새 이동', relationKind: 'equivalent' })); expect(await screen.findByText('제안을 추가했습니다. 아직 확정되지 않았습니다.')).toBeTruthy(); });
  it('chooses an existing concept and related relation', async () => { mount('&tab=spec&event=ROBOT%2FMOVE'); fireEvent.click(await screen.findByRole('button', { name: '개념 제안' })); fireEvent.keyDown(screen.getByRole('combobox', { name: '기존 개념 또는 새 개념' }), { key: 'Enter' }); fireEvent.click(await screen.findByRole('option', { name: '로봇 이동' })); fireEvent.keyDown(screen.getByRole('combobox', { name: '개념 관계' }), { key: 'Enter' }); fireEvent.click(await screen.findByRole('option', { name: '관련 개념' })); fireEvent.click(screen.getByRole('button', { name: '제안 추가' })); await waitFor(() => expect(writes[0]?.input).toMatchObject({ conceptId: 'c', relationKind: 'related' })); expect(writes[0]?.input).not.toHaveProperty('canonicalLabel'); });
  it.each(['error', 'forbidden', 'empty'])('shows related Item %s state', async state => { relatedFailure = state; mount('&tab=spec&event=ROBOT%2FMOVE'); expect(await screen.findByText(state === 'error' ? '관련 Item을 불러오지 못했습니다.' : state === 'forbidden' ? /관련 Item을 볼 수 없습니다/ : '연결된 Item이 없습니다.')).toBeTruthy(); });
  it('keeps the proposal input after a failed write', async () => { actionFailure = 'error'; mount('&tab=spec&event=ROBOT%2FMOVE'); fireEvent.click(await screen.findByRole('button', { name: '개념 제안' })); fireEvent.change(screen.getByLabelText(/새 개념 이름/), { target: { value: '입력 보존' } }); fireEvent.click(screen.getByRole('button', { name: '제안 추가' })); expect(await screen.findByText('제안을 저장하지 못했습니다. 다시 시도해 주세요.')).toBeTruthy(); expect((screen.getByLabelText(/새 개념 이름/) as HTMLInputElement).value).toBe('입력 보존'); });
});
describe('Item subjects', () => {
  it.each([['loading', '대상을 불러오는 중…'], ['error', '대상을 불러오지 못했습니다.'], ['forbidden', /명세를 볼 수 없습니다/], ['empty', /발행된 명세가 없습니다/]] as const)('shows picker %s state', async (state, text) => { specFailure = state; mount('', <Picker />); expect(await screen.findByText(text)).toBeTruthy(); });
  it('shows an empty search result', async () => { mount('', <Picker />); fireEvent.change(await screen.findByLabelText('대상 검색'), { target: { value: 'missing' } }); expect(screen.getByText('검색 결과가 없습니다.')).toBeTruthy(); });

  it('searches the model tree, adds, changes relation and removes', async () => { mount('', <Picker />); fireEvent.change(await screen.findByLabelText('대상 검색'), { target: { value: 'MOVE' } }); fireEvent.click(await screen.findByRole('button', { name: 'Event · Move 추가' })); expect(screen.getByText('1 / 20')).toBeTruthy(); fireEvent.keyDown(screen.getByRole('combobox', { name: 'ROBOT/MOVE 관계' }), { key: 'Enter' }); fireEvent.click(await screen.findByRole('option', { name: '배경' })); expect(screen.getByRole('combobox', { name: 'ROBOT/MOVE 관계' }).textContent).toContain('배경'); fireEvent.click(screen.getByRole('button', { name: 'ROBOT/MOVE 빼기' })); expect(screen.getByText('0 / 20')).toBeTruthy(); });
  it('enforces the 20 cap', async () => { mount('', <Picker initial={Array.from({ length: 20 }, (_, i) => ({ kind: 'event', key: `X/${i}`, relation: 'about' }))} />); expect((await screen.findByRole('button', { name: 'Event · Move 추가' }) as HTMLButtonElement).disabled).toBe(true); });
  it('explains item write permission', async () => { allowed = false; mount('', <Picker />); expect(await screen.findByText(/Item 작성 권한.*관리자/)).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Event · Move 추가' })).toBeNull(); });
  it('shows subject states and only links resolved targets', async () => { mount('', <SubjectChips subjects={(['resolved', 'gone', 'no_spec'] as const).map((state, i) => ({ modelId, modelName: 'A-100', targetKind: 'event', targetKey: `ROBOT/${i}`, subjectRelation: 'about', specRevNoAtLink: 1, state, targetName: null }))} />); expect(screen.getByText('연결됨')).toBeTruthy(); expect(screen.getByText('대상 사라짐')).toBeTruthy(); expect(screen.getByText('명세 없음')).toBeTruthy(); expect(screen.getAllByRole('link')).toHaveLength(1); expect(screen.getByRole('link').getAttribute('href')).toContain('event=ROBOT%2F0'); });
});

const detail: ItemDetailData = { subjects: [{ modelId, modelName: 'A-100', targetKind: 'event', targetKey: 'ROBOT/MOVE', subjectRelation: 'about', specRevNoAtLink: 1, state: 'resolved', targetName: 'Move' }], item: { id: '00000005-0000-4000-8000-000000000001', itemNo: 1, title: '이동 사례', typeCode: 'anomaly', owner: { kind: 'model', modelId, modelName: 'A-100' }, verificationState: 'not_checked', processingState: 'open', publicationState: 'published', latestRevisionNo: 1, updatedAt: '2026-11-01T00:00:00Z', version: '1', createdAt: '2026-11-01T00:00:00Z', createdBy: 'admin' }, revision: { revisionNo: 1, title: '이동 사례', typeCode: 'anomaly', observation: '이동 느림', expected: null, analysisOpinion: null, improvement: null, evidence: [], changeNote: null, publishedAt: '2026-11-01T00:00:00Z', publishedBy: 'admin' }, revisions: [], assessments: [], links: [] };
describe('Item editor subject payload', () => {
  it('keeps the actual Item drawer and draft after a conflict reload fails', async () => { actionFailure = 'conflict'; mount('&drawer=revise', <ItemDetailScreen params={{ itemId: detail.item.id }} />); fireEvent.change(await screen.findByLabelText(/변경 사유/), { target: { value: '내 대상 수정' } }); fireEvent.click(screen.getByRole('button', { name: '새 리비전 저장' })); await screen.findByText('다른 사람이 먼저 고쳤습니다'); itemReadFailure = true; fireEvent.click(screen.getByRole('button', { name: '최신 불러오기' })); await screen.findByText('데이터를 불러오지 못했습니다'); expect((screen.getByLabelText(/변경 사유/) as HTMLInputElement).value).toBe('내 대상 수정'); expect(screen.getByRole('button', { name: 'ROBOT/MOVE 빼기' })).toBeTruthy(); });

  it('carries unchanged subjects by omission on revise', async () => { mount('', <ItemWriteDrawer target={{ mode: 'revise', detail, viewedRevisionNo: null, onReload: vi.fn() }} onClose={vi.fn()} />); fireEvent.change(await screen.findByLabelText(/변경 사유/), { target: { value: '문구 보완' } }); fireEvent.click(screen.getByRole('button', { name: '새 리비전 저장' })); await waitFor(() => expect(writes).toHaveLength(1)); expect(writes[0]?.input).not.toHaveProperty('subjects'); });
  it('sends an explicit empty subjects list after removing the last target', async () => { mount('', <ItemWriteDrawer target={{ mode: 'revise', detail, viewedRevisionNo: null, onReload: vi.fn() }} onClose={vi.fn()} />); fireEvent.click(await screen.findByRole('button', { name: 'ROBOT/MOVE 빼기' })); fireEvent.change(screen.getByLabelText(/변경 사유/), { target: { value: '연결 제거' } }); fireEvent.click(screen.getByRole('button', { name: '새 리비전 저장' })); await waitFor(() => expect(writes[0]?.input).toHaveProperty('subjects', [])); });
});
