import { cleanup, render as renderBase, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LifecycleApi, Model, RequestDetail, RuleResult, Presentation, Project, ReadState, RoundDetail, ScreenProps, TableParts } from '../contracts';
import { StageBadge, StageStepper } from '../presentation';
import { ModelsScreen } from '../ModelsScreen';
import { ProjectScreen } from '../ProjectScreen';
import { RoundScreen } from '../RoundScreen';
import { RequestsScreen } from '../RequestsScreen';
import { LifecycleHost } from '../host';
import type { ReactNode } from 'react';
import { GatePanel } from '../GatePanel';

const render = (node: ReactNode) => renderBase(<LifecycleHost navigate={vi.fn()}>{node}</LifecycleHost>);
const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const run = vi.fn().mockResolvedValue({ outcome: 'ok', data: {}, fieldErrors: [], version: '2' });
function Table<T extends { id: string }>(p: TableParts<T>) { return <><table aria-label={p.title}><tbody>{p.rows.map(r => <tr key={r.id}>{p.columns.map(c => <td key={c.id}>{c.cell(r)}</td>)}<td>{p.rowAction?.(r)}</td></tr>)}</tbody></table>{p.pagination}</>; }
const ui: Presentation = { table: Table, drawer: p => <section role="dialog" aria-label={String(p.title)}>{p.body}<button type="button" onClick={p.requestClose}>상세 닫기</button></section>, timeline: () => <p>변경 이력이 없습니다.</p>, trust: reasons => <p>{reasons.join(' · ')}</p> };
function props(data: Record<string, unknown> = {}, state: Partial<ReadState<unknown>> = {}): ScreenProps {
  const api: LifecycleApi = { useRead: <T,>(name: string): ReadState<T> => ({ status: 'done', data: (data[name] ?? null) as T | null, retry: vi.fn(), ...state }) as ReadState<T>, useAction: () => ({ pending: false, run }) };
  return { api, ui, canProject: true, canRound: true, actorId: ID, setSelection: vi.fn() };
}
const project = { id: ID, modelId: ID, model: { code: 'ETCH-300', name: '식각', vendorName: '설비사' }, stage: 'alpha', softwareId: null, owner: { id: ID, displayName: '김개발' }, targetDate: null, nextStages: ['beta', 'cancelled'], reopenTo: null, openRound: null, version: '7', gateTarget: 'beta', gate: { latest: null } } as Project;
const gate = (reasons: string[] = []): RoundDetail => ({ id: ID, projectId: ID, seq: 3, stage: 'alpha', status: 'open', version: '1', createdAt: '', specPin: null, sampleManifestDigest: '', note: null, sampleSet: { sourceOwner: 'team', files: [] }, gateDecisions: [], gateAvailability: { targetStage: 'beta', projectVersion: '7', reasons: [], decisions: { approved: { allowed: reasons.length === 0, reasons }, rejected: { allowed: true, reasons: [] }, exception: { allowed: true, reasons: [] } }, basis: {} } });
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
    await user.type(screen.getByLabelText('결정 사유 (필수)'), '검토 완료');
    await user.click(screen.getByRole('button', { name: /결정 기록/ }));
    expect(run).toHaveBeenCalledWith({ roundId: ID, targetStage: 'beta', decision: 'approved', reason: '검토 완료' }, { expectedVersion: '7' });
  });
  it('fixes the Round when request registration starts there', async () => {
    render(<RequestsScreen {...props({ requests: { rows: [], total: 0 } })} fixedRound={{ id: ID, seq: 3 }} register />);
    expect(within(screen.getByRole('dialog')).getByLabelText('Round (필수)')).toHaveValue(ID);
    expect(within(screen.getByRole('dialog')).getByLabelText('Round (필수)')).toBeDisabled();
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
    expect(screen.getByText(kind === 'denied' ? /권한 없음 · 이 원본/ : kind === 'deleted' ? '보관 기간 지남으로 삭제됨' : '짧은 합성 로그')).toBeVisible();
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
    await user.type(screen.getByLabelText('결정 사유 (필수)'), '일정상 예외');
    expect(screen.getByRole('button', { name: /결정 기록/ })).toBeDisabled();
    await user.type(screen.getByLabelText('예외 범위 (필수)'), '이 Round에 한함');
    await user.click(screen.getByRole('button', { name: /결정 기록/ }));
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
    await user.type(screen.getByLabelText('결정 사유 (필수)'), '검토 완료');
  await user.click(screen.getByRole('button', { name: /결정 기록/ }));
  expect(screen.queryByRole('alert')).toBeNull();
});
