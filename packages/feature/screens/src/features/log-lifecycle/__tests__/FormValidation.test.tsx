import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LifecycleApi, Params, ReadState, RoundDetail, ScreenProps } from '../contracts';
import { LifecycleHost } from '../host';
import { LifecycleForm } from '../forms';
import { GatePanel } from '../GatePanel';
import { fakeUi } from './presentation';

// #2574: lifecycle forms validate on submit, tie each error to its control and focus the first invalid control
// (`useValidatedSubmit`), instead of relying on native `required` or a submit button disabled without a reason.
const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const run = vi.fn().mockResolvedValue({ outcome: 'ok', data: {}, fieldErrors: [], version: '2' });
const ui = fakeUi({ sourceView: undefined });
function props(): ScreenProps {
  const api: LifecycleApi = { useRead: <T,>(): ReadState<T> => ({ status: 'done', data: null, retry: vi.fn() }) as ReadState<T>, useAction: () => ({ pending: false, run }) };
  return { api, ui, canProject: true, canRound: true, actorId: ID, setSelection: vi.fn() };
}
function renderForm(name: string, title: string, initial: Params, version?: string) {
  return render(<LifecycleHost navigate={vi.fn()}><LifecycleForm {...props()} name={name} title={title} initial={initial} {...(version ? { version } : {})} onClose={vi.fn()} /></LifecycleHost>);
}
const gate = (allowed = true): RoundDetail => ({ id: ID, projectId: ID, seq: 3, stage: 'alpha', status: 'open', version: '1', createdAt: '', specPin: null, sampleManifestDigest: '', note: null, sampleSet: { sourceOwner: 'team', files: [] }, gateDecisions: [], gateAvailability: { targetStage: 'beta', projectVersion: '7', reasons: [], decisions: { approved: { allowed, reasons: [] }, rejected: { allowed, reasons: [] }, exception: { allowed, reasons: [] } }, basis: {} } });
/** The control is invalid, described by the visible error and marked required. */
function expectFieldError(control: HTMLElement, message: string) {
  const error = screen.getByText(message);
  expect(control).toHaveAttribute('aria-invalid', 'true');
  expect(control).toHaveAttribute('aria-describedby', expect.stringContaining(error.id));
  expect(control).toHaveAttribute('aria-required', 'true');
}
afterEach(() => { cleanup(); run.mockClear(); });

describe('LifecycleForm submit validation', () => {
  it.each([
    ['projectUpdate', '개발 건 수정', { id: ID, ownerActorId: '', softwareId: '', targetDate: '' }, '담당 Actor ID', '담당 Actor ID를 입력해 주세요.'],
    ['projectSetStage', '베타로 이동', { id: ID, toStage: 'beta', reason: '' }, '사유', '사유를 입력해 주세요.'],
    ['roundOpen', 'Round 열기', { projectId: ID }, '원본 소유자', '원본 소유자를 입력해 주세요.'],
  ] as const)('%s shows the field error on its control and focuses it without writing', async (name, title, initial, label, message) => {
    const user = userEvent.setup();
    renderForm(name, title, initial, '7');
    await user.click(screen.getByRole('button', { name: title }));
    const control = screen.getByRole('textbox', { name: label });
    expectFieldError(control, message);
    expect(control).toHaveFocus();
    expect(run).not.toHaveBeenCalled();
  });
  it('Round open marks every blank or malformed sample field and keeps focus on the first one', async () => {
    const user = userEvent.setup();
    renderForm('roundOpen', 'Round 열기', { projectId: ID });
    await user.type(screen.getByRole('textbox', { name: '원본 소유자' }), 'fab-team');
    await user.type(screen.getByRole('textbox', { name: '샘플 1 SHA-256' }), 'xyz');
    await user.click(screen.getByRole('button', { name: 'Round 열기' }));
    const location = screen.getByRole('textbox', { name: '샘플 1 위치' });
    expectFieldError(location, '샘플 위치를 입력해 주세요.');
    expectFieldError(screen.getByRole('textbox', { name: '샘플 1 SHA-256' }), 'SHA-256은 16진수 64자로 입력해 주세요.');
    expect(location).toHaveFocus();
    expect(run).not.toHaveBeenCalled();
  });
  it('clears a field error when that field changes', async () => {
    const user = userEvent.setup();
    renderForm('projectSetStage', '베타로 이동', { id: ID, toStage: 'beta', reason: '' }, '7');
    await user.click(screen.getByRole('button', { name: '베타로 이동' }));
    expect(screen.getByRole('textbox', { name: '사유' })).toHaveAttribute('aria-invalid', 'true');
    await user.type(screen.getByRole('textbox', { name: '사유' }), '검토 완료');
    expect(screen.getByRole('textbox', { name: '사유' })).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('사유를 입력해 주세요.')).toBeNull();
  });
  it.each([
    ['projectUpdate', '개발 건 수정', { id: ID, ownerActorId: ID, softwareId: '', targetDate: '' }, { id: ID, ownerActorId: ID, softwareId: null, targetDate: null }],
    ['projectSetStage', '베타로 이동', { id: ID, toStage: 'beta', reason: '검토 완료' }, { id: ID, toStage: 'beta', reason: '검토 완료' }],
  ] as const)('%s sends the same payload as before when valid', async (name, title, initial, payload) => {
    const user = userEvent.setup();
    renderForm(name, title, initial, '7');
    await user.click(screen.getByRole('button', { name: title }));
    expect(run).toHaveBeenCalledWith(payload, { expectedVersion: '7' });
  });
});

describe('Gate decision submit', () => {
  it('shows exception field errors on submit instead of disabling it, and focuses the first one', async () => {
    const user = userEvent.setup();
    render(<LifecycleHost navigate={vi.fn()}><GatePanel {...props()} round={gate()} /></LifecycleHost>);
    await user.click(screen.getByRole('radio', { name: '예외' }));
    await user.type(screen.getByRole('textbox', { name: '결정 사유 (한 줄)' }), '일정상 예외');
    await user.clear(screen.getByRole('textbox', { name: '위험 수용자 Actor ID' }));
    const submit = screen.getByRole('button', { name: 'Gate 결정 기록' });
    expect(submit).toBeEnabled();
    await user.click(submit);
    const risk = screen.getByRole('textbox', { name: '위험 수용자 Actor ID' });
    expectFieldError(risk, '위험 수용자 Actor ID를 입력해 주세요.');
    expectFieldError(screen.getByRole('textbox', { name: '예외 범위' }), '예외 범위를 입력해 주세요.');
    expect(risk).toHaveFocus();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
  it('focuses the reason first when the reason and the exception scope are both missing', async () => {
    const user = userEvent.setup();
    render(<LifecycleHost navigate={vi.fn()}><GatePanel {...props()} round={gate()} /></LifecycleHost>);
    await user.click(screen.getByRole('radio', { name: '예외' }));
    await user.click(screen.getByRole('button', { name: 'Gate 결정 기록' }));
    expect(screen.getByRole('textbox', { name: '결정 사유 (한 줄)' })).toHaveFocus();
    expectFieldError(screen.getByRole('textbox', { name: '예외 범위' }), '예외 범위를 입력해 주세요.');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
  it.each([
    [true, '결정을 선택해 주세요.'],
    [false, '서버가 허용한 결정이 없습니다.'],
  ])('names why the submit is disabled before a decision is chosen (decisions allowed=%s)', (allowed, reason) => {
    render(<LifecycleHost navigate={vi.fn()}><GatePanel {...props()} round={gate(allowed)} /></LifecycleHost>);
    const submit = screen.getByRole('button', { name: 'Gate 결정 기록' });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription(reason);
  });
  it('sends the same exception payload as before when valid', async () => {
    const user = userEvent.setup();
    render(<LifecycleHost navigate={vi.fn()}><GatePanel {...props()} round={gate()} /></LifecycleHost>);
    await user.click(screen.getByRole('radio', { name: '예외' }));
    await user.type(screen.getByRole('textbox', { name: '결정 사유 (한 줄)' }), '일정상 예외');
    await user.type(screen.getByRole('textbox', { name: '예외 범위' }), '이 Round에 한함');
    await user.click(screen.getByRole('button', { name: 'Gate 결정 기록' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '기록' }));
    expect(run).toHaveBeenCalledWith({ roundId: ID, targetStage: 'beta', decision: 'exception', reason: '일정상 예외', exception: { riskAcceptedBy: ID, scope: '이 Round에 한함' } }, { expectedVersion: '7' });
  });
});
