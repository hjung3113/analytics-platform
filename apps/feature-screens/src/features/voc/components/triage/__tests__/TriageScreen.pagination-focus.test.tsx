import { registerTriageTestHost } from '@/test/triage-host';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, expect, it, vi } from 'vitest';
import type { VocTriageScreenProps } from '../VocTriageScreen';
import { TriageQueue } from '../TriageQueue';

const api = vi.hoisted(() => ({ apiClient: vi.fn() }));
vi.mock('@/lib/api/client', async (original) => ({ ...(await original<typeof import('@/lib/api/client')>()), apiClient: api.apiClient }));
vi.mock('../VocTriageScreen', () => ({ VocTriageScreen: ({ items, queueFooter }: VocTriageScreenProps) => <TriageQueue vocs={items} selectedId={null} onSelect={vi.fn()}>{queueFooter}</TriageQueue> }));
vi.mock('@/lib/api/nav', () => ({ fetchNavCounts: async () => ({ counts: {} }) }));
vi.mock('@/lib/api/me', () => ({ useMeBridge: () => ({ isLoading: false }) }));
vi.mock('@/lib/cross-system/usePermissionCheckBridge', () => ({ usePermissionCheckBridge: () => ({ isPending: false, data: { state: 'approved' } }) }));
import { TriageScreen } from '../TriageScreen';

beforeAll(() => registerTriageTestHost(() => ({ view: 'triage', managedSystem: '00000000-0000-4000-8000-000000000001' }), vi.fn()));

it.each([false, true])('keeps load-more focus pending and hands off at the terminal page unless moved (%s)', async (moveFocus) => {
  let resolve!: (value: unknown) => void;
  api.apiClient.mockImplementation(async (_method: string, url: string) => {
    if (url.includes('cursor=')) return new Promise((done) => { resolve = done; });
    return { data: { items: [{ id: 'first', title: 'First row', display_id: 'VOC-1', reporter_facing_status: 'received', triage_state: 'untriaged', review_postponed_at: null, created_at: '2026-01-01T00:00:00Z', owner_user_id: null, owner_team_id: null, analytics_area_id: null }], page: { has_more: true, cursor: 'next' } } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><TriageScreen /><button type="button">Elsewhere</button></QueryClientProvider>);
  const more = await screen.findByRole('button', { name: '더 보기' }, { timeout: 10_000 });
  more.focus();
  fireEvent.click(more);
  await waitFor(() => expect(more).toHaveTextContent('불러오는 중'));
  expect(document.activeElement).toBe(more);
  expect(more).toHaveAttribute('aria-disabled', 'true');
  expect(more).not.toBeDisabled();
  if (moveFocus) screen.getByRole('button', { name: 'Elsewhere' }).focus();
  await act(async () => resolve({ data: { items: [], page: { has_more: false } } }));
  await waitFor(() => expect(more.isConnected).toBe(false));
  const queue = screen.getByRole('region', { name: '분류 대기열' });
  expect(document.activeElement).toBe(moveFocus ? screen.getByRole('button', { name: 'Elsewhere' }) : queue);
});
