// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Ruler } from 'lucide-react';
import { groupId, spaceId, type ApiResponse, type MenuQuery } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, usePlatform } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { manifests } from '../index';
import { REASON_COPY, type CatalogStatus, type CoverageData, type CoverageReason, type RuleDetail } from '../endpoints';
import RulesScreen from './RulesScreen';

const modelId = '00000003-0000-4000-8000-000000000001';
const otherModelId = '00000003-0000-4000-8000-000000000002';
const softwareId = '00000004-0000-4000-8000-000000000001';
const status: CatalogStatus = { received: true, lastReportedAt: '2026-11-08T11:30:00', sourceSystem: '합성 fixture', validatorVersion: 'v0', sources: [], ruleSetCount: 1, ruleCount: 1, requirementIdsDeclared: true };
const long = 'UNBROKEN_TARGET_'.repeat(28);
const detail: RuleDetail = { ruleSetKey: 'core', ruleKey: 'R-001', revision: 'r2', title: '합성 규칙', summary: '합성 fixture 요약', support: 'supported', scope: null, requiredDefault: null, inCurrentRevision: true, sourceSystem: '합성 fixture', lastReportedAt: status.lastReportedAt!, targets: [{ position: 0, format: 'original', target: long, requirementIds: ['ROBOT/READY', 'ORPHAN'] }], revisions: [{ revision: 'r2', status: 'active', retired: false, isCurrent: true, support: 'supported' }] };
const row = { ...detail, firstTarget: detail.targets[0], targetCount: 1, requirementIdCount: 2 };
const coverage: CoverageData = { computable: true, specPin: { revisionId: 'rev-1', changeSetDigest: 'digest' }, coverageDigest: 'coverage-digest', counts: { no_rule: 0, unsupported: 0, unknown: 0, partial: 0, covered: 1, total: 1 }, ruleSetRevisions: [], rows: [{ key: 'ROBOT/READY', state: 'covered', declaredCount: 1, declaredBy: [{ ruleSetKey: 'core', revision: 'r2', ruleKey: 'R-001', support: 'supported' }] }], total: 1, page: 0, pageSize: 50 };
const registry = createRegistry({ spaces: [{ id: spaceId('logDev'), label: { ko: '로그', en: 'Log' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'log-rules' }], groups: [{ id: groupId('logRules'), label: { ko: '기준', en: 'Rules' }, icon: Ruler, space: spaceId('logDev') }], menus: [...manifests, { ...manifests[0]!, id: 'log-knowledge-spec', path: '/log/knowledge/models/:modelId/spec', pageKeys: ['module', 'event', 'software', 'returnTo'], repeatedPageKeys: [], hiddenPageKeys: [], contextResetKeys: [], primary: false }] });
let received = true, empty = false, missing = false, noIds = false;
let data: CoverageData | null = coverage;
let queries: MenuQuery[] = [];
let hold: Promise<void> | undefined;
let softwareFailures = 0;
let coverageAnswer: ((req: MenuQuery) => Promise<ApiResponse<never>>) | undefined;
const ok = (value: unknown) => ({ outcome: 'ok', data: value, assessments: [], trust: null, correlationId: 'fixture' }) as ApiResponse<never>;
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session, menuQuery: async req => {
  queries.push(req);
  if (req.endpoint === 'logRules.catalogStatus') { await hold; return ok({ ...status, received }); }
  if (req.endpoint === 'logRules.rules') return ok({ rows: empty ? [] : [row], total: empty ? 0 : 1 });
  if (req.endpoint === 'logRules.ruleSets') return ok({ rows: [{ ruleSetKey: 'core' }], total: 1 });
  if (req.endpoint === 'logRules.ruleDetail') return ok(missing ? null : { ...detail, targets: noIds ? [{ ...detail.targets[0], requirementIds: [] }] : detail.targets });
  if (req.endpoint === 'logRules.ruleSetDetail') return ok({ ruleSetKey: 'core', revisions: [{ revision: 'r1', retired: true, isCurrent: false, previousRevision: null, changes: null }, { revision: 'r2', retired: false, isCurrent: true, previousRevision: 'r1', changes: { added: ['R-002'], removed: ['R-003'], supportChanged: [{ ruleKey: 'R-001', from: 'unknown', to: 'supported' }], addedCount: 1, removedCount: 1, supportChangedCount: 1, truncated: false } }] });
  if (req.endpoint === 'logRules.coverage') return coverageAnswer ? coverageAnswer(req) : ok(data);
  if (req.endpoint === 'logRules.coverageSummary') return ok({ rows: [] });
  if (req.endpoint === 'logRules.modelOptions') return ok({ rows: [{ id: modelId, code: 'MX-1', name: '합성 모델', vendorName: '합성 설비사', active: true }, { id: otherModelId, code: 'MX-2', name: '다른 모델', vendorName: '합성 설비사', active: true }], total: 2, page: 0, pageSize: 20 });
  if (req.endpoint === 'logRules.softwareOptions' && softwareFailures > 0) { softwareFailures -= 1; return { outcome: 'error', data: null, assessments: [], trust: null, correlationId: 'fixture' } as ApiResponse<never>; }
  if (req.endpoint === 'logRules.softwareOptions') return ok({ rows: [{ id: softwareId, versionLabel: '2.1', name: '', active: true }] });
  return ok(null);
} });
function Slot() { const slot = useDetailPanelSlotHost(); return <aside ref={slot.ref} />; }
function LinkProbe() { const { linkTo, page, pageParams } = usePlatform(); return <output aria-label="공유 주소">{linkTo('log-rules', { page: { ...Object.fromEntries(page), filter: pageParams('filter') } })}</output>; }
const mount = (search = '', params = {}) => {
  window.history.replaceState(null, '', `/logDev/log-rules?v=1${search}`);
  return render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter}><DetailPanelSlotProvider><RulesScreen params={params} /><LinkProbe /><Slot /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
};
let restore: () => void;
beforeEach(() => { received = true; empty = false; missing = false; noIds = false; data = coverage; queries = []; hold = undefined; softwareFailures = 0; coverageAnswer = undefined; restore = stubCompactTableGeometry(); });
afterEach(() => { cleanup(); restore(); });

describe('validation rules screen', () => {
  it.each(['support:in:bogus', 'ruleSetKey:in:', `ruleSetKey:in:${'a'.repeat(201)}`])('refuses malformed filter %s before requesting rules', async filter => {
    mount(`&filter=${encodeURIComponent(filter)}`);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(queries.some(q => q.endpoint === 'logRules.rules')).toBe(false);
  });
  it('preserves a valid unknown RuleSet filter', async () => {
    mount('&filter=ruleSetKey:in:unknown');
    await screen.findByText('R-001');
    expect(queries.find(q => q.endpoint === 'logRules.rules')?.params).toMatchObject({ filters: [{ id: 'ruleSetKey', op: 'in', value: ['unknown'] }] });
  });
  it.each([false, true])('does not take arrival focus after an asynchronous Rule read (direct route: %s)', async direct => {
    let release!: () => void; hold = new Promise<void>(resolve => { release = resolve; });
    mount(direct ? '' : '&ruleSetKey=core&ruleKey=R-001', direct ? { ruleSetKey: 'core', ruleKey: 'R-001' } : {});
    const arrival = document.createElement('button'); document.body.append(arrival); arrival.focus();
    await act(async () => { release(); });
    await screen.findByRole('dialog');
    await act(async () => {});
    expect(document.activeElement).toBe(arrival);
    arrival.remove();
  });
  it('connects both tabs to named panels, including loading and unavailable states', async () => {
    let release!: () => void; hold = new Promise<void>(resolve => { release = resolve; });
    mount();
    const rulesTab = screen.getByRole('tab', { name: '규칙' });
    const panel = screen.getByRole('tabpanel', { name: '규칙' });
    expect(rulesTab.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.querySelector('[aria-busy]')).toBeTruthy();
    await act(async () => { release(); });
    fireEvent.mouseDown(screen.getByRole('tab', { name: '명세 커버리지' }), { button: 0, ctrlKey: false });
    const coveragePanel = await screen.findByRole('tabpanel', { name: '명세 커버리지' });
    expect(within(coveragePanel).getByText('모델을 선택해 주세요')).toBeTruthy();
    expect(screen.getByRole('tab', { name: '명세 커버리지' }).getAttribute('aria-controls')).toBe(coveragePanel.id);
  });
  it('clears search and filters from the empty result recovery', async () => {
    empty = true; mount('&q=absent&filter=support:in:partial&filter=targetCount:contains:csv');
    fireEvent.click(await screen.findByRole('button', { name: '필터 지우기' }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).has('q')).toBe(false));
    expect(screen.getByLabelText('공유 주소').textContent).not.toContain('filter=');
    await waitFor(() => expect(queries.filter(q => q.endpoint === 'logRules.rules').at(-1)?.params).toMatchObject({ q: null, targetQ: null, filters: [] }));
  });
  it('opens current RuleSet rules from history and preserves other filters', async () => {
    mount('&ruleSetKey=core&filter=support:in:partial');
    fireEvent.click(await screen.findByRole('button', { name: '이 RuleSet의 규칙 보기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(queries.filter(q => q.endpoint === 'logRules.rules').at(-1)?.params).toMatchObject({ filters: expect.arrayContaining([{ id: 'ruleSetKey', op: 'in', value: ['core'] }, { id: 'support', op: 'in', value: ['partial'] }]) }));
  });
  it('keeps one toolbar search with IME, Enter, blur and Escape semantics', async () => {
    mount(); const search = await screen.findByRole('searchbox');
    expect(screen.getAllByRole('searchbox')).toHaveLength(1);
    fireEvent.change(search, { target: { value: 'robot' } });
    fireEvent.keyDown(search, { key: 'Enter', isComposing: true });
    expect(new URLSearchParams(window.location.search).has('q')).toBe(false);
    fireEvent.keyDown(search, { key: 'Enter', keyCode: 229 });
    expect(new URLSearchParams(window.location.search).has('q')).toBe(false);
    fireEvent.keyDown(search, { key: 'Enter' });
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('q')).toBe('robot'));
    fireEvent.keyDown(search, { key: 'Escape' });
    expect((search as HTMLInputElement).value).toBe('');
    expect(new URLSearchParams(window.location.search).get('q')).toBe('robot');
    fireEvent.blur(search);
    await waitFor(() => expect(new URLSearchParams(window.location.search).has('q')).toBe(false));
  });
  it('waits for the catalog without briefly showing an empty table', async () => {
    let release!: () => void; hold = new Promise<void>(r => { release = r; }); mount();
    expect(screen.queryByText('규칙 카탈로그')).toBeNull();
    expect(document.querySelector('[aria-busy]')).toBeTruthy(); release();
    expect(await screen.findByText('R-001')).toBeTruthy();
  });
  it('shows a reasoned state instead of a table when the catalog is missing', async () => {
    received = false; mount();
    expect(await screen.findByText('카탈로그를 아직 받지 못했습니다')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(queries.some(q => q.endpoint === 'logRules.rules')).toBe(false);
  });
  it('maps the target text filter to the server parameter and keeps sorting and page in table requests and shared URLs', async () => {
    mount('&tab=rules&q=robot&filter=targetCount:contains:csv&sort=ruleKey:desc&page=2&filter=support:in:partial');
    await screen.findByText('R-001');
    expect(queries.find(q => q.endpoint === 'logRules.rules')?.params).toMatchObject({ q: 'robot', targetQ: 'csv', sorting: [{ id: 'ruleKey', desc: true }], filters: [{ id: 'support', op: 'in', value: ['partial'] }] });
    expect(screen.getByLabelText('공유 주소').textContent).toContain('filter=');
  });
  it('uses the shared empty-filter state', async () => {
    empty = true; mount('&q=absent');
    expect(await screen.findByText('조건에 맞는 결과가 없습니다')).toBeTruthy();
  });
  it('opens a read-only drawer, wraps verbatim values, and restores keyboard focus after Escape', async () => {
    mount(); await screen.findByRole('button', { name: 'R-001 상세 보기' }); await act(async () => {}); const opener = screen.getByRole('button', { name: 'R-001 상세 보기' }); opener.focus(); fireEvent.click(screen.getByRole('button', { name: 'R-001 상세 보기' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(long).className).toContain('break-words');
    expect(within(dialog).getAllByText('지원')).toHaveLength(2); // once for the summary, once for its Revision
    expect(within(dialog).queryByText('저장')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: '상세 닫기' })));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'R-001 상세 보기' })));
    expect(screen.getByText(`original · ${long}`).className).toContain('truncate');
  });
  it('restores direct Rule links and gracefully closes unknown Rule drawers', async () => {
    missing = true; mount('', { ruleSetKey: 'core', ruleKey: 'gone' });
    expect(await screen.findByText('규칙을 찾을 수 없습니다')).toBeTruthy();
    expect(screen.getByRole('dialog').textContent).toContain('규칙을 찾을 수 없습니다');
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: '상세 닫기' }));
  });
  it('can select a different row or RuleSet history after a direct Rule arrival', async () => {
    mount('', { ruleSetKey: 'core', ruleKey: 'R-OLD' });
    await screen.findByRole('dialog'); await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'R-001 상세 보기' }));
    await waitFor(() => expect(queries.filter(q => q.endpoint === 'logRules.ruleDetail').at(-1)?.params).toEqual({ ruleSetKey: 'core', ruleKey: 'R-001' }));
    fireEvent.click(screen.getByRole('button', { name: 'core RuleSet 이력' }));
    expect(await screen.findByRole('dialog', { name: 'core · RuleSet 이력' })).toBeTruthy();
  });
  it('does not call declared IDs unmatched until a complete selected spec is read', async () => {
    mount('&ruleSetKey=core&ruleKey=R-001');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/모델을 선택하면/)).toBeTruthy();
    expect(within(dialog).queryByText('명세에 없는 요구사항 ID')).toBeNull();
  });
  it('pairs exact requirement keys from coverage and labels only proven unmatched IDs', async () => {
    mount(`&ruleSetKey=core&ruleKey=R-001&modelId=${modelId}`);
    expect(await screen.findByText('명세에 없는 요구사항 ID')).toBeTruthy();
    expect(screen.getByRole('link', { name: /ROBOT\/READY.*명세 보기/ }).getAttribute('href')).toContain('module=ROBOT');
  });
  it.each([false, true])('checks every requirement page and refuses a changed snapshot (digest changed: %s)', async changed => {
    let release!: () => void; const second = new Promise<void>(r => { release = r; });
    coverageAnswer = async req => {
      const page = (req.params as { page: number }).page;
      if (page === 1) { await second; return ok({ ...coverage, page: 1, pageSize: 200, coverageDigest: changed ? 'new-digest' : coverage.coverageDigest, total: 201 }); }
      return ok({ ...coverage, rows: Array.from({ length: 200 }, (_, i) => ({ ...coverage.rows[0], key: `OTHER-${i}` })), total: 201, pageSize: 200 });
    };
    mount(`&ruleSetKey=core&ruleKey=R-001&modelId=${modelId}`);
    await screen.findByRole('dialog');
    await waitFor(() => expect(queries.some(q => q.endpoint === 'logRules.coverage' && (q.params as { page: number }).page === 1)).toBe(true));
    expect(screen.queryByText('명세에 없는 요구사항 ID')).toBeNull();
    await act(async () => { release(); });
    if (changed) {
      expect(await screen.findByText('선택한 모델의 명세와 짝 여부를 아직 확인하지 못했습니다.')).toBeTruthy();
      expect(screen.queryByText('명세에 없는 요구사항 ID')).toBeNull();
    } else expect(await screen.findByRole('link', { name: /ROBOT\/READY.*명세 보기/ })).toBeTruthy();
  });
  it('shows the absence of declarations separately', async () => {
    noIds = true; mount('&ruleSetKey=core&ruleKey=R-001');
    expect(await screen.findByText('Validator가 요구사항 ID를 주지 않았습니다.')).toBeTruthy();
  });
  it('reads RuleSet Revision diffs including a retired revision', async () => {
    mount('&ruleSetKey=core');
    expect(await screen.findByRole('dialog', { name: 'core · RuleSet 이력' })).toBeTruthy();
    expect(await screen.findByText('R-002')).toBeTruthy();
    expect(screen.getByText('R-003')).toBeTruthy(); expect(screen.getAllByText(/r1 · 퇴역/)).toHaveLength(1);
  });
  it('keeps drawer state on refresh and browser history navigation', async () => {
    mount('&ruleSetKey=core&ruleKey=R-001'); await screen.findByRole('dialog'); cleanup();
    mount('&ruleSetKey=core&ruleKey=R-001'); await screen.findByRole('dialog');
    window.history.pushState(null, '', '/logDev/log-rules?v=1&tab=rules'); fireEvent(window, new PopStateEvent('popstate'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    window.history.pushState(null, '', '/logDev/log-rules?v=1&ruleSetKey=core&ruleKey=R-001'); fireEvent(window, new PopStateEvent('popstate'));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });
});

describe('spec coverage', () => {
  it('rejects D2 rows against D1 metadata and refreshes the parent snapshot on recovery', async () => {
    let reads = 0;
    const newer = { ...coverage, coverageDigest: 'D2', specPin: { revisionId: 'rev-2', changeSetDigest: 'digest-2' }, counts: { ...coverage.counts, covered: 0, no_rule: 1 }, rows: [{ key: 'NEW/KEY', state: 'no_rule', declaredCount: 0, declaredBy: [] }] };
    coverageAnswer = async () => ok(++reads === 1 ? { ...coverage, coverageDigest: 'D1' } : newer);
    mount(`&tab=coverage&modelId=${modelId}&focus=NEW%2FKEY`);
    const refresh = await screen.findByRole('button', { name: '명세 커버리지 새로고침' });
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText(/명세 커버리지 100%/)).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText(/rev-1/)).toBeNull();
    fireEvent.click(refresh);
    expect(await screen.findByText(/명세 커버리지 0%/)).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'NEW/KEY 상세 보기' })).toBeTruthy();
    expect(screen.getByRole('dialog').textContent).toContain('이 명세 요구사항을 선언한 규칙이 없습니다.');
    expect(screen.queryByText(/rev-1/)).toBeNull();
  });
  it('renders a stale requirement selection inside a drawer without arrival focus', async () => {
    mount(`&tab=coverage&modelId=${modelId}&focus=MISSING`);
    const note = await screen.findByRole('alert');
    expect(screen.getByRole('dialog').contains(note)).toBe(true);
    expect(note.textContent).toContain('명세 요구사항을 찾을 수 없습니다');
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: '상세 닫기' }));
  });
  it.each(['model_unknown', 'ambiguous_key', 'no_spec', 'no_catalog', 'no_requirement_ids'] as CoverageReason[])('%s is one reason, with no table or percentage', async reason => {
    data = reason === 'model_unknown' ? null : { computable: false, reason, specPin: null };
    mount(`&tab=coverage&modelId=${modelId}`);
    expect(await screen.findByText(REASON_COPY[reason])).toBeTruthy();
    expect(screen.queryByText(/0%/)).toBeNull(); expect(screen.queryByRole('table')).toBeNull();
  });
  it('waits for coverage without a temporary zero-percent summary', async () => {
    let release!: () => void; const gate = new Promise<void>(r => { release = r; });
    coverageAnswer = async () => { await gate; return ok(coverage); };
    mount(`&tab=coverage&modelId=${modelId}`);
    await screen.findByLabelText('모델');
    expect(screen.queryByText(/명세 커버리지 0%/)).toBeNull();
    expect(screen.queryByText('명세 요구사항')).toBeNull();
    await act(async () => { release(); });
    expect(await screen.findByText(/명세 커버리지 100%/)).toBeTruthy();
  });
  it('picks a model by name, writes the UUID keys, and drops the SW version on a model change (#1496)', async () => {
    mount('&tab=coverage');
    fireEvent.click(await screen.findByRole('combobox', { name: '모델' }));
    fireEvent.click(await screen.findByRole('option', { name: /합성 모델/ }));
    expect(await screen.findByText(/명세 커버리지 100%/)).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get('modelId')).toBe(modelId);
    expect(queries.some(q => q.endpoint === 'logRules.coverage' && (q.params as { modelId: string }).modelId === modelId)).toBe(true);
    fireEvent.click(screen.getByRole('combobox', { name: 'SW 버전 (선택)' }));
    fireEvent.click(await screen.findByRole('option', { name: /2\.1/ }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('softwareId')).toBe(softwareId));
    fireEvent.click(screen.getByRole('combobox', { name: '모델' }));
    fireEvent.click(await screen.findByRole('option', { name: /다른 모델/ }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('modelId')).toBe(otherModelId));
    expect(new URLSearchParams(window.location.search).get('softwareId')).toBeNull();
  });
  it('shows a failed SW version list next to the picker with a retry that recovers on the same model (#1496)', async () => {
    softwareFailures = 1;
    mount(`&tab=coverage&modelId=${modelId}`);
    expect((await screen.findByRole('alert', { name: '' })).textContent).toContain('SW 버전 목록을 불러오지 못했습니다');
    expect(screen.queryByText('이 모델에 SW 버전이 없습니다')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: '다시 시도' }).at(-1) as HTMLElement);
    await waitFor(() => expect(screen.queryByText(/SW 버전 목록을 불러오지 못했습니다/)).toBeNull());
    fireEvent.click(screen.getByRole('combobox', { name: 'SW 버전 (선택)' }));
    expect(await screen.findByRole('option', { name: /2\.1/ })).toBeTruthy();
    expect(queries.filter(q => q.endpoint === 'logRules.softwareOptions')).toHaveLength(2);
  });
  it('labels an address model by name, and shows the raw id when the list cannot label it', async () => {
    mount(`&tab=coverage&modelId=${modelId}`);
    expect(await screen.findByRole('combobox', { name: '모델' })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('combobox', { name: '모델' }).textContent).toContain('합성 모델'));
    cleanup();
    const unlisted = '00000003-0000-4000-8000-0000000000ff';
    mount(`&tab=coverage&modelId=${unlisted}`);
    await waitFor(() => expect(screen.getByRole('combobox', { name: '모델' }).textContent).toContain(unlisted));
    expect(screen.queryByText(/불러오지 못했습니다/)).toBeNull();
  });
  it('does not invent a percentage for an empty published requirement set', async () => {
    data = { ...coverage, counts: { ...coverage.counts, covered: 0, total: 0 }, rows: [], total: 0 };
    mount(`&tab=coverage&modelId=${modelId}`);
    await screen.findByText(/통과가 아니라 구성 정보입니다/);
    expect(screen.queryByText(/명세 커버리지 \d+%/)).toBeNull();
  });
  it('keeps the composition-information line even at 100% and opens the declaring Rules', async () => {
    mount(`&tab=coverage&modelId=${modelId}`);
    expect(await screen.findByText(/명세 커버리지 100%/)).toBeTruthy();
    expect(screen.getByText(/통과가 아니라 구성 정보입니다/)).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'ROBOT/READY 상세 보기' }));
    expect((await screen.findByRole('dialog')).textContent).toContain('core / R-001');
  });
  it('does not label an empty spec as 100% and explains a requirement without declaring Rules', async () => {
    data = { ...coverage, rows: [{ key: 'ARM/PICK', state: 'no_rule', declaredCount: 0, declaredBy: [] }], counts: { ...coverage.counts, covered: 0, no_rule: 1 }, total: 1 };
    mount(`&tab=coverage&modelId=${modelId}&focus=ARM%2FPICK`);
    expect(await screen.findByText('이 명세 요구사항을 선언한 규칙이 없습니다.')).toBeTruthy();
  });
});
