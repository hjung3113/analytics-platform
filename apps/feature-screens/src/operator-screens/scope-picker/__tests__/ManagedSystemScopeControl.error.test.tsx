import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ManagedSystemScopeControl } from '../ManagedSystemScopeControl';

const fetchSystems = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/registry-reads', () => ({ fetchManagedSystems: fetchSystems }));
vi.mock('@/lib/api/me', () => ({ useMeBridge: () => ({ data: undefined }) }));

it('shows a catalog failure and retries instead of presenting an empty scope', async () => {
  fetchSystems.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ items: [], total: 0 });
  const client = new QueryClient();
  render(<QueryClientProvider client={client}><ManagedSystemScopeControl onChange={vi.fn()} /></QueryClientProvider>);
  expect(screen.queryByTestId('scope-selector')).not.toBeInTheDocument();
  expect(await screen.findByRole('alert')).toHaveTextContent('시스템을 불러오지 못했습니다.');
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByTestId('scope-selector')).toBeInTheDocument();
});

it.each(['pending', 'error'])('renders nothing while collapsed with a %s catalog', async (state) => {
  fetchSystems.mockReset();
  if (state === 'pending') fetchSystems.mockReturnValue(new Promise(() => {}));
  else fetchSystems.mockRejectedValue(new Error('offline'));
  const client = new QueryClient();
  const { container } = render(<QueryClientProvider client={client}><ManagedSystemScopeControl collapsed onChange={vi.fn()} /></QueryClientProvider>);
  await waitFor(() => expect(client.getQueryState(['managed-systems', 'scope-selector'])?.status).toBe(state));
  expect(container).toBeEmptyDOMElement();
});

it.each([false, true])('retains retry focus pending and hands it to the selector unless moved elsewhere (%s)', async (moveFocus) => {
  fetchSystems.mockReset();
  let resolve!: (value: { items: []; total: number }) => void;
  fetchSystems.mockRejectedValueOnce(new Error('offline')).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const client = new QueryClient();
  render(<QueryClientProvider client={client}><ManagedSystemScopeControl onChange={vi.fn()} /><button type="button">Elsewhere</button></QueryClientProvider>);
  const retry = await screen.findByRole('button', { name: '다시 시도' });
  retry.focus();
  fireEvent.click(retry);
  expect(retry.isConnected).toBe(true);
  expect(document.activeElement).toBe(retry);
  expect(retry).toHaveAttribute('aria-disabled', 'true');
  if (moveFocus) screen.getByRole('button', { name: 'Elsewhere' }).focus();
  await act(async () => resolve({ items: [], total: 0 }));
  const selector = await screen.findByTestId('scope-selector');
  expect(document.activeElement).toBe(moveFocus ? screen.getByRole('button', { name: 'Elsewhere' }) : selector);
});
