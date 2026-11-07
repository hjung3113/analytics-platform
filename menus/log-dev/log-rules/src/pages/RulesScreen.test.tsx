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
  return ok(null);
} });
function Slot() { const slot = useDetailPanelSlotHost(); return <aside ref={slot.ref} />; }
function LinkProbe() { const { linkTo, page, pageParams } = usePlatform(); return <output aria-label="공유 주소">{linkTo('log-rules', { page: { ...Object.fromEntries(page), filter: pageParams('filter') } })}</output>; }
const mount = (search = '', params = {}) => {
  window.history.replaceState(null, '', `/logDev/log-rules?v=1${search}`);
  return render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter}><DetailPanelSlotProvider><RulesScreen params={params} /><LinkProbe /><Slot /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
};
let restore: () => void;
beforeEach(() => { received = true; empty = false; missing = false; noIds = false; data = coverage; queries = []; hold = undefined; coverageAnswer = undefined; restore = stubCompactTableGeometry(); });
afterEach(() => { cleanup(); restore(); });

describe('validation rules screen', () => {
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
  it('keeps both searches, filter, sorting and page in table requests and shared URLs', async () => {
    mount('&tab=rules&q=robot&targetQ=csv&sort=ruleKey:desc&page=2&filter=support:in:partial');
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
    expect(within(dialog).getByText(long).className).toContain('break-all');
    expect(within(dialog).getAllByText('지원')).toHaveLength(2); // once for the summary, once for its Revision
    expect(within(dialog).queryByText('저장')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: '상세 닫기' })));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'R-001 상세 보기' })));
    expect(screen.getByText(`original · ${long}`).className).toContain('break-all');
  });
  it('restores direct Rule links and gracefully closes unknown Rule drawers', async () => {
    missing = true; mount('', { ruleSetKey: 'core', ruleKey: 'gone' });
    expect(await screen.findByText('규칙을 찾을 수 없습니다')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('can select a different row or RuleSet history after a direct Rule arrival', async () => {
    mount('', { ruleSetKey: 'core', ruleKey: 'R-OLD' });
    await screen.findByRole('dialog'); await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'R-001 상세 보기' }));
    await waitFor(() => expect(queries.filter(q => q.endpoint === 'logRules.ruleDetail').at(-1)?.params).toEqual({ ruleSetKey: 'core', ruleKey: 'R-001' }));
    fireEvent.click(screen.getByRole('button', { name: 'core RuleSet 이력' }));
    expect(await screen.findByText('core · RuleSet 이력')).toBeTruthy();
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
    expect(await screen.findByText('core · RuleSet 이력')).toBeTruthy();
    expect(await screen.findByText('R-002')).toBeTruthy();
    expect(screen.getByText('R-003')).toBeTruthy(); expect(screen.getByText('퇴역')).toBeTruthy();
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
    await screen.findByLabelText('모델 ID');
    expect(screen.queryByText(/명세 커버리지 0%/)).toBeNull();
    expect(screen.queryByText('명세 요구사항')).toBeNull();
    await act(async () => { release(); });
    expect(await screen.findByText(/명세 커버리지 100%/)).toBeTruthy();
  });
  it('validates a stable model/software id and resets the requirement page on a new selection', async () => {
    mount('&tab=coverage');
    const input = await screen.findByLabelText('모델 ID');
    fireEvent.change(input, { target: { value: 'bad-id' } }); fireEvent.click(screen.getByRole('button', { name: '조회' }));
    expect(await screen.findByText('모델 ID와 SW 버전 ID는 UUID 형식으로 입력해 주세요.')).toBeTruthy();
    expect(queries.some(q => q.endpoint === 'logRules.coverage')).toBe(false);
    fireEvent.change(input, { target: { value: modelId } }); fireEvent.click(screen.getByRole('button', { name: '조회' }));
    expect(await screen.findByText(/명세 커버리지 100%/)).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get('modelId')).toBe(modelId);
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
