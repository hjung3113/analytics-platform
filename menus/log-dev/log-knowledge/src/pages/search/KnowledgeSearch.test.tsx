// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { stubCompactTableGeometry } from '@ap/components/testing';
import type { ApiResponse, MenuQuery } from '@ap/contracts';
import type { KnowledgeSearchData, KnowledgeSearchItem, KnowledgeSearchParams } from '../../endpoints';
import { knowledgeRegistry, treeWith } from '../test-support';
import KnowledgeSearch from './KnowledgeSearch';

const registry = knowledgeRegistry(['knowledge:catalog-manage'], { homeMenuId: 'log-knowledge-search', description: { ko: '검색', en: 'Search' } });
const item: KnowledgeSearchItem = {
  itemId: '00000005-0000-4000-8000-000000000001', itemNo: 1501, title: 'Step 전환 직후 시작 지연', excerpt: '최신 Revision의 관찰 사실', typeCode: 'anomaly', revisionNo: 2,
  publicationState: 'published', verificationState: 'verified', processingState: 'open', publishedAt: '2026-11-08T00:00:00Z',
  owner: { modelId: '00000003-0000-4000-8000-000000000001', modelCode: 'MX-100', modelName: 'MX-100', softwareId: null, softwareLabel: null },
  reasons: ['observed_same_direction'], stage: 1, expectedOnly: false, relatedCount: 2,
};
const initialData = (): KnowledgeSearchData => ({
  version: 'v0', interpretation: { original: 'STEP_PROCESS before PROCESS_START', tokens: [], direction: { origin: 'operator', source: 'STEP_PROCESS', target: 'PROCESS_START', kind: 'all', swapped: false } },
  items: [item], opposite: null, oppositeHasMore: false, hasMore: false, nextCursor: null, capped: false,
  indexLag: { lagSeconds: null, backfill: { state: 'done', percent: 100 } },
});
let data = initialData(), fail = false, rejectedCursor: string | null = null, requests: MenuQuery[] = [], hold: Promise<void> | null = null;
const storedPreferences = new Map<string, string>();
const ok = (value: unknown): ApiResponse<never> => ({ outcome: 'ok', data: value, assessments: [], trust: null, correlationId: 'search-test' }) as ApiResponse<never>;
const session = testSession(['platform:view']);
const adapter = testAdapter({
  session: () => session,
  menuQuery: async request => {
    requests.push(request);
    if (request.endpoint === 'logKnowledge.searchSuggest') return ok({ version: 'v0', suggestions: [{ kind: 'eventKey', text: 'CHAMBER/START' }] });
    if (request.endpoint !== 'logKnowledge.search') return ok({ rows: [], total: 0 });
    if (hold) await hold;
    if (fail) return { ...ok(null), outcome: 'error' };
    const params = request.params as KnowledgeSearchParams;
    if (params.cursor === rejectedCursor) return { ...ok(null), outcome: 'error' };
    const reply = structuredClone(data);
    if (params.q === 'STEP_PROCESS PROCESS_START') reply.interpretation.direction = null;
    if (params.cursor) { reply.items = [{ ...item, itemId: '00000005-0000-4000-8000-000000000003', itemNo: 1503, title: '다음 페이지 Item' }]; reply.hasMore = false; reply.nextCursor = null; }
    if (params.includeOpposite) reply.opposite = [{ ...item, itemId: '00000005-0000-4000-8000-000000000002', title: '역방향 관찰', itemNo: 1502, reasons: [] }];
    return ok(reply);
  },
});
const query = 'q=STEP_PROCESS%20before%20PROCESS_START';
const recentModelId = '00000003-0000-4000-8000-000000000009';
const recentDetail = {
  item: { id: item.itemId, itemNo: item.itemNo, owner: { kind: 'model', modelId: recentModelId, modelName: 'MX-200' }, publicationState: 'published', verificationState: 'verified', processingState: 'open' },
  revision: { title: item.title, typeCode: item.typeCode },
};
const recentProfile = { model: { id: recentModelId, code: 'MX-200', name: 'MX-200', vendor: { name: 'Acme' } } };
function mount(q = query) {
  window.history.replaceState(null, '', `/log/knowledge/search${q ? `?${q}` : ''}`);
  return render(treeWith({ registry, adapter, ui: <KnowledgeSearch /> }));
}
let restoreGeometry = () => {};
beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storedPreferences.get(key) ?? null,
    setItem: (key: string, value: string) => { storedPreferences.set(key, value); },
    removeItem: (key: string) => { storedPreferences.delete(key); },
    clear: () => storedPreferences.clear(),
  } });
  storedPreferences.clear(); restoreGeometry = stubCompactTableGeometry(); data = initialData(); fail = false; rejectedCursor = null; requests = []; hold = null;
});
afterEach(() => { cleanup(); restoreGeometry(); storedPreferences.clear(); });

describe('confirmed knowledge search', () => {
  it('starts idle with labelled selectors and no leftover result title', async () => {
    mount('');
    expect(await screen.findByRole('region', { name: '모델 탐색' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /검색 결과/ })).toBeNull();
    const order = screen.getByRole('button', { name: '순서 검색' });
    expect(order.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('combobox', { name: 'Event A' })).toBeNull();
    fireEvent.click(order);
    expect(screen.getByRole('combobox', { name: 'Event A' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Event B' })).toBeTruthy();
    expect(requests.some(r => r.endpoint === 'logKnowledge.search')).toBe(false);
  });
  it('shows owner, states, match reasons and linked related counts without exact totals', async () => {
    data.hasMore = true; data.nextCursor = 'next'; data.capped = true;
    Object.assign(data, { total: 9854, counts: { observed: 9853 } });
    mount();
    expect(await screen.findByText(item.title)).toBeTruthy();
    expect(screen.getByText('같은 방향 · 관찰')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'KI-1501' }).getAttribute('href')).toContain(item.itemId);
    expect(screen.getByText('관련 Item 2건').closest('a')?.getAttribute('href')).toContain(item.itemId);
    expect(screen.getAllByRole('link').filter(link => link.getAttribute('href')?.includes(item.itemId))).toHaveLength(3);
    expect(screen.getByText('MX-100')).toBeTruthy();
    expect(screen.getByText('100건 이상')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/9854|9853|총\s*\d|\d+\s*\/\s*\d+/);
    expect(screen.getByRole('button', { name: '더 보기' })).toBeTruthy();
  });
  it('shows no-result guidance with no result title or fabricated counts', async () => {
    data.items = [];
    mount();
    expect(await screen.findByText('일치하는 기술 Item을 찾지 못했습니다')).toBeTruthy();
    expect(screen.getByText('방금 발행한 Item은 잠시 뒤 검색됩니다')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /검색 결과/ })).toBeNull();
  });
  it.each([
    ['expected_same_direction', '같은 방향 · 명세상 기대'],
    ['exact_token', 'Event 키 일치'],
    ['concept_mapping', '개념 매핑으로 일치'],
  ] as const)('explains %s matches', async (reason, label) => {
    data.items = [{ ...item, reasons: [reason], expectedOnly: reason === 'expected_same_direction' }];
    mount();
    expect(await screen.findByText(label)).toBeTruthy();
  });
  it('uses the returned cursor to append the next page', async () => {
    data.hasMore = true; data.nextCursor = 'next';
    mount();
    fireEvent.click(await screen.findByRole('button', { name: '더 보기' }));
    expect(await screen.findByText('다음 페이지 Item')).toBeTruthy();
    expect(screen.getByText(item.title)).toBeTruthy();
    expect(requests.some(r => r.endpoint === 'logKnowledge.search' && (r.params as { cursor?: string }).cursor === 'next')).toBe(true);
  });
  it('restarts page one with every search parameter after a continuation is rejected', async () => {
    data.hasMore = true; data.nextCursor = 'expired'; rejectedCursor = 'expired';
    const relation = { source: 'STEP_PROCESS', predicate: 'after', target: 'PROCESS_START' };
    mount(new URLSearchParams({ q: 'step log', relation: JSON.stringify(relation), kind: 'expected', opposite: 'true' }).toString());
    fireEvent.click(await screen.findByRole('button', { name: '더 보기' }));
    await screen.findByText('검색하지 못했습니다');
    data.nextCursor = 'fresh'; data.items = [{ ...item, title: '새 첫 페이지 Item' }];
    let release = () => {};
    hold = new Promise<void>(resolve => { release = resolve; });
    fireEvent.click(screen.getByRole('button', { name: '처음부터 다시 검색' }));
    await waitFor(() => expect(requests.filter(r => r.endpoint === 'logKnowledge.search')).toHaveLength(3));
    expect(screen.queryByText('검색하지 못했습니다')).toBeNull();
    expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull();
    await act(async () => { hold = null; release(); });
    await screen.findByText('새 첫 페이지 Item');
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    await screen.findByText('다음 페이지 Item');
    const params = { q: 'step log', relation, kind: 'expected', includeOpposite: true };
    expect(requests.filter(r => r.endpoint === 'logKnowledge.search').map(r => r.params)).toEqual([
      params, { ...params, cursor: 'expired' }, params, { ...params, cursor: 'fresh' },
    ]);
    expect(screen.queryByText(item.title)).toBeNull();
    expect(new URLSearchParams(window.location.search).get('q')).toBe('step log');
  });
  it('submits an explicit order through the shareable relation key', async () => {
    mount('');
    fireEvent.click(screen.getByRole('button', { name: '순서 검색' }));
    const selector = await screen.findByRole('region', { name: '순서 검색' });
    // No pre-filled Event pair (#1594 B-Q1): the button stays off until the user names both Events.
    const submit = within(selector).getByRole('button', { name: '순서 검색' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    const choose = (name: string, key: string) => {
      fireEvent.click(within(selector).getByRole('combobox', { name }));
      const input = screen.getByRole('textbox', { name: '' });
      fireEvent.change(input, { target: { value: key } });
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter' });
    };
    choose('Event A', 'CHAMBER/STEP_PROCESS');
    expect(submit.disabled).toBe(true);
    choose('Event B', 'CHAMBER/PROCESS_START');
    fireEvent.click(within(selector).getByRole('radio', { name: '나중' }));
    fireEvent.click(submit);
    await waitFor(() => expect(requests.some(r => r.endpoint === 'logKnowledge.search')).toBe(true));
    expect(JSON.parse(new URLSearchParams(window.location.search).get('relation')!)).toEqual({ source: 'CHAMBER/STEP_PROCESS', predicate: 'after', target: 'CHAMBER/PROCESS_START' });
  });
  it('shows accessible recent Items and models, with only one Item destination link', async () => {
    storedPreferences.set('platform:recent:u1', JSON.stringify([
      { menuId: 'log-knowledge-item', url: `/log/knowledge/items/${item.itemId}?v=1`, at: 3 },
      { menuId: 'log-knowledge-model', url: `/log/knowledge/models/${recentModelId}?v=1`, at: 2 },
      { menuId: 'log-knowledge-spec', url: `/log/knowledge/models/${recentModelId}/spec?v=1`, at: 1 },
    ]));
    const recentAdapter = testAdapter({ session: () => session, menuQuery: async request => {
      requests.push(request);
      if (request.endpoint === 'logKnowledge.itemDetail') return ok(recentDetail);
      if (request.endpoint === 'logKnowledge.modelProfile') return ok(recentProfile);
      return ok({ rows: [], total: 0 });
    } });
    window.history.replaceState(null, '', '/log/knowledge/search?v=1');
    render(treeWith({ registry, adapter: recentAdapter, ui: <KnowledgeSearch /> }));
    const items = await screen.findByRole('region', { name: '최근 본 기술 Item' });
    const title = within(items).getByRole('link', { name: item.title });
    expect(title.getAttribute('href')).toContain(item.itemId);
    expect(within(items).getByText('KI-1501').closest('a')).toBeNull();
    expect(within(items).getAllByRole('link')).toHaveLength(1);
    const models = await screen.findByRole('region', { name: '자주 보는 모델' });
    expect(within(models).getByRole('link', { name: 'MX-200' })).toBeTruthy();
    expect(requests.filter(request => request.endpoint === 'logKnowledge.modelProfile')).toHaveLength(1);
  });
  it('skips recent Items and models that are forbidden or gone', async () => {
    const forbiddenItemId = '00000005-0000-4000-8000-000000000011', goneItemId = '00000005-0000-4000-8000-000000000012';
    const forbiddenModelId = '00000003-0000-4000-8000-000000000013';
    storedPreferences.set('platform:recent:u1', JSON.stringify([
      { menuId: 'log-knowledge-item', url: `/log/knowledge/items/${forbiddenItemId}`, at: 5 },
      { menuId: 'log-knowledge-item', url: `/log/knowledge/items/${goneItemId}`, at: 4 },
      { menuId: 'log-knowledge-item', url: `/log/knowledge/items/${item.itemId}`, at: 3 },
      { menuId: 'log-knowledge-model', url: `/log/knowledge/models/${forbiddenModelId}`, at: 2 },
      { menuId: 'log-knowledge-model', url: `/log/knowledge/models/${recentModelId}`, at: 1 },
    ]));
    const recentAdapter = testAdapter({ session: () => session, menuQuery: async request => {
      requests.push(request);
      const params = request.params as { itemId?: string; modelId?: string };
      if (request.endpoint === 'logKnowledge.itemDetail') {
        if (params.itemId === forbiddenItemId) return { ...ok(null), outcome: 'forbidden' };
        if (params.itemId === goneItemId) return ok(null);
        return ok({ ...recentDetail, item: { ...recentDetail.item, id: params.itemId }, revision: { ...recentDetail.revision, title: '접근 가능한 최근 Item' } });
      }
      if (request.endpoint === 'logKnowledge.modelProfile') {
        if (params.modelId === forbiddenModelId) return { ...ok(null), outcome: 'forbidden' };
        return ok(recentProfile);
      }
      return ok({ rows: [], total: 0 });
    } });
    window.history.replaceState(null, '', '/log/knowledge/search?v=1');
    render(treeWith({ registry, adapter: recentAdapter, ui: <KnowledgeSearch /> }));
    const items = await screen.findByRole('region', { name: '최근 본 기술 Item' });
    expect(within(items).getByRole('link', { name: '접근 가능한 최근 Item' })).toBeTruthy();
    expect(items.textContent).not.toContain(forbiddenItemId);
    expect(items.textContent).not.toContain(goneItemId);
    expect(within(items).getAllByRole('link')).toHaveLength(1);
    const models = await screen.findByRole('region', { name: '자주 보는 모델' });
    expect(within(models).getByRole('link', { name: 'MX-200' })).toBeTruthy();
    expect(within(models).queryByText(forbiddenModelId)).toBeNull();
  });
  it('keeps empty history useful and opens conditioned URLs directly into results', async () => {
    mount('');
    expect(await screen.findByRole('region', { name: '모델 탐색' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: '최근 본 기술 Item' })).toBeNull();
    cleanup(); requests = [];
    mount(query);
    expect(await screen.findByText(item.title)).toBeTruthy();
    expect(screen.getByRole('region', { name: '검색 결과' })).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Event A' })).toBeNull();
    expect(requests.some(request => request.endpoint === 'logKnowledge.search')).toBe(true);
  });
  it('uses indexLag percentages and lag chips without N/N counters', async () => {
    data.indexLag = { lagSeconds: 11, backfill: { state: 'running', percent: 48 } };
    mount();
    expect(await screen.findByText('색인 중 48%')).toBeTruthy();
    expect(screen.getAllByText('색인 지연').length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/\d+\s*\/\s*\d+/);
  });
  it('keeps opposite-direction Items in a separately labelled section, default off', async () => {
    mount();
    await screen.findByText(item.title);
    const toggle = screen.getByRole('checkbox', { name: '반대 방향도 보기' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByText('역방향 관찰')).toBeNull();
    fireEvent.click(toggle);
    const section = await screen.findByRole('region', { name: '반대 방향' });
    expect(within(section).getByText('역방향 관찰')).toBeTruthy();
    expect(within(section).queryByText('일치 이유')).toBeNull();
    expect(within(section).getByText('관련 Item 2건').closest('a')?.getAttribute('href')).toContain('00000005-0000-4000-8000-000000000002');
    expect(within(screen.getByRole('region', { name: '검색 결과' })).queryByText('역방향 관찰')).toBeNull();
    expect(new URLSearchParams(window.location.search).get('opposite')).toBe('true');
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.queryByRole('region', { name: '반대 방향' })).toBeNull());
  });
  it('offers one filter reset while the interpreted direction and filter panel are visible', async () => {
    mount();
    await screen.findByText(item.title);
    fireEvent.click(screen.getByRole('button', { name: '필터' }));
    expect(screen.getAllByRole('button', { name: '필터 초기화' })).toHaveLength(1);
  });
  it.each(['STEP_PROCESS before PROCESS_START', 'STEP_PROCESS→PROCESS_START', 'STEP_PROCESS →PROCESS_START', 'STEP_PROCESS→ PROCESS_START'])('removes direction and preserves plain terms after reload for %s', async q => {
    const view = mount(new URLSearchParams({ q }).toString());
    await screen.findByText(/방향으로 해석:/);
    fireEvent.click(screen.getByRole('button', { name: '방향 해석 끄기' }));
    await waitFor(() => expect(screen.queryByText(/방향으로 해석:/)).toBeNull());
    const params = new URLSearchParams(window.location.search);
    expect(params.get('q')).toBe('STEP_PROCESS PROCESS_START');
    expect(params.get('relation')).toBeNull();
    const address = window.location.search.slice(1);
    view.unmount();
    mount(address);
    await screen.findByText(item.title);
    expect(screen.queryByText(/방향으로 해석:/)).toBeNull();
    expect(screen.getByRole('searchbox', { name: '통합 검색어' }).getAttribute('value')).toBe('STEP_PROCESS PROCESS_START');
  });
  it('preserves every ordinary text word when resetting filters', async () => {
    data.interpretation.direction = null;
    mount(new URLSearchParams({ q: 'step before process', kind: 'expected' }).toString());
    await screen.findByText(item.title);
    fireEvent.click(screen.getByRole('button', { name: '필터' }));
    fireEvent.click(screen.getByRole('button', { name: '필터 초기화' }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('kind')).toBeNull());
    expect(new URLSearchParams(window.location.search).get('q')).toBe('step before process');
  });
  it('shows loading and recovers from a failed read with Retry', async () => {
    let release = () => {};
    hold = new Promise<void>(resolve => { release = resolve; });
    fail = true;
    mount();
    expect(await screen.findByText('검색 중…')).toBeTruthy();
    await act(async () => release());
    expect(await screen.findByText('검색하지 못했습니다')).toBeTruthy();
    fail = false; hold = null;
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText(item.title)).toBeTruthy();
  });
  it('commits text with Enter and offers server suggestions with keyboard access', async () => {
    mount('');
    const input = await screen.findByRole('searchbox', { name: '통합 검색어' });
    fireEvent.change(input, { target: { value: 'CHAMBER' } });
    expect(await screen.findByRole('button', { name: 'CHAMBER/START 검색' })).toBeTruthy();
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(requests.some(r => r.endpoint === 'logKnowledge.search')).toBe(true));
    expect(new URLSearchParams(window.location.search).get('q')).toBe('CHAMBER');
  });
  it('keeps suggestions available when focus leaves the input for a suggestion', async () => {
    mount('');
    const input = await screen.findByRole('searchbox', { name: '통합 검색어' });
    fireEvent.change(input, { target: { value: 'CHAMBER' } });
    await screen.findByRole('button', { name: 'CHAMBER/START 검색' });
    fireEvent.blur(input);
    expect(requests.some(r => r.endpoint === 'logKnowledge.search')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'CHAMBER/START 검색' }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('q')).toBe('CHAMBER/START'));
  });
});
