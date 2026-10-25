import { getMilestone, listMilestones } from '@/lib/api/milestones';
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import type { HostSearch } from '@/lib/host/search';
import type { MilestoneDetailDto, MilestoneDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MilestonePanelParts } from './MilestonesScreen';
import { MilestonesScreen } from './MilestonesScreen';

// MilestonesScreen under a bare HostSeamProvider, with no router mocked or mounted: the bridge's situation (#763 m).
const IDS = {
  workspace: 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001',
  ms: 'cccccccc-cccc-4ccc-8ccc-cccccccc00c1',
  owner: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002',
  sso: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1021',
  notif: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1022',
  finding: 'ffffffff-ffff-4fff-8fff-ffffffff0181',
};

vi.mock('@/lib/api/milestones', () => ({
  listMilestones: vi.fn(),
  getMilestone: vi.fn(),
  createMilestone: vi.fn(),
  updateMilestone: vi.fn(),
}));
vi.mock('@/lib/api/tasks', () => ({ listTasks: vi.fn(async () => ({ items: [] })) }));
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({
    actors: [{ id: IDS.owner, display_name: '박서연', kind: 'user', role_level: 'admin' }],
  }),
}));
vi.mock('@/lib/api/registry-reads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/registry-reads')>()),
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [], total: 0 })),
  fetchManagedSystems: vi.fn(async () => ({
    items: [{ id: IDS.ms, name: 'Power BI', archived_at: null }],
    total: 1,
  })),
}));

function milestone(id: string, displayId: string, title: string): MilestoneDto {
  return {
    id,
    workspace_id: IDS.workspace,
    display_id: displayId,
    primary_managed_system_id: IDS.ms,
    analytics_area_id: null,
    title,
    why: `${title} why`,
    status: 'in_progress',
    owner_actor_id: IDS.owner,
    created_by: IDS.owner,
    start_date: '2026-05-10',
    target_date: '2026-06-15',
    created_at: '2026-07-21T01:00:00.000Z',
    updated_at: '2026-07-21T08:30:00.000Z',
    progress: { released_done: 0, in_flight: 1, queued: 0, total: 1, percent: 0 },
  };
}
const SSO = milestone(IDS.sso, 'MLS-1021', 'SSO Stabilization');
const NOTIF = milestone(IDS.notif, 'MLS-1022', 'Notification Reliability');
const detailOf = (row: MilestoneDto, linked: boolean): MilestoneDetailDto => ({
  ...row,
  source_finding: linked
    ? {
        id: IDS.finding,
        display_id: 'FIN-181',
        title: 'SSO finding',
        summary: 'summary',
        evidence_count: 1,
      }
    : null,
});

const navigate = vi.fn();
let parts: MilestonePanelParts | null = null;
let canLinkFinding = true;
let absoluteHref: HostSeam['absoluteHref'];

function renderDetail(next: MilestonePanelParts) {
  parts = next;
  return (
    <section data-testid="detail">
      <div>{next.title}</div>
      <div>{next.headerActions}</div>
      <div>{next.body}</div>
    </section>
  );
}

function Harness({ search }: { search: HostSearch }) {
  const seam: HostSeam = {
    canLink: (to) => (to.startsWith('/findings') ? canLinkFinding : true),
    Link: ({ to, children }) => <a href={to}>{children}</a>,
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
    useNavigate: () => navigate,
    useSearch: () => search,
    useTitle: () => {},
    ...(absoluteHref !== undefined ? { absoluteHref } : {}),
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <HostSeamProvider value={seam}>
        <MilestonesScreen renderDetail={renderDetail} />
      </HostSeamProvider>
    </QueryClientProvider>
  );
}

const BASE = { view: 'milestones', managedSystem: IDS.ms };
const withParam = (id: string): HostSearch => ({ ...BASE, param: id });

beforeEach(() => {
  navigate.mockReset();
  parts = null;
  canLinkFinding = true;
  absoluteHref = (to) => `https://fo.test${to}`;
  vi.mocked(listMilestones)
    .mockReset()
    .mockResolvedValue({ items: [SSO, NOTIF] });
  vi.mocked(getMilestone)
    .mockReset()
    .mockImplementation(async (id) => detailOf(id === IDS.sso ? SSO : NOTIF, true));
});

describe('MilestonesScreen under a host seam (#763 m)', () => {
  it('writes the selected row and the close as seam hrefs, keeping the scope', async () => {
    const { rerender } = render(<Harness search={BASE} />);
    fireEvent.click(
      (await screen.findByText('MLS-1021')).closest('[role="button"]') as HTMLElement,
    );
    expect(navigate).toHaveBeenLastCalledWith(
      `/tasks?view=milestones&param=${IDS.sso}&managedSystem=${IDS.ms}`,
    );
    rerender(<Harness search={withParam(IDS.sso)} />);
    await screen.findByRole('heading', { name: 'SSO Stabilization' });
    act(() => parts?.requestClose());
    expect(navigate).toHaveBeenLastCalledWith(`/tasks?view=milestones&managedSystem=${IDS.ms}`);
  });

  it('holds a dirty title against a seam param change until confirmed, and a decline restores the retained param', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness search={withParam(IDS.sso)} />);
    await screen.findByRole('heading', { name: 'SSO Stabilization' });
    await user.click(screen.getByRole('button', { name: '제목 편집' }));
    await user.type(screen.getByRole('textbox', { name: '제목' }), ' edited');
    rerender(<Harness search={withParam(IDS.notif)} />);
    expect(await screen.findByText('변경사항이 저장되지 않았습니다')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    expect(parts?.kind === 'detail' && parts.view.kind === 'ready' && parts.view.milestone.id).toBe(
      IDS.sso,
    );
    await user.click(screen.getByRole('button', { name: '계속 작성' }));
    expect(navigate).toHaveBeenCalledWith(
      `/tasks?view=milestones&param=${IDS.sso}&managedSystem=${IDS.ms}`,
    );
  });

  it('opens create parts and blocks a row switch while the create form is dirty', async () => {
    const user = userEvent.setup();
    render(<Harness search={BASE} />);
    await screen.findByText('MLS-1021');
    await user.click(screen.getByRole('button', { name: 'Milestone 생성' }));
    await waitFor(() => expect(parts?.kind).toBe('create'));
    await user.type(await screen.findByRole('textbox', { name: '제목' }), 'Draft');
    fireEvent.click(screen.getByText('MLS-1021').closest('[role="button"]') as HTMLElement);
    expect(await screen.findByText('변경사항이 저장되지 않았습니다')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    expect(parts?.kind).toBe('create');
  });

  it('shows the source Finding action only when the host links it, and navigates through the host', async () => {
    const user = userEvent.setup();
    canLinkFinding = false;
    const { unmount } = render(<Harness search={withParam(IDS.sso)} />);
    await screen.findByRole('heading', { name: 'SSO Stabilization' });
    expect(screen.queryByRole('button', { name: 'Finding 열기' })).not.toBeInTheDocument();
    unmount();

    canLinkFinding = true;
    render(<Harness search={withParam(IDS.sso)} />);
    await user.click(await screen.findByRole('button', { name: 'Finding 열기' }));
    expect(navigate).toHaveBeenCalledWith(`/findings/${IDS.finding}`);
  });

  it('copies the host address, and offers no copy action when the host has none', async () => {
    const spy = vi.fn((to: string) => `https://fo.test${to}`);
    absoluteHref = spy;
    const { unmount } = render(<Harness search={withParam(IDS.sso)} />);
    expect(await screen.findByRole('button', { name: '링크 복사' })).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith(`/tasks?view=milestones&param=${IDS.sso}`);
    unmount();

    absoluteHref = () => null;
    render(<Harness search={withParam(IDS.sso)} />);
    await screen.findByRole('heading', { name: 'SSO Stabilization' });
    expect(screen.queryByRole('button', { name: '링크 복사' })).not.toBeInTheDocument();
  });
});
