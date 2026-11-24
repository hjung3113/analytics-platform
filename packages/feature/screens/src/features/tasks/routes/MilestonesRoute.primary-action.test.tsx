// #1291 B2 — Milestone 생성 is drawn in the host head when the host offers one and still opens the create block from there.
import { listMilestones } from '../../../lib/api/milestones';
import { ApiError } from '../../../lib/api/types';
import { PERMISSION_BLOCKED_REASONS } from '../../../lib/copy/permission-reasons';
import { type HostSeam, HostSeamProvider } from '../../../lib/host/host-seam';
import { HeadTargetHost } from '../../../test/primary-action-host';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MilestonesScreen } from './MilestonesScreen';

vi.mock('../../../lib/api/milestones', () => ({
  listMilestones: vi.fn(),
  getMilestone: vi.fn(),
  createMilestone: vi.fn(),
  updateMilestone: vi.fn(),
}));
vi.mock('../../../lib/api/tasks', () => ({ listTasks: vi.fn(async () => ({ items: [] })) }));
vi.mock('../../../lib/cross-system/useWorkspaceActors', () => ({ useWorkspaceActors: () => ({ actors: [] }) }));
vi.mock('../../../lib/api/registry-reads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/registry-reads')>()),
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

  it('hides Milestone 생성 and the list toolbar on 403', async () => {
    vi.mocked(listMilestones).mockRejectedValue(
      new ApiError(403, { code: 'permission.denied', message: 'finding.manage required' }),
    );
    render(<HeadTargetHost base={seam}>{screenOf()}</HeadTargetHost>);
    expect(await screen.findByText(PERMISSION_BLOCKED_REASONS.milestoneList)).toBeInTheDocument();
    const head = within(screen.getByTestId('host-head'));
    expect(head.queryByRole('button', CREATE)).not.toBeInTheDocument();
    expect(within(screen.getByTestId('host-body')).queryByRole('button', CREATE)).toBeNull();
    expect(document.querySelector('[data-list-toolbar]')).not.toBeInTheDocument();
    expect(screen.queryByTestId('milestones-summary')).not.toBeInTheDocument();
  });

  it('moves focus from Milestone 생성 to the denial card when a deferred 403 settles', async () => {
    const rejectors: Array<(error: unknown) => void> = [];
    vi.mocked(listMilestones).mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectors.push(reject);
        }),
    );
    render(<HeadTargetHost base={seam}>{screenOf()}</HeadTargetHost>);
    const head = within(screen.getByTestId('host-head'));
    const button = await head.findByRole('button', CREATE);
    expect(screen.getByText('Milestones 불러오는 중…')).toBeInTheDocument();
    button.focus();
    expect(button).toHaveFocus();

    const denial = new ApiError(403, { code: 'permission.denied', message: 'finding.manage required' });
    for (const reject of rejectors) reject(denial);

    const reason = await screen.findByText(PERMISSION_BLOCKED_REASONS.milestoneList);
    expect(reason.closest('[tabindex="-1"]')).toContainElement(document.activeElement as HTMLElement);
    expect(button).not.toBeInTheDocument();
  });

  it.each([
    ['an allowed empty list', '표시할 Milestone이 없습니다.', null],
    ['a generic list error', 'Milestone 목록을 불러오지 못했습니다', new ApiError(500, {
      code: 'internal.unexpected', message: 'list unavailable',
    })],
  ] as const)('keeps Milestone 생성 in the host head on %s', async (_state, message, error) => {
    if (error) vi.mocked(listMilestones).mockRejectedValue(error);
    render(<HeadTargetHost base={seam}>{screenOf()}</HeadTargetHost>);
    await screen.findByText(message);
    expect(within(screen.getByTestId('host-head')).getByRole('button', CREATE)).toBeInTheDocument();
  });
});
