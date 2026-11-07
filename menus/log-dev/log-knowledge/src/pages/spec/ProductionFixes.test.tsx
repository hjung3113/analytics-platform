// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { type ApiResponse, type ActionResponse, type MenuQuery, type MenuAction } from '@ap/contracts';
import { useI18n, usePlatform } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { Button, buttonVariants } from '@ap/ui';
import { stubCompactTableGeometry } from '@ap/components/testing';
import type { ConceptMappingRow, ConceptSuggestion, ItemDetail, ItemSubject, ModelSpecData } from '../../endpoints';
import SpecScreen from './SpecScreen';
import { SubjectPicker } from '../items/ItemSubjects';
import { ItemWriteDrawer } from '../items/ItemWriteDrawer';
import type { SubjectPick } from '../items/subjectModel';
import { knowledgeRegistry, mountWith } from '../test-support';
const modelId = '00000003-0000-4000-8000-000000000008', other = '00000003-0000-4000-8000-000000000009';
const registry = knowledgeRegistry(['knowledge:catalog-manage', 'knowledge:spec-publish', 'knowledge:item-publish'], { description: { ko: '로그', en: 'Log' }, homeMenuId: 'log-knowledge-models' });
const spec: ModelSpecData = { revision: { id: 'r', modelId, revisionNo: 1, state: 'published', schemaVersion: 1, sourceDocRef: { docLabel: 'Spec', docVersion: '1' }, contentSha256: null, publishedAt: null, publishedBy: null }, modules: [{ id: 'm', moduleKey: 'ROBOT', name: 'Robot', parentModuleId: null }], events: [{ id: 'e', moduleId: 'm', eventKey: 'MOVE', name: 'Move', fields: [], triggerRule: 'On move', detailDocRef: null }], relations: [] };
const mapping = (id: string, patch: Partial<ConceptMappingRow> = {}): ConceptMappingRow => ({ id, conceptId: 'c', conceptLabel: '로봇 이동', kind: 'event', modelId, modelName: 'A-100', targetKind: 'event', targetKey: 'ROBOT/MOVE', targetName: 'Move', targetState: 'present', relationKind: 'equivalent', reviewState: 'proposed', origin: 'similarity', similarityScore: 1, similarityBasis: { name_trgm: 1 }, rejectReason: null, proposedBy: 'admin', proposedAt: '2026-11-01T00:00:00Z', reviewedBy: null, reviewedAt: null, version: 1, ...patch });
const ok = (data: unknown) => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'fix-test' }) as ApiResponse<never>;
let rows: ConceptMappingRow[], suggestions: ConceptSuggestion[], reads: MenuQuery[], writes: MenuAction[], allowed: boolean, failure: string | null, writeOutcome: string, restore: () => void;
beforeEach(() => { rows = [mapping('a'), mapping('b', { modelId: other, modelName: 'B-10' }), mapping('z', { conceptId: 'd', conceptLabel: '다른 개념' })]; suggestions = []; reads = []; writes = []; allowed = true; failure = null; writeOutcome = 'ok'; restore = stubCompactTableGeometry(); HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { cleanup(); restore(); vi.restoreAllMocks(); });
function Language({ lang }: { lang: 'ko' | 'en' }) { const { setLang } = useI18n(); useEffect(() => setLang(lang), [lang, setLang]); return null; }
function mount(search = '&tab=concept', child?: React.ReactNode, lang: 'ko' | 'en' = 'ko') {
  window.history.replaceState(null, '', `/logDev/log-knowledge-spec/${modelId}?v=1&scopeId=MEM${search}`);
  const session = testSession(['platform:view', ...(allowed ? ['knowledge:spec-publish' as const, 'knowledge:item-publish' as const] : [])]);
  const adapter = testAdapter({ session: () => session, menuQuery: async req => {
    reads.push(req); const p = req.params as Record<string, string | number>;
    if (req.endpoint === 'logKnowledge.modelSpec') return ok(spec);
    if (req.endpoint === 'logKnowledge.conceptSuggestions') return ok({ rows: suggestions, total: suggestions.length });
    if (req.endpoint === 'logKnowledge.conceptMappings') {
      if (failure === 'loading') return new Promise(() => {});
      if (failure) return { ...ok(null), outcome: failure } as ApiResponse<never>;
      const found = rows.filter(r => (!p.modelId || r.modelId === p.modelId) && (!p.conceptId || r.conceptId === p.conceptId));
      return ok({ rows: found.slice(Number(p.page) * Number(p.pageSize), (Number(p.page) + 1) * Number(p.pageSize)), total: found.length });
    }
    return ok({ rows: [], total: 0 });
  }, menuAction: async req => {
    writes.push(req);
    if (writeOutcome !== 'ok') return { outcome: writeOutcome, fieldErrors: writeOutcome === 'invalid' ? [{ path: ['subjects', 0, 'target'], code: 'not_found' }] : [] } as unknown as ActionResponse<never>;
    const input = req.input as { mappingId?: string; reason?: string; canonicalLabel?: string };
    if (req.action === 'logKnowledge.conceptPropose') rows = [...rows, mapping('new', { conceptId: 'new-c', conceptLabel: input.canonicalLabel ?? '새 제안' })];
    rows = rows.map(r => r.id === input.mappingId ? { ...r, reviewState: req.action.endsWith('Reject') ? 'rejected' : 'confirmed', rejectReason: input.reason ?? null } : r);
    return { outcome: 'ok', data: { conceptId: 'c', mappingId: 'a' }, fieldErrors: [] } as unknown as ActionResponse<never>;
  } });
  return mountWith({ registry, adapter, ui: child ?? <SpecScreen params={{ modelId }} />, slot: true, head: <Language lang={lang} /> });
}
function OpenEvent() { const { setPage } = usePlatform(); return <Button onClick={() => setPage({ tab: 'spec', event: 'ROBOT/MOVE', drawer: 'event' })}>Open Event</Button>; }
function Picker() { const [picks, setPicks] = useState<SubjectPick[]>([{ kind: 'event', key: 'ROBOT/MOVE', relation: 'about' }]); return <SubjectPicker modelId={modelId} picks={picks} onChange={setPicks} />; }
const subjects: ItemSubject[] = [{ modelId, modelName: 'A-100', targetKind: 'event', targetKey: 'ROBOT/GHOST', targetName: null, state: 'gone', subjectRelation: 'about', specRevNoAtLink: 1 }, { modelId, modelName: 'A-100', targetKind: 'event', targetKey: 'ROBOT/MOVE', targetName: 'Move', state: 'resolved', subjectRelation: 'about', specRevNoAtLink: 1 }];
const detail: ItemDetail = { subjects, item: { id: '00000005-0000-4000-8000-000000000001', itemNo: 1, title: '사례', typeCode: 'anomaly', owner: { kind: 'model', modelId, modelName: 'A-100' }, verificationState: 'not_checked', processingState: 'open', publicationState: 'published', latestRevisionNo: 1, updatedAt: '2026-11-01T00:00:00Z', version: '1', createdAt: '2026-11-01T00:00:00Z', createdBy: 'admin' }, revision: { revisionNo: 1, title: '사례', typeCode: 'anomaly', observation: '관찰', expected: null, analysisOpinion: null, improvement: null, evidence: [], changeNote: null, publishedAt: '2026-11-01T00:00:00Z', publishedBy: 'admin' }, revisions: [], assessments: [], links: [] };
describe('1196 production fix regressions', () => {
  it('clears the Event when changing tabs so returning to spec keeps the drawer closed', async () => {
    mount('&tab=spec&event=ROBOT%2FMOVE'); await screen.findByRole('heading', { name: 'Move' });
    fireEvent.mouseDown(screen.getByRole('tab', { name: /개념/ }), { button: 0, ctrlKey: false });
    expect(window.location.search).not.toContain('event=');
    fireEvent.mouseDown(screen.getByRole('tab', { name: '명세' }), { button: 0, ctrlKey: false }); expect(screen.getByRole('complementary').innerHTML).toBe('');
  });
  it('does not eagerly page through concepts on other tabs', async () => {
    rows = Array.from({ length: 201 }, (_, i) => mapping(`p${i}`));
    mount('&tab=spec'); await screen.findByRole('tab', { name: '명세' });
    const conceptReads = reads.filter(r => r.endpoint.includes('concept'));
    expect(conceptReads.every(r => (r.params as { pageSize: number }).pageSize === 1)).toBe(true);
    expect(conceptReads).toHaveLength(2); expect(conceptReads.every(r => (r.params as { page: number }).page === 0)).toBe(true);
  });
  it.each(['loading', 'error'])('reserves an explicit unknown tab count during %s', async state => {
    failure = state; mount(); expect(await screen.findByRole('tab', { name: '개념 (검토 대기 –건)' })).toBeTruthy();
  });
  it('loads each partner model definition once for multiple cards and pages review history', async () => {
    rows = [mapping('a'), mapping('z'), mapping('b', { modelId: other }), ...Array.from({ length: 11 }, (_, i) => mapping(`h${i}`, { reviewState: 'confirmed' }))];
    mount(); await waitFor(() => expect(screen.getAllByText('On move').length).toBeGreaterThan(2));
    const partnerReads = () => reads.filter(r => r.endpoint === 'logKnowledge.modelSpec' && (r.params as { modelId: string }).modelId === other);
    await waitFor(() => expect(partnerReads()).toHaveLength(1)); expect(partnerReads()).toHaveLength(1);
    const history = screen.getByRole('region', { name: '확정·거절 이력' }); expect(within(history).getAllByRole('article')).toHaveLength(10);
    fireEvent.click(within(history).getByRole('button', { name: '다음' })); expect(within(history).getAllByRole('article')).toHaveLength(1);
  });
  it('uses a named removable Event chip, prominent concept titles and qualitative name evidence', async () => {
    mount('&tab=concept&event=ROBOT%2FMOVE'); const card = await screen.findByRole('article', { name: '검토 a' });
    expect(screen.getByText('이벤트 · Move')).toBeTruthy(); expect(screen.getByRole('button', { name: '필터 해제' }).textContent).toBe('×');
    expect(within(card).getByRole('heading', { name: '로봇 이동' }).className).toContain('text-lg');
    expect(within(card).getByText('제안 · 사람이 확정하기 전').className).toContain('text-text-warning-label');
    expect(within(card).getByText(/이름이 같아 제안됨/)).toBeTruthy(); expect(screen.queryByText(/^검토 대기 ·/)).toBeNull();
  });
  it('explains a stale Event filter and offers to clear it', async () => {
    mount('&tab=concept&event=REMOVED%2FEVENT'); expect(await screen.findByText('이 Event에 해당하는 제안이 없습니다')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: '필터 해제' }).at(-1)!); expect(window.location.search).not.toContain('event=');
  });
  it('renders one consistent administrator permission request for a reader', async () => {
    allowed = false; mount(); await screen.findByRole('article', { name: '검토 a' });
    expect(screen.getAllByText(/명세 관리 권한을 관리자에게 요청하세요/)).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(/knowledge[.:]|platform:view/);
  });
  it.each(['confirm', 'reject'])('moves focus to the next heading and announces %s in an existing live region', async action => {
    mount(); const card = await screen.findByRole('article', { name: '검토 a' });
    const section = screen.getByRole('region', { name: '개념 매핑 검토' }), live = within(section).getByRole('status', { name: '검토 결과' });
    expect(live.textContent).toBe('');
    if (action === 'reject') { fireEvent.click(within(card).getByRole('button', { name: '거절' })); fireEvent.change(within(card).getByLabelText(/거절 사유/), { target: { value: '다른 조건' } }); }
    fireEvent.click(within(card).getByRole('button', { name: action === 'confirm' ? '같은 개념으로 확정' : '거절하기' }));
    await waitFor(() => expect(document.activeElement).toBe(within(screen.getByRole('article', { name: '검토 z' })).getByRole('heading')));
    expect(live.isConnected).toBe(true); expect(live.textContent).toContain(action === 'confirm' ? '확정했습니다' : '거절했습니다');
  });
  it('shows conflict recovery as small secondary and preserves the typed reason', async () => {
    writeOutcome = 'conflict'; mount(); const card = await screen.findByRole('article', { name: '검토 a' });
    fireEvent.click(within(card).getByRole('button', { name: '거절' })); fireEvent.change(within(card).getByLabelText(/거절 사유/), { target: { value: '유지할 사유' } });
    fireEvent.click(within(card).getByRole('button', { name: '거절하기' })); const reload = await within(card).findByRole('button', { name: '최신 불러오기' });
    expect(reload.className).toBe(buttonVariants({ variant: 'secondary', size: 'sm' }));
    fireEvent.click(reload); await waitFor(() => expect((within(card).getByLabelText(/거절 사유/) as HTMLInputElement).value).toBe('유지할 사유'));
  });
  it('keeps the Event footer compact and the form in the body, with cancel/focus return and empty details', async () => {
    rows = []; mount('&tab=spec&event=ROBOT%2FMOVE'); const drawer = await screen.findByRole('complementary');
    const toggle = within(drawer).getByRole('button', { name: '개념 제안' }); fireEvent.click(toggle);
    const form = within(drawer).getByRole('region', { name: '개념 제안 양식' });
    expect(form.closest('[data-slot="drawer-footer"]')).toBeNull();
    expect(within(drawer).getByText('이 Event의 제안 없음')).toBeTruthy(); expect(within(drawer).getByText('정의된 필드가 없습니다.')).toBeTruthy();
    expect(within(drawer).getByRole('heading', { name: '대상 키' })).toBeTruthy(); expect(within(drawer).getByText('정의된 관계가 없습니다.')).toBeTruthy(); expect(within(drawer).queryByText('[]')).toBeNull();
    fireEvent.click(within(form).getByRole('button', { name: '취소' })); expect(document.activeElement).toBe(toggle);
  });
  it('uses existing live regions for proposal errors and success and returns focus on save', async () => {
    rows = []; writeOutcome = 'error'; mount('&tab=spec&event=ROBOT%2FMOVE'); const drawer = await screen.findByRole('complementary');
    const toggle = within(drawer).getByRole('button', { name: '개념 제안' });
    const live = within(drawer).getAllByRole('status').find(el => el.getAttribute('aria-live') === 'polite')!;
    const error = within(drawer).getByRole('alert'); expect(error.textContent).toBe(''); expect(live.textContent).toBe('');
    fireEvent.click(toggle); fireEvent.change(within(drawer).getByLabelText(/새 개념 이름/), { target: { value: '개념 이름' } });
    fireEvent.click(within(drawer).getByRole('button', { name: '제안 추가' }));
    await waitFor(() => expect(error.textContent).toContain('제안을 저장하지 못했습니다'));
    expect((within(drawer).getByLabelText(/새 개념 이름/) as HTMLInputElement).value).toBe('개념 이름');
    writeOutcome = 'ok'; fireEvent.click(within(drawer).getByRole('button', { name: '제안 추가' }));
    await waitFor(() => expect(live.textContent).toContain('제안을 추가했습니다'));
    expect(live.isConnected).toBe(true); expect(error.isConnected).toBe(true); expect(document.activeElement).toBe(toggle);
  });
  it('returns focus to the section heading when the last proposal is reviewed', async () => {
    rows = [mapping('a')]; mount(); const card = await screen.findByRole('article', { name: '검토 a' });
    fireEvent.click(within(card).getByRole('button', { name: '같은 개념으로 확정' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: '개념 매핑 검토' })));
  });
  it('refreshes bounded counts and the later concept queue after a proposal is added from the drawer', async () => {
    // Load the full review first so the spec tab has an accepted snapshot to invalidate.
    rows = []; mount('&tab=concept', <><SpecScreen params={{ modelId }} /><OpenEvent /></>); await screen.findByText('개념 제안이 없습니다');
    fireEvent.click(screen.getByRole('button', { name: 'Open Event' }));
    fireEvent.click(await screen.findByRole('button', { name: '개념 제안' }));
    fireEvent.change(screen.getByLabelText(/새 개념 이름/), { target: { value: '새 개념' } });
    fireEvent.click(screen.getByRole('button', { name: '제안 추가' })); await screen.findByText('제안을 추가했습니다. 아직 확정되지 않았습니다.');
    await waitFor(() => expect(screen.getByRole('tab', { name: '개념 (검토 대기 1건)' })).toBeTruthy());
    fireEvent.mouseDown(screen.getByRole('tab', { name: /개념/ }), { button: 0, ctrlKey: false });
    expect(await screen.findByRole('article', { name: '검토 new' })).toBeTruthy();
  });
  it('announces picker matches and lays out readable selections before candidates with kind-specific add names', async () => {
    mount('', <Picker />); const search = await screen.findByLabelText('대상 검색'), selected = screen.getByRole('region', { name: '선택한 대상 1' });
    expect(selected.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(selected).getByText('Move')).toBeTruthy(); expect(within(selected).getByText('Event')).toBeTruthy();
    expect(within(selected).getByRole('combobox', { name: 'ROBOT/MOVE 관계' })).toBeTruthy();
    expect(within(selected).queryByText('ROBOT/MOVE 관계')).toBeNull(); expect(within(selected).getByRole('button', { name: 'ROBOT/MOVE 빼기' }).className).toBe(buttonVariants({ variant: 'secondary', size: 'sm' }));
    expect(screen.getByRole('button', { name: '모듈 · Robot 추가' })).toBeTruthy(); expect(screen.getByRole('button', { name: 'Event · Move 추가' })).toBeTruthy();
    fireEvent.change(search, { target: { value: 'MOVE' } }); await waitFor(() => expect(screen.getByRole('status', { name: '검색 결과 수' }).textContent).toBe('검색 결과 1개'));
  });
  it.each(['ko', 'en'] as const)('labels gone subjects and explains blocked saves in %s', async lang => {
    mount('', <ItemWriteDrawer target={{ mode: 'revise', detail, viewedRevisionNo: null, onReload: vi.fn() }} onClose={vi.fn()} />, lang);
    expect(await screen.findByText(lang === 'ko' ? '대상 사라짐' : 'Target gone')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `ROBOT/MOVE ${lang === 'ko' ? '빼기' : 'Remove'}` }));
    fireEvent.change(screen.getByLabelText(/변경 사유/), { target: { value: '대상 변경' } }); fireEvent.click(screen.getByRole('button', { name: '새 리비전 저장' }));
    expect(await screen.findByText(lang === 'ko' ? '대상 목록을 바꾸려면 사라진 대상을 먼저 빼 주세요.' : 'Remove missing targets before changing the subject list.')).toBeTruthy(); expect(writes).toHaveLength(0);
  });
  it('localizes subject validation errors in English', async () => {
    writeOutcome = 'invalid'; mount('', <ItemWriteDrawer target={{ mode: 'revise', detail: { ...detail, subjects: [] }, viewedRevisionNo: null, onReload: vi.fn() }} onClose={vi.fn()} />, 'en');
    fireEvent.change(await screen.findByLabelText(/변경 사유/), { target: { value: 'reason' } }); fireEvent.click(screen.getByRole('button', { name: '새 리비전 저장' }));
    expect(await screen.findByText('Not in the current specification.')).toBeTruthy();
  });
});

describe('1196s4 selected subject row regression', () => {
  it('keeps key, kind, readable name, relation and remove in one non-wrapping row and titles only overflowed names', async () => {
    mount('', <Picker />);
    const selected = await screen.findByRole('region', { name: '선택한 대상 1' });
    const key = within(selected).getByText('ROBOT/MOVE'), name = within(selected).getByText('Move');
    const row = key.parentElement!;
    expect([...row.children].map(el => el.textContent)).toEqual(['ROBOT/MOVE', 'Event', 'Move', '직접 다루는 대상', '빼기']);
    expect(row.className).not.toContain('flex-wrap');
    expect(name.className).toContain('truncate'); expect(name.hasAttribute('title')).toBe(false);
    Object.defineProperties(name, { clientWidth: { configurable: true, value: 20 }, scrollWidth: { configurable: true, value: 60 } });
    fireEvent(window, new Event('resize'));
    await waitFor(() => expect(name.getAttribute('title')).toBe('Move'));
    Object.defineProperty(name, 'clientWidth', { configurable: true, value: 80 });
    fireEvent(window, new Event('resize'));
    await waitFor(() => expect(name.hasAttribute('title')).toBe(false));
  });
  it('puts a gone-target hint under the row without consuming its key/name/control columns', async () => {
    mount('', <ItemWriteDrawer target={{ mode: 'revise', detail, viewedRevisionNo: null, onReload: vi.fn() }} onClose={vi.fn()} />);
    const key = await screen.findByText('ROBOT/GHOST'), hint = screen.getByText('대상 목록을 바꾸려면 이 대상을 빼 주세요.');
    expect(key.parentElement!.contains(hint)).toBe(false);
    expect(key.closest('li')!.contains(hint)).toBe(true);
  });
  it('does not emit duplicate row-key warnings when opening the Event drawer', async () => {
    const error = vi.spyOn(console, 'error'); mount('&tab=spec&event=ROBOT%2FMOVE');
    await screen.findByRole('heading', { name: 'Move' });
    expect(error.mock.calls.filter(args => args.some(value => String(value).includes('same key')))).toEqual([]);
  });
});
