import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
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
