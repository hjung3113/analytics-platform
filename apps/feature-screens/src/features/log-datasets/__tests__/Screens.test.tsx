import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DatasetsScreen } from '../DatasetsScreen';
import { BaselinePanel } from '../BaselinePanel';
import { ComparisonPanel } from '../ComparisonPanel';
import { RequestDrawer, RunsPanel } from '../RunsPanel';
import { useState } from 'react';
import { DatasetBadge } from '../presentation';
import type { Baseline, Comparison, Dataset, DatasetApi, Run, Params, Presentation, ScreenProps, SuiteDetail, WriteResult } from '../contracts';

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});

const at = '2026-11-08T00:00:00Z';
const ui: Presentation = {
  page: ({ children, primaryAction }) => <>{primaryAction}{children}</>,
  cellLink: ({ children, onClick, label }) => <button type="button" aria-label={label} onClick={onClick}>{children}</button>,
  table: ({ title, rows, columns, search, pagination, loading }) => <section aria-label={title}>{search}{loading ? <p>불러오는 중…</p> : null}{rows.map(r => <div key={r.id}>{columns.map(c => <span key={c.id}>{c.cell(r)}</span>)}</div>)}{pagination}</section>,
  drawer: ({ title, body, footer, requestClose }) => <div role="dialog" aria-label={String(title)}><button type="button" onClick={requestClose}>닫기</button>{body}{footer}</div>,
  timeline: events => <div>{events.map(e => <p key={e.id}>{e.kind} {e.selfApproved ? '자기 승인' : ''}</p>)}</div>,
  trust: reasons => <div>{reasons.join(' ')}</div>,
};
const dataset: Dataset = { id: 'ds', name: '전원 복구 경계 01', purpose: '전원 복구 시나리오', owner: { id: 'me', displayName: '김검토' }, shareScope: 'private', modelIds: [], scenarioTags: ['normal'], status: 'active', synthetic: true, revisionCount: 1, latestRevisionSeq: 3, version: '1', createdAt: at, updatedAt: at };
const baseline: Baseline = { id: 'b', datasetId: 'ds', datasetRevisionId: 'rev', revisionSeq: 3, seq: 2, status: 'draft', profilePin: {}, expectationCount: 1, scopeCount: 1, author: dataset.owner, approvedBy: null, approvedAt: null, version: '4', stale: null, expectedScope: ['R-01'], expectations: [{ ruleId: 'R-01', expected: 'PASS', evidence: [{ fileRef: 'file-1', line: 120 }] }], events: [] };
const suite: SuiteDetail = { id: 'suite', name: '회귀 묶음', engineProfileRef: 'ep-8', items: [{ ordinal: 1, restricted: false, datasetId: 'ds', datasetName: dataset.name, datasetRevisionId: 'rev', baselineId: 'b', resolvesTo: { ok: true, revisionId: 'rev', revisionSeq: 3, baselineId: 'b', baselineSeq: 2 } }], version: '1' };
const comparison: Comparison = { run: { id: 'run', suiteId: 'suite', state: 'succeeded', createdAt: at }, items: [{ ordinal: 1, restricted: false, datasetId: 'ds', datasetName: dataset.name, datasetRevisionId: 'rev', revisionSeq: 3, baselineId: 'b', baselineSeq: 2, requestState: 'succeeded', baselineStale: null, observed: { attemptId: 'attempt', attemptNo: 1, ruleSetRevision: 'rs-12' }, counts: { regressed: 0, new: 0, fixed: 0, not_comparable: 1, missing: 0, unchanged: 0 }, coverage: { scopeCount: 1, executedCount: 0, notExecutedCount: 1, requiredGapCount: 1, ratio: 0, notExecuted: [{ ruleId: 'R-01', reason: 'not_checked', required: true }] }, labelCount: 0 }], rules: { total: 1, rows: [{ ordinal: 1, ruleId: 'R-01', expected: 'PASS', observed: 'NOT_CHECKED', classification: 'not_comparable', required: true, label: null }] }, labels: { total: 0 } };
function props(data: Record<string, unknown> = {}, result: WriteResult = { outcome: 'ok', data: {}, version: null, fieldErrors: [] }): ScreenProps {
  const run = vi.fn().mockResolvedValue(result);
  const api: DatasetApi = { useRead: <T,>(name: string) => ({ status: 'done', data: (data[name] ?? null) as T | null, completedAt: Date.parse(at), retry: vi.fn() }), useAction: () => ({ pending: false, run }) };
  return { api, ui, actorId: 'me', canManage: true, canApprove: true, canRun: true, navigate: vi.fn() };
}
describe('log dataset captured states', () => {
  it('uses a matching empty title and explanation', () => {
    render(<DatasetsScreen {...props({ datasets: { rows: [], total: 0 } })} />);
    expect(screen.getByText('등록된 테스트 데이터셋이 없습니다.')).toBeVisible();
    expect(screen.getByText(/샘플 목록과 기대 결과를 준비한 뒤/)).toBeVisible();
  });
  it.each(['loading', 'error', 'denied'] as const)('shows %s separately from a successful empty list', state => {
    const p = props(); p.api.useRead = () => ({ status: state === 'loading' ? 'loading' : 'error', denied: state === 'denied', data: null, retry: vi.fn() });
    render(<DatasetsScreen {...p} />);
    expect(screen.getByText(state === 'loading' ? '불러오는 중…' : state === 'denied' ? '읽기 권한이 없습니다. 관리자에게 요청해 주세요.' : '데이터를 불러오지 못했습니다.')).toBeVisible();
    expect(screen.queryByText('등록된 테스트 데이터셋이 없습니다.')).toBeNull();
  });
  it('shows synthetic data inline', () => {
    render(<DatasetsScreen {...props({ datasets: { rows: [dataset], total: 1 } })} />);
    expect(screen.getByText('합성')).toBeVisible();
  });
  it('blocks baseline approval with its session permission reason', () => {
    render(<BaselinePanel {...props({ baselines: { rows: [baseline] }, baselineDetail: baseline })} canApprove={false} dataset={dataset} revisionId="rev" />);
    expect(screen.getAllByText(/Baseline 승인 권한이 없습니다/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '초안 b2 승인' })).toBeDisabled();
  });
  it('requires an approval reason and the current baseline version', async () => {
    const p = props({ baselines: { rows: [baseline] }, baselineDetail: baseline });
    const action = p.api.useAction('baselineApprove');
    render(<BaselinePanel {...p} dataset={dataset} revisionId="rev" />);
    await userEvent.setup().type(screen.getByLabelText('승인 사유'), '검토 완료');
    await userEvent.setup().click(screen.getByRole('button', { name: '초안 b2 승인' }));
    expect(action.run).toHaveBeenCalledWith({ id: 'b', reason: '검토 완료' }, { expectedVersion: '4' });
    expect(await screen.findByText('Baseline을 승인했습니다.')).toBeVisible();
  });
  it('shows self-approval from server history', () => {
    const b = { ...baseline, status: 'approved', approvedBy: dataset.owner, approvedAt: at, events: [{ id: 'e', kind: 'approved', actor: dataset.owner, before: null, after: null, reason: '검토 완료', selfApproved: true, at }] };
    render(<BaselinePanel {...props({ baselines: { rows: [b] }, baselineDetail: b })} dataset={dataset} revisionId="rev" />);
    expect(screen.getAllByText(/자기 승인/).length).toBeGreaterThan(0);
  });
  it('shows asserted stale reasons separately from unknown checks', () => {
    const b = { ...baseline, status: 'approved', stale: { state: 'stale' as const, reasons: ['file_hash_changed', 'spec_pin_changed'], unknown: ['parser'] } };
    render(<BaselinePanel {...props({ baselines: { rows: [b] }, baselineDetail: b })} dataset={dataset} revisionId="rev" />);
    expect(screen.getByText('파일 해시 변경')).toBeVisible();
    expect(screen.getByText('명세 고정값 변경')).toBeVisible();
    expect(screen.getByText(/확인 불가: Parser/)).toBeVisible();
  });
  it.each(['not_comparable', 'unavailable', 'unsupported', 'EXPECTED_UNSUPPORTED'])('%s never uses PASS styling', value => {
    const { container } = render(<DatasetBadge value={value} />);
    expect(container.innerHTML).not.toContain('success');
    expect(container.innerHTML).not.toContain('text-text-success');
  });
  it('keeps required unchecked rules and pinned baseline above the comparison and gates the label drawer', async () => {
    render(<ComparisonPanel {...props({ comparison })} canManage={false} datasetId="ds" suiteRunId="run" />);
    expect(screen.getByText('실행 커버리지')).toBeVisible();
    expect(screen.getByText(/필수 미검사 1/)).toBeVisible();
    expect(screen.getByText(/비교 대상 고정/)).toBeVisible();
    await userEvent.setup().click(screen.getByRole('button', { name: 'R-01 검토 전' }));
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).getByText(/결과 검토 라벨 권한이 없습니다/)).toBeVisible();
    expect(within(drawer).getByRole('button', { name: '결과 검토 라벨 남기기' })).toBeDisabled();
  });
  it('#2107 submits the selected run item ordinal', async () => {
    const selected: Comparison = { ...comparison, items: comparison.items.map(i => ({ ...i, ordinal: 2 })), rules: { ...comparison.rules, rows: comparison.rules.rows.map(r => ({ ...r, ordinal: 2 })) } };
    const p = props({ comparison: selected });
    const action = p.api.useAction('reviewLabelAdd');
    render(<ComparisonPanel {...p} datasetId="ds" suiteRunId="run" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'R-01 검토 전' }));
    await user.type(screen.getByLabelText('검토 사유'), '확인 필요');
    await user.click(screen.getByRole('button', { name: '결과 검토 라벨 남기기' }));
    expect(action.run).toHaveBeenCalledWith({ suiteRunId: 'run', ordinal: 2, datasetRevisionId: 'rev', ruleId: 'R-01', label: 'needs_review', reason: '확인 필요' });
  });
  it('submits an append-only review label against the pinned revision', async () => {
    const p = props({ comparison }); const action = p.api.useAction('reviewLabelAdd');
    render(<ComparisonPanel {...p} datasetId="ds" suiteRunId="run" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'R-01 검토 전' }));
    await user.type(screen.getByLabelText('검토 사유'), '엔진 지원 확인 필요');
    await user.click(screen.getByRole('button', { name: '결과 검토 라벨 남기기' }));
    expect(action.run).toHaveBeenCalledWith({ suiteRunId: 'run', ordinal: 1, datasetRevisionId: 'rev', ruleId: 'R-01', label: 'needs_review', reason: '엔진 지원 확인 필요' });
  });
  it.each(['queued', 'failed'] as const)('shows request %s and pins the resolved baseline', async state => {
    const result = state === 'queued' ? { outcome: 'ok', data: { suiteRunId: 'new-run' }, version: null, fieldErrors: [] } : { outcome: 'invalid', data: null, version: null, fieldErrors: [{ path: ['suiteId'], code: 'suite.run_limit' }] };
    render(<RequestDrawer {...props({}, result)} suite={suite} datasetId="ds" onClose={vi.fn()} />);
    expect(screen.getByText(/r3 · Baseline b2/)).toBeVisible();
    expect(screen.getByText(/사용자당 동시 회귀 실행 한도 3건/)).toBeVisible();
    await userEvent.setup().click(screen.getByRole('button', { name: '회귀 실행 요청 등록' }));
    expect(await screen.findByText(state === 'queued' ? '검증 요청: 대기' : /동시 실행 한도 3건에 도달했습니다/)).toBeVisible();
  });
});

it('keeps the approved baseline pin and stale reasons visible beside a selected draft', () => {
  const approved = { ...baseline, id: 'approved', seq: 1, status: 'approved', profilePin: { ruleSetRevision: 'approved-rules' }, stale: { state: 'stale' as const, reasons: ['spec_pin_changed'], unknown: [] } };
  render(<BaselinePanel {...props({ baselines: { rows: [baseline, approved] }, baselineDetail: baseline })} dataset={dataset} revisionId="rev" />);
  expect(screen.getByText(/^승인 b1 · 초안 b2/)).toBeVisible();
  expect(screen.getByText(/approved-rules/)).toBeVisible();
  expect(screen.getByText('명세 고정값 변경')).toBeVisible();
  expect(screen.getByRole('button', { name: '초안 b2 승인' })).toBeDisabled();
});


it('renders visible run request details alongside a minimal restricted item (#2112)', () => {
  const run: Run = { id: 'visible-run', suiteId: 'suite', state: 'queued', createdAt: at, engineProfileRef: null, items: [
    { ordinal: 1, restricted: true },
    { ordinal: 2, restricted: false, datasetId: 'ds', revisionSeq: 3, baselineSeq: 2, requestState: 'failed', attemptCount: 2, latestVerdict: null },
  ] };
  render(<RunsPanel {...props({ suites: { rows: [suite], total: 1 }, suiteDetail: suite, suiteRuns: { rows: [run], total: 1 } })} dataset={{ ...dataset, revisions: [] }} />);
  expect(screen.getByText('visible-run')).toBeVisible();
  expect(screen.getByText(/r3 · Baseline b2 · 프로파일 미지정 고정 · 시도 2/)).toBeVisible();
  expect(screen.getByText(/검증 요청이 실패했습니다/)).toBeVisible();
  expect(screen.getAllByText(/검증 요청:/)).toHaveLength(1);
});

// Exercise server-sized histories and a pinned Suite outside the list page.
function historyProps() {
  const suites = [{ ...suite, id: 'suite-a', name: 'Suite A' }, { ...suite, id: 'suite-b', name: 'Suite B', engineProfileRef: 'profile-B' }];
  const runs: Run[] = Array.from({ length: 27 }, (_, i) => ({ id: `run-${i}`, suiteId: 'suite-b', state: 'succeeded', createdAt: new Date(Date.parse(at) - i * 60000).toISOString(), engineProfileRef: 'profile-B', items: [] }));
  for (const r of runs) { r.items = [{ ordinal: 1, restricted: false, datasetId: 'ds', requestState: 'succeeded', attemptCount: 1, latestVerdict: 'pass' }]; }
  const p = props();
  p.api.useRead = <T,>(name: string, params: Params, enabled = true) => {
    const page = Number(params.page ?? 0);
    const data = !enabled ? null : name === 'suites' ? { rows: suites.slice(0, 1), total: 1 }
      : name === 'suiteDetail' ? suites.find(s => s.id === params.suiteId)
      : name === 'suiteRuns' ? { rows: params.suiteId === 'suite-b' ? runs.slice(page * 25, (page + 1) * 25) : [], total: params.suiteId === 'suite-b' ? runs.length : 0 }
      : name === 'comparison' ? { ...comparison, run: { ...comparison.run, id: params.suiteRunId, suiteId: 'suite-b' } }
      : name === 'rerunDiff' ? { from: { id: params.fromRunId }, to: { id: params.toRunId }, revisions: [], diffs: { rows: [], total: 0 } } : null;
    return { status: 'done', data: data as T | null, retry: vi.fn() };
  };
  p.runNavigation = { current: { suiteId: '', page: 0, suitePage: 0 }, change(next) { if (p.runNavigation) p.runNavigation.current = next; } };
  return p;
}
function History({ p, initialRun = 'run-0' }: { p: ScreenProps; initialRun?: string }) {
  const [runId, setRunId] = useState<string | undefined>(initialRun);
  return <RunsPanel key={runId} {...p} navigate={(datasetId, run) => { p.navigate(datasetId, run); setRunId(run); }} dataset={{ ...dataset, revisions: [] }} {...(runId ? { suiteRunId: runId } : {})} compare />;
}
async function choose(label: string, name: string | RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.click(screen.getByRole('option', { name }));
}
it('pages beyond 25 runs, keeps the pin across navigation and pages, and selects an older rerun', async () => {
  render(<History p={historyProps()} />);
  await userEvent.setup().click(historyButton('다음'));
  await userEvent.setup().click(screen.getByRole('combobox', { name: '비교할 회귀 실행' }));
  const options = screen.getAllByRole('option');
  expect(options).toHaveLength(4); // placeholder, pinned run, two older runs
  await userEvent.setup().click(option(2));
  expect(screen.getByText('27건 · 2페이지')).toBeVisible();
  await userEvent.setup().click(historyButton('이전'));
  expect(screen.getByRole('combobox', { name: '비교할 회귀 실행' })).not.toHaveTextContent('회귀 실행 선택');
  await userEvent.setup().click(historyButton('다음'));
  await userEvent.setup().click(screen.getByRole('combobox', { name: '같은 Revision 재실행 비교' }));
  await userEvent.setup().click(option(-1));
  expect(await screen.findByText('재실행 비교: run-26 → run-25')).toBeVisible();
});
it('restores Suite B from a pinned deep link outside the Suite page, including rerun and request targets', async () => {
  const p = historyProps();
  const { unmount } = render(<History p={p} />);
  expect(screen.getByRole('combobox', { name: '회귀 Suite' })).toHaveTextContent('Suite B');
  unmount(); // reload/direct-link mount
  render(<History p={p} />);
  expect(screen.getByRole('combobox', { name: '회귀 Suite' })).toHaveTextContent('Suite B');
  await userEvent.setup().click(screen.getByRole('combobox', { name: '같은 Revision 재실행 비교' }));
  await userEvent.setup().click(option(1));
  expect(await screen.findByText('재실행 비교: run-1 → run-0')).toBeVisible();
  await userEvent.setup().click(screen.getByRole('button', { name: '회귀 실행 요청' }));
  expect(within(screen.getByRole('dialog')).getByText('실행 프로파일: profile-B')).toBeVisible();
  await userEvent.setup().click(screen.getByRole('button', { name: '회귀 실행 요청 등록' }));
  expect(p.api.useAction('suiteRun').run).toHaveBeenCalledWith(expect.objectContaining({ suiteId: 'suite-b' }));
  await userEvent.setup().click(screen.getByRole('button', { name: '닫기' }));
  await choose('회귀 Suite', 'Suite A');
  expect(p.navigate).toHaveBeenLastCalledWith('ds', undefined);
  expect(screen.queryByText('실행 커버리지')).toBeNull();
});
it.each(['queued', 'failed'])('keeps %s coverage unknown and explains unavailable comparison', state => {
  const c = { ...comparison, items: comparison.items.map(i => i.restricted ? i : { ...i, requestState: state, coverage: null, observed: null }), rules: { rows: [], total: 0 } };
  render(<ComparisonPanel {...props({ comparison: c })} datasetId="ds" suiteRunId="run" />);
  expect(screen.getByText('미산출')).toBeVisible();
  expect(screen.getByText(/성공한 시도 없음/)).toBeVisible();
  expect(screen.getByText('비교 결과를 제공할 수 없습니다.')).toBeVisible();
  expect(screen.queryByText('실행 0')).toBeNull();
  expect(screen.queryByRole('region', { name: 'Baseline 대비 규칙 결과' })).toBeNull();
  expect(screen.queryByRole('button', { name: /^unchanged 0/ })).toBeNull();
});
it('preserves measured zero coverage', () => {
  render(<ComparisonPanel {...props({ comparison })} datasetId="ds" suiteRunId="run" />);
  expect(screen.getByText('실행 0')).toBeVisible();
  expect(screen.queryByText('미산출')).toBeNull();
});
it('names review controls with the Rule identity', () => {
  render(<ComparisonPanel {...props({ comparison })} datasetId="ds" suiteRunId="run" />);
  expect(screen.getByRole('button', { name: 'R-01 검토 전' })).toBeVisible();
});

it('preserves the loading table contract instead of returning a status paragraph', () => {
  const p = props(); const table = vi.fn();
  p.api.useRead = () => ({ status: 'loading', data: null, retry: vi.fn() });
  render(<DatasetsScreen {...p} ui={{ ...ui, table: parts => { table(parts); return ui.table(parts); } }} />);
  expect(table).toHaveBeenCalledWith(expect.objectContaining({ loading: true, title: '테스트 데이터셋 목록', rows: [] }));
});
it('reveals all evidence locations and exception scope with the keyboard', async () => {
  const b = { ...baseline, expectations: [{ ...baseline.expectations[0], exception: { reason: '입력 예외', scope: '전체 시나리오의 길고 자세한 범위' }, evidence: [{ fileRef: 'synthetic/very-long-evidence-location.log', line: 120 }, { fileRef: 'synthetic/second-evidence.log', line: 240 }] }] };
  render(<BaselinePanel {...props({ baselines: { rows: [b] }, baselineDetail: b })} dataset={dataset} revisionId="rev" />);
  const user = userEvent.setup();
  screen.getByRole('button', { name: 'R-01 근거 위치 전체 보기' }).focus();
  await user.keyboard('{Enter}');
  expect(within(screen.getByRole('dialog')).getByText(/synthetic\/very-long-evidence-location.log · 120행/)).toBeVisible();
  expect(within(screen.getByRole('dialog')).getByText(/synthetic\/second-evidence.log · 240행/)).toBeVisible();
  await user.keyboard('{Escape}');
  screen.getByRole('button', { name: 'R-01 예외 전체 보기' }).focus();
  await user.keyboard('{Enter}');
  expect(within(screen.getByRole('dialog')).getByText(/전체 시나리오의 길고 자세한 범위/)).toBeVisible();
});

function option(index: number) {
  const element = screen.getAllByRole('option').at(index);
  if (!element) throw new Error(`Missing option ${index}`);
  return element;
}
function historyButton(name: string) {
  const element = screen.getAllByRole('button', { name })[0];
  if (!element) throw new Error(`Missing history button ${name}`);
  return element;
}
