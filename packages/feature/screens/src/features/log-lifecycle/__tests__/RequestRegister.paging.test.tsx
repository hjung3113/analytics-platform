import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { LifecycleApi, Presentation, ReadState } from '../contracts';
import { RequestRegister } from '../RequestsScreen';

function mount(run = vi.fn().mockResolvedValue({ outcome: 'ok', data: {}, fieldErrors: [], version: null })) {
  const api: LifecycleApi = {
    useRead: <T,>(name: string): ReadState<T> => ({ status: 'done', retry: vi.fn(), data: (name === 'models' ? { rows: [{ code: 'MODEL-A', name: 'Synthetic model', project: { projectId: 'project-a' } }], total: 26 } : name === 'rounds' ? { rows: [{ id: 'round-a', status: 'open', seq: 1 }] } : null) as T | null }),
    useAction: () => ({ pending: false, run }),
  };
  const ui: Presentation = { page: p => p.children, drawer: parts => parts.body, table: () => null, timeline: () => null, trust: () => null };
  render(<RequestRegister api={api} ui={ui} actorId="actor" canProject canRound setSelection={vi.fn()} onClose={vi.fn()} />);
  return run;
}
/** The control is invalid and described by the visible error. */
function expectFieldError(control: HTMLElement, message: string) {
  expect(control).toHaveAttribute('aria-invalid', 'true');
  expect(control).toHaveAttribute('aria-describedby', expect.stringContaining(screen.getByText(message).id));
}

it('clears the development project and Round when the model page changes', async () => {
  const run = mount();
  fireEvent.click(screen.getByRole('combobox', { name: '개발 건 선택' }));
  fireEvent.click(await screen.findByRole('option', { name: 'MODEL-A · Synthetic model' }));
  fireEvent.click(screen.getByRole('combobox', { name: 'Round' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Round 1' }));
  expect(screen.getByRole('button', { name: '요청 등록' })).toBeEnabled();
  // The pager inside the form only turns the page; it never submits the request with the old Round.
  fireEvent.click(screen.getByRole('button', { name: '다음' }));
  expect(run).not.toHaveBeenCalled();
  expect(screen.queryByRole('combobox', { name: 'Round' })).not.toBeInTheDocument();
  // #2574: the cleared choice is reported on submit instead of disabling the button.
  fireEvent.click(screen.getByRole('button', { name: '요청 등록' }));
  expectFieldError(screen.getByRole('combobox', { name: '개발 건 선택' }), '개발 건을 선택해 주세요.');
  expect(run).not.toHaveBeenCalled();
});

// #2574 follow-up C1: the required Round shows «· 필수» like the other lifecycle forms and is validated on submit.
it('marks the Round required with «· 필수», shows its error on submit and focuses it without writing', async () => {
  const run = mount();
  fireEvent.click(screen.getByRole('combobox', { name: '개발 건 선택' }));
  fireEvent.click(await screen.findByRole('option', { name: 'MODEL-A · Synthetic model' }));
  const round = screen.getByRole('combobox', { name: 'Round' });
  expect(document.querySelector(`label[for="${round.id}"]`)?.textContent).toBe('Round· 필수');
  expect(round).toHaveAttribute('aria-required', 'true');
  const submit = screen.getByRole('button', { name: '요청 등록' });
  expect(submit).toBeEnabled();
  fireEvent.click(submit);
  expectFieldError(round, 'Round를 선택해 주세요.');
  expect(round).toHaveFocus();
  expect(run).not.toHaveBeenCalled();
});
it('sends the same request payload as before once a Round is chosen', async () => {
  const run = mount();
  fireEvent.click(screen.getByRole('combobox', { name: '개발 건 선택' }));
  fireEvent.click(await screen.findByRole('option', { name: 'MODEL-A · Synthetic model' }));
  fireEvent.click(screen.getByRole('button', { name: '요청 등록' }));
  fireEvent.click(screen.getByRole('combobox', { name: 'Round' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Round 1' }));
  expect(screen.getByRole('combobox', { name: 'Round' })).not.toHaveAttribute('aria-invalid');
  fireEvent.click(screen.getByRole('button', { name: '요청 등록' }));
  expect(run).toHaveBeenCalledWith({ roundId: 'round-a', priority: 1, immediate: false });
});
