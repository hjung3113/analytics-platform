import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HostSeamProvider, type HostSeam } from '../../../../lib/host/host-seam';
import { CreateClusterModal } from './CreateClusterModal';
import { CreateFindingFromClusterModal } from './CreateFindingFromClusterModal';

const api = vi.hoisted(() => ({ apiClient: vi.fn() }));
vi.mock('../../../../lib/api/client', async (original) => ({ ...(await original<typeof import('../../../../lib/api/client')>()), apiClient: api.apiClient }));
vi.mock('../../../../lib/api/registry-reads', () => ({ fetchManagedSystems: async () => ({ items: [{ id: '00000000-0000-4000-8000-000000000001', name: 'System A' }], total: 1 }) }));
vi.mock('../../../../lib/api/permission-reads', () => ({ fetchCapabilityScopeViaClient: async () => ({ scope: { kind: 'all' } }) }));

describe('creation pending dismissal', () => {
  it.each(['cluster', 'finding'] as const)('keeps %s mounted through Escape and close, then delivers success once', async (kind) => {
    let resolve!: (value: unknown) => void;
    api.apiClient.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const onClose = vi.fn();
    const onCreated = vi.fn();
    const navigate = vi.fn();
    const seam: HostSeam = { canLink: () => true, Link: ({ children }) => <a href="#host">{children}</a>, useNavigate: () => navigate, notifyError: vi.fn(), notifySuccess: vi.fn() };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><HostSeamProvider value={seam}>
      {kind === 'cluster' ? <CreateClusterModal open onClose={onClose} onCreated={onCreated} /> : <CreateFindingFromClusterModal open cluster={{ id: '00000000-0000-4000-8000-000000000002', title: 'Cluster title', summary: 'Cluster summary', members: [] }} onClose={onClose} />}
    </HostSeamProvider></QueryClientProvider>);
    const prefix = kind === 'cluster' ? 'create-cluster' : 'create-finding-from-cluster';
    fireEvent.change(screen.getByLabelText(/제목/), { target: { value: 'Synthetic title' } });
    if (kind === 'cluster') {
      const picker = screen.getByRole('combobox', { name: '시스템' });
      await waitFor(() => expect(picker).not.toBeDisabled());
      fireEvent.click(picker);
      fireEvent.click(await screen.findByRole('option', { name: 'System A' }));
    } else {
      fireEvent.change(screen.getByLabelText(/요약/), { target: { value: 'Synthetic summary' } });
    }
    fireEvent.click(screen.getByTestId(`${prefix}-submit`));
    await waitFor(() => expect(screen.getByTestId(`${prefix}-submit`)).toBeDisabled());
    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => resolve({ data: { id: '00000000-0000-4000-8000-000000000003' } }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    if (kind === 'cluster') expect(onCreated).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000003');
    else expect(navigate).toHaveBeenCalledWith('/findings/00000000-0000-4000-8000-000000000003');
    expect(api.apiClient).toHaveBeenCalledTimes(1);
    api.apiClient.mockReset();
  });
});
