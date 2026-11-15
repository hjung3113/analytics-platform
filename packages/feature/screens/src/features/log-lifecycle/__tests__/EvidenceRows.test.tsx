import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EvidenceStateRow, ExcerptState, LifecycleApi, ReadState, RoundDetail, RuleResult, SourceState } from '../contracts';
import { RuleEvidence } from '../EvidenceRows';

const SHA = 'a'.repeat(64);
const evidence = (line: number, hasExcerpt = true) => ({ fileRef: 'synthetic://sample-01', line, fileSha256: SHA, hasExcerpt });
const rule = (n: number): RuleResult => ({ id: 'rule-result', ruleId: 'SYN-R001', result: 'FAIL', required: true, expected: null, observed: null, evidence: Array.from({ length: n }, (_, i) => evidence(10 + i)), hasExcerpt: true });
const round = { sampleSet: { sourceOwner: 'synthetic', files: [{ fileRef: 'synthetic://sample-01', order: 1, sha256: SHA }] } } as RoundDetail;
const row = (evidenceIndex: number, excerptState: ExcerptState, sourceState: SourceState): EvidenceStateRow => ({ ruleResultId: 'rule-result', evidenceIndex, evidenceRef: { fileRef: 'synthetic://sample-01', line: 10, fileSha256: SHA }, excerptState, sourceState });
function mount(state: Partial<ReadState<{ rows: EvidenceStateRow[] }>>, n = 1) {
  const read = vi.fn((_name: string, _params: Record<string, unknown>, _enabled?: boolean) => ({ status: 'done', data: null, retry: vi.fn(), ...state }));
  const api = { useRead: read, useAction: vi.fn() } as unknown as LifecycleApi;
  const onOpenSource = vi.fn(), onExcerpt = vi.fn();
  render(<RuleEvidence api={api} rule={rule(n)} round={round} onOpenSource={onOpenSource} onExcerpt={onExcerpt} />);
  return { read, onOpenSource, onExcerpt };
}
afterEach(cleanup);
const COMBOS: [ExcerptState, SourceState, string, string][] = [
  ['not_submitted', 'not_checked', '발췌 미제출', '원본 미확인'],
  ['not_loaded', 'not_checked', '발췌 열람 전', '원본 미확인'],
  ['no_permission', 'no_permission', '발췌 열람 권한 없음', '원본 열람 권한 없음'],
  ['unknown', 'hash_mismatch', '발췌 상태 알 수 없음', '원본 해시 불일치'],
  ['not_loaded', 'hash_mismatch', '발췌 열람 전', '원본 해시 불일치'],
  ['unknown', 'not_checked', '발췌 상태 알 수 없음', '원본 미확인'],
  ['not_submitted', 'no_permission', '발췌 미제출', '원본 열람 권한 없음'],
];
describe('evidence state rows', () => {
  it.each(COMBOS)('shows %s and %s as two separate axes', async (excerpt, source, excerptText, sourceText) => {
    const { onExcerpt, onOpenSource } = mount({ data: { rows: [row(0, excerpt, source)] } });
    expect(screen.getByText(excerptText)).toBeVisible();
    expect(screen.getByText(sourceText)).toBeVisible();
    expect(screen.queryByText(/원본 확인됨|삭제됨|만료/)).toBeNull();
    const user = userEvent.setup();
    const open = screen.queryByRole('button', { name: /원본에서 보기/ });
    expect(!!open).toBe(source === 'not_checked');
    if (source !== 'not_checked') expect(screen.getByText(source === 'hash_mismatch' ? /해시와 달라 열 수 없습니다/ : /원본 열람 권한이 없어/)).toBeVisible();
    if (open) { await user.click(open); expect(onOpenSource).toHaveBeenCalledWith(1, 10); }
    const view = screen.queryByRole('button', { name: '발췌 보기' });
    expect(!!view).toBe(excerpt === 'not_loaded');
    if (view) { await user.click(view); expect(onExcerpt).toHaveBeenCalledWith(0); }
  });
  it('keeps duplicate locations as separate rows by original index', async () => {
    const { onExcerpt } = mount({ data: { rows: [row(0, 'not_loaded', 'not_checked'), row(1, 'not_submitted', 'not_checked'), row(2, 'not_loaded', 'not_checked')] } }, 3);
    expect(screen.getAllByText('synthetic://sample-01:10')).toHaveLength(3);
    const buttons = screen.getAllByRole('button', { name: '발췌 보기' });
    expect(buttons).toHaveLength(2);
    await userEvent.setup().click(buttons.at(1) as HTMLElement);
    expect(onExcerpt).toHaveBeenCalledWith(2);
  });
  it('reads the states of the opened rule', () => {
    const { read } = mount({ data: { rows: [] } });
    expect(read).toHaveBeenCalledWith('evidenceStates', { ruleResultId: 'rule-result' }, true);
    expect(screen.getByText(/근거 위치 없음/)).toBeVisible();
  });
  it('does not read states for a rule without evidence', () => {
    const { read } = mount({ data: { rows: [] } }, 0);
    expect(read).toHaveBeenCalledWith('evidenceStates', { ruleResultId: 'rule-result' }, false);
    expect(screen.getByText(/근거 위치 없음/)).toBeVisible();
  });
  it('shows loading without any row or action', () => {
    mount({ status: 'loading' });
    expect(screen.getByRole('status')).toHaveTextContent('불러오는 중');
    expect(screen.queryByRole('button', { name: /발췌 보기|원본에서 보기/ })).toBeNull();
  });
  it('shows a retryable error', async () => {
    const retry = vi.fn();
    mount({ status: 'error', retry });
    await userEvent.setup().click(within(document.body).getByRole('button', { name: '다시 시도' }));
    expect(retry).toHaveBeenCalled();
  });
  it('shows the denied and the ok+null states without rows', () => {
    mount({ status: 'error', denied: true });
    expect(screen.getByText('읽기 권한이 없습니다. 관리자에게 요청해 주세요.')).toBeVisible();
    cleanup();
    mount({ data: null });
    expect(screen.getByText(/근거 상태를 읽을 수 없습니다/)).toBeVisible();
    expect(screen.queryByRole('button', { name: /발췌 보기|원본에서 보기/ })).toBeNull();
  });
});
