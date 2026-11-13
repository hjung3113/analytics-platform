// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Cpu } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, settleQueries, testAdapter, testSession } from '@ap/kernel/testing';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { groupId, spaceId, type ActionResponse, type ApiResponse, type MenuAction, type MenuQuery } from '@ap/contracts';
import type { Model, Project, RequestDetail, RoundDetail, RuleResult } from '../endpoints';
import { GATE_DECIDE, ISSUE_CONTRIBUTE, ISSUE_LINK, PROJECT_MANAGE, ROUND_MANAGE } from '../endpoints';
import { manifests } from '../index';
import { setRoundSourceView } from '../round-source-slot';
import LifecyclePage from './LifecyclePage';

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const AT = '2026-11-07T00:00:00Z';
const project: Project = { id: ID, modelId: ID, model: { code: 'ETCH-300', name: '식각', vendorName: '설비사' }, kind: 'new', stage: 'alpha', softwareId: null, owner: { id: ID, displayName: '김개발' }, targetDate: null, nextStages: ['beta'], reopenTo: null, openRound: { id: ID, seq: 3 }, version: '7', gateTarget: 'beta', gate: { latest: null } };
const round: RoundDetail = { id: ID, projectId: ID, seq: 3, stage: 'alpha', status: 'open', version: '1', createdAt: AT, specPin: null, sampleManifestDigest: '', note: null, sampleSet: { sourceOwner: 'team', files: [] }, gateDecisions: [], gateAvailability: { targetStage: 'beta', projectVersion: '7', reasons: [], decisions: { approved: { allowed: true, reasons: [] }, rejected: { allowed: true, reasons: [] }, exception: { allowed: true, reasons: [] } }, basis: {} } };
const attempt = (id: string): RequestDetail['attempts'][number] => ({ id, attemptNo: 1, outcome: 'succeeded', workerActorId: ID, verdict: 'fail', manifestMatches: true, counts: { FAIL: 13, PASS: 13 }, requiredUnchecked: 0, ruleCount: 26, startedAt: AT, endedAt: AT, ruleSetRevision: 'r1', inputManifestDigest: '' });
const request = (id: string): RequestDetail => ({ id, roundId: ID, roundSeq: 3, projectId: ID, modelId: ID, modelCode: 'ETCH-300', softwareLabel: null, priority: 1, immediate: false, state: 'succeeded', attemptCount: 1, maxAttempts: 3, leaseExpiresAt: null, lastHeartbeatAt: null, requestedBy: { id: ID, displayName: '김개발' }, createdAt: AT, endedAt: AT, latestVerdict: 'fail', version: '9', cancelReason: null, attempts: [attempt(id)] });
const rules: RuleResult[] = Array.from({ length: 26 }, (_, i) => ({ id: `dddddddd-dddd-4ddd-8ddd-${String(i).padStart(12, '0')}`, ruleId: `R-${String(i + 1).padStart(3, '0')}`, result: i % 2 ? 'FAIL' : 'PASS', required: i % 2 === 1, expected: '기대', observed: '관측', evidence: [], hasExcerpt: false }));
const ok = (data: unknown): ApiResponse<never> => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'fixture' }) as ApiResponse<never>;
const registry = createRegistry({ permissions: [PROJECT_MANAGE, ROUND_MANAGE, GATE_DECIDE, ISSUE_CONTRIBUTE, ISSUE_LINK], spaces: [{ id: spaceId('logDev'), label: { ko: '로그', en: 'Log' }, description: { ko: '개발 모델 관리', en: 'Model development' }, homeMenuId: 'log-models' }], groups: [{ id: groupId('logModels'), label: { ko: '모델', en: 'Models' }, icon: Cpu, space: spaceId('logDev') }], menus: manifests });
function DetailHost() { const slot = useDetailPanelSlotHost(); return <aside ref={slot.ref} />; }
let restoreGeometry: () => void;
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  restoreGeometry = stubCompactTableGeometry(900);
  Element.prototype.scrollIntoView = vi.fn();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); restoreGeometry(); vi.restoreAllMocks(); });

/** Optional extra server reads (#1808 issue endpoints); unset = the Kernel gets `ok(null)` as before. */
let extraRead: ((q: MenuQuery<Record<string, unknown>>) => ApiResponse<never> | undefined) | null = null;
function mount(search = '', count = 1, route = 'round', extra: (typeof ISSUE_CONTRIBUTE)[] | ((q: MenuQuery<Record<string, unknown>>) => ApiResponse<never> | undefined) = []) {
  const extraPermissions = Array.isArray(extra) ? extra : [];
  const override = typeof extra === 'function' ? extra : undefined;
  const queries: MenuQuery<Record<string, unknown>>[] = [];
  const sent: { request: MenuAction; resolve(value: ActionResponse<unknown>): void }[] = [];
  const listeners = new Set<() => void>();
  const permissions = ['platform:view' as const, PROJECT_MANAGE, ROUND_MANAGE, GATE_DECIDE, ...extraPermissions];
  let session = testSession(permissions, { user: { id: ID } });
  const adapter = testAdapter({ session: () => session, subscribe: l => { listeners.add(l); return () => listeners.delete(l); }, menuQuery: async q => {
    queries.push(q as MenuQuery<Record<string, unknown>>);
    const p = q.params as Record<string, unknown>;
    const overridden = override?.(q as MenuQuery<Record<string, unknown>>);
    if (overridden) return overridden;
    if (q.endpoint === 'logLifecycle.models') {
      const filters = (p.filters ?? []) as { id: string; value?: string[] }[];
      const rows: Model[] = [{ id: B, code: 'MODEL-B', name: '다른 모델', vendorName: '설비사', vendorId: ID, processes: [], updatedAt: AT, validation: 'none', pendingRequests: 0, gateDecision: null, project: { projectId: B, stage: 'alpha', latestRound: { id: B, seq: 1, status: 'open' } } }];
      const selected = rows.filter(m => !filters.some(f => f.id === 'id' && !f.value?.includes(m.id)));
      return ok({ rows: selected, total: selected.length });
    }
    if (q.endpoint === 'logLifecycle.rounds') return ok({ rows: [{ ...round, createdBy: ID }], total: 1 });
    if (q.endpoint === 'logLifecycle.projectDetail') return ok(project);
    if (q.endpoint === 'logLifecycle.roundDetail') return ok(round);
    if (q.endpoint === 'logLifecycle.requests') return ok({ rows: Array.from({ length: count }, (_, i) => request(i === 0 ? ID : i === 1 ? B : `cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, '0')}`)).slice(Number(p.page ?? 0) * 25, (Number(p.page ?? 0) + 1) * 25), total: count });
    if (q.endpoint === 'logLifecycle.requestDetail') return ok(request(String(p.requestId)));
    if (q.endpoint === 'logLifecycle.ruleResults') {
      let rows = rules.filter(r => (!p.results || (p.results as string[]).includes(r.result)) && (!p.required || r.required));
      if ((p.sorting as { id: string }[] | undefined)?.[0]?.id === 'result') rows = [...rows].sort((a, b) => a.result.localeCompare(b.result));
      return ok({ rows: rows.slice(Number(p.page ?? 0) * 25, (Number(p.page ?? 0) + 1) * 25), total: rows.length });
    }
    if (q.endpoint === 'logLifecycle.evidenceStates') {
      // Mirrors the server's rules over the fixture: no stored excerpt means not_submitted, and a different pinned hash for the same file means hash_mismatch.
      const found = rules.find(r => r.id === p.ruleResultId);
      return ok(found ? { rows: found.evidence.map((e, evidenceIndex) => ({ ruleResultId: found.id, evidenceIndex, evidenceRef: { fileRef: e.fileRef, line: e.line, fileSha256: e.fileSha256 }, excerptState: e.hasExcerpt ? 'not_loaded' : 'not_submitted', sourceState: round.sampleSet.files.some(f => f.fileRef === e.fileRef && f.sha256 !== e.fileSha256) ? 'hash_mismatch' : 'not_checked' })) } : null);
    }
    return extraRead?.(q as MenuQuery<Record<string, unknown>>) ?? ok(null);
  }, menuAction: req => new Promise(resolve => sent.push({ request: req, resolve })) });
  window.history.replaceState(null, '', route === 'requests' ? `/logDev/log-validation-requests?v=1${search}` : route === 'project' ? `/logDev/log-model-project/${ID}?v=1${search}` : `/logDev/log-model-round/${ID}/${ID}?v=1${search}`);
  const history = vi.spyOn(window.history, 'pushState');
  act(() => root.render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider><LifecyclePage params={route === 'requests' ? {} : { projectId: ID, ...(route === 'round' ? { roundId: ID } : {}) }} /><DetailHost /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>));
  return { queries, sent, history, switchSession: () => act(() => { session = testSession(permissions, { user: { id: B } }); listeners.forEach(l => l()); }) };
}
const issueRow = (id: string, title: string) => ({ id, projectId: ID, firstRoundId: ID, title, reporterActorId: ID, createdAt: AT, lastActivityAt: AT, commentCount: 0, occurrenceCount: 0, roundCount: 0 });
const issueDetail = (id: string, title: string, body: string) => ({ ...issueRow(id, title), body, expected: null, actual: null, repro: null, occurrences: { rows: [] } });
function element(selector: string, parent: ParentNode = document): HTMLElement {
  const found = parent.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`Missing ${selector}`);
  return found;
}
function button(name: string | RegExp, parent: ParentNode = document): HTMLButtonElement {
  const found = [...parent.querySelectorAll<HTMLButtonElement>('button')].find(b => typeof name === 'string' ? b.textContent?.trim() === name : name.test(b.textContent ?? ''));
  if (!found) throw new Error(`Missing button ${name}`);
  return found;
}
const click = (node: HTMLElement) => act(() => node.click());
const text = (value: string, parent: ParentNode = document) => [...parent.querySelectorAll('*')].some(n => n.textContent === value);
async function waitFor(assertion: () => void) {
  for (let i = 0; i < 50; i++) {
    await act(async () => { await settleQueries(); });
    try { assertion(); return; } catch (error) { if (i === 49) throw error; }
  }
}
function activateRoundTab(name: string) { const node = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(n => n.textContent?.startsWith(name)); if (!node) throw new Error('Missing tab ' + name); act(() => { node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); }); }
const rulesRegion = () => element('section[aria-label="규칙 결과"]');
const requestsRegion = () => element('section[aria-label="Round 검증 요청"]');
const query = () => new URLSearchParams(window.location.search);
const ready = () => waitFor(() => expect(text('R-002')).toBe(true));
function change(selector: string, value: string) {
  const node = element(selector) as HTMLInputElement;
  act(() => {
    const prototype = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('lifecycle interactions with the real Kernel host', () => {
  it('re-reads evidence states on every drawer open and never re-shows a prior answer after revocation', async () => {
    const ev = { fileRef: 'synthetic://sample-01', line: 7, fileSha256: 'a'.repeat(64), hasExcerpt: true };
    let revoked = false;
    const t = mount('&result=all', 1, 'round', q => {
      const p = q.params as Record<string, unknown>;
      if (q.endpoint === 'logLifecycle.ruleResults') return ok({ rows: rules.map(r => r.ruleId === 'R-002' ? { ...r, evidence: [ev], hasExcerpt: true } : r), total: rules.length });
      if (q.endpoint === 'logLifecycle.evidenceStates') return ok(revoked ? null : { rows: [{ ruleResultId: p.ruleResultId, evidenceIndex: 0, evidenceRef: { fileRef: ev.fileRef, line: ev.line, fileSha256: ev.fileSha256 }, excerptState: 'not_loaded', sourceState: 'not_checked' }] });
      return undefined;
    });
    await ready();
    const evidenceReads = () => t.queries.filter(q => q.endpoint === 'logLifecycle.evidenceStates');
    click(element('button[aria-label="R-002 상세 열기"]'));
    await waitFor(() => expect(button('발췌 보기')).toBeTruthy());
    expect(evidenceReads()).toHaveLength(1);
    expect(evidenceReads()[0]?.params).toEqual({ ruleResultId: rules[1]?.id });
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('발췌 열람 전');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('원본 미확인');
    click(element('[role="dialog"] button[aria-label="상세 닫기"]'));
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    revoked = true;
    click(element('button[aria-label="R-002 상세 열기"]'));
    // Immediately after reopening, the previous answer is not shown while the new read is pending.
    expect(document.querySelector('[role="dialog"]')?.textContent ?? '').not.toContain('발췌 열람 전');
    await waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain('근거 상태를 읽을 수 없습니다'));
    expect(evidenceReads()).toHaveLength(2);
    expect([...document.querySelectorAll('button')].some(b => b.textContent === '발췌 보기')).toBe(false);
  });

  it('never shows a cached excerpt body or evidence state after close, revocation and an offline reopen', async () => {
    const BODY = 'SYNTHETIC BODY · 합성 발췌';
    const ev = { fileRef: 'synthetic://sample-01', line: 7, fileSha256: 'a'.repeat(64), hasExcerpt: true };
    const denied = { outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' } as ApiResponse<never>;
    let revoked = false;
    const t = mount('&result=all', 1, 'round', q => {
      const p = q.params as Record<string, unknown>;
      if (q.endpoint === 'logLifecycle.ruleResults') return ok({ rows: rules.map(r => r.ruleId === 'R-002' ? { ...r, evidence: [ev], hasExcerpt: true } : r), total: rules.length });
      if (q.endpoint === 'logLifecycle.evidenceStates') return ok(revoked ? null : { rows: [{ ruleResultId: p.ruleResultId, evidenceIndex: 0, evidenceRef: { fileRef: ev.fileRef, line: ev.line, fileSha256: ev.fileSha256 }, excerptState: 'not_loaded', sourceState: 'not_checked' }] });
      if (q.endpoint === 'logLifecycle.excerpt') return revoked ? denied : ok({ deleted: false, excerpt: BODY });
      return undefined;
    });
    const reads = (name: string) => t.queries.filter(q => q.endpoint === `logLifecycle.${name}`).length;
    const dialog = () => document.querySelector('[role="dialog"]')?.textContent ?? '';
    const page = () => document.body.textContent ?? '';
    const network = (online: boolean) => act(() => { window.dispatchEvent(new Event(online ? 'online' : 'offline')); });
    try {
      await ready();
      click(element('button[aria-label="R-002 상세 열기"]'));
      await waitFor(() => expect(button('발췌 보기')).toBeTruthy());
      click(button('발췌 보기'));
      await waitFor(() => expect(dialog()).toContain(BODY));
      expect(reads('excerpt')).toBe(1);
      // Closing the excerpt returns to the rule drawer, which reads the states again.
      click(element('[role="dialog"] button[aria-label="상세 닫기"]'));
      await waitFor(() => expect(button('발췌 보기')).toBeTruthy());
      expect(reads('evidenceStates')).toBe(2);
      // Revoked and offline: a reopened excerpt starts with no prior body and sends nothing until the connection returns.
      revoked = true;
      network(false);
      click(button('발췌 보기'));
      await waitFor(() => expect(dialog()).toContain('로그 발췌'));
      await act(async () => { await settleQueries(); });
      expect(page()).not.toContain(BODY);
      expect(reads('excerpt')).toBe(1);
      network(true);
      await waitFor(() => expect(dialog()).toContain('권한 없음 · 이 원본의 발췌 열람 권한이 없습니다.'));
      expect(reads('excerpt')).toBe(2);
      expect(page()).not.toContain(BODY);
      click(element('[role="dialog"] button[aria-label="상세 닫기"]'));
      await waitFor(() => expect(dialog()).toContain('근거 상태를 읽을 수 없습니다'));
      click(element('[role="dialog"] button[aria-label="상세 닫기"]'));
      await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
      // Offline reopen of the rule drawer: no cached `not_loaded` row or 발췌 보기 button, no request until online.
      const before = reads('evidenceStates');
      network(false);
      click(element('button[aria-label="R-002 상세 열기"]'));
      await waitFor(() => expect(dialog()).toContain('R-002'));
      await act(async () => { await settleQueries(); });
      expect(dialog()).not.toContain('발췌 열람 전');
      expect([...document.querySelectorAll('button')].some(b => b.textContent === '발췌 보기')).toBe(false);
      expect(reads('evidenceStates')).toBe(before);
      network(true);
      await waitFor(() => expect(dialog()).toContain('근거 상태를 읽을 수 없습니다'));
      expect(reads('evidenceStates')).toBe(before + 1);
      expect(page()).not.toContain(BODY);
    } finally {
      network(true);
    }
  });

  it.each([['modelId', ID, { id: 'id', op: 'in', value: [ID] }], ['processId', 'none', { id: 'processes', op: 'isEmpty' }]])('projects the hierarchy %s page key into the existing list condition', async (key, value, condition) => {
    const queries: MenuQuery<Record<string, unknown>>[] = [];
    const adapter = testAdapter({ menuQuery: async q => { queries.push(q as MenuQuery<Record<string, unknown>>); return ok({ rows: [], total: 0 }); } });
    window.history.replaceState(null, '', `/logDev/log-models?v=1&${key}=${value}`);
    act(() => root.render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider><LifecyclePage params={{}} /><DetailHost /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>));
    await waitFor(() => expect(queries.find(q => q.endpoint === 'logLifecycle.models')?.params.filters).toContainEqual(condition));
  });
  it('keeps request registration model search independent from the requests modelId filter', async () => {
    const t = mount(`&modelId=${ID}`, 1, 'requests');
    await waitFor(() => expect(t.queries.some(q => q.endpoint === 'logLifecycle.requests' && q.params.modelId === ID)).toBe(true));
    click(button('요청 등록'));
    await waitFor(() => expect(document.querySelector('#request-model')).not.toBeNull());
    change('#request-model', 'MODEL-B');
    await waitFor(() => {
      const search = [...t.queries].reverse().find(q => q.endpoint === 'logLifecycle.models' && q.params.q === 'MODEL-B');
      expect(search).toBeDefined();
      expect(search?.params.filters ?? []).toEqual([]);
    });
    click(element('[role="combobox"][aria-label="개발 건 선택"]'));
    await waitFor(() => expect(text('MODEL-B · 다른 모델')).toBe(true));
    expect(query().get('modelId')).toBe(ID);
  });
  it('preserves the placement node when opening a Round within the same project', async () => {
    const node = `v/${ID}/p/none/m/${B}`;
    mount(`&node=${encodeURIComponent(node)}`, 1, 'project');
    await waitFor(() => expect(document.body.textContent).not.toContain('주소의 node'));
    await waitFor(() => expect([...document.querySelectorAll('button')].some(b => b.textContent === 'Round 3')).toBe(true));
    click(button('Round 3'));
    await waitFor(() => expect(window.location.pathname).toBe(`/logDev/log-model-round/${ID}/${ID}`));
    expect(query().get('node')).toBe(node);
  });
  it('keeps the one request and its results mounted on rule page two and returns with Previous', async () => {
    const t = mount('&result=all'); await ready();
    click(button('다음', rulesRegion()));
    await waitFor(() => expect(text('R-026')).toBe(true));
    expect(query().get('rulesPage')).toBe('2');
    expect(query().has('requestsPage')).toBe(false);
    expect(text('26건 · 2페이지', rulesRegion())).toBe(true);
    expect(t.queries.filter(q => q.endpoint === 'logLifecycle.requests').every(q => q.params.page === 0)).toBe(true);
    click(button('이전', rulesRegion()));
    await ready();
    expect(query().has('rulesPage')).toBe(false);
  });
  it('selects B and clears its dependent attempt and rule page in one host write', async () => {
    const t = mount(`&result=all&request=${ID}&attempt=${ID}&rulesPage=2`, 2);
    await waitFor(() => expect(text('R-026')).toBe(true));
    t.history.mockClear();
    activateRoundTab('설정·이력');
    await waitFor(() => expect(text('bbbbbbbb', requestsRegion())).toBe(true)); t.history.mockClear();
    click(button('bbbbbbbb', requestsRegion()));
    await ready();
    expect(query().get('request')).toBe(B);
    expect(query().has('attempt')).toBe(false);
    expect(query().has('rulesPage')).toBe(false);
    expect(t.history).toHaveBeenCalledTimes(1);
    expect(t.queries.some(q => q.endpoint === 'logLifecycle.ruleResults' && q.params.attemptId === B)).toBe(true);
  });
  it('pages requests and clears request, attempt and rule page atomically', async () => {
    const t = mount(`&result=all&request=${ID}&attempt=${ID}&rulesPage=2`, 26);
    await waitFor(() => expect(text('R-026')).toBe(true)); t.history.mockClear();
    activateRoundTab('설정·이력'); t.history.mockClear();
    click(button('다음', requestsRegion()));
    await waitFor(() => expect(query().get('requestsPage')).toBe('2'));
    expect(['request', 'attempt', 'rulesPage'].some(k => query().has(k))).toBe(false);
    expect(t.history).toHaveBeenCalledTimes(1);
    await ready();
    click(button('이전', requestsRegion()));
    await waitFor(() => expect(query().has('requestsPage')).toBe(false));
  });
  it('keeps the Gate decisive attempt in 결과·결함 when the requests page turns, until a row is clicked', async () => {
    const OTHER = 'cccccccc-cccc-4ccc-8ccc-000000000025';
    const OLD_ATTEMPT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const ids = Array.from({ length: 26 }, (_, i) => i === 0 ? ID : i === 1 ? B : `cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, '0')}`);
    const queries: MenuQuery<Record<string, unknown>>[] = [];
    const detail = (id: string) => ({ ...request(id), attempts: [{ ...attempt(id === ID ? ID : OLD_ATTEMPT), attemptNo: id === ID ? 7 : 2 }] });
    const session = testSession(['platform:view', PROJECT_MANAGE, ROUND_MANAGE, GATE_DECIDE], { user: { id: ID } });
    const adapter = testAdapter({
      session: () => session,
      menuQuery: async q => {
        queries.push(q as MenuQuery<Record<string, unknown>>);
        const p = q.params as Record<string, unknown>;
        if (q.endpoint === 'logLifecycle.projectDetail') return ok(project);
        if (q.endpoint === 'logLifecycle.roundDetail') return ok({ ...round, gateAvailability: { ...round.gateAvailability, basis: { version: 1, decisiveAttemptId: ID, decisiveVerdict: 'fail', attempts: [{ attemptId: ID, requestId: ID }] } } });
        if (q.endpoint === 'logLifecycle.requests') return ok({ rows: ids.map(id => detail(id)).slice(Number(p.page ?? 0) * 25, (Number(p.page ?? 0) + 1) * 25), total: 26 });
        if (q.endpoint === 'logLifecycle.requestDetail') return ok(detail(String(p.requestId)));
        if (q.endpoint === 'logLifecycle.ruleResults') return ok({ rows: rules.filter(r => r.result === 'FAIL'), total: 13 });
        return ok(null);
      },
    });
    window.history.replaceState(null, '', `/logDev/log-model-round/${ID}/${ID}?v=1`);
    act(() => root.render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider><LifecyclePage params={{ projectId: ID, roundId: ID }} /><DetailHost /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>));
    await ready();
    const head = () => element('[aria-label="선택 시도 서버 판정"]').textContent ?? '';
    expect(head()).toContain('시도 #7');
    activateRoundTab('설정·이력');
    // Page 1 holds the decisive request: it is shown in 결과·결함 but not chosen, so no row reads as active.
    await waitFor(() => expect(text(ID.slice(0, 8), requestsRegion())).toBe(true));
    expect(document.querySelector('section[aria-label="Round 검증 요청"] [aria-current="true"]')).toBeNull();
    click(button('다음', requestsRegion()));
    await waitFor(() => expect(query().get('requestsPage')).toBe('2'));
    await waitFor(() => expect(text('cccccccc', requestsRegion())).toBe(true));
    expect(query().has('request')).toBe(false);
    expect(head()).toContain('시도 #7');
    expect(head()).toContain(`요청 ${ID.slice(0, 8)}`);
    expect(queries.filter(q => q.endpoint === 'logLifecycle.ruleResults').every(q => q.params.attemptId === ID)).toBe(true);
    expect(document.querySelector('section[aria-label="Round 검증 요청"] [aria-current="true"]')).toBeNull();
    click(button('cccccccc', requestsRegion()));
    await waitFor(() => expect(query().get('request')).toBe(OTHER));
    await waitFor(() => expect(head()).toContain('시도 #2'));
    await waitFor(() => expect(queries.some(q => q.endpoint === 'logLifecycle.ruleResults' && q.params.attemptId === OLD_ATTEMPT)).toBe(true));
  });
  it.each(['FAIL', 'required', 'sort'])('applies %s from an unfiltered URL with one host write and a rule-page reset', async control => {
    const t = mount('&result=all&rulesPage=2'); await waitFor(() => expect(text('R-026')).toBe(true)); t.history.mockClear();
    if (control === 'FAIL') click(button('실패 13'));
    else if (control === 'required') { activateRoundTab('설정·이력'); t.history.mockClear(); click(element('#rules-required')); }
    else {
      activateRoundTab('설정·이력'); t.history.mockClear();
      click(element('[role="combobox"][aria-label="결과 정렬"]'));
      await waitFor(() => expect(document.querySelector('[role="option"]')).not.toBeNull());
      click([...document.querySelectorAll<HTMLElement>('[role="option"]')].find(n => n.textContent === '결과순')!);
    }
    await waitFor(() => expect(query().get(control === 'FAIL' ? 'result' : control)).toBe(control === 'FAIL' ? 'FAIL' : control === 'required' ? 'true' : 'result'));
    expect(query().has('rulesPage')).toBe(false);
    expect(t.history).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(text('R-002')).toBe(true));
    if (control === 'FAIL') expect(button('실패 13').getAttribute('aria-pressed')).toBe('true');
  });
  it.each(['requestsPage', 'rulesPage'])('rejects malformed %s before reading Round data', async key => {
    const t = mount(`&${key}=zero`);
    await waitFor(() => expect(document.body.textContent).toContain('페이지'));
    expect(t.queries.some(q => q.endpoint === 'logLifecycle.roundDetail')).toBe(false);
  });
  it('keeps the selected request marked while its compact attempt history and result action are open', async () => {
    mount(`&request=${ID}`, 1, 'requests');
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    await waitFor(() => expect(document.querySelector(`[data-row-id="${ID}"][aria-current="true"] [data-active-row-marker]`)).not.toBeNull());
    const drawer = element('[role="dialog"]');
    expect(drawer.querySelector('section[aria-label="시도 이력"]')).not.toBeNull();
    expect(drawer.querySelector('[role="table"]')).toBeNull();
    expect(button('Round 결과 열기', drawer)).toBeTruthy();
  });
  it.each(['gate', 'close', 'register'])('consumes a %s retry rejection after a session change', async kind => {
    const t = mount(); await ready();
    if (kind === 'gate') {
      click(button('Gate 결정'));
      click(element('[role="radio"][value="approved"]'));
      change('textarea[id^="gate-reason"]', '검토 완료');
      click(button('Gate 결정 기록'));
    } else {
      activateRoundTab('설정·이력');
      const title = kind === 'close' ? 'Round 종료' : '요청 등록';
      click(button(title));
      await waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
      click(button(title, element('[role="dialog"]')));
    }
    await waitFor(() => expect(t.sent).toHaveLength(1));
    await act(async () => { t.sent[0]!.resolve({ outcome: 'unknown', data: null, fieldErrors: [], version: null, replayed: false, correlationId: 'retry-test' }); await settleQueries(); });
    click(button('같은 요청 다시 확인'));
    await waitFor(() => expect(t.sent).toHaveLength(2));
    expect(t.sent[1]!.request).toBe(t.sent[0]!.request);
    t.switchSession();
    await act(async () => { t.sent[1]!.resolve({ outcome: 'ok', data: null, fieldErrors: [], version: '8', replayed: true, correlationId: 'retry-test' }); await settleQueries(); });
    expect(text('Gate 결정을 기록했습니다.')).toBe(false);
    // Vitest also fails this test on any unhandled AbortError from the actual retry callback.
  });
});

describe('Round «원본/시퀀스» tab (#1475)', () => {
  const FILE = { fileRef: 's3://synthetic/a.log', order: 2, sha256: 'a'.repeat(64) };
  const original = { sampleSet: round.sampleSet, first: rules[0]! };
  const tabs = () => document.querySelector('[role="tablist"][aria-label="Round 상세 보기"]');
  const tab = (name: string) => { const found = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(n => n.textContent?.startsWith(name)); if (!found) throw new Error('Missing tab ' + name + ' among ' + [...document.querySelectorAll('[role="tab"]')].map(n => JSON.stringify(n.textContent)).join()); return found; };
  // Radix Tabs activates on mouse down, not on click.
  const activate = (node: HTMLElement) => act(() => { node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); });
  function wire(sha = FILE.sha256) {
    round.sampleSet = { sourceOwner: 'team', files: [FILE] };
    rules[0] = { ...original.first, evidence: [{ fileRef: FILE.fileRef, line: 7, fileSha256: sha, hasExcerpt: false }] };
    setRoundSourceView(({ roundId, sampleSet }) => <div data-testid="fake-source">{roundId}|{sampleSet.files.map(f => `${f.order}:${f.fileRef}`).join(',')}</div>);
  }
  afterEach(() => { setRoundSourceView(null); round.sampleSet = original.sampleSet; rules[0] = original.first; });

  it('keeps the result workbench and explains unavailable Source when the app injects nothing', async () => {
    mount(); await ready();
    expect(tabs()).not.toBeNull();
    activate(tab('원본'));
    expect(text('원본 보기를 사용할 수 없습니다.')).toBe(true);
    expect(document.querySelector('[data-testid="result-first-workbench"]')).not.toBeNull();
  });
  it('shows the verification tab first, then mounts the injected body with this Round only after the tab opens', async () => {
    wire(); mount(); await ready();
    expect(tabs()).not.toBeNull();
    expect(document.querySelector('[data-testid="fake-source"]')).toBeNull();
    activate(tab('원본'));
    await waitFor(() => expect(document.querySelector('[data-testid="fake-source"]')?.textContent).toBe(`${ID}|2:${FILE.fileRef}`));
    expect(query().get('view')).toBe('source');
    expect(element('section[aria-label="규칙 결과"]').closest('[hidden]')).not.toBeNull();
    expect(document.querySelector('[data-testid="round-source-slot"]')?.textContent).toContain('읽기 전용');
    activate(tab('결과·결함'));
    await ready();
    expect(query().has('view')).toBe(false);
  });
  it('keeps a Gate draft while the Source tab is open and brings it back', async () => {
    wire(); mount(); await ready();
    click(button('Gate 결정'));
    change('textarea[id^="gate-reason"]', '근거 확인 중');
    activate(tab('원본'));
    await waitFor(() => expect(document.querySelector('[data-testid="fake-source"]')).not.toBeNull());
    expect(document.querySelector('textarea[id^="gate-reason"]')).toBeNull();
    activate(tab('결과·결함'));
    await waitFor(() => expect(document.querySelector('[data-testid="fake-source"]')).toBeNull());
    expect((element('textarea[id^="gate-reason"]') as HTMLTextAreaElement).value).toBe('근거 확인 중');
    expect(element('textarea[id^="gate-reason"]').closest('[hidden]')).toBeNull();
  });
  it('「원본에서 보기」 on a rule result opens the tab on that line in one host write', async () => {
    wire(); const t = mount('&result=all'); await ready();
    click(button(/^R-001/));
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull()); t.history.mockClear();
    const link = button('원본에서 보기', element('[role="dialog"]'));
    expect(link.getAttribute('aria-label')).toMatch(/^R-\d{3} s3:\/\/synthetic\/a\.log:7 원본에서 보기$/);
    click(link);
    await waitFor(() => expect(document.querySelector('[data-testid="fake-source"]')).not.toBeNull());
    expect(query().get('view')).toBe('source');
    expect(query().get('sourceFocus')).toBe('2:7');
    expect(query().get('sourceDrawer')).toBe('record');
    expect(t.history).toHaveBeenCalledTimes(1);
  });
  it('keeps 원본 확인 불가 with a hash warning when the evidence hash differs from the pinned sample', async () => {
    wire('b'.repeat(64)); mount('&result=all'); await ready();
    click(button(/^R-001/));
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    expect(() => button('원본에서 보기', element('[role="dialog"]'))).toThrow();
    expect(text('원본 해시 불일치', element('[role="dialog"]'))).toBe(true);
    expect(text('원본 확인 불가', element('[role="dialog"]'))).toBe(true);
  });
  it('refuses a wrong view value with the invalid-value panel, and recovery clears only that key', async () => {
    wire(); mount('&view=bogus&request=' + ID);
    await waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain('보기 “bogus”는 이 화면에서 쓸 수 없는 값입니다'));
    expect(document.querySelector('[data-testid="fake-source"]')).toBeNull();
    expect(tabs()).toBeNull();
    click(button('초기화'));
    await ready();
    expect(query().has('view')).toBe(false);
    expect(query().get('request')).toBe(ID);
    expect(tabs()).not.toBeNull();
  });
  it('accepts any positive safe-integer source line in the address, as the body does', async () => {
    wire(); mount('&view=source&sourceFocus=1:10000000000');
    await waitFor(() => expect(document.querySelector('[data-testid="fake-source"]')).not.toBeNull());
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });
});

describe('result-first selection (#1809)', () => {
  it('pins the request, completed attempt and rule UUID in a single URL write and restores focus on close', async () => {
    const t = mount('&result=all'); await ready(); t.history.mockClear();
    const opener = element('button[aria-label="R-002 상세 열기"]');
    click(opener);
    await waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain('R-002 · 규칙 상세'));
    expect(element('button[aria-label="R-002 상세 열기"]')).toBe(opener);
    expect(query().get('request')).toBe(ID);
    expect(query().get('attempt')).toBe(ID);
    expect(query().get('rule')).toBe(rules[1]?.id);
    expect(t.history).toHaveBeenCalledTimes(1);
    expect(window.location.search).not.toMatch(/fileRef|s3|excerpt|signed/i);
    click(element('[role="dialog"] button[aria-label="상세 닫기"]'));
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    expect(query().has('rule')).toBe(false);
    // An explicit returnFocusRef restores focus one task after the closing commit.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(document.activeElement).toBe(opener);
  });
  it('restores the completed attempt and rule selection on page two from a refreshed URL', async () => {
    mount(`&result=all&request=${ID}&attempt=${ID}&rulesPage=2&rule=${rules[25]?.id}`);
    await waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain('R-026 · 규칙 상세'));
    expect(text('26건 · 2페이지', rulesRegion())).toBe(true);
    expect(element(`[data-row-id="${rules[25]?.id}"]`).getAttribute('aria-current')).toBe('true');
  });
  it('restores the previous selected rule when the browser goes back', async () => {
    mount('&result=all'); await ready();
    click(element('button[aria-label="R-001 상세 열기"]'));
    await waitFor(() => expect(query().get('rule')).toBe(rules[0]?.id));
    click(element('button[aria-label="R-002 상세 열기"]'));
    await waitFor(() => expect(query().get('rule')).toBe(rules[1]?.id));
    await act(async () => { window.history.back(); await new Promise(resolve => setTimeout(resolve, 20)); });
    await waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain('R-001 · 규칙 상세'));
    expect(query().get('rule')).toBe(rules[0]?.id);
  });
  it.each(['rule', 'issue'])('rejects an unstable %s selection before reading Round data', async key => {
    const t = mount(`&${key}=s3%3A%2F%2Fsynthetic%2Ffile.log`);
    await waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent).toContain(key));
    expect(t.queries.some(q => q.endpoint === 'logLifecycle.roundDetail')).toBe(false);
  });
  it('opens the request’s completed attempt directly in Round results', async () => {
    mount(`&request=${ID}`, 1, 'requests');
    await waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Round 결과 열기'));
    click(button('Round 결과 열기', element('[role="dialog"]')));
    await waitFor(() => expect(window.location.pathname).toBe(`/logDev/log-model-round/${ID}/${ID}`));
    expect(query().get('request')).toBe(ID);
    expect(query().get('attempt')).toBe(ID);
  });
});


describe('review-final regressions (#1809)', () => {
  it.each(['unknown', 'error'] as const)('retries the same Gate request after %s, tab and slot replacement', async outcome => {
    const t = mount('&result=all'); await ready();
    click(button('Gate 결정'));
    click(element('[role="radio"][value="approved"]'));
    change('textarea[id^="gate-reason"]', '합성 검토 완료');
    click(button('Gate 결정 기록'));
    await waitFor(() => expect(t.sent).toHaveLength(1));
    await act(async () => { t.sent[0]!.resolve({ outcome, data: null, fieldErrors: [], version: null, replayed: false, correlationId: 'gate-retained' }); await settleQueries(); });
    activateRoundTab('설정·이력');
    expect(document.querySelector('textarea[id^="gate-reason"]')).toBeNull();
    activateRoundTab('결과·결함');
    click(element('button[aria-label="R-002 상세 열기"]'));
    await waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain('R-002 · 규칙 상세'));
    click(button('Gate 결정'));
    click(button('같은 요청 다시 확인'));
    await waitFor(() => expect(t.sent).toHaveLength(2));
    expect(t.sent[1]!.request).toBe(t.sent[0]!.request);
    await act(async () => { t.sent[1]!.resolve({ outcome: 'ok', data: null, fieldErrors: [], version: '8', replayed: true, correlationId: 'gate-retained' }); await settleQueries(); });
    await waitFor(() => expect(text('Gate 결정을 기록했습니다.')).toBe(true));
    expect((element('textarea[id^="gate-reason"]') as HTMLTextAreaElement).disabled).toBe(false);
  });
  it('receives an in-flight Gate result while its panel is replaced', async () => {
    const t = mount('&result=all'); await ready();
    click(button('Gate 결정'));
    click(element('[role="radio"][value="approved"]'));
    change('textarea[id^="gate-reason"]', '합성 검토 완료');
    click(button('Gate 결정 기록'));
    await waitFor(() => expect(t.sent).toHaveLength(1));
    click(element('button[aria-label="R-002 상세 열기"]'));
    await waitFor(() => expect(document.querySelector('textarea[id^="gate-reason"]')).toBeNull());
    await act(async () => { t.sent[0]!.resolve({ outcome: 'ok', data: null, fieldErrors: [], version: '8', replayed: false, correlationId: 'gate-inflight' }); await settleQueries(); });
    click(button('Gate 결정'));
    await waitFor(() => expect(text('Gate 결정을 기록했습니다.')).toBe(true));
  });
  it('keeps selected rule detail across next page, reload and Back independently from table membership', async () => {
    mount('&result=all'); await ready();
    click(element('button[aria-label="R-002 상세 열기"]'));
    await waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain('R-002 · 규칙 상세'));
    click(button('다음', rulesRegion()));
    await waitFor(() => expect(text('R-026')).toBe(true));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('R-002 · 규칙 상세');
    const saved = window.location.search.slice('?v=1'.length);
    act(() => root.unmount()); root = createRoot(container);
    mount(saved);
    await waitFor(() => expect(text('R-026')).toBe(true));
    await waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain('R-002 · 규칙 상세'));
    click(button('이전', rulesRegion())); await ready();
    await act(async () => { window.history.back(); await new Promise(resolve => setTimeout(resolve, 20)); });
    await waitFor(() => expect(query().get('rulesPage')).toBe('2'));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('R-002 · 규칙 상세');
  });
  it('reports a truly missing rule UUID only after searching the independent unfiltered pages', async () => {
    const t = mount(`&request=${ID}&attempt=${ID}&rule=${B}`); await ready();
    await waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain('선택한 규칙 결과를 찾을 수 없습니다.'));
    expect(query().get('rule')).toBe(B);
    expect(t.queries.some(q => q.endpoint === 'logLifecycle.ruleResults' && q.params.page === 1 && !q.params.results && !q.params.required && !q.params.opinionGrade)).toBe(true);
  });
  it.each([false, true])('finishes all Project summary cells for a zero-request Round without a page-length issue total (issue rows served: %s)', async known => {
    try {
      if (known) extraRead = q => q.endpoint === 'logLifecycle.validationIssues' ? ok({ rows: [issueRow(B, '합성 항목 1'), issueRow(ID, '합성 항목 2')] }) : undefined;
      const t = mount('', 0, 'project');
      await waitFor(() => expect(document.body.textContent).toContain('완료 시도 없음'));
      expect(document.body.textContent).toContain('규칙 결과 없음');
      await waitFor(() => expect(document.body.textContent).toContain('검증 항목 집계 불가'));
      expect(document.body.textContent).not.toMatch(/검증 항목 \d+건/);
      expect(document.body.textContent).not.toContain('불러오는 중');
      expect(t.queries.some(q => q.endpoint === 'logLifecycle.requestDetail')).toBe(false);
    } finally { extraRead = null; }
  });
  it('keeps the exact issue opener connected and returns focus after close', async () => {
    try {
      extraRead = q => q.endpoint === 'logLifecycle.validationIssues' ? ok({ rows: [issueRow(B, '합성 결함')] }) : q.endpoint === 'logLifecycle.validationIssueDetail' ? ok(issueDetail(B, '합성 결함', '합성 결함 설명')) : q.endpoint.startsWith('logLifecycle.validationIssue') ? ok({ rows: [] }) : undefined;
      mount(); await ready();
      await waitFor(() => expect(text('합성 결함')).toBe(true));
      const region = element('[role="region"][aria-label="검증 항목"]');
      const opener = button('합성 결함', region);
      click(opener);
      await waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain('합성 결함 설명'));
      expect(button('합성 결함', region)).toBe(opener);
      expect(opener.isConnected).toBe(true);
      click(element('[role="dialog"] button[aria-label="상세 닫기"]'));
      await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
      expect(document.activeElement).toBe(opener);
    } finally { extraRead = null; }
  });
  it('retains the server decisive attempt after registering a new queued request and lists its failing rules', async () => {
    let queued = false;
    const session = testSession(['platform:view', PROJECT_MANAGE, ROUND_MANAGE, GATE_DECIDE], { user: { id: ID } });
    const adapter = testAdapter({
      session: () => session,
      menuQuery: async q => {
        const params = q.params as Record<string, unknown>;
        if (q.endpoint === 'logLifecycle.projectDetail') return ok(project);
        if (q.endpoint === 'logLifecycle.roundDetail') return ok({ ...round, gateAvailability: { ...round.gateAvailability, basis: { version: 1, decisiveAttemptId: ID, decisiveVerdict: 'fail', attempts: [{ attemptId: ID, requestId: ID }] } } });
        if (q.endpoint === 'logLifecycle.requests') return ok({ rows: queued ? [{ ...request(B), state: 'queued', attempts: [], attemptCount: 0 }, request(ID)] : [request(ID)], total: queued ? 2 : 1 });
        if (q.endpoint === 'logLifecycle.requestDetail') return ok(params.requestId === B ? { ...request(B), state: 'queued', attempts: [], attemptCount: 0 } : request(ID));
        if (q.endpoint === 'logLifecycle.ruleResults') return ok({ rows: rules.filter(r => r.result === 'FAIL'), total: 13 });
        if (q.endpoint === 'logLifecycle.queueStatus') return ok({ runWindow: { timezone: 'Asia/Seoul', weekday: { fromHour: 22, toHour: 6 }, weekendAllDay: true }, immediateLimit: 5, withinWindow: true, serverAt: AT });
        return ok(null);
      },
      menuAction: async () => { queued = true; return { outcome: 'ok', data: { requestId: B }, version: '1', fieldErrors: [], replayed: false, correlationId: 'queued-host' }; },
    });
    window.history.replaceState(null, '', `/logDev/log-model-round/${ID}/${ID}?v=1`);
    act(() => root.render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider><LifecyclePage params={{ projectId: ID, roundId: ID }} /><DetailHost /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>));
    await ready();
    expect(element('[aria-label="선택 시도 서버 판정"]').textContent).toContain('전체 규칙 26건');
    activateRoundTab('설정·이력'); click(button('요청 등록'));
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    click(button('요청 등록', element('[role="dialog"]')));
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    activateRoundTab('결과·결함');
    await waitFor(() => expect(element('[aria-label="최신 실행 상태"]').textContent).toContain('요청 대기'));
    expect(element('[aria-label="선택 시도 서버 판정"]').textContent).toContain('전체 규칙 26건');
    expect(text('R-002')).toBe(true);
    click(button('Gate 결정'));
    await waitFor(() => expect(element('[aria-label="서버 결정 근거"]').textContent).toContain('R-002'));
    expect(element('[aria-label="서버 결정 근거"]').textContent).toContain('실패 13');
    expect(element('[aria-label="서버 결정 근거"]').textContent).not.toContain('Gate 기준 시도 없음');
  });
});

describe('human validation records with the real Kernel host (#1808 N3)', () => {
  type Comment = { id: string; authorActorId: string; body: string; correctsCommentId: null; createdAt: string };
  const response = (outcome: string, data: unknown, id: string): ActionResponse<unknown> => ({ outcome, data, version: null, fieldErrors: [], replayed: false, correlationId: id }) as ActionResponse<unknown>;
  function mountIssues() {
    const server = { issues: [] as ReturnType<typeof issueDetail>[], comments: [] as Comment[], actions: [] as MenuAction[], queries: [] as MenuQuery<Record<string, unknown>>[] };
    const listeners = new Set<() => void>();
    let actor = ID;
    let session = testSession(['platform:view', ISSUE_CONTRIBUTE], { user: { id: actor } });
    const adapter = testAdapter({
      session: () => session, subscribe: l => { listeners.add(l); return () => listeners.delete(l); },
      menuQuery: async q => {
        server.queries.push(q as MenuQuery<Record<string, unknown>>);
        const p = q.params as Record<string, unknown>;
        if (q.endpoint === 'logLifecycle.projectDetail') return ok(project);
        if (q.endpoint === 'logLifecycle.roundDetail') return ok(round);
        if (q.endpoint === 'logLifecycle.requests') return ok({ rows: [], total: 0 });
        if (q.endpoint === 'logLifecycle.validationIssues') return ok({ rows: server.issues.map(i => issueRow(i.id, i.title)) });
        if (q.endpoint === 'logLifecycle.validationIssueDetail') return ok(server.issues.find(i => i.id === p.issueId) ?? null);
        // The synthetic server pages one comment at a time so a short thread exercises the cursor.
        if (q.endpoint === 'logLifecycle.validationIssueThread') return ok(p.cursor === 'page-2' ? { rows: server.comments.slice(1) } : { rows: server.comments.slice(0, 1), ...(server.comments.length > 1 ? { nextCursor: 'page-2' } : {}) });
        if (q.endpoint === 'logLifecycle.validationIssueHistory' || q.endpoint === 'logLifecycle.roundDiscussion') return ok({ rows: [] });
        return ok(null);
      },
      menuAction: async req => {
        server.actions.push(req);
        const input = req.input as Record<string, unknown>;
        if (req.action === 'logLifecycle.validationIssueRegister') { server.issues.push(issueDetail(B, String(input.title), String(input.body))); return response('ok', { id: B }, 'register'); }
        const comment = { id: `cccccccc-cccc-4ccc-8ccc-${String(server.comments.length).padStart(12, '0')}`, authorActorId: actor, body: String(input.body), correctsCommentId: null, createdAt: AT };
        server.comments.push(comment);
        return response('ok', { id: comment.id, issueId: input.issueId }, 'comment');
      },
    });
    window.history.replaceState(null, '', `/logDev/log-model-round/${ID}/${ID}?v=1`);
    act(() => root.render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider><LifecyclePage params={{ projectId: ID, roundId: ID }} /><DetailHost /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>));
    return { server, switchActor: (next: string) => act(() => { actor = next; session = testSession(['platform:view', ISSUE_CONTRIBUTE], { user: { id: next } }); listeners.forEach(l => l()); }) };
  }
  const dialog = () => element('[role="dialog"]');
  const commentBox = () => element('textarea[id^="comment-issue"]') as HTMLTextAreaElement;

  it('registers without a rule, comments as another person, keeps the draft across tabs and pages the thread', async () => {
    const t = mountIssues();
    await waitFor(() => expect(text('검증 항목 없음')).toBe(true));
    click(button('검증 항목 등록'));
    await waitFor(() => expect(document.querySelector('#issue-title')).not.toBeNull());
    change('#issue-title', '규칙 밖 관찰');
    change('#issue-body', '합성 자유 설명');
    click(button('검증 항목 등록', dialog()));
    await waitFor(() => expect(dialog().textContent).toContain('합성 자유 설명'));
    expect(query().get('issue')).toBe(B);
    expect(t.server.actions[0]).toMatchObject({ action: 'logLifecycle.validationIssueRegister', input: { projectId: ID, firstRoundId: ID, title: '규칙 밖 관찰', body: '합성 자유 설명' } });
    expect(Object.keys(t.server.actions[0]!.input as object)).not.toContain('ruleResultId');
    // Another person with the contribute grant: the session change remounts and the drawer is restored from `issue`.
    t.switchActor(B);
    await waitFor(() => expect(commentBox()).toBeTruthy());
    expect(dialog().textContent).toContain('등록 사용자 aaaaaaaa');
    change('textarea[id^="comment-issue"]', '다른 사람 첫 댓글');
    click(button('댓글 남기기', dialog()));
    await waitFor(() => expect(text('다른 사람 첫 댓글')).toBe(true));
    change('textarea[id^="comment-issue"]', '탭 전환 초안');
    activateRoundTab('Round 토론');
    await waitFor(() => expect(document.querySelector('textarea[id^="comment-issue"]')).toBeNull());
    activateRoundTab('결과·결함');
    await waitFor(() => expect(commentBox().value).toBe('탭 전환 초안'));
    click(button('댓글 남기기', dialog()));
    await waitFor(() => expect(text('더 보기')).toBe(true));
    expect(text('탭 전환 초안')).toBe(false);
    click(button('더 보기', dialog()));
    await waitFor(() => expect(text('탭 전환 초안')).toBe(true));
    expect(text('다른 사람 첫 댓글')).toBe(true);
    expect(t.server.queries.some(q => q.endpoint === 'logLifecycle.validationIssueThread' && q.params.cursor === 'page-2' && q.params.issueId === B)).toBe(true);
    const comments = t.server.actions.filter(a => a.action === 'logLifecycle.validationIssueComment');
    expect(comments.map(a => a.input)).toEqual([{ issueId: B, body: '다른 사람 첫 댓글' }, { issueId: B, body: '탭 전환 초안' }]);
    expect(new Set(t.server.actions.map(a => a.idempotencyKey)).size).toBe(3);
  });
  it.each([['denied', () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'denied' }) as unknown as ApiResponse<never>, '읽기 권한이 없습니다'], ['hidden', () => ok(null), '찾을 수 없거나 읽을 수 없습니다']] as const)('shows no cached issue body after access is %s on a session change', async (_, revokedAnswer, feedback) => {
    let revoked = false;
    try {
      extraRead = q => q.endpoint.startsWith('logLifecycle.validationIssue') && revoked ? revokedAnswer() : q.endpoint === 'logLifecycle.validationIssues' ? ok({ rows: [issueRow(B, '합성 항목')] }) : q.endpoint === 'logLifecycle.validationIssueDetail' ? ok(issueDetail(B, '합성 항목', '합성 보호 본문')) : q.endpoint.startsWith('logLifecycle.validationIssue') ? ok({ rows: [] }) : undefined;
      const t = mount(`&issue=${B}`); await ready();
      await waitFor(() => expect(text('합성 보호 본문')).toBe(true));
      revoked = true;
      t.switchSession();
      await waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain(feedback));
      expect(document.body.textContent).not.toContain('합성 보호 본문');
    } finally { extraRead = null; }
  });
  const denied = () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'denied' }) as unknown as ApiResponse<never>;
  const network = (online: boolean) => act(() => { window.dispatchEvent(new Event(online ? 'online' : 'offline')); });
  it('never re-shows a closed issue body or thread in the same session after revocation, also on an offline reopen', async () => {
    let revoked = false;
    try {
      extraRead = q => q.endpoint === 'logLifecycle.validationIssues' ? ok({ rows: [issueRow(B, '합성 항목')] })
        : revoked && q.endpoint.startsWith('logLifecycle.validationIssue') ? denied()
        : q.endpoint === 'logLifecycle.validationIssueDetail' ? ok(issueDetail(B, '합성 항목', '합성 보호 본문'))
        : q.endpoint === 'logLifecycle.validationIssueThread' ? ok({ rows: [{ id: ID, authorActorId: B, body: '합성 보호 댓글', correctsCommentId: null, createdAt: AT }] })
        : q.endpoint.startsWith('logLifecycle.validationIssue') ? ok({ rows: [] }) : undefined;
      const t = mount(); await ready();
      const reads = () => t.queries.filter(q => q.endpoint === 'logLifecycle.validationIssueDetail').length;
      const region = () => element('[role="region"][aria-label="검증 항목"]');
      await waitFor(() => expect(text('합성 항목', region())).toBe(true));
      click(button('합성 항목', region()));
      await waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain('합성 보호 댓글'));
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain('합성 보호 본문');
      click(element('[role="dialog"] button[aria-label="상세 닫기"]'));
      await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
      // Same user and revision (no Kernel generation change): only the per-mount read keeps the old answer away.
      revoked = true;
      network(false);
      const before = reads();
      click(button('합성 항목', region()));
      await waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
      await act(async () => { await settleQueries(); });
      expect(document.body.textContent).not.toContain('합성 보호 본문');
      expect(document.body.textContent).not.toContain('합성 보호 댓글');
      expect(reads()).toBe(before);
      network(true);
      await waitFor(() => expect(document.querySelector('[role="dialog"]')?.textContent).toContain('읽기 권한이 없습니다'));
      expect(reads()).toBe(before + 1);
      expect(document.body.textContent).not.toContain('합성 보호 본문');
      expect(document.body.textContent).not.toContain('합성 보호 댓글');
    } finally { network(true); extraRead = null; }
  });
  it('pages again from a fresh first page after a comment, under the server cutoff (51 comments, then a 52nd)', async () => {
    const comments = Array.from({ length: 51 }, (_, i) => ({ id: `cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, '0')}`, authorActorId: ID, body: `합성 댓글 ${i + 1}`, correctsCommentId: null, createdAt: AT }));
    try {
      extraRead = q => {
        const p = q.params as Record<string, unknown>;
        if (q.endpoint === 'logLifecycle.validationIssues') return ok({ rows: [issueRow(B, '합성 항목')] });
        if (q.endpoint === 'logLifecycle.validationIssueDetail') return ok(issueDetail(B, '합성 항목', '합성 본문'));
        if (q.endpoint === 'logLifecycle.validationIssueThread') {
          // Cursor = first-page cutoff (row count at that time) and offset: comments written later never join an old chain.
          const limit = Number(p.limit ?? 50);
          const [cutoff, offset] = typeof p.cursor === 'string' ? p.cursor.split(':').map(Number) as [number, number] : [comments.length, 0];
          const rows = comments.slice(0, cutoff).slice(offset, offset + limit);
          return ok({ rows, ...(offset + limit < cutoff ? { nextCursor: `${cutoff}:${offset + limit}` } : {}) });
        }
        return q.endpoint.startsWith('logLifecycle.validationIssue') ? ok({ rows: [] }) : undefined;
      };
      const t = mount(`&issue=${B}`, 1, 'round', [ISSUE_CONTRIBUTE]); await ready();
      await waitFor(() => expect(text('합성 댓글 50')).toBe(true));
      click(button('더 보기', dialog()));
      await waitFor(() => expect(text('합성 댓글 51')).toBe(true));
      expect([...dialog().querySelectorAll('button')].some(b => b.textContent === '더 보기')).toBe(false);
      change('textarea[id^="comment-issue"]', '새 댓글 52');
      click(button('댓글 남기기', dialog()));
      await waitFor(() => expect(t.sent).toHaveLength(1));
      comments.push({ ...comments[0]!, id: 'cccccccc-cccc-4ccc-8ccc-000000000052', body: '새 댓글 52' });
      await act(async () => { t.sent[0]!.resolve(response('ok', { id: ID, issueId: B }, 'comment-52')); await settleQueries(); });
      await waitFor(() => expect([...dialog().querySelectorAll('button')].some(b => b.textContent === '더 보기')).toBe(true));
      click(button('더 보기', dialog()));
      await waitFor(() => expect(text('새 댓글 52')).toBe(true));
      expect([...dialog().querySelectorAll('p')].filter(n => n.textContent === '합성 댓글 51')).toHaveLength(1);
    } finally { extraRead = null; }
  });
  it('never lets one issue’s retry join another issue’s in-flight comment, and retries with its own idempotency key', async () => {
    const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    try {
      extraRead = q => {
        const p = q.params as Record<string, unknown>;
        if (q.endpoint === 'logLifecycle.validationIssues') return ok({ rows: [issueRow(B, '항목 A'), issueRow(C, '항목 B')] });
        if (q.endpoint === 'logLifecycle.validationIssueDetail') return ok(p.issueId === B ? issueDetail(B, '항목 A', '항목 A 설명') : issueDetail(C, '항목 B', '항목 B 설명'));
        return q.endpoint.startsWith('logLifecycle.validationIssue') ? ok({ rows: [] }) : undefined;
      };
      const t = mount('', 1, 'round', [ISSUE_CONTRIBUTE]); await ready();
      const region = () => element('[role="region"][aria-label="검증 항목"]');
      const retry = () => button('같은 요청 다시 확인', dialog());
      await waitFor(() => expect(text('항목 B', region())).toBe(true));
      click(button('항목 A', region()));
      await waitFor(() => expect(dialog().textContent).toContain('항목 A 설명'));
      change('textarea[id^="comment-issue"]', '초안 A');
      click(button('댓글 남기기', dialog()));
      await waitFor(() => expect(t.sent).toHaveLength(1));
      await act(async () => { t.sent[0]!.resolve(response('unknown', null, 'a-unknown')); await settleQueries(); });
      await waitFor(() => expect(retry()).toBeTruthy());
      click(button('항목 B', region()));
      await waitFor(() => expect(dialog().textContent).toContain('항목 B 설명'));
      change('textarea[id^="comment-issue"]', '초안 B');
      click(button('댓글 남기기', dialog()));
      await waitFor(() => expect(t.sent).toHaveLength(2));
      click(button('항목 A', region()));
      await waitFor(() => expect(dialog().textContent).toContain('항목 A 설명'));
      await waitFor(() => expect(retry()).toBeTruthy());
      // B's request is in flight: A's retry waits instead of joining B's promise and taking B's answer.
      expect(retry().disabled).toBe(true);
      click(retry());
      await act(async () => { t.sent[1]!.resolve(response('ok', { id: ID, issueId: C }, 'b-ok')); await settleQueries(); });
      expect(t.sent).toHaveLength(2);
      expect(t.sent[1]!.request).toMatchObject({ input: { issueId: C, body: '초안 B' } });
      expect(text('댓글을 남겼습니다.', dialog())).toBe(false);
      expect(commentBox().value).toBe('초안 A');
      await waitFor(() => expect(retry().disabled).toBe(false));
      click(retry());
      await waitFor(() => expect(t.sent).toHaveLength(3));
      expect(t.sent[2]!.request).toBe(t.sent[0]!.request);
      expect(t.sent[2]!.request.idempotencyKey).not.toBe(t.sent[1]!.request.idempotencyKey);
      await act(async () => { t.sent[2]!.resolve({ ...response('ok', { id: ID, issueId: B }, 'a-ok'), replayed: true }); await settleQueries(); });
      await waitFor(() => expect(text('댓글을 남겼습니다.', dialog())).toBe(true));
      expect(commentBox().value).toBe('');
    } finally { extraRead = null; }
  });
  it('sends a double-clicked comment once and resends the same request after an unknown answer', async () => {
    try {
      extraRead = q => q.endpoint === 'logLifecycle.validationIssues' ? ok({ rows: [issueRow(B, '합성 항목')] }) : q.endpoint === 'logLifecycle.validationIssueDetail' ? ok(issueDetail(B, '합성 항목', '합성 본문')) : q.endpoint.startsWith('logLifecycle.validationIssue') ? ok({ rows: [] }) : undefined;
      const t = mount(`&issue=${B}`, 1, 'round', [ISSUE_CONTRIBUTE]); await ready();
      await waitFor(() => expect(commentBox()).toBeTruthy());
      change('textarea[id^="comment-issue"]', '한 번만 저장');
      const submit = button('댓글 남기기', dialog());
      await act(async () => { submit.click(); submit.click(); await Promise.resolve(); });
      await waitFor(() => expect(t.sent).toHaveLength(1));
      await act(async () => { await settleQueries(); });
      expect(t.sent).toHaveLength(1);
      expect(t.sent[0]!.request).toMatchObject({ action: 'logLifecycle.validationIssueComment', input: { issueId: B, body: '한 번만 저장' } });
      await act(async () => { t.sent[0]!.resolve(response('unknown', null, 'comment-unknown')); await settleQueries(); });
      await waitFor(() => expect(text('같은 요청 다시 확인')).toBe(true));
      expect(commentBox().disabled).toBe(true);
      click(button('같은 요청 다시 확인'));
      await waitFor(() => expect(t.sent).toHaveLength(2));
      expect(t.sent[1]!.request).toBe(t.sent[0]!.request);
      await act(async () => { t.sent[1]!.resolve({ ...response('ok', { id: ID, issueId: B }, 'comment-unknown'), replayed: true }); await settleQueries(); });
      await waitFor(() => expect(text('댓글을 남겼습니다.')).toBe(true));
      expect(commentBox().value).toBe('');
    } finally { extraRead = null; }
  });
});
