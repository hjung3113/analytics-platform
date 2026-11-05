// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BookOpen } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { DetailPanelSlotProvider } from '@ap/ui';
import { encodeFilterParams, groupId, menuPermission, spaceId, type ApiResponse, type ColumnFilter, type MenuQuery } from '@ap/contracts';
import { CATALOG_MANAGE_PERMISSION, type ItemAssessment, type ItemDetail as ItemDetailData, type ItemRevision, type ItemRow } from '../../endpoints';
import { manifests } from '../../index';
import ItemDetail from './ItemDetail';
import ItemList from './ItemList';

const registry = createRegistry({
  permissions: [menuPermission('knowledge:catalog-manage')],
  spaces: [{ id: spaceId('logDev'), label: { ko: '로그', en: 'Log' }, description: { ko: '목적', en: 'Purpose' }, permission: CATALOG_MANAGE_PERMISSION, homeMenuId: 'log-knowledge-catalog' }],
  groups: [{ id: groupId('logKnowledge'), label: { ko: '지식', en: 'Knowledge' }, icon: BookOpen, space: spaceId('logDev') }],
  menus: manifests,
});
const session = testSession(['knowledge:catalog-manage', 'platform:view'], { user: { id: 'admin', name: 'admin', title: { ko: '관리자', en: 'Admin' } } });
const ok = (data: unknown): ApiResponse<never> => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'fixture' }) as ApiResponse<never>;

// ---- fixtures: hand-written server answers (a menu screen test does not import the mock) ----
const uuid = (n: number) => `00000005-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const modelOwner = { kind: 'model' as const, modelId: 'm-a100', modelName: 'Alpha 100' };
const swOwner = { kind: 'software' as const, modelId: 'm-a100', modelName: 'Alpha 100', softwareId: 's-1', versionLabel: 'v1.0' };
const row = (n: number, patch: Partial<ItemRow> = {}): ItemRow => ({
  id: uuid(n), itemNo: n, title: `제목 ${n}`, typeCode: 'anomaly', owner: modelOwner, verificationState: 'observed', processingState: 'open',
  publicationState: 'published', latestRevisionNo: 1, updatedAt: `2026-10-${String(10 + n).padStart(2, '0')}T09:00:00.000Z`, ...patch,
});
const ROWS: ItemRow[] = [
  row(1, { title: '챔버 압력 로그 지연', verificationState: 'disputed', processingState: 'under_investigation', latestRevisionNo: 3 }),
  row(3, { title: '보관된 사례', publicationState: 'archived', owner: { ...modelOwner, modelId: 'm-b10', modelName: 'Beta 10' }, typeCode: 'behavior_note' }),
  row(4, { title: '증거 없는 사례', typeCode: 'guideline', latestRevisionNo: 1 }),
  row(5, { title: '파생된 SW 사례', owner: swOwner, latestRevisionNo: 1 }),
  row(7, { title: '일곱 번째' }),
];
const revision = (n: number, patch: Partial<ItemRevision> = {}): ItemRevision => ({
  revisionNo: n, title: `제목 r${n}`, typeCode: 'anomaly', observation: '같은 구간이 반복 기록됨', expected: '한 번만 기록되어야 함', analysisOpinion: '재시작 타이밍 탓으로 보임',
  improvement: '중복 제거 규칙 추가', changeNote: n === 1 ? null : `${n}차 보완`, publishedBy: 'actor-aaaa-1111', publishedAt: `2026-10-0${n + 1}T09:00:00.000Z`,
  evidence: [{ ordinal: 1, sourceKind: 'log_file', sourceOwner: 'MARS', sourceRef: 'logs/a.log', sourceVersion: 'v1', contentHash: 'sha256:9f2c41ab77d0', locator: 'L120-L148', note: '중복 구간 발췌' }], ...patch,
});
const assessment = (n: number, patch: Partial<ItemAssessment>): ItemAssessment => ({
  id: `a-${n}`, dimension: 'verification', priorState: 'not_checked', newState: 'observed', rationale: `사유 ${n}`, actorId: 'actor-bbbb-2222', basedOnRevisionNo: 1, observedAt: `2026-10-${String(n).padStart(2, '0')}T10:00:00.000Z`, ...patch,
});
const link = (kind: 'derived_from' | 'related', direction: 'outgoing' | 'incoming', n: number, sourceRevisionNo: number | null) =>
  ({ kind, direction, itemId: uuid(n), itemNo: n, title: `연결 ${n}`, owner: n === 5 ? swOwner : modelOwner, sourceRevisionNo });
/** Newest first, like the server. */
const history = [
  assessment(13, { dimension: 'processing', priorState: 'open', newState: 'under_investigation', rationale: '원인 조사 시작', basedOnRevisionNo: 3 }),
  assessment(12, { priorState: 'verified', newState: 'disputed', rationale: '정비 이력과 맞지 않는다는 이견', basedOnRevisionNo: 3 }),
  assessment(8, { priorState: 'observed', newState: 'verified', rationale: '두 번째 설비에서도 재현', basedOnRevisionNo: 2 }),
  assessment(4, { rationale: '현장 로그에서 같은 현상을 확인' }),
];
function detailOf(n: number, revisionNo?: number): ItemDetailData | null {
  const base = ROWS.find(r => r.itemNo === n);
  if (!base) return null;
  const wanted = revisionNo ?? base.latestRevisionNo;
  if (wanted > base.latestRevisionNo) return null;
  const revs = Array.from({ length: base.latestRevisionNo }, (_, i) => i + 1);
  return {
    item: { ...base, version: '1', createdBy: 'actor-aaaa-1111', createdAt: '2026-10-01T09:00:00.000Z' },
    revision: revision(wanted, { title: wanted === base.latestRevisionNo ? base.title : `${base.title} 초안 ${wanted}`, ...(n === 4 ? { evidence: [], analysisOpinion: null } : {}) }),
    revisions: [...revs].reverse().map(r => ({ revisionNo: r, title: `제목 r${r}`, publishedBy: 'actor-aaaa-1111', publishedAt: `2026-10-0${r + 1}T09:00:00.000Z`, changeNote: r === 1 ? null : `${r}차 보완` })),
    assessments: n === 1 ? history : [],
    links: n === 1 ? [link('derived_from', 'incoming', 5, 2)] : n === 5 ? [link('derived_from', 'outgoing', 1, 2), link('related', 'outgoing', 7, null)] : [],
  };
}
const conditionOf = (filters: ColumnFilter[] | undefined, id: string) => filters?.find(f => f.id === id) as { value: string[] } | undefined;
function listOf(params: { q?: string | null; filters?: ColumnFilter[] }) {
  const published = conditionOf(params.filters, 'publicationState')?.value ?? ['published'];
  const kinds = conditionOf(params.filters, 'ownerKind')?.value;
  const no = /^ki-?(\d+)$/i.exec(params.q ?? '');
  const rows = ROWS.filter(r => published.includes(r.publicationState) && (!kinds || kinds.includes(r.owner.kind)) && (!no || r.itemNo === Number(no[1])));
  return { rows, total: rows.length };
}

let queries: MenuQuery[] = [];
/** While set, every itemDetail read waits for it (#1365: inspect the window between a revision pick and the reply). */
let holdDetail: Promise<void> | null = null;
const adapter = testAdapter({
  menuQuery: async (req: MenuQuery) => {
    queries.push(req);
    const p = req.params as { itemId?: string; revisionNo?: number; q?: string | null; filters?: ColumnFilter[] };
    if (req.endpoint === 'logKnowledge.itemDetail') {
      if (holdDetail) await holdDetail;
      const found = ROWS.find(r => r.id === p.itemId);
      return ok(found ? detailOf(found.itemNo, p.revisionNo) : null);
    }
    return ok(listOf(p));
  },
  session: () => session,
});

let restoreGeometry: () => void;
beforeEach(() => { queries = []; holdDetail = null; restoreGeometry = stubCompactTableGeometry(); });
afterEach(() => { cleanup(); restoreGeometry(); vi.restoreAllMocks(); });

const idOf = (itemNo: number) => uuid(itemNo);
function mountList(search = '') {
  window.history.replaceState(null, '', `/log/knowledge/items?v=1${search}`);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider><ItemList /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
}
function mountDetail(itemId: string, search = '') {
  window.history.replaceState(null, '', `/log/knowledge/items/${itemId}?v=1${search}`);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider><ItemDetail params={{ itemId }} /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
}
const url = () => new URLSearchParams(window.location.search);
const hiddenFilters = () => ((window.history.state as { apHidden?: { pairs: [string, string][] } } | null)?.apHidden?.pairs ?? []).filter(([k]) => k === 'filter').map(([, v]) => v);
const filterParams = (...filters: ColumnFilter[]) => encodeFilterParams(filters).map(f => `&filter=${encodeURIComponent(f)}`).join('');
const tableReads = () => queries.filter(q => q.endpoint === 'logKnowledge.items' && (q.params as { pageSize?: number }).pageSize === 25);
const lastFilters = () => (tableReads().at(-1)?.params as { filters?: ColumnFilter[] } | undefined)?.filters;
const detailReads = () => queries.filter(q => q.endpoint === 'logKnowledge.itemDetail');
const slow = { timeout: 8000 };
vi.setConfig({ testTimeout: 20000 });

describe('전체 기술 Item list', () => {
  it('a bare address opens with 게시 상태 = 게시됨 in the address and on the wire', async () => {
    mountList();
    await screen.findByText('KI-1', {}, slow);
    expect(hiddenFilters()).toEqual(['publicationState:in:published']);
    await waitFor(() => expect(lastFilters()).toEqual([{ id: 'publicationState', op: 'in', value: ['published'] }]));
    expect(screen.queryByText('KI-3')).toBeNull();
  });

  it('shows the columns and a row link to the detail screen that carries returnTo', async () => {
    mountList();
    const link = await screen.findByRole('link', { name: 'KI-1' }, slow);
    expect(link.getAttribute('href')).toContain(`/log-knowledge-item/${idOf(1)}`);
    expect(link.getAttribute('href')).toContain('returnTo=');
    const row = link.closest('[role="row"]')!;
    expect(within(row as HTMLElement).getByText('챔버 압력 로그 지연')).toBeTruthy();
    expect(row.textContent).toContain('이상 사례');
    expect(row.textContent).toContain('이견 있음');
    expect(row.textContent).toContain('조사 중');
    expect(['Item ID', '제목', '소유', '유형', '검증', '처리', '갱신일'].every(h => screen.getAllByRole('columnheader').some(c => c.textContent?.includes(h)))).toBe(true);
  });

  it('draws the owner chip for a model-owned and a SW-owned item', async () => {
    mountList();
    const model = (await screen.findByText('KI-1', {}, slow)).closest('[role="row"]') as HTMLElement;
    expect(model.textContent).toContain('모델');
    expect(within(model).getByTitle('Alpha 100')).toBeTruthy();
    cleanup();
    mountList(`${filterParams({ id: 'ownerKind', op: 'in', value: ['software'] }, { id: 'publicationState', op: 'in', value: ['published'] })}`);
    const software = (await screen.findAllByTitle(/^Alpha 100 \/ v/, {}, slow))[0]!.closest('[role="row"]') as HTMLElement;
    expect(software.textContent).toContain('SW');
    expect(screen.queryAllByTitle('Alpha 200')).toHaveLength(0);
  });

  it('mutes archived rows when the filter asks for them', async () => {
    mountList(filterParams({ id: 'publicationState', op: 'in', value: ['published', 'archived'] }));
    const archived = (await screen.findByText('KI-3', {}, slow)).closest('[role="row"]')!;
    expect(archived.getAttribute('data-muted')).toBe('true');
    expect(archived.textContent).toContain('보관됨');
    expect(screen.getByText('KI-1').closest('[role="row"]')!.getAttribute('data-muted')).toBeNull();
  });

  it('sends several filters at once, keeps them through a remount (refresh) and follows Back/Forward', async () => {
    const both = [{ id: 'typeCode', op: 'in', value: ['anomaly'] }, { id: 'verificationState', op: 'in', value: ['verified', 'disputed'] }, { id: 'publicationState', op: 'in', value: ['published'] }] satisfies ColumnFilter[];
    mountList(filterParams(...both));
    await screen.findByText('KI-1', {}, slow);
    await waitFor(() => expect(lastFilters()).toEqual(both));
    cleanup(); queries = [];
    mountList(filterParams(...both));
    await screen.findByText('KI-1', {}, slow);
    await waitFor(() => expect(lastFilters()).toEqual(both));
    const other = [{ id: 'processingState', op: 'in', value: ['resolved'] }, { id: 'publicationState', op: 'in', value: ['published'] }] satisfies ColumnFilter[];
    act(() => { window.history.pushState(null, '', `/log/knowledge/items?v=1${filterParams(...other)}`); window.dispatchEvent(new PopStateEvent('popstate')); });
    await waitFor(() => expect(lastFilters()).toEqual(other), slow);
    act(() => { window.history.back(); });
    await waitFor(() => expect(lastFilters()).toEqual(both), slow);
  });

  it('searches the title and KI-<n> through the server', async () => {
    mountList(`${filterParams({ id: 'publicationState', op: 'in', value: ['published'] })}&q=ki-7`);
    await screen.findByText('KI-7', {}, slow);
    expect((tableReads().at(-1)?.params as { q: string | null }).q).toBe('ki-7');
    expect(screen.queryByText('KI-1')).toBeNull();
  });
});

describe('기술 Item detail', () => {
  it('shows the title, owner, type, three separate state badges and the revision stamp', async () => {
    mountDetail(idOf(1));
    expect(await screen.findByRole('heading', { name: '챔버 압력 로그 지연' }, slow)).toBeTruthy();
    expect(screen.getAllByText('KI-1').length).toBeGreaterThan(0);
    const badge = (axis: string, state: string) => screen.getAllByText(axis).some(el => el.parentElement!.textContent === `${axis}\u00a0${state}`);
    expect(badge('게시', '게시됨')).toBe(true);
    expect(badge('기술 검증', '이견 있음')).toBe(true);
    expect(badge('처리', '조사 중')).toBe(true);
    expect(screen.getByTitle('Alpha 100')).toBeTruthy();
    expect(screen.getByText('이상 사례')).toBeTruthy();
    expect(detailReads().at(-1)?.params).toEqual({ itemId: idOf(1) });
  });

  it('keeps fact and opinion apart: the opinion block is marked, dashed and says it is not fact', async () => {
    mountDetail(idOf(1));
    const opinion = (await screen.findByRole('region', { name: '분석 의견' }, slow));
    expect(opinion.getAttribute('data-kind')).toBe('opinion');
    expect(opinion.className).toContain('border-dashed');
    expect(opinion.textContent).toContain('의견 · 사실 아님');
    for (const name of ['관찰 사실', '기대·기준', '개선 방향']) {
      const block = screen.getByRole('region', { name });
      expect(block.getAttribute('data-kind')).toBe('fact');
      expect(block.textContent).not.toContain('의견 · 사실 아님');
    }
  });

  it('writes 기록 없음 for an empty block and 등록된 근거 없음 for an item without evidence', async () => {
    mountDetail(idOf(4));
    await screen.findByRole('heading', { name: /증거 없는 사례/ }, slow);
    expect(screen.getByRole('region', { name: '분석 의견' }).textContent).toContain('기록 없음');
    expect(screen.getByRole('region', { name: '근거' }).textContent).toContain('등록된 근거 없음');
  });

  it('lists evidence pointers with kind, owner, ref, version, hash, locator and note', async () => {
    mountDetail(idOf(1));
    const evidence = await screen.findByRole('region', { name: '근거' }, slow);
    for (const text of ['로그 파일', 'MARS', 'sha256:9f2c41ab77d0', 'L120-L148', '중복 구간 발췌']) expect(evidence.textContent).toContain(text);
    expect(evidence.textContent).not.toContain('log_file');
  });

  it('links both directions: 이 Item에서 파생 on the original, 파생 원본 on the derived item', async () => {
    mountDetail(idOf(1));
    const links = await screen.findByRole('region', { name: '연결 Item' }, slow);
    expect(links.textContent).toContain('이 Item에서 파생');
    expect(within(links).getByRole('link', { name: 'KI-5' }).getAttribute('href')).toContain(`/log-knowledge-item/${idOf(5)}`);
    cleanup();
    mountDetail(idOf(5));
    const derived = await screen.findByRole('region', { name: '연결 Item' }, slow);
    expect(derived.textContent).toContain('파생 원본');
    expect(derived.textContent).toContain('r2');
    expect(within(derived).getByRole('link', { name: 'KI-1' }).getAttribute('href')).toContain(`/log-knowledge-item/${idOf(1)}`);
  });

  it('lists the assessments newest first with axis, prior → new, rationale and basis revision', async () => {
    mountDetail(idOf(1));
    const history = await screen.findByRole('list', { name: '판단 변경 이력 (최신 먼저)' }, slow);
    const entries = within(history).getAllByRole('listitem');
    expect(entries).toHaveLength(4);
    expect(entries[0]!.textContent).toContain('원인 조사 시작');
    expect(entries[0]!.textContent).toContain('처리');
    expect(entries[1]!.textContent).toContain('정비 이력과 맞지 않는다는 이견');
    expect(entries[1]!.textContent).toContain('검증됨');
    expect(entries[1]!.textContent).toContain('이견 있음');
    expect(entries[3]!.textContent).toContain('현장 로그에서 같은 현상을 확인');
    expect(entries[3]!.textContent).toContain('r1 기준');
  });

  it('reads an older revision through ?rev=, shows the banner and returns to the latest', async () => {
    mountDetail(idOf(1), '&rev=1');
    expect(await screen.findByText(/이전 리비전 r1을 보고 있습니다/, {}, slow)).toBeTruthy();
    expect(detailReads().at(-1)?.params).toEqual({ itemId: idOf(1), revisionNo: 1 });
    expect(screen.getByRole('heading', { name: /초안 1/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '최신 보기' }));
    await waitFor(() => expect(url().get('rev')).toBeNull());
    await waitFor(() => expect(screen.queryByText(/이전 리비전/)).toBeNull(), slow);
    expect(detailReads().at(-1)?.params).toEqual({ itemId: idOf(1) });
  });

  it('selecting a revision writes ?rev= and marks the current one', async () => {
    mountDetail(idOf(1));
    const list = await screen.findByRole('region', { name: '리비전' }, slow);
    expect(list.textContent).toContain('현재');
    expect(within(list).getByRole('button', { name: /r3/ }).getAttribute('aria-current')).toBe('true');
    fireEvent.click(within(list).getByRole('button', { name: /r2/ }));
    await waitFor(() => expect(url().get('rev')).toBe('2'));
    expect(await screen.findByText(/이전 리비전 r2을 보고 있습니다/, {}, slow)).toBeTruthy();
    expect(detailReads().at(-1)?.params).toEqual({ itemId: idOf(1), revisionNo: 2 });
  });

  it('answers not-found with a link back for an unknown item and for a revision the item lacks', async () => {
    mountDetail('00000005-0000-4000-8000-0000000000ff');
    expect(await screen.findByText('이 Item을 찾을 수 없습니다', {}, slow)).toBeTruthy();
    expect(screen.getByRole('link', { name: '전체 기술 Item으로' }).getAttribute('href')).toContain('/log-knowledge-items');
    cleanup();
    mountDetail(idOf(1), '&rev=9');
    expect(await screen.findByText('이 Item을 찾을 수 없습니다', {}, slow)).toBeTruthy();
    expect(screen.getByText(/r9 리비전이 없습니다/)).toBeTruthy();
  });

  it('does not ask the server for an id that is not a uuid, and refuses a malformed rev instead of correcting it', async () => {
    mountDetail('KI-1');
    expect(await screen.findByText('이 Item을 찾을 수 없습니다', {}, slow)).toBeTruthy();
    expect(detailReads()).toHaveLength(0);
    cleanup();
    mountDetail(idOf(1), '&rev=abc');
    expect((await screen.findByRole('alert', {}, slow)).textContent).toContain('abc');
    expect(detailReads()).toHaveLength(0);
  });

  it('renders no write control (writes are node s3)', async () => {
    mountDetail(idOf(1));
    await screen.findByRole('heading', { name: '챔버 압력 로그 지연' }, slow);
    expect(screen.queryByRole('button', { name: /수정|판단 변경|보관|신규 작성|근거 추가/ })).toBeNull();
  });
});

describe('기술 Item instants follow the viewer zone', () => {
  const realTz = process.env.TZ;
  afterEach(() => { if (realTz === undefined) delete process.env.TZ; else process.env.TZ = realTz; });
  it('shows the list 갱신일 and the detail stamps on the viewer calendar day (Auckland: Oct 2 20:30Z is Oct 3)', async () => {
    process.env.TZ = 'Pacific/Auckland';
    const saved = ROWS.splice(0, ROWS.length, row(1, { updatedAt: '2026-10-02T20:30:00.000Z' }));
    try {
      mountList();
      await screen.findByText('KI-1', {}, slow);
      expect(screen.getByText(/10\. 3\./)).toBeTruthy();
      expect(screen.queryByText('2026-10-02')).toBeNull();
    } finally { ROWS.splice(0, ROWS.length, ...saved); }
  });
});

describe('기술 Item 상세 keeps the previous revision while another loads (#1365)', () => {
  it('picking an older revision keeps the shown revision with the refreshing label and no skeleton, then shows the picked one', async () => {
    mountDetail(idOf(1));
    const list = await screen.findByRole('region', { name: '리비전' }, slow);
    expect(await screen.findByRole('heading', { name: '챔버 압력 로그 지연' }, slow)).toBeTruthy();
    let release = () => {};
    holdDetail = new Promise<void>(resolve => { release = resolve; });
    fireEvent.click(within(list).getByRole('button', { name: /r2/ }));
    await waitFor(() => expect(url().get('rev')).toBe('2'));
    expect(screen.getByRole('heading', { name: '챔버 압력 로그 지연' })).toBeTruthy();
    expect(screen.getAllByRole('status').some(node => node.textContent?.includes('갱신 중'))).toBe(true);
    expect(document.querySelectorAll('[role="status"][aria-busy]').length).toBe(0);
    expect(screen.queryByText(/이전 리비전 r2/)).toBeNull();
    await act(async () => { release(); });
    expect(await screen.findByText(/이전 리비전 r2을 보고 있습니다/, {}, slow)).toBeTruthy();
  });

  it('another Item opens fresh, never behind the previous Item', async () => {
    mountDetail(idOf(1));
    expect(await screen.findByRole('heading', { name: '챔버 압력 로그 지연' }, slow)).toBeTruthy();
    holdDetail = new Promise<void>(() => {});
    cleanup();
    mountDetail(idOf(4));
    expect(screen.queryByRole('heading', { name: '챔버 압력 로그 지연' })).toBeNull();
  });
});
