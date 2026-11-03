// #1291 B2 — Cluster 생성 is drawn in the host head when the host offers one; the permission hint for other roles stays in the toolbar.
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { HeadTargetHost } from '@/test/primary-action-host';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ClusterListScreen } from './ClusterListScreen';

const me = vi.hoisted(() => ({ role: 'admin' }));
vi.mock('@/features/voc-cluster/components/detail/VocClusterListShell', () => ({
  VocClusterListShell: ({ toolbarActions }: { toolbarActions?: ReactNode }) => (
    <div data-testid="shell-toolbar">{toolbarActions}</div>
  ),
}));
vi.mock('@/features/voc-cluster/hooks/useVocClusterList', () => ({
  useVocClusterList: () => ({ isSuccess: true, data: { items: [] } }),
}));
vi.mock('@/lib/api/me', () => ({
  useMeBridge: () => ({ data: { actor: { role_level: me.role } } }),
}));

const seam: HostSeam = {
  canLink: () => true,
  Link: ({ to, children }) => <a href={to}>{children}</a>,
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
};
const page = (
  <QueryClientProvider client={new QueryClient()}>
    <ClusterListScreen onCreated={vi.fn()} />
  </QueryClientProvider>
);

describe('ClusterListScreen Cluster 생성 placement', () => {
  it('is in the host head and not in the shell toolbar', () => {
    me.role = 'admin';
    render(<HeadTargetHost base={seam}>{page}</HeadTargetHost>);
    expect(within(screen.getByTestId('host-head')).getByTestId('cluster-create-button')).toBeInTheDocument();
    expect(within(screen.getByTestId('shell-toolbar')).queryByTestId('cluster-create-button')).toBeNull();
    expect(screen.getAllByTestId('cluster-create-button')).toHaveLength(1);
  });

  it('stays in the shell toolbar without a host target', () => {
    me.role = 'admin';
    render(<HostSeamProvider value={seam}>{page}</HostSeamProvider>);
    expect(within(screen.getByTestId('shell-toolbar')).getByTestId('cluster-create-button')).toBeInTheDocument();
  });

  it('draws no head action for a role without permission and keeps the hint in the toolbar', () => {
    me.role = 'viewer';
    render(<HeadTargetHost base={seam}>{page}</HeadTargetHost>);
    expect(screen.queryByTestId('cluster-create-button')).toBeNull();
    expect(within(screen.getByTestId('shell-toolbar')).getByTestId('cluster-create-hint')).toBeInTheDocument();
  });
});
