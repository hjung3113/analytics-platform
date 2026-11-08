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
import type { Project, RequestDetail, RoundDetail, RuleResult } from '../endpoints';
import { GATE_DECIDE, PROJECT_MANAGE, ROUND_MANAGE } from '../endpoints';
import { manifests } from '../index';
import LifecyclePage from './LifecyclePage';

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const AT = '2026-11-07T00:00:00Z';
const project: Project = { id: ID, modelId: ID, model: { code: 'ETCH-300', name: '식각', vendorName: '설비사' }, kind: 'new', stage: 'alpha', softwareId: null, owner: { id: ID, displayName: '김개발' }, targetDate: null, nextStages: ['beta'], reopenTo: null, openRound: { id: ID, seq: 3 }, version: '7', gateTarget: 'beta', gate: { latest: null } };
const round: RoundDetail = { id: ID, projectId: ID, seq: 3, stage: 'alpha', status: 'open', version: '1', createdAt: AT, specPin: null, sampleManifestDigest: '', note: null, sampleSet: { sourceOwner: 'team', files: [] }, gateDecisions: [], gateAvailability: { targetStage: 'beta', projectVersion: '7', reasons: [], decisions: { approved: { allowed: true, reasons: [] }, rejected: { allowed: true, reasons: [] }, exception: { allowed: true, reasons: [] } }, basis: {} } };
const attempt = (id: string): RequestDetail['attempts'][number] => ({ id, attemptNo: 1, outcome: 'succeeded', workerActorId: ID, verdict: 'fail', manifestMatches: true, counts: { FAIL: 13, PASS: 13 }, requiredUnchecked: 0, ruleCount: 26, startedAt: AT, endedAt: AT, ruleSetRevision: 'r1', inputManifestDigest: '' });
const request = (id: string): RequestDetail => ({ id, roundId: ID, roundSeq: 3, projectId: ID, modelId: ID, modelCode: 'ETCH-300', softwareLabel: null, priority: 1, immediate: false, state: 'succeeded', attemptCount: 1, maxAttempts: 3, leaseExpiresAt: null, lastHeartbeatAt: null, requestedBy: { id: ID, displayName: '김개발' }, createdAt: AT, endedAt: AT, latestVerdict: 'fail', version: '9', cancelReason: null, attempts: [attempt(id)] });
const rules: RuleResult[] = Array.from({ length: 26 }, (_, i) => ({ id: `rule-${i}`, ruleId: `R-${String(i + 1).padStart(3, '0')}`, result: i % 2 ? 'FAIL' : 'PASS', required: i % 2 === 1, expected: '기대', observed: '관측', evidence: [], hasExcerpt: false }));
const ok = (data: unknown): ApiResponse<never> => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'fixture' }) as ApiResponse<never>;
const registry = createRegistry({ permissions: [PROJECT_MANAGE, ROUND_MANAGE, GATE_DECIDE], spaces: [{ id: spaceId('logDev'), label: { ko: '로그', en: 'Log' }, description: { ko: '개발 모델 관리', en: 'Model development' }, homeMenuId: 'log-models' }], groups: [{ id: groupId('logModels'), label: { ko: '모델', en: 'Models' }, icon: Cpu, space: spaceId('logDev') }], menus: manifests });
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

function mount(search = '', count = 1, route = 'round') {
  const queries: MenuQuery<Record<string, unknown>>[] = [];
  const sent: { request: MenuAction; resolve(value: ActionResponse<unknown>): void }[] = [];
  const listeners = new Set<() => void>();
  const permissions = ['platform:view' as const, PROJECT_MANAGE, ROUND_MANAGE, GATE_DECIDE];
  let session = testSession(permissions, { user: { id: ID } });
  const adapter = testAdapter({ session: () => session, subscribe: l => { listeners.add(l); return () => listeners.delete(l); }, menuQuery: async q => {
    queries.push(q as MenuQuery<Record<string, unknown>>);
    const p = q.params as Record<string, unknown>;
    if (q.endpoint === 'logLifecycle.projectDetail') return ok(project);
    if (q.endpoint === 'logLifecycle.roundDetail') return ok(round);
    if (q.endpoint === 'logLifecycle.requests') return ok({ rows: Array.from({ length: count }, (_, i) => request(i === 0 ? ID : i === 1 ? B : `cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, '0')}`)).slice(Number(p.page ?? 0) * 25, (Number(p.page ?? 0) + 1) * 25), total: count });
    if (q.endpoint === 'logLifecycle.requestDetail') return ok(request(String(p.requestId)));
    if (q.endpoint === 'logLifecycle.ruleResults') {
      let rows = rules.filter(r => (!p.results || (p.results as string[]).includes(r.result)) && (!p.required || r.required));
      if ((p.sorting as { id: string }[] | undefined)?.[0]?.id === 'result') rows = [...rows].sort((a, b) => a.result.localeCompare(b.result));
      return ok({ rows: rows.slice(Number(p.page ?? 0) * 25, (Number(p.page ?? 0) + 1) * 25), total: rows.length });
    }
    return ok(null);
  }, menuAction: req => new Promise(resolve => sent.push({ request: req, resolve })) });
  window.history.replaceState(null, '', route === 'requests' ? `/logDev/log-validation-requests?v=1${search}` : `/logDev/log-model-round/${ID}/${ID}?v=1${search}`);
  const history = vi.spyOn(window.history, 'pushState');
  act(() => root.render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider><LifecyclePage params={route === 'requests' ? {} : { projectId: ID, roundId: ID }} /><DetailHost /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>));
  return { queries, sent, history, switchSession: () => act(() => { session = testSession(permissions, { user: { id: B } }); listeners.forEach(l => l()); }) };
}
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
const rulesRegion = () => element('section[aria-label="규칙 결과"]');
const requestsRegion = () => element('section[aria-label="Round 검증 요청"]');
const query = () => new URLSearchParams(window.location.search);
const ready = () => waitFor(() => expect(text('R-001')).toBe(true));
function change(selector: string, value: string) {
  const node = element(selector) as HTMLInputElement;
  act(() => {
    const prototype = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('lifecycle interactions with the real Kernel host', () => {
  it('keeps the one request and its results mounted on rule page two and returns with Previous', async () => {
    const t = mount(); await ready();
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
    const t = mount(`&request=${ID}&attempt=${ID}&rulesPage=2`, 2);
    await waitFor(() => expect(text('R-026')).toBe(true));
    t.history.mockClear();
    click(button('bbbbbbbb', requestsRegion()));
    await ready();
    expect(query().get('request')).toBe(B);
    expect(query().has('attempt')).toBe(false);
    expect(query().has('rulesPage')).toBe(false);
    expect(t.history).toHaveBeenCalledTimes(1);
    expect(t.queries.some(q => q.endpoint === 'logLifecycle.ruleResults' && q.params.attemptId === B)).toBe(true);
  });
  it('pages requests and clears request, attempt and rule page atomically', async () => {
    const t = mount(`&request=${ID}&attempt=${ID}&rulesPage=2`, 26);
    await waitFor(() => expect(text('R-026')).toBe(true)); t.history.mockClear();
    click(button('다음', requestsRegion()));
    await waitFor(() => expect(query().get('requestsPage')).toBe('2'));
    expect(['request', 'attempt', 'rulesPage'].some(k => query().has(k))).toBe(false);
    expect(t.history).toHaveBeenCalledTimes(1);
    await ready();
    click(button('이전', requestsRegion()));
    await waitFor(() => expect(query().has('requestsPage')).toBe(false));
  });
  it.each(['FAIL', 'required', 'sort'])('applies %s from an unfiltered URL with one host write and a rule-page reset', async control => {
    const t = mount('&rulesPage=2'); await waitFor(() => expect(text('R-026')).toBe(true)); t.history.mockClear();
    if (control === 'FAIL') click(button('실패 13'));
    else if (control === 'required') click(element('#rules-required'));
    else {
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
      change('textarea[id^="gate-reason"]', '검토 완료');
      click(button(/진입 결정 기록/));
    } else {
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
