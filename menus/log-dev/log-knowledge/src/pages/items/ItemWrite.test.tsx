// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act as rtlAct, act as reactAct, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { usePlatform } from '@ap/kernel';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { encodeFilterParams, type ActionResponse, type ApiResponse, type ColumnFilter, type FieldError, type MenuAction, type MenuQuery } from '@ap/contracts';
import { CATALOG_MANAGE_PERMISSION, type ItemAssessment, type ItemDetail as ItemDetailData, type ItemLinkRow, type ItemOwner, type ItemRevision, type ItemRow } from '../../endpoints';
import ModelProfile from '../models/ModelProfile';
import ItemDetail from './ItemDetail';
import ItemList from './ItemList';
import { knowledgeRegistry, treeWith } from '../test-support';

const registry = knowledgeRegistry(['knowledge:catalog-manage', 'knowledge:item-publish'], { description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'log-knowledge-catalog', permission: CATALOG_MANAGE_PERMISSION });
const user = { id: 'admin', name: 'admin', title: { ko: '관리자', en: 'Admin' } };
const publisher = testSession(['knowledge:catalog-manage', 'knowledge:item-publish', 'platform:view'], { user });
const reader = testSession(['knowledge:catalog-manage', 'platform:view'], { user });
let session = publisher;
const ok = (data: unknown): ApiResponse<never> => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'fixture' }) as ApiResponse<never>;

// ---- a small stateful server: what the item actions and reads answer (hand-written; a menu screen test does not import the mock) ----
const uuid = (kind: number, n: number) => `0000000${kind}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const MODEL_A = uuid(3, 1), MODEL_B = uuid(3, 2), SW_A1 = uuid(4, 1), SW_A2 = uuid(4, 2), SW_B1 = uuid(4, 3);
const MODEL_OFF = uuid(3, 9);
const MODELS: { id: string; code: string; name: string; active: boolean }[] = [{ id: MODEL_A, code: 'A-100', name: 'Alpha 100', active: true }, { id: MODEL_B, code: 'B-10', name: 'Beta 10', active: true }, { id: MODEL_OFF, code: 'Z-30', name: 'Zeta 30', active: false }];
const SOFTWARE = [
  { id: SW_A1, modelId: MODEL_A, code: 'v1.0', versionLabel: 'v1.0', name: '', active: true }, { id: SW_A2, modelId: MODEL_A, code: 'v2.0', versionLabel: 'v2.0', name: 'Major', active: true },
  { id: SW_B1, modelId: MODEL_B, code: 'v9.0', versionLabel: 'v9.0', name: '', active: true },
];
const modelOwner = (id: string): ItemOwner => ({ kind: 'model', modelId: id, modelName: MODELS.find(m => m.id === id)!.name });
const swOwner = (id: string): ItemOwner => { const s = SOFTWARE.find(x => x.id === id)!; return { kind: 'software', modelId: s.modelId, modelName: MODELS.find(m => m.id === s.modelId)!.name, softwareId: s.id, versionLabel: s.versionLabel }; };

type Rec = {
  id: string; itemNo: number; owner: ItemOwner; version: number; verification: string; processing: string; publication: string;
  createdAt: string; updatedAt: string; revisions: ItemRevision[]; assessments: ItemAssessment[]; links: ItemLinkRow[];
};
let clock = 0;
const tick = () => new Date(Date.UTC(2026, 9, 1, 9, 0, 0) + (clock += 60_000)).toISOString();
const revision = (n: number, patch: Partial<ItemRevision> = {}): ItemRevision => ({
  revisionNo: n, title: `제목 r${n}`, typeCode: 'anomaly', observation: `관찰 r${n}`, expected: '기대 기준', analysisOpinion: '재시작 탓으로 보임', improvement: '규칙 추가',
  changeNote: n === 1 ? null : `${n}차 보완`, publishedBy: 'actor-aaaa-1111', publishedAt: tick(),
  evidence: [{ ordinal: 1, sourceKind: 'log_file', sourceOwner: 'MARS', sourceRef: 'logs/a.log', sourceVersion: null, contentHash: null, locator: null, note: null }], ...patch,
});
let store: Rec[] = [];
let writes: MenuAction[] = [];
let queries: MenuQuery[] = [];
let failLatest = false;
let profileActive = true;
let nextError: { outcome: 'invalid'; fieldErrors: FieldError[] } | { outcome: 'conflict' } | null = null;
function seed() {
  clock = 0;
  const base = { version: 1, verification: 'observed', processing: 'open', publication: 'published', assessments: [], links: [] };
  store = [
    { ...base, id: uuid(5, 1), itemNo: 1, owner: modelOwner(MODEL_A), createdAt: tick(), updatedAt: tick(), revisions: [revision(1, { title: '챔버 압력 로그 지연' }), revision(2, { title: '챔버 압력 로그 지연 (보완)' })], assessments: [
      { id: 'a-1', dimension: 'verification', priorState: 'not_checked', newState: 'observed', rationale: '현장 확인', actorId: 'actor-bbbb-2222', basedOnRevisionNo: 1, observedAt: tick() }] },
    { ...base, id: uuid(5, 2), itemNo: 2, owner: swOwner(SW_A1), createdAt: tick(), updatedAt: tick(), revisions: [revision(1, { title: 'SW 소유 사례' })] },
    { ...base, id: uuid(5, 3), itemNo: 3, owner: modelOwner(MODEL_B), createdAt: tick(), updatedAt: tick(), revisions: [revision(1, { title: '다른 모델 사례' })] },
  ];
}
const recOf = (id: unknown) => store.find(r => r.id === id);
const rowOf = (r: Rec): ItemRow => ({ id: r.id, itemNo: r.itemNo, title: r.revisions.at(-1)!.title, typeCode: r.revisions.at(-1)!.typeCode, owner: r.owner, verificationState: r.verification as ItemRow['verificationState'], processingState: r.processing as ItemRow['processingState'], publicationState: r.publication as ItemRow['publicationState'], latestRevisionNo: r.revisions.length, updatedAt: r.updatedAt });
function detailOf(r: Rec, revisionNo?: number): ItemDetailData | null {
  const rev = r.revisions.find(x => x.revisionNo === (revisionNo ?? r.revisions.length));
  if (!rev) return null;
  return {
    subjects: [],
    relations: [],
    item: { ...rowOf(r), version: String(r.version), createdBy: 'actor-aaaa-1111', createdAt: r.createdAt }, revision: rev,
    revisions: [...r.revisions].reverse().map(x => ({ revisionNo: x.revisionNo, title: x.title, publishedBy: x.publishedBy, publishedAt: x.publishedAt, changeNote: x.changeNote })),
    assessments: [...r.assessments].reverse(), links: r.links,
  };
}
type Cond = { value?: string[] } | undefined;
const cond = (filters: ColumnFilter[] | undefined, id: string) => filters?.find(f => f.id === id) as Cond;
function listOf(p: { q?: string | null; filters?: ColumnFilter[]; page?: number; pageSize?: number }) {
  const published = cond(p.filters, 'publicationState')?.value ?? ['published'];
  const owners = cond(p.filters, 'ownerModelId')?.value;
  const withSoftware = cond(p.filters, 'includeSoftware')?.value?.[0] === 'true';
  const rows = store.filter(r => published.includes(r.publication) && (!owners || (owners.includes(r.owner.modelId) && (r.owner.kind === 'model' || withSoftware))))
    .map(rowOf).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const size = p.pageSize ?? 25;
  return { rows: rows.slice((p.page ?? 0) * size, ((p.page ?? 0) + 1) * size), total: rows.length };
}
const body = (i: Record<string, unknown>) => (typeof i.observation === 'string' && i.observation.trim() !== '' ? i.observation : null);
const contentOf = (i: Record<string, unknown>) => ({
  title: String(i.title), typeCode: i.typeCode as ItemRevision['typeCode'], observation: body(i), expected: typeof i.expected === 'string' && i.expected.trim() !== '' ? i.expected : null,
  analysisOpinion: (i.analysisOpinion as string | null) ?? null, improvement: (i.improvement as string | null) ?? null,
});
function insert(i: Record<string, unknown>, evidence: ItemRevision['evidence']): Rec {
  const owner = i.ownerSoftwareId ? swOwner(String(i.ownerSoftwareId)) : modelOwner(String(i.ownerModelId));
  const rec: Rec = { id: uuid(5, 100 + store.length), itemNo: store.length + 1, owner, version: 1, verification: 'not_checked', processing: 'open', publication: 'published', createdAt: tick(), updatedAt: tick(), revisions: [], assessments: [], links: [] };
  rec.revisions.push({ ...revision(1, contentOf(i)), changeNote: null, evidence });
  store.push(rec);
  return rec;
}
const done = (data: unknown, version: string | null = '1'): ActionResponse<never> => ({ outcome: 'ok', data, version, fieldErrors: [], replayed: false, correlationId: 'fixture' }) as ActionResponse<never>;
function act(req: MenuAction): ActionResponse<never> {
  const i = req.input as Record<string, unknown>;
  if (nextError) { const e = nextError; nextError = null; return { ...done(null, null), outcome: e.outcome, fieldErrors: e.outcome === 'invalid' ? e.fieldErrors : [] } as ActionResponse<never>; }
  const rec = recOf(i.id);
  if (req.action !== 'logKnowledge.itemCreate' && req.action !== 'logKnowledge.itemDerive') {
    if (!rec) return { ...done(null, null), outcome: 'not_found' } as ActionResponse<never>;
    if (req.expectedVersion !== String(rec.version)) return { ...done(null, String(rec.version)), outcome: 'conflict' } as ActionResponse<never>;
  }
  switch (req.action) {
    case 'logKnowledge.itemCreate': { const r = insert(i, ((i.evidence as ItemRevision['evidence']) ?? []).map((e, n) => ({ ...e, ordinal: n + 1 }))); return done({ id: r.id, itemNo: r.itemNo }); }
    case 'logKnowledge.itemDerive': {
      const source = recOf(i.sourceItemId)!;
      const r = insert(i, []);
      r.links.push({ kind: 'derived_from', direction: 'outgoing', itemId: source.id, itemNo: source.itemNo, title: source.revisions.at(-1)!.title, owner: source.owner, sourceRevisionNo: Number(i.sourceRevisionNo) });
      return done({ id: r.id, itemNo: r.itemNo });
    }
    case 'logKnowledge.itemRevise': {
      rec!.revisions.push({ ...revision(rec!.revisions.length + 1, contentOf(i)), changeNote: String(i.changeNote), evidence: ((i.evidence as ItemRevision['evidence']) ?? []).map((e, n) => ({ ...e, ordinal: n + 1 })) });
      rec!.version += 1; rec!.updatedAt = tick();
      return done({ id: rec!.id, itemNo: rec!.itemNo, revisionNo: rec!.revisions.length }, String(rec!.version));
    }
    case 'logKnowledge.itemAssess': {
      const dim = i.dimension as 'verification' | 'processing';
      rec!.assessments.push({ id: `a-${rec!.assessments.length + 1}`, dimension: dim, priorState: rec![dim], newState: String(i.newState), rationale: String(i.rationale), actorId: 'actor-bbbb-2222', basedOnRevisionNo: rec!.revisions.length, observedAt: tick() });
      rec![dim] = String(i.newState); rec!.version += 1; rec!.updatedAt = tick();
      return done({ id: rec!.id, itemNo: rec!.itemNo }, String(rec!.version));
    }
    default: { rec!.publication = i.archived ? 'archived' : 'published'; rec!.version += 1; rec!.updatedAt = tick(); return done({ id: rec!.id, itemNo: rec!.itemNo }, String(rec!.version)); }
  }
}
/** While set, every itemDetail read waits for it (#1365: the window between a revision pick and its reply). */
let holdDetail: Promise<void> | null = null;
const adapter = testAdapter({
  menuQuery: async (req: MenuQuery) => {
    queries.push(req);
    const p = req.params as { itemId?: string; revisionNo?: number; q?: string | null; page?: number; pageSize?: number; filters?: ColumnFilter[] };
    if (req.endpoint === 'logKnowledge.itemDetail') { if (holdDetail) await holdDetail; if (failLatest && p.revisionNo === undefined) return { outcome: 'error', message: 'boom' } as unknown as ApiResponse<never>; const r = recOf(p.itemId); return ok(r ? detailOf(r, p.revisionNo) : null); }
    if (req.endpoint === 'logKnowledge.items') return ok(listOf(p));
    if (req.endpoint === 'logKnowledge.models' || req.endpoint === 'logKnowledge.softwareVersions') {
      const pool: Record<string, unknown>[] = req.endpoint === 'logKnowledge.models' ? MODELS : SOFTWARE;
      const byId = cond(p.filters, 'id')?.value, byModel = cond(p.filters, 'modelId')?.value, byActive = cond(p.filters, 'active')?.value;
      const q = (p.q ?? '').toLowerCase();
      const rows = pool.filter(r => (!byId || byId.includes(r.id as string)) && (!byModel || byModel.includes(r.modelId as string)) && (!byActive || byActive.includes(String(r.active))) && (q === '' || `${r.code} ${r.name}`.toLowerCase().includes(q)))
        .map(r => ({ ...r, active: r.active ?? true, version: '1', createdAt: tick(), updatedAt: tick() }));
      const size = p.pageSize ?? 200, at = (p.page ?? 0) * size;
      return ok({ rows: rows.slice(at, at + size), total: rows.length });
    }
    if (req.endpoint === 'logKnowledge.modelProfile') {
      return ok({ model: { id: MODEL_A, code: 'A-100', name: 'Alpha 100', active: profileActive, vendor: { id: 'v', code: 'V', name: 'Alpha Semicap', active: true }, processes: [], createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' },
        softwareVersions: [], truncated: false, modelItems: { total: 0 } });
    }
    if (req.endpoint === 'logKnowledge.modelTopView') return ok({ target: null, resolved: null, links: [], softwareOptions: [] });
    if (req.endpoint === 'logKnowledge.topViewRevisionOptions') return ok({ rows: [] });
    return ok({ rows: [], total: 0 });
  },
  menuAction: async (req: MenuAction) => { writes.push(req); return act(req); },
  session: () => session,
});

let restoreGeometry: () => void;
beforeEach(() => { holdDetail = null; seed(); failLatest = false; profileActive = true; MODELS.length = 3; writes = []; queries = []; nextError = null; session = publisher; restoreGeometry = stubCompactTableGeometry(); });
afterEach(() => { cleanup(); restoreGeometry(); vi.restoreAllMocks(); });

const tree = (ui: React.ReactNode, selected = adapter) => treeWith({ registry, adapter: selected, ui, slot: true, slotLabel: '상세 패널' });
/** The two item routes, switched by the address like the app's router: a write that navigates (create, derive) lands on the new item's detail. */
function Routes() {
  const { pathname } = usePlatform();
  const itemId = /\/(?:items|log-knowledge-item)\/([^/?]+)$/.exec(pathname)?.[1];
  return itemId ? <ItemDetail key={itemId} params={{ itemId }} /> : <ItemList />;
}
function mountList(search = '') {
  window.history.replaceState(null, '', `/log/knowledge/items?v=1${search}`);
  render(tree(<Routes />));
}
function mountDetail(itemId: string, search = '') {
  window.history.replaceState(null, '', `/log/knowledge/items/${itemId}?v=1${search}`);
  render(tree(<ItemDetail params={{ itemId }} />));
}
function mountProfile() {
  window.history.replaceState(null, '', `/log/knowledge/models/${MODEL_A}?v=1`);
  render(tree(<ModelProfile params={{ modelId: MODEL_A }} />));
}
const url = () => new URLSearchParams(window.location.search);
const slow = { timeout: 8000 };
vi.setConfig({ testTimeout: 30000 });
const published = encodeFilterParams([{ id: 'publicationState', op: 'in', value: ['published'] }]).map(f => `&filter=${encodeURIComponent(f)}`).join('');
const drawer = () => screen.getByRole('complementary', { name: '상세 패널' });
const field = (label: RegExp) => within(drawer()).getByLabelText(label);
const type = (label: RegExp, value: string) => fireEvent.change(field(label), { target: { value } });
const submit = (name: string) => fireEvent.click(within(drawer()).getByRole('button', { name }));
const ITEM = (n: number) => uuid(5, n);
const lastWrite = () => writes.at(-1);
const input = () => lastWrite()?.input as Record<string, unknown>;
const pick = async (comboboxIndex: number, name: string | RegExp) => {
  fireEvent.click(within(drawer()).getAllByRole('combobox')[comboboxIndex]!);
  fireEvent.click(await screen.findByRole('option', { name }, slow));
};

const DRAWER_TITLES = ['기술 Item 수정', '판단 변경', '관련 Item으로 신규 작성'];
const WRITE_ACTIONS = /^(보관|보관 해제|판단 변경|관련 Item으로 신규 작성)$/;

describe('write controls follow the publish right', () => {
  it('a viewer sees no write affordance on the list, the detail (header, ⋯ menu, drawer URLs) or the profile', async () => {
    session = reader;
    mountList(`${published}&focus=new`);
    await screen.findByText('KI-1', {}, slow);
    expect(screen.queryByRole('button', { name: /새 기술 Item/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: '새 기술 Item' })).toBeNull();
    expect(screen.queryByRole('button', { name: '등록' })).toBeNull();
    cleanup();
    for (const drawerKind of ['revise', 'assess', 'derive']) {
      mountDetail(ITEM(1), `&drawer=${drawerKind}`);
      await screen.findByRole('heading', { level: 1, name: /챔버 압력/ }, slow);
      expect(screen.queryByRole('button', { name: '수정' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: '더보기' }));
      await waitFor(() => expect(screen.getByRole('button', { name: '더보기' }).getAttribute('aria-expanded')).toBe('true'));
      expect(screen.queryAllByRole('button').filter(b => WRITE_ACTIONS.test(b.textContent?.trim() ?? ''))).toEqual([]);
      for (const title of DRAWER_TITLES) expect(screen.queryByRole('heading', { name: title })).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByRole('button', { name: /새 리비전 저장|판단 변경$|관련 Item 작성/ })).toBeNull();
      cleanup();
    }
    mountProfile();
    await screen.findByRole('heading', { level: 1, name: 'Alpha 100' }, slow);
    expect(screen.queryByRole('link', { name: /새 기술 Item/ })).toBeNull();
  });

  it('a publisher gets the same surfaces (so the viewer assertions above can fail)', async () => {
    mountDetail(ITEM(1), '&drawer=revise');
    expect(await screen.findByRole('heading', { name: '기술 Item 수정' }, slow)).toBeTruthy();
    expect(within(drawer()).getByRole('button', { name: '새 리비전 저장' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    expect(await screen.findByRole('button', { name: '보관' }, slow)).toBeTruthy();
    expect(screen.getByRole('button', { name: '판단 변경' })).toBeTruthy();
  });
});

describe('새 기술 Item (create)', () => {
  it('opens from the primary button into the address (focus=new) and keeps the drawer through a remount', async () => {
    mountList(published);
    fireEvent.click(await screen.findByRole('button', { name: /새 기술 Item/ }, slow));
    await waitFor(() => expect(url().get('focus')).toBe('new'));
    expect(await screen.findByRole('heading', { name: '새 기술 Item' }, slow)).toBeTruthy();
    cleanup();
    mountList(`${published}&focus=new`);
    expect(await screen.findByRole('heading', { name: '새 기술 Item' }, slow)).toBeTruthy();
  });

  it('creates a model-owned item and goes to its detail', async () => {
    mountList(`${published}&focus=new&owner=${MODEL_A}`);
    await screen.findByRole('heading', { name: '새 기술 Item' }, slow);
    await waitFor(() => expect(within(drawer()).getAllByRole('combobox')[0]!.textContent).toContain('Alpha 100'), slow);
    type(/^제목/, '새 사례');
    type(/^관찰 사실/, '무엇이 보였다');
    submit('등록');
    await waitFor(() => expect(writes).toHaveLength(1), slow);
    expect(lastWrite()?.action).toBe('logKnowledge.itemCreate');
    expect(input()).toMatchObject({ ownerModelId: MODEL_A, title: '새 사례', observation: '무엇이 보였다', typeCode: 'anomaly', evidence: [] });
    expect(input()).not.toHaveProperty('ownerSoftwareId');
    await waitFor(() => expect(window.location.pathname).toContain(`/${store.at(-1)!.id}`), slow);
    expect(await screen.findByRole('heading', { level: 1, name: '새 사례' }, slow)).toBeTruthy();
  });

  it('creates an SW-owned item: the SW picker lists only that model\'s versions and resets when the model changes', async () => {
    mountList(`${published}&focus=new`);
    await screen.findByRole('heading', { name: '새 기술 Item' }, slow);
    fireEvent.click(within(drawer()).getByRole('radio', { name: 'SW 버전' }));
    await pick(0, /Alpha 100/);
    await pick(1, /v2\.0/);
    expect(queries.some(q => q.endpoint === 'logKnowledge.softwareVersions' && JSON.stringify((q.params as { filters: unknown }).filters).includes(MODEL_A))).toBe(true);
    expect(screen.queryByRole('option', { name: /v9\.0/ })).toBeNull();
    // Changing the model clears the chosen SW version.
    await pick(0, /Beta 10/);
    await waitFor(() => expect(within(drawer()).getAllByRole('combobox')[1]!.textContent).not.toContain('v2.0'), slow);
    await pick(1, /v9\.0/);
    type(/^제목/, 'SW 사례');
    type(/^기대·기준/, '이래야 한다');
    submit('등록');
    await waitFor(() => expect(writes).toHaveLength(1), slow);
    expect(input()).toMatchObject({ ownerSoftwareId: SW_B1, title: 'SW 사례', expected: '이래야 한다' });
    expect(input()).not.toHaveProperty('ownerModelId');
  });

  it('refuses a missing title, a missing fact and a missing owner before any write', async () => {
    mountList(`${published}&focus=new`);
    await screen.findByRole('heading', { name: '새 기술 Item' }, slow);
    submit('등록');
    expect(await within(drawer()).findByText('소유 대상을 골라 주세요')).toBeTruthy();
    expect(within(drawer()).getByText('필수 항목입니다')).toBeTruthy();
    expect(within(drawer()).getByText('관찰 사실과 기대·기준 중 하나는 써야 합니다').id).toContain('observation-error');
    expect(field(/^관찰 사실/).getAttribute('aria-invalid')).toBe('true');
    expect(writes).toHaveLength(0);
  });

  it('puts a nested server error on its own evidence row and an unmapped path in a visible form error', async () => {
    mountList(`${published}&focus=new&owner=${MODEL_A}`);
    await screen.findByRole('heading', { name: '새 기술 Item' }, slow);
    type(/^제목/, '근거 사례');
    type(/^관찰 사실/, '사실');
    fireEvent.click(within(drawer()).getByRole('button', { name: '근거 추가' }));
    fireEvent.click(within(drawer()).getByRole('button', { name: '근거 추가' }));
    const refs = within(drawer()).getAllByLabelText(/^참조/), owners = within(drawer()).getAllByLabelText(/^출처 소유/);
    fireEvent.change(owners[0]!, { target: { value: 'MARS' } }); fireEvent.change(refs[0]!, { target: { value: 'a.log' } });
    fireEvent.change(owners[1]!, { target: { value: 'MARS' } }); fireEvent.change(refs[1]!, { target: { value: 'b.log' } });
    nextError = { outcome: 'invalid', fieldErrors: [{ path: ['evidence', '1', 'sourceRef'], code: 'malformed' }] };
    submit('등록');
    const message = await within(drawer()).findByText('사용할 수 없는 문자가 들어 있습니다', {}, slow);
    expect(message.id).toContain('ev-1-sourceRef-error');
    expect(within(drawer()).getAllByLabelText(/^참조/)[1]!.getAttribute('aria-invalid')).toBe('true');
    expect(within(drawer()).getAllByLabelText(/^참조/)[0]!.getAttribute('aria-invalid')).not.toBe('true');
    nextError = { outcome: 'invalid', fieldErrors: [{ path: ['owner'], code: 'required_one' }, { path: ['mystery'], code: 'required' }] };
    submit('등록');
    expect(await within(drawer()).findByText('mystery: 필수 항목입니다', {}, slow)).toBeTruthy();
    expect(within(drawer()).getByRole('combobox', { name: /소유 대상/ }).getAttribute('aria-invalid')).toBe('true');
  });
});

describe('Item 상세 수정 (revise)', () => {
  it.each(['adapter', 'session', 'revision'] as const)('drops retained title and draft across a %s generation while the replacement read is pending then denied', async change => {
    window.history.replaceState(null, '', `/log/knowledge/items/${ITEM(1)}?v=1&drawer=revise`);
    let blocked = false, notify = () => {}, deny = (_: ApiResponse<never>) => {};
    let currentSession = publisher;
    const port = testAdapter({ session: () => currentSession, subscribe: listener => { notify = listener; return () => {}; }, menuQuery: req => {
      if (req.endpoint !== 'logKnowledge.itemDetail') return Promise.resolve(ok({ rows: [], total: 0 }));
      return blocked ? new Promise(resolve => { deny = resolve; }) : Promise.resolve(ok(detailOf(store[0]!)));
    } });
    const view = (selected = port) => tree(<ItemDetail params={{ itemId: ITEM(1) }} />, selected);
    const mounted = render(view());
    await screen.findByRole('heading', { name: '기술 Item 수정' });
    type(/^제목/, 'private draft');
    blocked = true;
    if (change === 'adapter') mounted.rerender(view({ ...port }));
    else { if (change === 'session') currentSession = testSession(['knowledge:item-publish', 'platform:view'], { user: { id: 'new-user' } }); reactAct(() => notify()); }
    await waitFor(() => expect(screen.queryByDisplayValue('private draft')).toBeNull());
    expect(screen.queryByRole('heading', { name: '챔버 압력 로그 지연 (보완)' })).toBeNull();
    await reactAct(async () => deny({ ...ok(null), outcome: 'forbidden' }));
    expect(screen.queryByDisplayValue('private draft')).toBeNull();
    expect(screen.queryByRole('heading', { name: '챔버 압력 로그 지연 (보완)' })).toBeNull();
  });
  it('revises the latest revision with a required 변경 사유, then shows the new revision and keeps the old one selectable', async () => {
    mountDetail(ITEM(1), '&drawer=revise');
    await screen.findByRole('heading', { name: '기술 Item 수정' }, slow);
    expect((field(/^제목/) as HTMLInputElement).value).toBe('챔버 압력 로그 지연 (보완)');
    expect(within(drawer()).getByText('모델 · Alpha 100')).toBeTruthy();
    expect(within(drawer()).queryByRole('radio', { name: 'SW 버전' })).toBeNull();
    submit('새 리비전 저장');
    expect(await within(drawer()).findByText('필수 항목입니다')).toBeTruthy();
    expect(writes).toHaveLength(0);
    type(/^제목/, '챔버 압력 로그 지연 (3차)');
    type(/^변경 사유/, '재현 조건 추가');
    submit('새 리비전 저장');
    await waitFor(() => expect(writes).toHaveLength(1), slow);
    expect(lastWrite()).toMatchObject({ action: 'logKnowledge.itemRevise', expectedVersion: '1' });
    expect(input()).toMatchObject({ id: ITEM(1), title: '챔버 압력 로그 지연 (3차)', changeNote: '재현 조건 추가' });
    await waitFor(() => expect(url().get('drawer')).toBeNull(), slow);
    expect(await screen.findByRole('heading', { level: 1, name: '챔버 압력 로그 지연 (3차)' }, slow)).toBeTruthy();
    const list = within(screen.getByRole('region', { name: '리비전' }));
    expect(list.getAllByRole('button').map(b => b.textContent)).toEqual([expect.stringContaining('r3'), expect.stringContaining('r2'), expect.stringContaining('r1')]);
  });

  it('from an older rev it says it edits the latest, prefills the latest, and clears rev afterwards', async () => {
    mountDetail(ITEM(1), '&rev=1&drawer=revise');
    await screen.findByRole('heading', { name: '기술 Item 수정' }, slow);
    expect(await within(drawer()).findByText(/r1을 보고 있지만 수정은 항상 최신 리비전 r2를 바탕으로/, {}, slow)).toBeTruthy();
    await waitFor(() => expect((field(/^제목/) as HTMLInputElement).value).toBe('챔버 압력 로그 지연 (보완)'), slow);
    type(/^변경 사유/, '최신 기준 수정');
    submit('새 리비전 저장');
    await waitFor(() => expect(writes).toHaveLength(1), slow);
    expect(lastWrite()?.expectedVersion).toBe('1');
    await waitFor(() => { expect(url().get('rev')).toBeNull(); expect(url().get('drawer')).toBeNull(); }, slow);
    const list = within(await screen.findByRole('region', { name: '리비전' }, slow));
    expect(await list.findByRole('button', { name: /r1/ }, slow)).toBeTruthy();
    expect(list.getByRole('button', { name: /r3/ })).toBeTruthy();
  });

  it('a stale version reload preserves the draft and uses the latest version', async () => {
    mountDetail(ITEM(1), '&drawer=revise');
    await screen.findByRole('heading', { name: '기술 Item 수정' }, slow);
    // Someone else revises first.
    const rec = store[0]!;
    rec.revisions.push(revision(3, { title: '다른 사람의 3차' })); rec.version = 2;
    type(/^변경 사유/, '내 수정');
    submit('새 리비전 저장');
    expect(await within(drawer()).findByText('다른 사람이 먼저 고쳤습니다', {}, slow)).toBeTruthy();
    fireEvent.click(within(drawer()).getByRole('button', { name: '최신 불러오기' }));
    await waitFor(() => expect(within(drawer()).queryByText('다른 사람이 먼저 고쳤습니다')).toBeNull(), slow);
    expect((field(/^변경 사유/) as HTMLInputElement).value).toBe('내 수정');
    expect((field(/^제목/) as HTMLInputElement).value).toBe('챔버 압력 로그 지연 (보완)');
    submit('새 리비전 저장');
    await waitFor(() => expect(lastWrite()?.expectedVersion).toBe('2'), slow);
  });
});

describe('판단 변경 (assess)', () => {
  it('changes one axis: the current state is disabled and labelled, the new state badge and the top history row follow', async () => {
    mountDetail(ITEM(1), '&drawer=assess');
    await screen.findByRole('heading', { name: '판단 변경' }, slow);
    const current = within(drawer()).getByRole('radio', { name: /관찰됨/ });
    expect(current.hasAttribute('disabled')).toBe(true);
    expect(within(drawer()).getByText('현재')).toBeTruthy();
    expect(within(drawer()).getByRole('region', { name: '현재 판단 상태' }).textContent).toContain('관찰됨');
    submit('판단 변경');
    expect(await within(drawer()).findByText('새 상태를 골라 주세요')).toBeTruthy();
    expect(writes).toHaveLength(0);
    // No live role on the error (FormField contract): a failed submit moves focus to the first invalid input instead.
    expect(document.activeElement).toBe(within(drawer()).getAllByRole('radio').find(r => !r.hasAttribute('disabled') && r.closest('[aria-label="새 상태"]'))!);
    fireEvent.click(within(drawer()).getByRole('radio', { name: /검증됨/ }));
    submit('판단 변경');
    expect(await within(drawer()).findByText('필수 항목입니다')).toBeTruthy();
    expect(document.activeElement).toBe(field(/^사유/));
    expect(within(drawer()).queryByRole('alert')).toBeNull();
    type(/^사유/, '두 번째 설비에서도 재현');
    submit('판단 변경');
    await waitFor(() => expect(writes).toHaveLength(1), slow);
    expect(lastWrite()).toMatchObject({ action: 'logKnowledge.itemAssess', expectedVersion: '1' });
    expect(input()).toMatchObject({ id: ITEM(1), dimension: 'verification', newState: 'verified', rationale: '두 번째 설비에서도 재현' });
    await waitFor(() => expect(url().get('drawer')).toBeNull(), slow);
    const history = await screen.findByRole('list', { name: /판단 변경 이력/ }, slow);
    await waitFor(() => expect(within(history).getAllByRole('listitem')[0]!.textContent).toContain('두 번째 설비에서도 재현'), slow);
    expect(within(history).getAllByRole('listitem')[0]!.textContent).toContain('검증됨');
    expect(screen.getAllByText(/검증됨/).length).toBeGreaterThan(1);
  });

  it.each([
    ['newState', 'unchanged', '현재와 같은 상태입니다'],
    ['newState', 'invalid_state', '이 판단 축에서 쓸 수 없는 상태입니다'],
  ])('shows a server %s/%s inline under the new state', async (path, code, text) => {
    mountDetail(ITEM(1), '&drawer=assess');
    await screen.findByRole('heading', { name: '판단 변경' }, slow);
    fireEvent.click(within(drawer()).getByRole('radio', { name: /검증됨/ }));
    type(/^사유/, '사유');
    nextError = { outcome: 'invalid', fieldErrors: [{ path: [path], code }] };
    submit('판단 변경');
    const message = await within(drawer()).findByText(text, {}, slow);
    expect(message.id).toContain('newState-error');
  });

  it('shows a server id/archived error as a visible form error', async () => {
    mountDetail(ITEM(1), '&drawer=assess');
    await screen.findByRole('heading', { name: '판단 변경' }, slow);
    fireEvent.click(within(drawer()).getByRole('radio', { name: /검증됨/ }));
    type(/^사유/, '사유');
    nextError = { outcome: 'invalid', fieldErrors: [{ path: ['id'], code: 'archived' }] };
    submit('판단 변경');
    expect(await within(drawer()).findByText('Item: 보관된 Item은 바꿀 수 없습니다', {}, slow)).toBeTruthy();
  });
});

describe('assessment conflict reload (#2109)', () => {
  const rationale = '충돌 뒤에도 남겨야 할 사유';
  const notice = '최신 상태를 불러왔습니다. 새 상태를 다시 골라 주세요. 사유는 유지됩니다.';
  const saveButton = () => within(drawer()).getByRole('button', { name: '판단 변경' }) as HTMLButtonElement;
  const reload = () => fireEvent.click(within(drawer()).getByRole('button', { name: '새로 불러오기' }));
  let reloadFails = false;
  async function conflict() {
    reloadFails = false;
    const selected = testAdapter({ ...adapter, menuQuery: req => req.endpoint === 'logKnowledge.itemDetail' && reloadFails
      ? Promise.resolve({ ...ok(null), outcome: 'error', message: 'boom' } as ApiResponse<never>) : adapter.menuQuery(req) });
    window.history.replaceState(null, '', `/log/knowledge/items/${ITEM(1)}?v=1&drawer=assess`);
    render(tree(<ItemDetail params={{ itemId: ITEM(1) }} />, selected));
    await screen.findByRole('heading', { name: '판단 변경' }, slow);
    fireEvent.click(within(drawer()).getByRole('radio', { name: /검증됨/ }));
    type(/^사유/, '처음 쓴 사유');
    nextError = { outcome: 'conflict' };
    submit('판단 변경');
    await within(drawer()).findByText('다른 사람이 먼저 고쳤습니다', {}, slow);
    await rtlAct(async () => {});
    type(/^사유/, rationale);
  }
  function advance() { recOf(ITEM(1))!.version += 1; }

  it('keeps the conflict and submit gate during a delayed reload, then keeps rationale and writes against the new version', async () => {
    await conflict();
    let release = () => {};
    holdDetail = new Promise<void>(resolve => { release = resolve; });
    advance();
    reload();
    try {
      expect(within(drawer()).getByText('다른 사람이 먼저 고쳤습니다')).toBeTruthy();
      expect(within(drawer()).getByText('최신 상태를 불러오는 중입니다')).toBeTruthy();
      expect((within(drawer()).getByRole('button', { name: '새로 불러오기' }) as HTMLButtonElement).disabled).toBe(true);
      expect(saveButton().disabled).toBe(true);
      fireEvent.submit(saveButton().closest('form')!);
      expect(writes).toHaveLength(1);
    } finally { await rtlAct(async () => { release(); }); }
    await within(drawer()).findByText(notice, {}, slow);
    expect((field(/^사유/) as HTMLTextAreaElement).value).toBe(rationale);
    expect(within(drawer()).getByRole('radiogroup', { name: '새 상태' }).querySelector('[aria-checked="true"]')).toBeNull();
    expect(saveButton().disabled).toBe(false);
    submit('판단 변경');
    expect(within(drawer()).getByText('새 상태를 골라 주세요')).toBeTruthy();
    expect(writes).toHaveLength(1);
    fireEvent.click(within(drawer()).getByRole('radio', { name: /검증됨/ }));
    expect(within(drawer()).queryByText(notice)).toBeNull();
    submit('판단 변경');
    await waitFor(() => expect(writes).toHaveLength(2), slow);
    expect(lastWrite()).toMatchObject({ action: 'logKnowledge.itemAssess', expectedVersion: '2', input: { rationale, newState: 'verified' } });
  });

  it.each(['failed', 'same version'])('keeps rationale and submit locked after a %s reload, then allows a successful retry', async outcome => {
    await conflict();
    reloadFails = outcome === 'failed';
    reload();
    await within(drawer()).findByText('최신 상태를 불러오지 못했습니다', {}, slow);
    expect(saveButton().disabled).toBe(true);
    expect((field(/^사유/) as HTMLTextAreaElement).value).toBe(rationale);
    expect((within(drawer()).getByRole('button', { name: '새로 불러오기' }) as HTMLButtonElement).disabled).toBe(false);
    reloadFails = false;
    advance();
    reload();
    await within(drawer()).findByText(notice, {}, slow);
    expect(saveButton().disabled).toBe(false);
    expect((field(/^사유/) as HTMLTextAreaElement).value).toBe(rationale);
    type(/^사유/, `${rationale} 보완`);
    expect(within(drawer()).queryByText(notice)).toBeNull();
  });

  it('asks before closing after a successful reload with only the kept rationale dirty', async () => {
    await conflict();
    const originalField = field(/^사유/);
    advance();
    reload();
    await waitFor(() => expect(field(/^사유/)).not.toBe(originalField), slow);
    // No new state is picked and no input is edited after the remount.
    fireEvent.click(within(drawer()).getByRole('button', { name: '취소' }));
    await screen.findByText('작성 중인 내용이 사라집니다. 닫을까요?', {}, slow);
    expect(url().get('drawer')).toBe('assess');
    fireEvent.click(screen.getByRole('button', { name: '계속 작성' }));
    expect((field(/^사유/) as HTMLTextAreaElement).value).toBe(rationale);
  });

  it('keeps the drawer, rationale and conflict callout when the automatic conflict read fails before any click, then clears on reload', async () => {
    reloadFails = false;
    const selected = testAdapter({ ...adapter, menuQuery: req => req.endpoint === 'logKnowledge.itemDetail' && reloadFails
      ? Promise.resolve({ ...ok(null), outcome: 'error', message: 'boom' } as ApiResponse<never>) : adapter.menuQuery(req) });
    window.history.replaceState(null, '', `/log/knowledge/items/${ITEM(1)}?v=1&drawer=assess`);
    render(tree(<ItemDetail params={{ itemId: ITEM(1) }} />, selected));
    await screen.findByRole('heading', { name: '판단 변경' }, slow);
    fireEvent.click(within(drawer()).getByRole('radio', { name: /검증됨/ }));
    type(/^사유/, rationale);
    reloadFails = true;
    nextError = { outcome: 'conflict' };
    submit('판단 변경');
    await screen.findByRole('button', { name: '다시 시도' }, slow);
    expect(within(drawer()).getByRole('heading', { name: '판단 변경' })).toBeTruthy();
    expect(within(drawer()).getByText('다른 사람이 먼저 고쳤습니다')).toBeTruthy();
    expect((field(/^사유/) as HTMLTextAreaElement).value).toBe(rationale);
    expect(saveButton().disabled).toBe(true);
    reloadFails = false;
    advance();
    reload();
    await within(drawer()).findByText(notice, {}, slow);
    expect(saveButton().disabled).toBe(false);
    expect((field(/^사유/) as HTMLTextAreaElement).value).toBe(rationale);
  });

  it('does not keep r1 detail mounted when switching from rev=1 conflict reload to latest and latest read fails', async () => {
    let failLatestRead = false;
    const selected = testAdapter({ ...adapter, menuQuery: req => {
      const p = req.params as { revisionNo?: number };
      if (req.endpoint === 'logKnowledge.itemDetail' && failLatestRead && p.revisionNo === undefined) {
        return Promise.resolve({ ...ok(null), outcome: 'error', message: 'boom' } as ApiResponse<never>);
      }
      return adapter.menuQuery(req);
    } });
    window.history.replaceState(null, '', `/log/knowledge/items/${ITEM(1)}?v=1&rev=1&drawer=assess`);
    render(tree(<ItemDetail params={{ itemId: ITEM(1) }} />, selected));
    await screen.findByRole('heading', { name: '판단 변경' }, slow);
    expect(await screen.findByText(/이전 리비전 r1을 보고 있습니다/, {}, slow)).toBeTruthy();
    fireEvent.click(within(drawer()).getByRole('radio', { name: /검증됨/ }));
    type(/^사유/, '처음 쓴 사유');
    nextError = { outcome: 'conflict' };
    submit('판단 변경');
    await within(drawer()).findByText('다른 사람이 먼저 고쳤습니다', {}, slow);
    await rtlAct(async () => {});
    type(/^사유/, rationale);
    let release = () => {};
    holdDetail = new Promise<void>(resolve => { release = resolve; });
    advance();
    reload();
    failLatestRead = true;
    fireEvent.click(await screen.findByRole('button', { name: '최신 보기' }, slow));
    await waitFor(() => expect(url().get('rev')).toBeNull(), slow);
    await rtlAct(async () => { release(); });
    await screen.findByRole('button', { name: '다시 시도' }, slow);
    expect(screen.queryByRole('heading', { name: '판단 변경' })).toBeNull();
    expect(screen.queryByDisplayValue(rationale)).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not enable header 수정 or feed revise from the kept detail when assessment reload fails on latest', async () => {
    await conflict();
    reloadFails = true;
    reload();
    await within(drawer()).findByText('최신 상태를 불러오지 못했습니다', {}, slow);
    await screen.findByRole('button', { name: '다시 시도' }, slow);
    expect(screen.queryByRole('button', { name: '수정' })).toBeNull();
    rtlAct(() => {
      window.history.pushState(null, '', `${window.location.pathname}?v=1&drawer=revise`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(url().get('drawer')).toBe('revise'), slow);
    expect(screen.queryByRole('heading', { name: '기술 Item 수정' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('resets the assessment drawer when switching to another viewed revision', async () => {
    mountDetail(ITEM(1), '&rev=1&drawer=assess');
    await screen.findByRole('heading', { name: '판단 변경' }, slow);
    type(/^사유/, rationale);
    fireEvent.click(await screen.findByRole('button', { name: '최신 보기' }, slow));
    await waitFor(() => expect(url().get('rev')).toBeNull(), slow);
    await waitFor(() => expect(screen.queryByText(/이전 리비전 r1을 보고 있습니다/)).toBeNull(), slow);
    await screen.findByRole('heading', { name: '판단 변경' }, slow);
    expect((field(/^사유/) as HTMLTextAreaElement).value).toBe('');
  });
});

describe('관련 Item으로 신규 작성 (derive)', () => {
  it('prefills from the viewed revision, hides evidence, and creates an 미확인·열림 item linked to its source', async () => {
    mountDetail(ITEM(1), '&rev=1&drawer=derive');
    await screen.findByRole('heading', { name: '관련 Item으로 신규 작성' }, slow);
    expect(within(drawer()).getByText('원본 KI-1 r1에서 파생합니다. 근거는 새로 등록하고 판단 상태는 미확인으로 시작합니다')).toBeTruthy();
    expect((field(/^제목/) as HTMLInputElement).value).toBe('챔버 압력 로그 지연');
    expect((field(/^관찰 사실/) as HTMLTextAreaElement).value).toBe('');
    expect((field(/^기대·기준/) as HTMLTextAreaElement).value).toBe('');
    expect((field(/^분석 의견/) as HTMLTextAreaElement).value).toBe('재시작 탓으로 보임');
    expect(within(drawer()).queryByRole('button', { name: '근거 추가' })).toBeNull();
    expect(within(drawer()).getByText(/근거는 파생 작성에서 추가할 수 없습니다/)).toBeTruthy();
    await pick(0, /Beta 10/);
    type(/^관찰 사실/, '새 관찰');
    submit('관련 Item 작성');
    await waitFor(() => expect(writes).toHaveLength(1), slow);
    expect(lastWrite()?.action).toBe('logKnowledge.itemDerive');
    expect(input()).toMatchObject({ sourceItemId: ITEM(1), sourceRevisionNo: 1, ownerModelId: MODEL_B, observation: '새 관찰', title: '챔버 압력 로그 지연' });
    expect(input()).not.toHaveProperty('evidence');
    const created = store.at(-1)!;
    await waitFor(() => expect(window.location.pathname).toContain(created.id), slow);
    cleanup();
    mountDetail(created.id);
    await screen.findByRole('heading', { level: 1, name: '챔버 압력 로그 지연' }, slow);
    expect(screen.getAllByText(/미확인/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/열림/).length).toBeGreaterThan(0);
    expect(screen.getByText('등록된 근거 없음')).toBeTruthy();
    const source = within(screen.getByRole('region', { name: '연결 Item' }));
    expect(source.getByText(/파생 원본/)).toBeTruthy();
    expect(source.getByRole('link', { name: 'KI-1' }).getAttribute('href')).toContain(ITEM(1));
  });
});

describe('보관 / 보관 해제', () => {
  it('archives through a confirm in the ⋯ menu: banner, no write controls, then unarchives', async () => {
    mountDetail(ITEM(1));
    await screen.findByRole('heading', { level: 1, name: /챔버 압력/ }, slow);
    expect(screen.getByRole('button', { name: '수정' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    fireEvent.click(await screen.findByRole('button', { name: '보관' }, slow));
    const dialog = await screen.findByRole('alertdialog', {}, slow);
    expect(dialog.textContent).toContain('Item 조회');
    expect(dialog.textContent).toContain('이력 유지');
    fireEvent.click(within(dialog).getByRole('button', { name: '보관' }));
    await waitFor(() => expect(writes).toHaveLength(1), slow);
    expect(lastWrite()).toMatchObject({ action: 'logKnowledge.itemSetArchived', expectedVersion: '1' });
    expect(input()).toMatchObject({ id: ITEM(1), archived: true });
    expect(await screen.findByText(/보관된 Item ·/, {}, slow)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '수정' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    expect(screen.queryByRole('button', { name: '판단 변경' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: '보관 해제' }, slow));
    fireEvent.click(within(await screen.findByRole('alertdialog', {}, slow)).getByRole('button', { name: '보관 해제' }));
    await waitFor(() => expect(screen.queryByText(/보관된 Item ·/)).toBeNull(), slow);
    expect(screen.getByRole('button', { name: '수정' })).toBeTruthy();
    expect(input()).toMatchObject({ archived: false });
  });

  it('opens 판단 변경 and 관련 Item으로 신규 작성 from the ⋯ menu into the address', async () => {
    mountDetail(ITEM(1));
    await screen.findByRole('heading', { level: 1, name: /챔버 압력/ }, slow);
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    fireEvent.click(await screen.findByRole('button', { name: '판단 변경' }, slow));
    await waitFor(() => expect(url().get('drawer')).toBe('assess'));
    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    await waitFor(() => expect(url().get('drawer')).toBe('revise'));
    expect(await screen.findByRole('heading', { name: '기술 Item 수정' }, slow)).toBeTruthy();
  });
});

describe('모델 프로파일 «모델 공통 Item»', () => {
  it('lists only the model\'s own published items with a 모두 보기 link carrying the owner filter', async () => {
    store[0]!.publication = 'archived';
    store.push({ ...store[0]!, id: ITEM(9), itemNo: 9, publication: 'published', updatedAt: tick(), revisions: [revision(1, { title: '모델 공통 사례' })] });
    mountProfile();
    const section = within(await screen.findByRole('region', { name: '모델 공통 Item' }, slow));
    expect(await section.findByText('모델 공통 사례', {}, slow)).toBeTruthy();
    expect(section.queryByText('SW 소유 사례')).toBeNull();
    expect(section.queryByText('다른 모델 사례')).toBeNull();
    expect(section.queryByText(/챔버 압력/)).toBeNull();
    const row = section.getByText('모델 공통 사례').closest('li')!;
    for (const text of ['KI-9', '이상 사례', '검증', '관찰됨', '처리', '열림']) expect(row.textContent).toContain(text);
    expect(within(row).getByRole('link', { name: 'KI-9' }).getAttribute('href')).toContain('returnTo=');
    const all = section.getByRole('link', { name: '모두 보기 (1)' });
    const params = new URLSearchParams(all.getAttribute('href')!.split('?')[1]);
    expect(params.getAll('filter').sort()).toEqual(encodeFilterParams([{ id: 'ownerModelId', op: 'in', value: [MODEL_A] }, { id: 'publicationState', op: 'in', value: ['published'] }]).sort());
    const read = queries.find(q => q.endpoint === 'logKnowledge.items')!.params as { pageSize: number; sorting: unknown; filters: ColumnFilter[] };
    expect(read.pageSize).toBe(5);
    expect(read.sorting).toEqual([{ id: 'updatedAt', desc: true }]);
    expect(read.filters).toContainEqual({ id: 'includeSoftware', op: 'in', value: ['false'] });
  });

  it('shows at most five rows, and following 모두 보기 renders only that model\'s published items without a URL warning', async () => {
    for (let n = 10; n < 17; n += 1) store.push({ ...store[0]!, id: ITEM(n), itemNo: n, updatedAt: tick(), revisions: [revision(1, { title: `공통 ${n}` })] });
    mountProfile();
    const section = within(await screen.findByRole('region', { name: '모델 공통 Item' }, slow));
    await waitFor(() => expect(section.getAllByRole('listitem')).toHaveLength(5), slow);
    const href = section.getByRole('link', { name: /^모두 보기 \(8\)$/ }).getAttribute('href')!;
    cleanup();
    const search = new URLSearchParams(href.split('?')[1]).getAll('filter').map(f => `&filter=${encodeURIComponent(f)}`).join('');
    mountList(search);
    expect(await screen.findByText('KI-16', {}, slow)).toBeTruthy();
    expect(screen.queryByText('KI-2')).toBeNull();
    expect(screen.queryByText('KI-3')).toBeNull();
    expect(screen.queryByText(/주소/)).toBeNull();
    const read = queries.filter(q => q.endpoint === 'logKnowledge.items' && (q.params as { pageSize?: number }).pageSize === 25).at(-1)!.params as { filters: ColumnFilter[] };
    expect(read.filters).toContainEqual({ id: 'ownerModelId', op: 'in', value: [MODEL_A] });
  });

  it('an empty model says so and offers 새 기술 Item to publishers only, opening create with the model chosen', async () => {
    store = store.filter(r => r.owner.modelId !== MODEL_A);
    mountProfile();
    const section = within(await screen.findByRole('region', { name: '모델 공통 Item' }, slow));
    expect(await section.findByText('이 모델이 소유한 Item이 없습니다', {}, slow)).toBeTruthy();
    const link = section.getByRole('link', { name: /새 기술 Item/ });
    const target = new URLSearchParams(link.getAttribute('href')!.split('?')[1]);
    expect(target.get('focus')).toBe('new');
    expect(target.get('owner')).toBe(MODEL_A);
    cleanup();
    session = reader;
    mountProfile();
    const viewerSection = within(await screen.findByRole('region', { name: '모델 공통 Item' }, slow));
    expect(await viewerSection.findByText('이 모델이 소유한 Item이 없습니다', {}, slow)).toBeTruthy();
    expect(viewerSection.queryByRole('link', { name: /새 기술 Item/ })).toBeNull();
  });
});

describe('closing a drawer with unsaved input asks first', () => {
  const asked = () => screen.findByText('작성 중인 내용이 사라집니다. 닫을까요?', {}, slow);
  it('Escape on a dirty create form shows the confirm; 계속 작성 keeps the input, 닫기 closes', async () => {
    mountList(`${published}&focus=new`);
    await screen.findByRole('heading', { name: '새 기술 Item' }, slow);
    type(/^제목/, '쓰던 내용');
    fireEvent.keyDown(drawer().querySelector('[role="dialog"]')!, { key: 'Escape' });
    expect(await asked()).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '계속 작성' }));
    await waitFor(() => expect(screen.queryByText('작성 중인 내용이 사라집니다. 닫을까요?')).toBeNull());
    expect((field(/^제목/) as HTMLInputElement).value).toBe('쓰던 내용');
    expect(url().get('focus')).toBe('new');
    fireEvent.click(within(drawer()).getByRole('button', { name: '상세 닫기' }));
    await asked();
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(url().get('focus')).toBeNull(), slow);
    expect(screen.queryByRole('heading', { name: '새 기술 Item' })).toBeNull();
  });

  it('a clean form closes at once (Escape, 취소)', async () => {
    mountList(`${published}&focus=new`);
    await screen.findByRole('heading', { name: '새 기술 Item' }, slow);
    fireEvent.keyDown(drawer().querySelector('[role="dialog"]')!, { key: 'Escape' });
    await waitFor(() => expect(url().get('focus')).toBeNull(), slow);
    expect(screen.queryByText('작성 중인 내용이 사라집니다. 닫을까요?')).toBeNull();
  });

  it('the revise and assess drawers ask too, once something changed', async () => {
    mountDetail(ITEM(1), '&drawer=revise');
    await screen.findByRole('heading', { name: '기술 Item 수정' }, slow);
    fireEvent.click(within(drawer()).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(url().get('drawer')).toBeNull(), slow);
    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    await screen.findByRole('heading', { name: '기술 Item 수정' }, slow);
    type(/^변경 사유/, '쓰다 만 사유');
    fireEvent.click(within(drawer()).getByRole('button', { name: '취소' }));
    await asked();
    expect(url().get('drawer')).toBe('revise');
    fireEvent.click(screen.getByRole('button', { name: '계속 작성' }));
    cleanup();
    mountDetail(ITEM(1), '&drawer=assess');
    await screen.findByRole('heading', { name: '판단 변경' }, slow);
    type(/^사유/, '쓰다 만 사유');
    fireEvent.keyDown(drawer().querySelector('[role="dialog"]')!, { key: 'Escape' });
    await asked();
    expect(url().get('drawer')).toBe('assess');
  });
});

describe('the create owner from the address', () => {
  it.each([
    ['an inactive model', MODEL_OFF],
    ['an unknown model', uuid(3, 77)],
    ['a malformed id', 'not-a-uuid'],
  ])('%s is refused: a notice, an empty owner, and no write', async (_name, owner) => {
    mountList(`${published}&focus=new&owner=${owner}`);
    expect(await screen.findByText(/활성 모델이 아니어서 비워 두었습니다/, {}, slow)).toBeTruthy();
    await screen.findByRole('heading', { name: '새 기술 Item' }, slow);
    expect(within(drawer()).getAllByRole('combobox')[0]!.textContent).not.toMatch(/Zeta|Alpha|Beta/);
    type(/^제목/, '사례');
    type(/^관찰 사실/, '사실');
    submit('등록');
    expect(await within(drawer()).findByText('소유 대상을 골라 주세요')).toBeTruthy();
    expect(writes).toHaveLength(0);
  });

  it('an active model is accepted and sent', async () => {
    mountList(`${published}&focus=new&owner=${MODEL_B}`);
    await screen.findByRole('heading', { name: '새 기술 Item' }, slow);
    await waitFor(() => expect(within(drawer()).getAllByRole('combobox')[0]!.textContent).toContain('Beta 10'), slow);
    expect(screen.queryByText(/활성 모델이 아니어서/)).toBeNull();
    type(/^제목/, '사례'); type(/^관찰 사실/, '사실');
    submit('등록');
    await waitFor(() => expect(writes).toHaveLength(1), slow);
    expect(input()).toMatchObject({ ownerModelId: MODEL_B });
  });
});

describe('owner pickers page past the first 50 matches', () => {
  it('shows 더 보기 for the model list and loads the next page with the search kept', async () => {
    for (let n = 0; n < 60; n += 1) MODELS.push({ id: uuid(3, 100 + n), code: `P-${n}`, name: `Plenty ${String(n).padStart(2, '0')}`, active: true });
    mountList(`${published}&focus=new`);
    await screen.findByRole('heading', { name: '새 기술 Item' }, slow);
    fireEvent.click(within(drawer()).getAllByRole('combobox')[0]!);
    expect(await screen.findByRole('button', { name: '모델 더 보기' }, slow)).toBeTruthy();
    expect((await screen.findAllByRole('option', {}, slow)).length).toBe(50);
    fireEvent.click(screen.getByRole('button', { name: '모델 더 보기' }));
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(50), slow);
    const pages = queries.filter(q => q.endpoint === 'logKnowledge.models' && (q.params as { pageSize?: number }).pageSize === 50).map(q => (q.params as { page: number }).page);
    expect(pages).toEqual(expect.arrayContaining([0, 1]));
    expect(screen.getAllByRole('option').some(o => /Plenty 59/.test(o.textContent ?? ''))).toBe(true);
  });
});

describe('revising from an older rev reads the latest', () => {
  it('shows an inline error with 다시 시도 inside the drawer when the latest read fails, and recovers', async () => {
    failLatest = true;
    mountDetail(ITEM(1), '&rev=1&drawer=revise');
    expect(await within(await screen.findByRole('complementary', { name: '상세 패널' }, slow)).findByText(/최신 리비전을 불러오지 못했습니다/, {}, slow)).toBeTruthy();
    expect(url().get('drawer')).toBe('revise');
    failLatest = false;
    fireEvent.click(within(drawer()).getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect((field(/^제목/) as HTMLInputElement).value).toBe('챔버 압력 로그 지연 (보완)'), slow);
  });

  it('the error drawer closes with 닫기', async () => {
    failLatest = true;
    mountDetail(ITEM(1), '&rev=1&drawer=revise');
    await within(await screen.findByRole('complementary', { name: '상세 패널' }, slow)).findByText(/최신 리비전을 불러오지 못했습니다/, {}, slow);
    fireEvent.click(within(drawer()).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(url().get('drawer')).toBeNull(), slow);
  });
});

describe('수정 폼을 이전 리비전에서 연 채 최신 보기로 돌아오기 (#1365 R2)', () => {
  it('does not loop: the form and its draft stay while the latest response arrives', async () => {
    mountDetail(ITEM(1), '&rev=1&drawer=revise');
    await screen.findByRole('heading', { name: '기술 Item 수정' }, slow);
    await waitFor(() => expect((field(/^제목/) as HTMLInputElement).value).toBe('챔버 압력 로그 지연 (보완)'), slow);
    type(/^변경 사유/, '입력 중');
    let release = () => {};
    holdDetail = new Promise<void>(resolve => { release = resolve; });
    fireEvent.click(await screen.findByRole('button', { name: '최신 보기' }, slow));
    await waitFor(() => expect(url().get('rev')).toBeNull(), slow);
    await rtlAct(async () => { release(); });
    await waitFor(() => expect(screen.queryByText(/이전 리비전 r1을 보고 있습니다/)).toBeNull(), slow);
    expect(screen.queryByText(/Too many re-renders/)).toBeNull();
    expect((field(/^변경 사유/) as HTMLTextAreaElement | HTMLInputElement).value).toBe('입력 중');
    expect((field(/^제목/) as HTMLInputElement).value).toBe('챔버 압력 로그 지연 (보완)');
  });
});

describe('an evidence kind outside the declared list', () => {
  it('is named on its row before any write, and choosing a declared kind clears it', async () => {
    // jsdom has no scrollIntoView, which Radix Select calls when it opens.
    Element.prototype.scrollIntoView = vi.fn();
    store[0]!.revisions.at(-1)!.evidence = [{ ordinal: 1, sourceKind: 'document', sourceOwner: 'Wiki', sourceRef: 'manuals/x', sourceVersion: null, contentHash: null, locator: null, note: null }];
    mountDetail(ITEM(1), '&drawer=revise');
    await screen.findByRole('heading', { name: '기술 Item 수정' }, slow);
    type(/^변경 사유/, '그대로');
    submit('새 리비전 저장');
    const message = await within(drawer()).findByText(/출처 종류 확인 필요/, {}, slow);
    expect(message.id).toContain('ev-0-sourceKind-error');
    expect(writes).toHaveLength(0);
    fireEvent.click(within(drawer()).getByRole('combobox', { name: /출처 종류/ }));
    fireEvent.click(await screen.findByRole('option', { name: '명세' }, slow));
    await screen.findByRole('complementary', { name: '상세 패널' }, slow);
    submit('새 리비전 저장');
    await waitFor(() => expect(writes).toHaveLength(1), slow);
    expect(input().evidence).toMatchObject([{ sourceKind: 'spec' }]);
  });
});

describe('an inactive model\'s profile', () => {
  it('shows only the empty text, with no 새 기술 Item', async () => {
    profileActive = false;
    store = store.filter(r => r.owner.modelId !== MODEL_A);
    mountProfile();
    const section = within(await screen.findByRole('region', { name: '모델 공통 Item' }, slow));
    expect(await section.findByText('이 모델이 소유한 Item이 없습니다', {}, slow)).toBeTruthy();
    expect(section.queryByRole('link', { name: /새 기술 Item/ })).toBeNull();
  });
});

describe('쓰기는 불러온 리비전 기준으로만 (#1365 F5)', () => {
  const hold = () => { let release = () => {}; holdDetail = new Promise<void>(resolve => { release = resolve; }); return () => release(); };

  it('while another revision loads the previous one is shown: every write control is disabled with a reason, and they work again once it arrives', async () => {
    mountDetail(ITEM(1));
    const list = await screen.findByRole('region', { name: '리비전' }, slow);
    const release = hold();
    fireEvent.click(within(list).getByRole('button', { name: /r1/ }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('rev')).toBe('1'));
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    for (const name of ['판단 변경', '관련 Item으로 신규 작성', '수정']) {
      const button = screen.getByRole('button', { name }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(button.title).toContain('불러오는 중');
    }
    await rtlAct(async () => { release(); });
    await waitFor(() => expect((screen.getByRole('button', { name: '관련 Item으로 신규 작성' }) as HTMLButtonElement).disabled).toBe(false), slow);
  });

  it('a derive form already open keeps its source revision and its typed input when another revision arrives', async () => {
    mountDetail(ITEM(1), '&drawer=derive');
    await screen.findByRole('heading', { name: '관련 Item으로 신규 작성' }, slow);
    expect(within(drawer()).getByText(/원본 KI-1 r2에서 파생합니다/)).toBeTruthy();
    type(/^관찰 사실/, '입력 중');
    const release = hold();
    rtlAct(() => {
      window.history.pushState(null, '', `${window.location.pathname}?v=1&drawer=derive&rev=1`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await rtlAct(async () => { release(); });
    expect(await screen.findByText(/이전 리비전 r1을 보고 있습니다/, {}, slow)).toBeTruthy();
    expect((field(/^관찰 사실/) as HTMLTextAreaElement).value).toBe('입력 중');
    expect(within(drawer()).getByText(/원본 KI-1 r2에서 파생합니다/)).toBeTruthy();
    await pick(0, /Beta 10/);
    submit('관련 Item 작성');
    await waitFor(() => expect(writes).toHaveLength(1), slow);
    expect(input()).toMatchObject({ sourceItemId: ITEM(1), sourceRevisionNo: 2 });
  });
});

describe('item input across a same-user session generation (#2108)', () => {
  it('restores typed input after the replacement item access read succeeds', async () => {
    window.history.replaceState(null, '', `/log/knowledge/items/${ITEM(1)}?v=1&drawer=revise`);
    const listeners = new Set<() => void>();
    let blocked = false;
    let deliver = (_: ApiResponse<never>) => {};
    const port = testAdapter({ session: () => publisher, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, menuQuery: req => {
      if (req.endpoint !== 'logKnowledge.itemDetail') return Promise.resolve(ok({ rows: [], total: 0 }));
      return blocked ? new Promise(resolve => { deliver = resolve; }) : Promise.resolve(ok(detailOf(store[0]!)));
    } });
    render(tree(<ItemDetail params={{ itemId: ITEM(1) }} />, port));
    await screen.findByRole('heading', { name: '기술 Item 수정' });
    type(/^제목/, 'my unsaved title');
    blocked = true;
    reactAct(() => listeners.forEach(listener => listener()));
    expect(screen.queryByDisplayValue('my unsaved title')).toBeNull();
    await reactAct(async () => deliver(ok(detailOf(store[0]!))));
    await waitFor(() => expect((field(/^제목/) as HTMLInputElement).value).toBe('my unsaved title'));
    expect(screen.getByText('세션이 바뀌어 화면을 다시 열었습니다. 저장하지 않은 입력을 되살렸습니다.')).toBeTruthy();
    fireEvent.click(within(drawer()).getByRole('button', { name: '취소' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });

  it('keeps the original baseVersion on a restored revise draft so saving after a server update enters conflict instead of overwriting', async () => {
    window.history.replaceState(null, '', `/log/knowledge/items/${ITEM(1)}?v=1&drawer=revise`);
    const listeners = new Set<() => void>();
    const port = testAdapter({
      session: () => publisher,
      subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
      menuQuery: req => req.endpoint === 'logKnowledge.itemDetail' ? Promise.resolve(ok(detailOf(store[0]!))) : Promise.resolve(ok({ rows: [], total: 0 })),
      menuAction: async (req: MenuAction) => { writes.push(req); return act(req); },
    });
    render(tree(<ItemDetail params={{ itemId: ITEM(1) }} />, port));
    await screen.findByRole('heading', { name: '기술 Item 수정' }, slow);
    type(/^제목/, 'my unsaved title');
    // Server advances to v2 with an updated untouched field while the user holds a v1 draft.
    const rec = store[0]!;
    rec.revisions.push(revision(3, { title: '다른 사람의 3차', observation: '다른 사람의 관찰 r3' }));
    rec.version = 2;
    reactAct(() => listeners.forEach(listener => listener()));
    await waitFor(() => expect((field(/^제목/) as HTMLInputElement).value).toBe('my unsaved title'), slow);
    type(/^변경 사유/, '내 수정');
    submit('새 리비전 저장');
    expect(await within(drawer()).findByText('다른 사람이 먼저 고쳤습니다', {}, slow)).toBeTruthy();
    expect(writes).toHaveLength(1);
    expect(lastWrite()?.expectedVersion).toBe('1');
    expect(rec.version).toBe(2);
    expect(rec.revisions.at(-1)!.observation).toBe('다른 사람의 관찰 r3');
    fireEvent.click(within(drawer()).getByRole('button', { name: '최신 불러오기' }));
    await waitFor(() => expect(within(drawer()).queryByText('다른 사람이 먼저 고쳤습니다')).toBeNull(), slow);
    submit('새 리비전 저장');
    await waitFor(() => expect(writes).toHaveLength(2), slow);
    expect(lastWrite()?.expectedVersion).toBe('2');
  });

  it('discards a held draft when navigating away before the pending replacement read resolves', async () => {
    window.history.replaceState(null, '', `/log/knowledge/items/${ITEM(1)}?v=1&drawer=revise`);
    const listeners = new Set<() => void>();
    let blocked = false;
    let deliver = (_: ApiResponse<never>) => {};
    const port = testAdapter({
      session: () => publisher,
      subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
      menuQuery: req => {
        if (req.endpoint !== 'logKnowledge.itemDetail') return Promise.resolve(ok({ rows: [], total: 0 }));
        return blocked ? new Promise(resolve => { deliver = resolve; }) : Promise.resolve(ok(detailOf(store[0]!)));
      },
    });
    const view = render(tree(<ItemDetail params={{ itemId: ITEM(1) }} />, port));
    await screen.findByRole('heading', { name: '기술 Item 수정' }, slow);
    type(/^제목/, 'my unsaved title');
    blocked = true;
    reactAct(() => listeners.forEach(listener => listener()));
    expect(screen.queryByDisplayValue('my unsaved title')).toBeNull();
    // Navigate away before the pending detail read resolves, then return in the same session.
    view.rerender(tree(<div />, port));
    await reactAct(async () => {});
    blocked = false;
    view.rerender(tree(<ItemDetail params={{ itemId: ITEM(1) }} />, port));
    await screen.findByRole('heading', { name: '기술 Item 수정' }, slow);
    await waitFor(() => expect((field(/^제목/) as HTMLInputElement).value).toBe('챔버 압력 로그 지연 (보완)'), slow);
    expect(screen.queryByText('세션이 바뀌어 화면을 다시 열었습니다. 저장하지 않은 입력을 되살렸습니다.')).toBeNull();
    void deliver;
  });

  it('discards a held draft when closing via the latest-read placeholder before the pending read resolves', async () => {
    window.history.replaceState(null, '', `/log/knowledge/items/${ITEM(1)}?v=1&rev=1&drawer=revise`);
    const listeners = new Set<() => void>();
    let blockLatest = false;
    const port = testAdapter({
      session: () => publisher,
      subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
      menuQuery: req => {
        if (req.endpoint !== 'logKnowledge.itemDetail') return Promise.resolve(ok({ rows: [], total: 0 }));
        const params = req.params as { revisionNo?: number };
        if (blockLatest && params.revisionNo === undefined) return new Promise(() => {});
        return Promise.resolve(ok(detailOf(store[0]!, params.revisionNo)));
      },
    });
    render(tree(<ItemDetail params={{ itemId: ITEM(1) }} />, port));
    await waitFor(() => expect((field(/^제목/) as HTMLInputElement).value).toBe('챔버 압력 로그 지연 (보완)'), slow);
    type(/^제목/, 'my unsaved title');
    blockLatest = true;
    reactAct(() => listeners.forEach(listener => listener()));
    expect(await within(drawer()).findByText('최신 리비전을 불러오는 중…', {}, slow)).toBeTruthy();
    fireEvent.click(within(drawer()).getByRole('button', { name: '상세 닫기' }));
    await waitFor(() => expect(url().get('drawer')).toBeNull(), slow);
    blockLatest = false;
    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    await waitFor(() => expect((field(/^제목/) as HTMLInputElement).value).toBe('챔버 압력 로그 지연 (보완)'), slow);
    expect(screen.queryByText('세션이 바뀌어 화면을 다시 열었습니다. 저장하지 않은 입력을 되살렸습니다.')).toBeNull();
  });
});
