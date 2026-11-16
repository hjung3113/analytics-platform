import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { LifecycleApi, Presentation, ReadState } from '../contracts';
import { RequestRegister } from '../RequestsScreen';

it('clears the development project and Round when the model page changes', async () => {
  const api: LifecycleApi = {
    useRead: <T,>(name: string): ReadState<T> => ({ status: 'done', retry: vi.fn(), data: (name === 'models' ? { rows: [{ code: 'MODEL-A', name: 'Synthetic model', project: { projectId: 'project-a' } }], total: 26 } : name === 'rounds' ? { rows: [{ id: 'round-a', status: 'open', seq: 1 }] } : null) as T | null }),
    useAction: () => ({ pending: false, run: vi.fn() }),
  };
  const ui: Presentation = { page: p => p.children, drawer: parts => parts.body, table: () => null, timeline: () => null, trust: () => null };
  render(<RequestRegister api={api} ui={ui} actorId="actor" canProject canRound setSelection={vi.fn()} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('combobox', { name: '개발 건 선택' }));
  fireEvent.click(await screen.findByRole('option', { name: 'MODEL-A · Synthetic model' }));
  fireEvent.click(screen.getByRole('combobox', { name: 'Round (필수)' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Round 1' }));
  expect(screen.getByRole('button', { name: '요청 등록' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: '다음' }));
  expect(screen.queryByRole('combobox', { name: 'Round (필수)' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '요청 등록' })).toBeDisabled();
});
