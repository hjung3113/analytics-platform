import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import type { Presentation, RoundDetail, ScreenProps } from '../contracts';
import { GatePanel } from '../GatePanel';
import { RequestsScreen } from '../RequestsScreen';
import { StageStepper } from '../presentation';

const ui: Presentation = { table: () => null, drawer: () => null, timeline: () => null, trust: () => null };
function props(state: Record<string, string> = {}): ScreenProps {
  return { ui, actorId: 'actor', canProject: true, canRound: true, setSelection: vi.fn(), state, setState: vi.fn(), api: { useRead: <T,>(name: string) => ({ status: 'done', data: name === 'queueStatus' ? null : { rows: [], total: 0 } as T, retry: vi.fn() }), useAction: () => ({ pending: false, run: vi.fn() }) } };
}
const round = (allowed: string[]): RoundDetail => ({ id: 'round', projectId: 'project', seq: 1, stage: 'alpha', status: 'open', version: '1', createdAt: '', specPin: null, sampleManifestDigest: '', note: null, sampleSet: { sourceOwner: 'team', files: [] }, gateDecisions: [], gateAvailability: { targetStage: 'beta', projectVersion: '7', reasons: [], decisions: { approved: { allowed: allowed.includes('approved'), reasons: [] }, rejected: { allowed: allowed.includes('rejected'), reasons: [] }, exception: { allowed: allowed.includes('exception'), reasons: [] } }, basis: {} } });

it('requires an explicit server-allowed Gate decision and a reason, and reconciles availability', async () => {
  const p = props(); const user = userEvent.setup();
  const view = render(<GatePanel {...p} round={round(['rejected', 'exception'])} />);
  expect(screen.getByRole('radio', { name: '승인' })).not.toBeChecked();
  expect(screen.getByRole('radio', { name: '거절' })).not.toBeChecked();
  await user.click(screen.getByRole('radio', { name: '거절' }));
  expect(screen.getByRole('button', { name: /결정 기록/ })).toBeDisabled();
  await user.type(screen.getByLabelText('결정 사유 (필수)'), '재검증 필요');
  expect(screen.getByRole('button', { name: /결정 기록/ })).toBeEnabled();
  view.rerender(<GatePanel {...p} round={round([])} />);
  expect(screen.getAllByRole('radio').every(r => r.getAttribute('aria-checked') === 'false')).toBe(true);
  expect(screen.getByRole('button', { name: /결정 기록/ })).toBeDisabled();
});

it.each([{ state: 'failed' }, { modelId: 'model' }, { priority: '1' }, { requestedFrom: '2026-11-01T12:00' }, { requestedTo: '2026-11-08T12:00' }])('explains filtered empty requests and clears every filter atomically: %o', async state => {
  // Queue settings are an independent read, so only the request empty state is asserted.
  const p = props(state); render(<RequestsScreen {...p} />);
  expect(screen.getByText('조건에 맞는 검증 요청이 없습니다. 필터를 변경하거나 해제해 주세요.')).toBeVisible();
  await userEvent.setup().click(screen.getByRole('button', { name: '필터 해제' }));
  expect(p.setState).toHaveBeenCalledTimes(1);
  expect(p.setState).toHaveBeenCalledWith({ state: undefined, priority: undefined, modelId: undefined, requestedFrom: undefined, requestedTo: undefined, page: undefined });
});

it('marks completed stages with checks while cancellation invents no completed history', () => {
  const view = render(<StageStepper stage="alpha" />);
  const steps = screen.getAllByRole('listitem');
  const first = steps[0], upcoming = steps[3];
  if (!first || !upcoming) throw new Error('Missing development steps');
  expect(within(first).queryByText('1')).toBeNull();
  expect(within(first).getByText('완료')).toBeTruthy();
  expect(steps[2]).toHaveAttribute('aria-current', 'step');
  expect(within(upcoming).getByText('4')).toBeTruthy();
  view.rerender(<StageStepper stage="cancelled" />);
  expect(screen.queryAllByText('완료', { selector: '.sr-only' })).toHaveLength(0);
});
