import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Attempt, Presentation, Project, ReadState, RequestDetail, RoundDetail, RuleResult, ScreenProps } from '../contracts';
import { RoundFrame } from '../RoundScreen';
import { fakeUi } from './presentation';

const project = { id: 'project', model: { code: 'SYN-300' }, softwareLabel: '3.2.1' } as Project;
const attempt: Attempt = { id: 'attempt', attemptNo: 2, outcome: 'succeeded', verdict: 'fail', workerActorId: 'actor', manifestMatches: true, counts: { ERROR: 1, FAIL: 4, PASS: 25 }, requiredUnchecked: 1, ruleCount: 30, startedAt: '', endedAt: '', ruleSetRevision: null, inputManifestDigest: '' };
const request = { id: 'request', roundId: 'round', state: 'failed', attempts: [attempt, { ...attempt, id: 'latest', attemptNo: 3, outcome: 'failed', verdict: null }] } as RequestDetail;
const rule: RuleResult = { id: 'rule-result', ruleId: 'SYN-R001', result: 'FAIL', required: true, expected: '종료 이벤트', observed: '종료 이벤트 없음', evidence: [], hasExcerpt: false };
const round: RoundDetail = { id: 'round', projectId: 'project', seq: 3, stage: 'alpha', status: 'open', version: '1', createdAt: '', specPin: null, sampleManifestDigest: '', note: null, sampleSet: { sourceOwner: 'synthetic', files: [] }, gateDecisions: [], gateAvailability: { targetStage: 'beta', projectVersion: '1', reasons: [], decisions: { approved: { allowed: false, reasons: ['verdict_not_pass'] }, rejected: { allowed: true, reasons: [] }, exception: { allowed: true, reasons: [] } }, basis: { decisiveAttemptId: 'attempt', decisiveVerdict: 'fail', attempts: [{ attemptId: 'attempt', requestId: 'request', attemptNo: 2, verdict: 'fail' }] } } };

const page = vi.fn<Presentation['page']>(p => <section data-testid="page"><h1>{p.title}</h1>{p.primaryAction ? <button type="button" onClick={p.primaryAction.onSelect}>{p.primaryAction.label}</button> : null}{p.children}</section>);
const ui = fakeUi({ page, drawer: () => null, sourceView: undefined });
function setup() {
  const options = { status: 'done' as ReadState<unknown>['status'], projectStatus: 'done' as ReadState<unknown>['status'], roundStatus: 'done' as ReadState<unknown>['status'], canGate: true, empty: false, denied: false, missing: false, manifestMatches: true, opinionCount: 1, scaleStatus: 'done' as ReadState<unknown>['status'], grades: [{ key: 'review', label: '검토' }] };
  function Host() {
    const [state, setState] = useState<Record<string, string>>({});
    const empty = options.empty && state.result !== 'all';
    const values: Record<string, unknown> = {
      roundDetail: round, requests: { rows: [request], total: 1 },
      requestDetail: { ...request, attempts: [{ ...attempt, opinionCount: options.opinionCount, manifestMatches: options.manifestMatches }] },
      opinionScale: { grades: options.grades }, ruleResults: options.missing ? null : { rows: empty ? [] : [rule], total: empty ? 0 : 1 },
    };
    const statuses: Record<string, ReadState<unknown>['status']> = { ruleResults: options.status, roundDetail: options.roundStatus, opinionScale: options.scaleStatus };
    const props: ScreenProps = {
      ui, actorId: 'actor', canProject: false, canRound: false, canGate: options.canGate, state,
      setState: patch => setState(previous => { const next = { ...previous }; for (const [key, value] of Object.entries(patch)) { if (value === undefined) delete next[key]; else next[key] = value; } return next; }),
      setSelection: vi.fn(), api: {
        useAction: () => ({ pending: false, run: vi.fn() }),
        useRead: <T,>(name: string) => ({ status: statuses[name] ?? 'done', denied: name === 'ruleResults' && options.denied, data: (values[name] ?? null) as T, retry: vi.fn() }),
      },
    };
    return <RoundFrame {...props} roundId="round" projectId="project" projectQuery={{ status: options.projectStatus, data: project, retry: vi.fn() }} />;
  }
  const mounted = render(<Host />);
  return { update(patch: Partial<typeof options>) { Object.assign(options, patch); mounted.rerender(<Host />); } };
}
afterEach(() => { cleanup(); page.mockClear(); });
it('places scope and visibly labelled opinion grade in the table controls without a repeated heading', () => {
  setup();
  const controls = within(screen.getByTestId('controls'));
  expect(controls.getByRole('radiogroup', { name: '결과 범위' })).toBeVisible();
  expect(controls.getByRole('combobox', { name: '의견 등급' })).toBeVisible();
  expect(controls.getByText('의견 등급:')).toBeVisible();
  expect(screen.queryByRole('heading', { name: '규칙 결과' })).toBeNull();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('SYN-300 · Round 3');
});
it('keeps the same table and controls through loading and error', () => {
  const mounted = setup();
  const table = screen.getByRole('table', { name: '규칙 결과' });
  const controls = screen.getByTestId('controls');
  for (const status of ['loading', 'error', 'done'] as const) {
    mounted.update({ status });
    expect(screen.getByRole('table', { name: '규칙 결과' })).toBe(table);
    expect(screen.getByTestId('controls')).toBe(controls);
    expect(within(table).queryByRole('button', { name: 'SYN-R001 상세 열기' }) !== null).toBe(status === 'done');
  }
});
it('changes the table read identity with the result scope so the previous read\'s rows are dropped', () => {
  setup();
  const before = screen.getByTestId('table-frame').getAttribute('data-filter-key');
  expect(before).toBeTruthy();
  fireEvent.click(within(screen.getByTestId('controls')).getByRole('radio', { name: '전체' }));
  const after = screen.getByTestId('table-frame').getAttribute('data-filter-key');
  expect(after).toBeTruthy();
  expect(after).not.toBe(before);
});
it('returns from zero problems to all results through the empty action', () => {
  const mounted = setup(); mounted.update({ empty: true });
  const table = screen.getByRole('table', { name: '규칙 결과' });
  fireEvent.click(screen.getByRole('button', { name: '전체 보기' }));
  expect(screen.getByRole('table', { name: '규칙 결과' })).toBe(table);
  expect(screen.getByRole('button', { name: 'SYN-R001 상세 열기' })).toBeVisible();
});
it.each([true, false])('declares the Gate primary only with permission=%s', canGate => {
  const mounted = setup(); mounted.update({ canGate });
  expect(page.mock.calls.at(-1)?.[0].primaryAction?.label).toBe(canGate ? 'Gate 결정' : undefined);
});
it.each(['loading', 'error', 'done'] as const)('preserves one page through project and round %s', status => {
  const mounted = setup(); const owner = screen.getByTestId('page');
  mounted.update({ projectStatus: status }); expect(screen.getAllByTestId('page')).toEqual([owner]);
  mounted.update({ projectStatus: 'done', roundStatus: status }); expect(screen.getAllByTestId('page')).toEqual([owner]);
});
it('keeps opinion scale loading and undeclared messages in the controls', () => {
  const mounted = setup(); mounted.update({ scaleStatus: 'loading' });
  expect(within(screen.getByTestId('controls')).getByText('의견 척도 불러오는 중…')).toBeVisible();
  mounted.update({ scaleStatus: 'done', grades: [] });
  expect(within(screen.getByTestId('controls')).getByText('의견 척도 미선언')).toBeVisible();
});
it('keeps required unchecked warning visible beside inline metadata', () => {
  setup();
  expect(screen.getByText('필수 오류·미검증·건너뜀 1건')).toHaveClass('text-text-warning-label');
  expect(screen.getByLabelText('선택 시도 서버 판정').closest('dl')).toBeTruthy();
});

it.each([
  [{ status: 'error', denied: true } as const, /읽기 권한이 없습니다/],
  [{ missing: true }, /항목을 찾을 수 없거나 읽을 수 없습니다/],
] as const)('keeps the table mounted and read failure visible for %o', (patch, message) => {
  const mounted = setup(); const table = screen.getByRole('table', { name: '규칙 결과' });
  mounted.update(patch);
  expect(screen.getByRole('table', { name: '규칙 결과' })).toBe(table);
  expect(within(table).queryByRole('button', { name: 'SYN-R001 상세 열기' })).toBeNull();
  const feedback = screen.getByTestId('table-frame').previousElementSibling;
  expect(feedback).toHaveTextContent(message);
  expect(feedback).toBeVisible();
});
it('keeps manifest mismatch as visible alert text', () => {
  const mounted = setup(); mounted.update({ manifestMatches: false });
  expect(screen.getByRole('alert')).toHaveTextContent('샘플 매니페스트 불일치');
  expect(screen.getByRole('alert')).toBeVisible();
});
