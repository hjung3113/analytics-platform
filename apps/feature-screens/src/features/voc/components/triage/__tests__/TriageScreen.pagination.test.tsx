import { registerTriageTestHost } from '@/test/triage-host';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, expect, it, vi } from 'vitest';
import type { VocTriageScreenProps } from '../VocTriageScreen';

const api = vi.hoisted(() => ({ apiClient: vi.fn() }));
vi.mock('@/lib/api/client', async (original) => ({ ...(await original<typeof import('@/lib/api/client')>()), apiClient: api.apiClient }));
vi.mock('../VocTriageScreen', () => ({ VocTriageScreen: ({ items, queueFooter }: VocTriageScreenProps) => <div>{items.map((item) => <p key={item.id}>{item.title}</p>)}{queueFooter}</div> }));
vi.mock('@/lib/api/nav', () => ({ fetchNavCounts: async () => ({ counts: {} }) }));
vi.mock('@/lib/api/me', () => ({ useMeBridge: () => ({ isLoading: false }) }));
vi.mock('@/lib/cross-system/usePermissionCheckBridge', () => ({ usePermissionCheckBridge: () => ({ isPending: false, data: { state: 'approved' } }) }));
import { TriageScreen } from '../TriageScreen';

let searchState: Record<string, string> = { view: 'triage', managedSystem: '00000000-0000-4000-8000-000000000001' };
beforeAll(() => registerTriageTestHost(() => searchState, vi.fn()));

it('appends the next cursor page, retains rows on failure, retries, and resets on tab changes', async () => {
  api.apiClient.mockImplementation(async (_method: string, url: string) => {
    const query = new URL(url, 'https://example.test').searchParams;
    if (query.get('tab') === 'high') return { data: { items: [{ id: 'high', title: 'High queue' }], page: { has_more: false } } };
    if (query.has('cursor')) throw new Error('temporarily offline');
    return { data: { items: Array.from({ length: 50 }, (_, i) => ({ id: `row-${i}`, title: `VOC ${i + 1}` })), page: { has_more: true, cursor: 'next-page' } } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = <QueryClientProvider client={client}><TriageScreen /></QueryClientProvider>;
  const { rerender } = render(ui);
  expect(await screen.findByText('VOC 50')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('불러오지 못했습니다');
  expect(screen.getByText('VOC 50')).toBeInTheDocument();
  api.apiClient.mockResolvedValueOnce({ data: { items: [{ id: 'row-50', title: 'VOC 51' }], page: { has_more: false } } });
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByText('VOC 51')).toBeInTheDocument();
  expect(screen.getByText('VOC 1')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
  expect(api.apiClient.mock.calls.some((call) => String(call[1]).includes('cursor=next-page'))).toBe(true);
  searchState = { ...searchState, tab: 'high' };
  await act(async () => rerender(<QueryClientProvider client={client}><TriageScreen /></QueryClientProvider>));
  await waitFor(() => expect(screen.getByText('High queue')).toBeInTheDocument());
  expect(screen.queryByText('VOC 51')).not.toBeInTheDocument();
});
