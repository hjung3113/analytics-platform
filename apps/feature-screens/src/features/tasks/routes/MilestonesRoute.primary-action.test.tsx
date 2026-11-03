// #1291 B2 — Milestone 생성 is drawn in the host head when the host offers one and still opens the create block from there.
import { listMilestones } from '@/lib/api/milestones';
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { HeadTargetHost } from '@/test/primary-action-host';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MilestonesScreen } from './MilestonesScreen';

vi.mock('@/lib/api/milestones', () => ({
  listMilestones: vi.fn(),
  getMilestone: vi.fn(),
  createMilestone: vi.fn(),
  updateMilestone: vi.fn(),
}));
vi.mock('@/lib/api/tasks', () => ({ listTasks: vi.fn(async () => ({ items: [] })) }));
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({ useWorkspaceActors: () => ({ actors: [] }) }));
vi.mock('@/lib/api/registry-reads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/registry-reads')>()),
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [], total: 0 })),
  fetchManagedSystems: vi.fn(async () => ({ items: [], total: 0 })),
}));

const seam: HostSeam = {
  canLink: () => true,
  Link: ({ to, children }) => <a href={to}>{children}</a>,
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  useNavigate: () => vi.fn(),
  useSearch: () => ({ view: 'milestones' }),
  useTitle: () => {},
};
const CREATE = { name: 'Milestone 생성' };
const screenOf = () => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MilestonesScreen renderDetail={(parts) => <section data-testid="detail">{parts.title}</section>} />
  </QueryClientProvider>
);

describe('MilestonesScreen Milestone 생성 placement', () => {
  beforeEach(() => {
    vi.mocked(listMilestones).mockReset().mockResolvedValue({ items: [] });
  });

  it('is in the host head and not in the toolbar, and opens the create block', async () => {
    render(<HeadTargetHost base={seam}>{screenOf()}</HeadTargetHost>);
    const head = within(screen.getByTestId('host-head'));
    const button = await head.findByRole('button', CREATE);
    expect(within(screen.getByTestId('host-body')).queryByRole('button', CREATE)).toBeNull();
    expect(screen.getAllByRole('button', CREATE)).toHaveLength(1);
    fireEvent.click(button);
    expect(await screen.findByTestId('detail')).toBeInTheDocument();
  });

  it('stays in the toolbar without a host target', async () => {
    render(<HostSeamProvider value={seam}>{screenOf()}</HostSeamProvider>);
    expect(await screen.findByRole('button', CREATE)).toBeInTheDocument();
    expect(screen.getAllByRole('button', CREATE)).toHaveLength(1);
  });
});
