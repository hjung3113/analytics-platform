import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { VocClusterDetailPanel, useClusterDetailParts } from './VocClusterDetailPanel';

const FINDING = '77777777-7777-4777-8777-777777777777';

vi.mock('@/features/voc-cluster/hooks/useVocClusterDetail', () => ({
  useVocClusterDetail: () => ({
    isLoading: false,
    isError: false,
    isSuccess: true,
    isFetching: false,
    data: {
      id: 'c1',
      display_id: 'CLU-1',
      title: 'Cluster title',
      summary: null,
      rationale: 'Related reports',
      status: 'confirmed',
      primary_managed_system_id: 'ms',
      members: Array.from({ length: 5 }, (_, index) => ({
        voc_id: `voc-${index}`,
        title: 'A long member title that should remain readable in the embedded drawer',
        display_id: `VOC-${index}`,
      })),
      linked_findings: [{ id: FINDING, display_id: 'FND-1', status: 'active' }],
    },
  }),
}));
vi.mock('@/features/voc-cluster/hooks/useConfirmCluster', () => ({
  useConfirmCluster: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/voc-cluster/hooks/useRemoveClusterMember', () => ({
  useRemoveClusterMember: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
}));
vi.mock('@/features/voc-cluster/hooks/useRequestTaskFromCluster', () => ({
  useRequestTaskFromCluster: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/cross-system/useManagedSystem', () => ({ useManagedSystem: () => null }));
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [] }),
}));
vi.mock('@/lib/api/me', () => ({
  useMeBridge: () => ({ data: { actor: { role_level: 'admin' } } }),
}));

function EmbeddedDetail() {
  const parts = useClusterDetailParts({ clusterId: 'c1' });
  return parts.body;
}

function mount(mapped: (to: string) => boolean, embedded = false) {
  const host: HostSeam = {
    canLink: mapped,
    Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
      <a href={to} {...(rest as object)}>
        {children}
      </a>
    ),
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
    useNavigate: () => vi.fn(),
    useSearch: () => ({}),
    useTitle: () => {},
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <HostSeamProvider value={host}>
        {embedded ? <EmbeddedDetail /> : <VocClusterDetailPanel clusterId="c1" />}
      </HostSeamProvider>
    </QueryClientProvider>,
  );
}

describe('cluster detail Finding links through the host seam', () => {
  it('leaves embedded drawer insets to the host and keeps member content flat and readable', () => {
    mount(() => true, true);
    const body = screen.getByTestId('cluster-detail-title')
      .closest('[data-anchor]')?.parentElement?.parentElement;
    expect(body).toHaveClass('overflow-y-auto', 'py-6');
    expect(body).not.toHaveClass('px-6');
    expect(screen.getByTestId('detail-panel-section-nav-strip')).toHaveClass('px-0');
    expect(screen.getByTestId('cluster-cta-footer')).not.toHaveClass('px-6');
    for (const className of ['border', 'p-3']) {
      expect(screen.getByTestId('cluster-detail-rationale')).not.toHaveClass(className);
    }
    for (const className of ['border', 'rounded-md', 'overflow-hidden']) {
      expect(screen.getByTestId('cluster-members-list')).not.toHaveClass(className);
    }
    const row = screen.getByTestId('cluster-member-row-voc-0');
    expect(row).not.toHaveClass('px-4');
    expect(row).toHaveClass('border-b');
    expect(screen.getByTestId('cluster-member-link-voc-0').parentElement).not.toHaveClass('truncate');
    expect(screen.getByTestId('cluster-members-more')).not.toHaveClass('px-4');
  });

  it('retains the standalone member frame and insets', () => {
    mount(() => true);
    expect(screen.getByTestId('cluster-members-list')).toHaveClass('border', 'rounded-md');
    expect(screen.getByTestId('cluster-member-row-voc-0')).toHaveClass('px-4');
    expect(screen.getByTestId('cluster-cta-footer')).toHaveClass('px-6');
  });

  it('offers the Finding path links when the host maps it', () => {
    mount(() => true);
    const links = screen.getAllByRole('link', { name: 'Finding 열기' });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute('href', `/findings/${FINDING}`);
  });

  it('offers no Finding link when the host maps none (ADR-0071 d10)', () => {
    mount(() => false);
    expect(screen.queryByRole('link', { name: 'Finding 열기' })).not.toBeInTheDocument();
    expect(screen.getByTestId('cluster-detail-panel')).toBeInTheDocument();
  });
});
