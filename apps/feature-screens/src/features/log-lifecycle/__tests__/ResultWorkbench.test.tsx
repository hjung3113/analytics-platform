import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type { Attempt, Presentation, Project, RequestDetail, RoundDetail, RuleResult, ScreenProps, TableParts } from '../contracts';
import { RoundScreen } from '../RoundScreen';

const project = { id: 'project', model: { code: 'SYN-300' }, softwareLabel: '3.2.1' } as Project;
const attempt: Attempt = { id: 'attempt', attemptNo: 2, outcome: 'succeeded', verdict: 'fail', workerActorId: 'actor', manifestMatches: true, counts: { FAIL: 4, NOT_CHECKED: 5, PASS: 21 }, requiredUnchecked: 5, ruleCount: 30, startedAt: '', endedAt: '', ruleSetRevision: null, inputManifestDigest: '' };
const request = { id: 'request', roundId: 'round', state: 'failed', attempts: [attempt, { ...attempt, id: 'latest', attemptNo: 3, outcome: 'failed', verdict: null }] } as RequestDetail;
const rule: RuleResult = { id: 'rule-result', ruleId: 'SYN-R001', result: 'FAIL', required: true, expected: '종료 이벤트', observed: '종료 이벤트 없음', evidence: [], hasExcerpt: false };
const round: RoundDetail = { id: 'round', projectId: 'project', seq: 3, stage: 'alpha', status: 'open', version: '1', createdAt: '', specPin: null, sampleManifestDigest: '', note: null, sampleSet: { sourceOwner: 'synthetic', files: [] }, gateDecisions: [], gateAvailability: { targetStage: 'beta', projectVersion: '1', reasons: [], decisions: { approved: { allowed: false, reasons: ['verdict_not_pass'] }, rejected: { allowed: true, reasons: [] }, exception: { allowed: true, reasons: [] } }, basis: { decisiveAttemptId: 'attempt', decisiveVerdict: 'fail', attempts: [{ attemptId: 'attempt', requestId: 'request', attemptNo: 2, verdict: 'fail' }] } } };
function Table<T extends { id: string }>(p: TableParts<T>) { return <><table aria-label={p.title}><tbody>{p.rows.map(r => <tr key={r.id}>{p.columns.map(c => <td key={c.id}>{c.cell(r)}</td>)}</tr>)}</tbody></table>{p.pagination}</>; }
const ui: Presentation = { table: Table, drawer: p => <section role="dialog" aria-label={String(p.title)}>{p.body}<button type="button" onClick={p.requestClose}>상세 닫기</button></section>, timeline: () => null, trust: () => null, sourceView: () => <p>합성 원본</p> };
function setup(options: { round?: RoundDetail; rules?: RuleResult[]; denied?: boolean; error?: boolean; loading?: boolean; missing?: boolean; canGate?: boolean } = {}) {
  const run = vi.fn();
  function Host() {
    const [state, setState] = useState<Record<string, string>>({});
    const props: ScreenProps = { ui, actorId: 'actor', canProject: false, canRound: false, canGate: options.canGate ?? true, state, setState: patch => setState(previous => { const next = { ...previous }; for (const [key, value] of Object.entries(patch)) { if (value === undefined) delete next[key]; else next[key] = value; } return next; }), setSelection: vi.fn(), api: { useAction: () => ({ pending: false, run }), useRead: <T,>(name: string) => ({ status: name === 'ruleResults' && (options.error || options.denied) ? 'error' : name === 'ruleResults' && options.loading ? 'loading' : 'done', denied: name === 'ruleResults' && !!options.denied, data: ({ roundDetail: options.round ?? round, requests: { rows: [request], total: 1 }, requestDetail: request, ruleResults: options.missing ? null : { rows: options.rules ?? [rule], total: 30 } }[name] ?? null) as T, retry: vi.fn() }) } };
    return <RoundScreen {...props} project={project} roundId="round" />;
  }
  const mounted = render(<Host />);
  return { ...mounted, run, update(patch: typeof options) { Object.assign(options, patch); mounted.rerender(<Host />); } };
}
afterEach(cleanup);
it.each(['FAIL', 'NOT_CHECKED', 'ERROR', 'PASS'])('opens a %s rule with missing evidence and no opinions', async result => {
  setup({ rules: [{ ...rule, result }] });
  await userEvent.setup().click(screen.getByRole('button', { name: 'SYN-R001 상세 열기' }));
  const detail = within(screen.getByRole('dialog'));
  expect(detail.getByText('종료 이벤트 없음')).toBeVisible();
  expect(detail.getByText(/근거 위치 없음/)).toBeVisible();
  expect(detail.getByText('의견 없음')).toBeVisible();
});
it('uses completed server counts while identifying the newer failed execution', () => {
  setup();
  expect(screen.getByLabelText('선택 시도 서버 판정')).toHaveTextContent('시도 #2');
  expect(screen.getByRole('button', { name: '실패 4' })).toBeVisible();
  expect(screen.getByRole('button', { name: '미검증 5' })).toBeVisible();
  expect(screen.getByLabelText('최신 실행 상태')).toHaveTextContent('시도 #3');
  expect(screen.queryByRole('table', { name: 'Round 검증 요청' })).toBeNull();
});
it('shows no synthetic defect table when the server has no defect projection', () => {
  setup();
  expect(screen.queryByRole('table', { name: '미해결 결함' })).toBeNull();
  expect(screen.getByText('미해결 결함 집계 불가')).toBeVisible();
});
it('moves keyboard focus to the server-provided unresolved defect table from the header count', async () => {
  setup({ round: { ...round, defects: { unresolvedCount: 1, rows: [{ id: 'issue', title: '합성 결함', status: 'open', ruleResultId: rule.id }] } } });
  const count = screen.getByRole('button', { name: '미해결 결함 1' });
  count.focus(); await userEvent.setup().keyboard('{Enter}');
  expect(screen.getByRole('region', { name: '미해결 결함' })).toHaveFocus();
  expect(screen.getByRole('table', { name: '규칙 결과' })).toBeVisible();
});
it('fills the read-only server Gate basis and preserves the reason through rule replacement and tab visits', async () => {
  setup(); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Gate 결정' }));
  expect(screen.getByLabelText('서버 결정 근거')).toHaveTextContent('실패 4');
  expect(screen.getByLabelText('서버 결정 근거')).toHaveTextContent('SYN-R001');
  expect(within(screen.getByRole('radiogroup', { name: '결정' })).getAllByRole('radio').every(r => r.getAttribute('aria-checked') === 'false')).toBe(true);
  await user.type(screen.getByLabelText('결정 사유 (필수)'), '근거 검토 중');
  await user.click(screen.getByRole('button', { name: 'SYN-R001 상세 열기' }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  fireEvent.mouseDown(screen.getByRole('tab', { name: '원본' }), { button: 0 });
  fireEvent.mouseDown(screen.getByRole('tab', { name: '결과·결함' }), { button: 0 });
  await user.click(screen.getByRole('button', { name: 'Gate 결정' }));
  expect(screen.getByLabelText('결정 사유 (필수)')).toHaveValue('근거 검토 중');
  expect(screen.getByRole('button', { name: 'Gate 결정 기록' })).toBeDisabled();
});
it('omits the Gate action without lifecycle:gate-decide', () => {
  setup({ canGate: false });
  expect(screen.queryByRole('button', { name: 'Gate 결정' })).toBeNull();
});

it.each([
  [{ denied: true }, /읽기 권한이 없습니다/],
  [{ error: true }, /데이터를 불러오지 못했습니다/],
  [{ loading: true }, /불러오는 중/],
  [{ missing: true }, /항목을 찾을 수 없거나 읽을 수 없습니다/],
] as const)('keeps visible feedback when the selected rule read changes: %o', async (state, feedback) => {
  const mounted = setup();
  await userEvent.setup().click(screen.getByRole('button', { name: 'SYN-R001 상세 열기' }));
  mounted.update(state);
  expect(within(screen.getByRole('dialog')).getByText(feedback)).toBeVisible();
});
