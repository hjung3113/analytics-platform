// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { useQueryBarExtension, useReportQueryBarStatus, WorkspaceQueryBarRow } from '@ap/components';
import { emptyGlobal, type MenuQuery, groupId, menuPermission, spaceId } from '@ap/contracts';
import { Timer } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider, useQueryDraft } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../index';
import CycleTimeDrilldown from './CycleTimeDrilldown';
import { installWorkspaceGeometry } from './workspaceTestSupport';
import { TEST_AXES } from '../test-axes';

// mount() alone may wait 8 s for the lazy chart chunks under CI load, so the 5 s default test timeout cut tests off first (#1681).
vi.setConfig({ testTimeout: 30_000 });

const registry = createRegistry({ permissions: [menuPermission('analytics:view')], spaces: [{ id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: menuPermission('analytics:view'), homeMenuId: 'productivity-overview' }], groups: [{ id: groupId('analytics'), label: { ko: '분석', en: 'Analytics' }, icon: Timer, space: spaceId('mars') }], menus: manifests });
function Apply() { const query = useQueryDraft(); return <button onClick={query.apply} disabled={!query.canApply}>Apply query</button>; }
const restoreGeometry = installWorkspaceGeometry();
afterAll(restoreGeometry);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('keeps page edits in draft until the single apply, preserving applied requests and URL', async () => {
  // The page head starts collapsed on a fill page (#680); the grain buttons live inside it.
  const storage = memoryStorage();
  storage.setItem('platform:page-head-collapsed:cycle-time', 'false');
  vi.stubGlobal('localStorage', storage);
  const session = testSession(['analytics:view', 'platform:view']);
  const send = vi.fn(async (_request: MenuQuery) => ({ outcome: 'empty' as const, data: null, assessments: [], trust: null, correlationId: 'test' }));
  window.history.replaceState(null, '', '/analytics/cycle-time?scopeId=MEM&roomNames=PHOTO&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
  const push = vi.spyOn(window.history, 'pushState');
  render(<I18nProvider><PlatformProvider equipmentAxes={TEST_AXES} registry={registry} adapter={testAdapter({ session: () => session, menuQuery: send })} slots={{ contextBar: <Apply /> }}><CycleTimeDrilldown params={{}} /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(new Set(send.mock.calls.map(([request]) => request.endpoint))).toEqual(new Set(['analytics.cycle.kpi', 'analytics.cycle.trend', 'analytics.cycle.dist', 'analytics.cycle.slow'])), { timeout: 8000 }); // first render loads the lazy chart chunks; under CI load the four initial requests exceeded the 1 s default (PR #738)
  const before = send.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: '일' }));
  expect(window.location.search).not.toContain('granularity');
  expect(send).toHaveBeenCalledTimes(before);
  expect(screen.getByRole('button', { name: '일' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Apply query' }));
  await waitFor(() => expect(window.location.search).toContain('granularity=day'));
  expect(push).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(send.mock.calls.filter(([request]) => request.endpoint === 'analytics.cycle.slow')).toHaveLength(2));
  expect(send.mock.calls.filter(([request]) => request.endpoint === 'analytics.cycle.trend')).toHaveLength(2);
  // Count real adapter requests, independently for each endpoint and complete identity.
  const counts = new Map<string, number>();
  for (const [request] of send.mock.calls) {
    const identity = JSON.stringify(request);
    counts.set(identity, (counts.get(identity) ?? 0) + 1);
  }
  for (const count of counts.values()) expect(count).toBe(1);
  const settled = send.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Apply query' }));
  expect(push).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledTimes(settled);
});

it.each(['', '&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00'])('shows the shared query idle state and required reasons before applying %s', async period => {
  vi.stubGlobal('localStorage', memoryStorage());
  const session = testSession(['analytics:view', 'platform:view']);
  const send = vi.fn();
  window.history.replaceState(null, '', `/analytics/cycle-time?scopeId=MEM${period}`);
  render(<I18nProvider><PlatformProvider equipmentAxes={TEST_AXES} registry={registry} adapter={testAdapter({ session: () => session, menuQuery: send })}><CycleTimeDrilldown params={{}} /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(screen.getAllByText('아직 조회하지 않았습니다').length).toBeGreaterThan(0));
  await waitFor(() => expect(screen.getAllByText(/공정.*선택/).length).toBeGreaterThan(0));
  expect(screen.queryByText('전역 기간이 URL에 확정되면 조회합니다.')).toBeNull();
  expect(send).not.toHaveBeenCalled();
});
it('formats historical page defaults from that candidate rather than the current draft', async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  const session = testSession(['analytics:view', 'platform:view']);
  window.history.replaceState(null, '', '/analytics/cycle-time?scopeId=MEM');
  const candidate = { ...emptyGlobal, scopeId: 'MEM', from: '2026-09-01T00:00:00', to: '2026-09-08T00:00:00' };
  function Summary() {
    const extension = useQueryBarExtension();
    return <p>{extension?.historyPageSummary?.(candidate, [['percentile', 'all'], ['sort', 'equipmentId:asc']]).map(item => `${item.label} ${item.value}`).join(' · ') ?? 'missing formatter'}</p>;
  }
  render(<I18nProvider><PlatformProvider equipmentAxes={TEST_AXES} registry={registry} adapter={testAdapter({ session: () => session })} slots={{ contextBar: <Summary /> }}><CycleTimeDrilldown params={{}} /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(screen.getByText('집계 일 · 느린 실행 기준 전체 실행 · 정렬 Equipment A→Z')).toBeTruthy());
});


it.each([
  ['error', '데이터를 불러오지 못했습니다'], ['timeout', '데이터를 불러오지 못했습니다'], ['too_large', '데이터를 불러오지 못했습니다'], ['forbidden', '데이터를 불러오지 못했습니다'],
  // A 0-row answer is a completed query, not a failure.
  ['empty', '요약 조회 완료'],
] as const)('reports terminal summary outcome %s with its completion time in the folded workspace bar (#1941)', async (outcome, expected) => {
  vi.stubGlobal('localStorage', memoryStorage());
  const session = testSession(['analytics:view', 'platform:view']);
  window.history.replaceState(null, '', '/analytics/cycle-time?scopeId=MEM&roomNames=PHOTO&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
  function FoldedBar() {
    useReportQueryBarStatus({ folded: true, editing: false, reasonKeys: [] });
    return <section aria-label="조회 조건"><WorkspaceQueryBarRow /></section>;
  }
  const failure = { outcome, data: null, assessments: outcome === 'empty' ? (['collection', 'processing_delay', 'coverage'] as const).map(kind => ({ kind, state: 'clear' as const })) : [], trust: null, correlationId: 'failure' };
  render(<I18nProvider><PlatformProvider equipmentAxes={TEST_AXES} registry={registry} adapter={testAdapter({ session: () => session, menuQuery: async () => failure })} slots={{ contextBar: <FoldedBar /> }}><CycleTimeDrilldown params={{}} /></PlatformProvider></I18nProvider>);
  await waitFor(() => {
    const row = screen.getByRole('region', { name: '조회 조건' }).querySelector('[role="status"]');
    expect(row?.textContent).toContain(expected);
    expect(row?.textContent).toMatch(/\d{1,2}:/);
  });
});
