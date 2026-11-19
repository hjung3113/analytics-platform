import { cleanup, fireEvent, render as renderBase, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GateDecision, LifecycleApi, Model, RequestDetail, RuleResult, Presentation, Project, ReadState, RoundDetail, ScreenProps } from '../contracts';
import { StageBadge, StageStepper } from '../presentation';
import { ModelsScreen } from '../ModelsScreen';
import { ProjectScreen } from '../ProjectScreen';
import { RoundScreen } from '../RoundScreen';
import { RequestsScreen } from '../RequestsScreen';
import { LifecycleHost } from '../host';
import type { ReactNode } from 'react';
import { GatePanel } from '../GatePanel';
import { fakeUi } from './presentation';

const render = (node: ReactNode) => renderBase(<LifecycleHost navigate={vi.fn()}>{node}</LifecycleHost>);
const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const run = vi.fn().mockResolvedValue({ outcome: 'ok', data: {}, fieldErrors: [], version: '2' });
const ui = fakeUi({ timeline: () => <p>변경 이력이 없습니다.</p>, trust: reasons => <p>{reasons.join(' · ')}</p>, sourceView: undefined });
function props(data: Record<string, unknown> = {}, state: Partial<ReadState<unknown>> = {}): ScreenProps {
  const api: LifecycleApi = { useRead: <T,>(name: string): ReadState<T> => ({ status: 'done', data: (data[name] ?? null) as T | null, retry: vi.fn(), ...state }) as ReadState<T>, useAction: () => ({ pending: false, run }) };
  return { api, ui, canProject: true, canRound: true, actorId: ID, setSelection: vi.fn() };
}
const project = { id: ID, modelId: ID, model: { code: 'ETCH-300', name: '식각', vendorName: '설비사' }, stage: 'alpha', softwareId: null, owner: { id: ID, displayName: '김개발' }, targetDate: null, nextStages: ['beta', 'cancelled'], reopenTo: null, openRound: null, version: '7', gateTarget: 'beta', gate: { latest: null } } as Project;
const gate = (reasons: string[] = []): RoundDetail => ({ id: ID, projectId: ID, seq: 3, stage: 'alpha', status: 'open', version: '1', createdAt: '', specPin: null, sampleManifestDigest: '', note: null, sampleSet: { sourceOwner: 'team', files: [] }, gateDecisions: [], gateAvailability: { targetStage: 'beta', projectVersion: '7', reasons: [], decisions: { approved: { allowed: reasons.length === 0, reasons }, rejected: { allowed: true, reasons: [] }, exception: { allowed: true, reasons: [] } }, basis: {} } });
const gateDecision = (entry: Pick<GateDecision, 'id' | 'decision' | 'reason' | 'selfApproved' | 'at'>): GateDecision => ({ ...entry, targetStage: 'beta', decidedBy: { id: ID, displayName: '김개발' }, exception: null, basis: {}, basisSummary: { attemptCount: 0, decisiveVerdict: null, evidenceLinkCount: 0 } });
const sampleGateBasis = {
  version: 1,
  attempts: [
    { attemptId: 'earlier', attemptNo: 3, requestId: 'earlier-request', verdict: 'pass', ruleSetRevision: 'rules-10', inputManifestDigest: 'd'.repeat(64), endedAt: '2026-11-08T10:00:00Z' },
    { attemptId: 'decisive', attemptNo: 4, requestId: 'request', verdict: 'incomplete', ruleSetRevision: 'rules-11', inputManifestDigest: 'e'.repeat(64), endedAt: '2026-11-08T11:42:00Z' },
  ],
  decisiveAttemptId: 'decisive',
  decisiveVerdict: 'incomplete',
  specPin: { revisionId: 'spec-12', changeSetDigest: 'f'.repeat(64) },
  sampleManifestDigest: 'a'.repeat(64),
  requestDigest: 'b'.repeat(64),
  evidenceLinks: [{ attachmentId: 'one', linkedAt: '2026-11-08T11:43:00Z' }],
};
const decisiveRequestAttempt = { id: 'decisive', attemptNo: 4, outcome: 'succeeded', workerActorId: ID, verdict: 'incomplete', manifestMatches: true, counts: { FAIL: 2, NOT_CHECKED: 0 }, requiredUnchecked: 1, ruleCount: 3, startedAt: '2026-11-08T11:40:00Z', endedAt: '2026-11-08T11:42:00Z', ruleSetRevision: 'rules-11', inputManifestDigest: 'e'.repeat(64) };
const gateRequestDetail: RequestDetail = { id: 'request', roundId: ID, roundSeq: 3, projectId: ID, modelId: ID, modelCode: 'ETCH-300', softwareLabel: null, priority: 1, immediate: false, state: 'failed', attemptCount: 1, maxAttempts: 3, leaseExpiresAt: null, lastHeartbeatAt: null, requestedBy: { id: ID, displayName: 'Worker' }, createdAt: '', endedAt: '', latestVerdict: 'incomplete', version: '1', attempts: [decisiveRequestAttempt], cancelReason: null };
function roundWithGateBasis(basis: unknown): RoundDetail {
  const source = gate();
  return { ...source, gateAvailability: { ...source.gateAvailability, basis } };
}
afterEach(() => { cleanup(); run.mockClear(); });
describe('log lifecycle screens', () => {
  it.each(['registered', 'kickoff', 'alpha', 'beta', 'completed', 'cancelled'])('renders %s with five stages and a separate cancellation badge', stage => {
    render(<><StageBadge stage={stage} /><StageStepper stage={stage} /></>);
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.queryByText('취소', { selector: 'li' })).toBeNull();
    expect(screen.getAllByText(stage === 'cancelled' ? '취소' : { registered: '등록', kickoff: '착수', alpha: '알파', beta: '베타', completed: '완료' }[stage] as string).length).toBeGreaterThan(0);
  });
  it.each([['models', ModelsScreen], ['requests', RequestsScreen]] as const)('%s explains its empty state', (name, Component) => {
    render(<Component {...props({ [name]: { rows: [], total: 0 } })} />);
    expect(screen.getByText(name === 'models' ? '등록된 모델이 없습니다.' : '검증 요청이 없습니다. Round를 열고 요청을 등록해 주세요.')).toBeVisible();
  });
  it.each([ModelsScreen, RequestsScreen, ProjectScreen])('shows read errors and permission denials', Component => {
    const p = props({}, { status: 'error', denied: true });
    render(<Component {...p} projectId={ID} />);
    expect(screen.getAllByText(/읽기 권한이 없습니다/).at(-1)).toBeVisible();
  });
  it('only offers project creation when permitted', () => {
    const m = { id: ID, code: 'CLEAN-90', name: '세정', vendorName: '설비사', vendorId: ID, processes: [], project: null, validation: 'none', gateDecision: null, pendingRequests: 0, updatedAt: '2026-11-07T00:00:00Z' } as Model;
    render(<ModelsScreen {...props({ models: { rows: [m], total: 1 } })} canProject={false} />);
    expect(screen.getByText('개발 건 없음')).toBeVisible();
    expect(screen.queryByRole('button', { name: '개발 건 만들기' })).toBeNull();
  });
  it('only shows server-allowed stage actions', () => {
    render(<ProjectScreen {...props({ projectDetail: project, rounds: { rows: [] } })} projectId={ID} />);
    expect(screen.getByRole('button', { name: '베타로 이동' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '완료로 이동' })).toBeNull();
  });
  it.each(['permission_denied', 'round_not_current', 'round_stage_mismatch', 'verdict_not_pass', 'software_required'])('shows the server Gate refusal %s', reason => {
    render(<GatePanel {...props()} round={gate([reason])} />);
    expect(screen.getByRole('radio', { name: '승인' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /결정 기록/ })).toBeDisabled();
  });
  it('requires a reason and submits the project version for the human decision', async () => {
    const user = userEvent.setup(); render(<GatePanel {...props()} round={gate()} />);
    await user.click(screen.getByRole('radio', { name: '승인' }));
    await user.type(screen.getByRole('textbox', { name: '결정 사유 (한 줄)' }), '검토 완료');
    await user.click(screen.getByRole('button', { name: /결정 기록/ }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '기록' }));
    expect(run).toHaveBeenCalledWith({ roundId: ID, targetStage: 'beta', decision: 'approved', reason: '검토 완료' }, { expectedVersion: '7' });
  });
  it('rejects an empty one-line judgment reason inline without opening confirmation or writing', async () => {
    const user = userEvent.setup();
    render(<GatePanel {...props()} round={gate()} />);
    await user.click(screen.getByRole('radio', { name: '승인' }));
    await user.click(screen.getByRole('button', { name: 'Gate 결정 기록' }));

    const reason = screen.getByRole('textbox', { name: '결정 사유 (한 줄)' });
    const error = screen.getByText('결정 사유를 입력해 주세요.');
    expect(error).toBeVisible();
    expect(reason).toHaveAttribute('aria-invalid', 'true');
    expect(reason).toHaveFocus();
    expect(reason).toHaveAttribute('aria-describedby', expect.stringContaining(error.id));
    expect(reason).toHaveAttribute('maxLength', '2000');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
  it('orders decision history chronologically and marks a self-approval', () => {
    const first = gateDecision({ id: 'first', decision: 'approved', reason: '먼저 기록한 자기 승인', selfApproved: true, at: '2026-11-18T10:00:00.000Z' });
    const second = gateDecision({ id: 'second', decision: 'rejected', reason: '나중에 기록한 거절', selfApproved: false, at: '2026-11-18T11:00:00.000Z' });
    render(<GatePanel {...props()} round={{ ...gate(), gateDecisions: [first, second] }} />);

    const firstReason = screen.getByText('먼저 기록한 자기 승인');
    const secondReason = screen.getByText('나중에 기록한 거절');
    expect(firstReason.compareDocumentPosition(secondReason) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(firstReason.closest('div.border-t')).toHaveTextContent('자기 승인');
  });
  it('uses the latest timestamp for the current Gate badge even when the server list is out of order', () => {
    const first = gateDecision({ id: 'first', decision: 'approved', reason: '오래된 결정', selfApproved: false, at: '2026-11-18T10:00:00.000Z' });
    const latest = gateDecision({ id: 'latest', decision: 'rejected', reason: '최신 결정', selfApproved: false, at: '2026-11-18T11:00:00.000Z' });
    render(<GatePanel {...props()} round={{ ...gate(), gateDecisions: [latest, first] }} />);

    expect(screen.getByRole('region', { name: 'Gate 결정' }).firstElementChild).toHaveTextContent('거절');
  });
  it('requires a confirm click before a Gate write and states exception details', async () => {
    const user = userEvent.setup(); render(<GatePanel {...props()} round={gate(['verdict_not_pass'])} />);
    await user.click(screen.getByRole('radio', { name: '예외' }));
    await user.type(screen.getByRole('textbox', { name: '결정 사유 (한 줄)' }), '일정상 예외');
    await user.type(screen.getByLabelText('예외 범위 (필수)'), '이 Round에 한함');
    const riskActor = screen.getByLabelText('위험 수용자 Actor ID (필수)');
    fireEvent.keyDown(riskActor, { key: 'Enter', isComposing: true });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(run).not.toHaveBeenCalled();
    await user.click(riskActor);
    await user.keyboard('{Enter}');
    let confirmation = await screen.findByRole('alertdialog');
    expect(confirmation).toHaveTextContent('예외');
    expect(confirmation).toHaveTextContent('일정상 예외');
    expect(confirmation).toHaveTextContent('이 Round에 한함');
    expect(confirmation).toHaveTextContent(ID);
    await user.click(within(confirmation).getByRole('button', { name: '취소' }));
    expect(run).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Gate 결정 기록' }));
    confirmation = screen.getByRole('alertdialog');
    await user.click(within(confirmation).getByRole('button', { name: '기록' }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({ roundId: ID, targetStage: 'beta', decision: 'exception', reason: '일정상 예외', exception: { riskAcceptedBy: ID, scope: '이 Round에 한함' } }, { expectedVersion: '7' });
  });
  it('labels the selected attempt only when it differs from the Gate decisive attempt', () => {
    const sourceRound = gate();
    const round = { ...sourceRound, gateAvailability: { ...sourceRound.gateAvailability, basis: { decisiveAttemptId: 'decisive', attempts: [{ attemptId: 'decisive', requestId: 'request', attemptNo: 1 }] } } };
    const decisiveAttempt = { id: 'decisive', attemptNo: 1, outcome: 'succeeded', workerActorId: ID, verdict: 'fail', manifestMatches: true, counts: { FAIL: 1, NOT_CHECKED: 2 }, requiredUnchecked: 0, ruleCount: 3, startedAt: '', endedAt: '', ruleSetRevision: null, inputManifestDigest: '' };
    const detail: RequestDetail = { id: 'request', roundId: ID, roundSeq: 3, projectId: ID, modelId: ID, modelCode: 'ETCH-300', softwareLabel: null, priority: 1, immediate: false, state: 'failed', attemptCount: 1, maxAttempts: 3, leaseExpiresAt: null, lastHeartbeatAt: null, requestedBy: { id: ID, displayName: 'Worker' }, createdAt: '', endedAt: '', latestVerdict: 'fail', version: '1', attempts: [decisiveAttempt], cancelReason: null };
    const p = props({ requestDetail: detail, ruleResults: { rows: [], total: 0 } });
    const view = render(<GatePanel {...p} round={round} selectedAttempt={{ id: 'decisive', attemptNo: 1 }} />);
    expect(screen.queryByText(/선택한 시도 #/)).toBeNull();
    view.rerender(<GatePanel {...p} round={round} selectedAttempt={{ id: 'selected', attemptNo: 2 }} />);
    expect(screen.getByText(/완료 시도 #1 \(선택한 시도 #2와 다름\)/)).toBeVisible();
  });
  it('shows the three Gate evidence groups from the decisive basis and request attempt', () => {
    render(<GatePanel {...props({ requestDetail: gateRequestDetail, ruleResults: { rows: [], total: 0 } })} round={roundWithGateBasis(sampleGateBasis)} />);
    expect(screen.getByText(/완료 시도 #4 · 불완전/)).toBeVisible();
    expect(screen.getByText(/실패 2건 · 미검증 0건 \/ 전체 규칙 3건/)).toBeVisible();
    expect(screen.getByText('필수 오류·미검증·건너뜀 1건')).toBeVisible();
    expect(screen.getByText('rules-11')).toBeVisible();
    expect(screen.getByText('spec-12')).toBeVisible();
    expect(screen.getByText(`${'a'.repeat(12)}…`)).toBeVisible();
    expect(screen.getByText('근거 링크').parentElement).toHaveTextContent('1개');
    expect(screen.getByText('시도 수').parentElement).toHaveTextContent('2개');
  });
  it.each([
    ['empty counts record', {}, '실패 0건 · 미검증 0건 / 전체 규칙 3건'],
    ['failure-only counts record', { FAIL: 2 }, '실패 2건 · 미검증 0건 / 전체 규칙 3건'],
    ['unchecked-only counts record', { NOT_CHECKED: 1 }, '실패 0건 · 미검증 1건 / 전체 규칙 3건'],
  ])('treats omitted keys as known zero in a %s', (_kind, counts, expected) => {
    const requestDetail = { ...gateRequestDetail, attempts: [{ ...decisiveRequestAttempt, counts: counts as Record<string, number> }] };
    render(<GatePanel {...props({ requestDetail, ruleResults: { rows: [], total: 0 } })} round={roundWithGateBasis(sampleGateBasis)} />);
    expect(screen.getByText(expected)).toBeVisible();
  });
  it.each([
    ['missing', undefined, '실패 확인 불가 · 미검증 확인 불가 / 전체 규칙 3건'],
    ['non-record', null, '실패 확인 불가 · 미검증 확인 불가 / 전체 규칙 3건'],
    ['negative value', { FAIL: -1, NOT_CHECKED: 0 }, '실패 확인 불가 · 미검증 0건 / 전체 규칙 3건'],
    ['unsafe integer', { FAIL: Number.MAX_SAFE_INTEGER + 1, NOT_CHECKED: 0 }, '실패 확인 불가 · 미검증 0건 / 전체 규칙 3건'],
  ])('keeps %s counts unavailable', (_kind, counts, expected) => {
    const requestDetail = { ...gateRequestDetail, attempts: [{ ...decisiveRequestAttempt, counts: counts as Record<string, number> }] };
    render(<GatePanel {...props({ requestDetail, ruleResults: { rows: [], total: 0 } })} round={roundWithGateBasis(sampleGateBasis)} />);
    expect(screen.getByText(expected)).toBeVisible();
  });
  it.each([
    ['without a known decisive attempt', null, false],
    ['with a positive failure count', 2, false],
    ['with a known zero failure count', 0, true],
  ] as const)('shows “실패 규칙 없음” only %s', (_case, failureCount, showNoFailures) => {
    const requestDetail = failureCount === null ? undefined : {
      ...gateRequestDetail,
      attempts: [{ ...decisiveRequestAttempt, counts: { FAIL: failureCount, NOT_CHECKED: 0 } }],
    };
    const data = { ruleResults: { rows: [], total: 0 }, ...(requestDetail ? { requestDetail } : {}) };
    render(<GatePanel {...props(data)} round={roundWithGateBasis(sampleGateBasis)} />);
    if (showNoFailures) expect(screen.getByText('실패 규칙 없음')).toBeVisible();
    else expect(screen.queryByText('실패 규칙 없음')).toBeNull();
  });
  it('uses the same resolvable decisive attempt as Round execution', () => {
    const basis = {
      decisiveAttemptId: 'decisive',
      attempts: [{ attemptId: 'decisive', attemptNo: 4, verdict: 'incomplete', endedAt: '2026-11-08T11:42:00Z' }],
    };
    render(<GatePanel {...props()} round={roundWithGateBasis(basis)} />);
    expect(screen.getByText('기준 시도').parentElement).toHaveTextContent('확인 불가');
    expect(screen.queryByText(/완료 시도 #4/)).toBeNull();
  });
  it.each([
    ['missing', undefined],
    ['malformed', { decisiveAttemptId: 'decisive', attempts: 'not-an-array' }],
    ['missing summary fields', { decisiveAttemptId: 'decisive', attempts: [{ attemptId: 'decisive', requestId: 'request' }], evidenceLinks: null }],
  ])('shows unavailable values without inventing zero for a %s basis', (_kind, basis) => {
    render(<GatePanel {...props()} round={roundWithGateBasis(basis)} />);
    expect(screen.getAllByText('확인 불가').length).toBeGreaterThan(0);
    expect(screen.queryByText(/0건|증거 0개|시도 0개/)).toBeNull();
  });
  it('does not use request counts when the request detail lacks the basis attempt', () => {
    const otherAttempt = { ...decisiveRequestAttempt, id: 'different-attempt', counts: { FAIL: 0, NOT_CHECKED: 0 }, requiredUnchecked: 0 };
    const mismatchedRequest = { ...gateRequestDetail, attempts: [otherAttempt] };
    render(<GatePanel {...props({ requestDetail: mismatchedRequest, ruleResults: { rows: [], total: 0 } })} round={roundWithGateBasis(sampleGateBasis)} />);
    expect(screen.getAllByText('확인 불가').length).toBeGreaterThan(0);
    expect(screen.queryByText(/실패 0건|미검증 0건|필수 오류·미검증·건너뜀 0건/)).toBeNull();
  });
  it('keeps raw basis JSON folded in flow and toggles it with the keyboard', async () => {
    const user = userEvent.setup();
    render(<GatePanel {...props({ requestDetail: gateRequestDetail, ruleResults: { rows: [], total: 0 } })} round={roundWithGateBasis(sampleGateBasis)} />);
    const toggle = screen.getByRole('button', { name: '원시 근거 JSON' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const rawPanel = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    expect(rawPanel).toHaveAttribute('hidden');
    const form = screen.getByRole('textbox', { name: '결정 사유 (한 줄)' }).closest('form');
    expect(form).not.toBeNull();
    expect(toggle.compareDocumentPosition(form as HTMLFormElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    toggle.focus();
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(rawPanel).not.toHaveAttribute('hidden');
    expect(screen.getByText((content, element) => element?.tagName === 'PRE' && content.includes('b'.repeat(64)))).toBeVisible();
    await user.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
  it('fixes the Round when request registration starts there', async () => {
    render(<RequestsScreen {...props({ requests: { rows: [], total: 0 } })} fixedRound={{ id: ID, seq: 3 }} register />);
    expect(within(screen.getByRole('dialog')).getByLabelText('Round (필수)')).toHaveValue(ID);
    expect(within(screen.getByRole('dialog')).getByLabelText('Round (필수)')).toBeDisabled();
  });
});

// #2217: the Enter that confirms a Korean composition in the model ID field (isComposing, keyCode 229, Safari's Enter right
// after compositionend) does not apply the filter; the next plain Enter does.
describe('model ID filter and IME Enter', () => {
  const composingEnters: Array<[string, (target: Element) => void]> = [
    ['isComposing', target => fireEvent.keyDown(target, { key: 'Enter', isComposing: true })],
    ['keyCode 229', target => fireEvent.keyDown(target, { key: 'Enter', keyCode: 229 })],
    ['Safari after compositionend', target => { fireEvent.compositionStart(target); fireEvent.compositionEnd(target); fireEvent.keyDown(target, { key: 'Enter' }); }],
  ];
  it.each(composingEnters)('a composition Enter does not apply the model ID (%s)', (_label, composingEnter) => {
    const setState = vi.fn();
    render(<RequestsScreen {...props({ requests: { rows: [], total: 0 } })} state={{}} setState={setState} />);
    fireEvent.click(screen.getByText('추가 필터 (0) ▾'));
    const field = screen.getByLabelText('모델 ID');
    // Synthetic UUID: the field only applies a well-formed model ID (#2077 MEN).
    fireEvent.change(field, { target: { value: '00000000-0000-4000-8000-0000000000aa' } });
    composingEnter(field);
    expect(setState).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(setState).toHaveBeenCalledWith(expect.objectContaining({ modelId: '00000000-0000-4000-8000-0000000000aa' }));
  });
});


describe('Round and request states', () => {
  const request = { id: ID, roundId: ID, roundSeq: 3, projectId: ID, modelId: ID, modelCode: 'ETCH-300', softwareLabel: '3.2.1', priority: 1, immediate: false, state: 'queued', attemptCount: 0, maxAttempts: 3, leaseExpiresAt: null, lastHeartbeatAt: null, requestedBy: { id: ID, displayName: '김개발' }, createdAt: '2026-11-07T00:00:00Z', endedAt: null, latestVerdict: null, version: '9', cancelReason: null, attempts: [] } satisfies RequestDetail;
  const result = { id: ID, ruleId: 'R-001', result: 'ERROR', required: true, expected: '해석 가능', observed: '미검증', evidence: [{ fileRef: 's3://sample/file.log', line: 1, fileSha256: 'a'.repeat(64), hasExcerpt: true }], hasExcerpt: true } satisfies RuleResult;
  it('explains why a Round has no results or requests', () => {
    render(<RoundScreen {...props({ roundDetail: gate(), requests: { rows: [], total: 0 } })} project={project} roundId={ID} />);
    expect(screen.getByText(/요청 없음 · 이 Round/)).toBeVisible();
    expect(screen.getByText(/규칙 결과 없음 · 완료된 시도/)).toBeVisible();
  });
  it.each([false, true])('renders Round read failures (permission denied=%s)', denied => {
    render(<RoundScreen {...props({}, { status: 'error', denied })} project={project} roundId={ID} />);
    expect(screen.getByText(denied ? /읽기 권한이 없습니다/ : /데이터를 불러오지 못했습니다/)).toBeVisible();
  });
  it('requires a reason before cancelling and sends the request version', async () => {
    const user = userEvent.setup();
    render(<RequestsScreen {...props({ requests: { rows: [request], total: 1 }, requestDetail: request })} selection={ID} />);
    await user.click(screen.getByRole('button', { name: '요청 취소' }));
    expect(run).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('사유 (필수)'), '입력 샘플 재확인');
    await user.click(screen.getByRole('button', { name: '요청 취소' }));
    expect(run).toHaveBeenCalledWith({ id: ID, reason: '입력 샘플 재확인' }, { expectedVersion: '9' });
  });
  it.each(['denied', 'deleted', 'readable'])('opens excerpt state %s only after an explicit read', async kind => {
    const attempt = { id: ID, attemptNo: 1, outcome: 'succeeded', workerActorId: ID, verdict: 'incomplete', manifestMatches: true, counts: { ERROR: 1 }, requiredUnchecked: 1, ruleCount: 1, startedAt: '2026-11-07T00:00:00Z', endedAt: '2026-11-07T00:01:00Z', ruleSetRevision: 'r1', inputManifestDigest: 'a'.repeat(64) };
    const p = props({ roundDetail: gate(), requests: { rows: [request], total: 1 }, requestDetail: { ...request, attempts: [attempt] }, ruleResults: { rows: [result], total: 1 }, evidenceStates: { rows: [{ ruleResultId: ID, evidenceIndex: 0, evidenceRef: { fileRef: 's3://sample/file.log', line: 1, fileSha256: 'a'.repeat(64) }, excerptState: 'not_loaded', sourceState: 'not_checked' }] }, excerpt: { deleted: kind === 'deleted', excerpt: '짧은 합성 로그' } });
    const base = p.api.useRead;
    p.api.useRead = <T,>(name: string, params: Record<string, unknown>, enabled?: boolean) => name === 'excerpt' && kind === 'denied' ? { status: 'error', data: null, denied: true, retry: vi.fn() } : base<T>(name, params, enabled);
    render(<RoundScreen {...p} project={project} roundId={ID} />);
    expect(screen.queryByText('짧은 합성 로그')).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'R-001 상세 열기' }));
    await user.click(screen.getByRole('button', { name: '발췌 보기' }));
    expect(screen.getByText(kind === 'denied' ? /권한 없음 · 이 원본/ : kind === 'deleted' ? /^발췌 상태 알 수 없음/ : '짧은 합성 로그')).toBeVisible();
    // A body deleted between the state read and the explicit read never claims a cause (R3).
    expect(screen.queryByText(/삭제됨|만료|보관 기간/)).toBeNull();
  });
  it('keeps another Round’s request results out of this Round', () => {
    render(<RoundScreen {...props({ roundDetail: gate(), requests: { rows: [request], total: 1 }, requestDetail: { ...request, roundId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', attempts: [] } })} project={project} roundId={ID} />);
    expect(screen.getByText('이 Round에 속한 요청이 아닙니다.')).toBeVisible();
    expect(screen.queryByRole('table', { name: '규칙 결과' })).toBeNull();
  });
  it('restores committed model search from the host', () => {
    render(<ModelsScreen {...props({ models: { rows: [], total: 0 } })} state={{ q: 'ETCH', page: '2' }} setState={vi.fn()} />);
    expect(screen.getByRole('searchbox', { name: '모델 코드·이름 검색' })).toHaveValue('ETCH');
  });
});


describe('mutation and recovery boundaries', () => {
  it.each([ModelsScreen, RequestsScreen, ProjectScreen])('shows a retryable read error', Component => {
    render(<Component {...props({}, { status: 'error', denied: false })} projectId={ID} />);
    expect(screen.getAllByText('데이터를 불러오지 못했습니다.').at(-1)).toBeVisible();
    expect(screen.getAllByRole('button', { name: '다시 시도' }).length).toBeGreaterThan(0);
  });
  it('keeps the request filter controls through a failed read', () => {
    render(<RequestsScreen {...props({}, { status: 'error', denied: false })} />);
    expect(screen.getByRole('button', { name: /추가 필터/ })).toBeVisible();
    expect(screen.getAllByText('데이터를 불러오지 못했습니다.').length).toBeGreaterThan(0);
  });
  it('keeps one page owner while the project read behind a Round resolves', () => {
    const pages = { ...ui, page: (p: Parameters<Presentation['page']>[0]) => <main><button type="button" data-owner="title">{String(p.title)}</button>{p.children}</main> };
    const read = (status: 'loading' | 'done') => ({ ...props({ projectDetail: status === 'done' ? project : null, roundDetail: gate() }), ui: pages, api: { useRead: <T,>(name: string): ReadState<T> => ({ status: name === 'projectDetail' ? status : 'done', data: (name === 'projectDetail' ? (status === 'done' ? project : null) : name === 'roundDetail' ? gate() : null) as T | null, retry: vi.fn() }) as ReadState<T>, useAction: () => ({ pending: false, run }) } });
    const view = renderBase(<LifecycleHost navigate={vi.fn()}><ProjectScreen {...read('loading')} projectId={ID} roundId={ID} /></LifecycleHost>);
    const heading = view.container.querySelector('[data-owner="title"]') as HTMLElement;
    heading.focus();
    view.rerender(<LifecycleHost navigate={vi.fn()}><ProjectScreen {...read('done')} projectId={ID} roundId={ID} /></LifecycleHost>);
    expect(view.container.querySelector('[data-owner="title"]')).toBe(heading);
    expect(document.activeElement).toBe(heading);
  });
  it('explains an unreadable or missing project without inventing facts', () => {
    render(<ProjectScreen {...props()} projectId={ID} />);
    expect(screen.getByText('항목을 찾을 수 없거나 읽을 수 없습니다.')).toBeVisible();
    expect(screen.queryByRole('list', { name: '개발 단계' })).toBeNull();
  });
  it('does not offer request registration without the round-manage right', () => {
    render(<RequestsScreen {...props({ requests: { rows: [], total: 0 } })} canRound={false} register />);
    expect(screen.queryByRole('button', { name: '요청 등록' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('registers an immediate request using only the fixed Round and selected queue properties', async () => {
    const user = userEvent.setup();
    render(<RequestsScreen {...props({ requests: { rows: [], total: 0 } })} fixedRound={{ id: ID, seq: 3 }} register />);
    const form = within(screen.getByRole('dialog'));
    await user.click(form.getByRole('checkbox', { name: '즉시 실행' }));
    await user.click(form.getByRole('button', { name: '요청 등록' }));
    expect(run).toHaveBeenCalledWith({ roundId: ID, priority: 1, immediate: true });
  });
  it('requires exception scope and records the human risk accepter separately from the reason', async () => {
    const user = userEvent.setup(); render(<GatePanel {...props()} round={gate(['verdict_not_pass'])} />);
    await user.click(screen.getByRole('radio', { name: '예외' }));
    await user.type(screen.getByRole('textbox', { name: '결정 사유 (한 줄)' }), '일정상 예외');
    expect(screen.getByRole('button', { name: /결정 기록/ })).toBeDisabled();
    await user.type(screen.getByLabelText('예외 범위 (필수)'), '이 Round에 한함');
    await user.click(screen.getByRole('button', { name: /결정 기록/ }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '기록' }));
    expect(run).toHaveBeenCalledWith({ roundId: ID, targetStage: 'beta', decision: 'exception', reason: '일정상 예외', exception: { riskAcceptedBy: ID, scope: '이 Round에 한함' } }, { expectedVersion: '7' });
  });
  it('opens a Round with the explicit sample order and no client spec pin or UI row keys', async () => {
    const user = userEvent.setup();
    render(<ProjectScreen {...props({ projectDetail: project, rounds: { rows: [] } })} projectId={ID} />);
    await user.click(screen.getByRole('button', { name: 'Round 열기' }));
    const form = within(screen.getByRole('dialog'));
    await user.type(form.getByLabelText('원본 소유자 (필수)'), 'fab-team');
    await user.type(form.getByLabelText('샘플 1 위치 (필수)'), 's3://samples/first.log');
    await user.type(form.getByLabelText('샘플 1 SHA-256 (필수)'), 'a'.repeat(64));
    await user.click(form.getByRole('button', { name: '샘플 추가' }));
    await user.type(form.getByLabelText('샘플 2 위치 (필수)'), 's3://samples/second.log');
    await user.type(form.getByLabelText('샘플 2 SHA-256 (필수)'), 'b'.repeat(64));
    await user.click(form.getAllByRole('button', { name: '위로' })[1] as HTMLElement);
    await user.click(form.getByRole('button', { name: 'Round 열기' }));
    expect(run).toHaveBeenCalledWith({ projectId: ID, sampleSet: { sourceOwner: 'fab-team', files: [{ fileRef: 's3://samples/second.log', order: 1, sha256: 'b'.repeat(64) }, { fileRef: 's3://samples/first.log', order: 2, sha256: 'a'.repeat(64) }] } }, undefined);
  });
});


it('does not present a session-superseded Gate delivery as a server write error', async () => {
  run.mockRejectedValueOnce(new DOMException('Session changed', 'AbortError'));
  const user = userEvent.setup(); render(<GatePanel {...props()} round={gate()} />);
  await user.click(screen.getByRole('radio', { name: '승인' }));
  await user.type(screen.getByRole('textbox', { name: '결정 사유 (한 줄)' }), '검토 완료');
  await user.click(screen.getByRole('button', { name: /결정 기록/ }));
  expect(screen.queryByRole('alert')).toBeNull();
});
