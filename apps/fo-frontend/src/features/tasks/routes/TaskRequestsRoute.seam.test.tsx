import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import type { HostSearch } from '@/lib/host/search';
import { taskRequestPage } from '@/test/task-request-pages';
import type { TaskRequestDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskRequestsScreen } from './TaskRequestsScreen';
import type { TaskRequestPanelParts } from './task-requests/TaskRequestPanelParts';

// TaskRequestsScreen under a bare HostSeamProvider, with no router mocked or mounted: the bridge's situation (#763 q2).
const api = vi.hoisted(() => ({ fetchTaskRequests: vi.fn(), getTaskRequest: vi.fn() }));

vi.mock('@/lib/api/task-requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/task-requests')>()),
  fetchTaskRequests: api.fetchTaskRequests,
  getTaskRequest: api.getTaskRequest,
}));
vi.mock('@/lib/api/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/me')>()),
  useMeBridge: () => ({ data: { actor: { id: 'actor', role_level: 'admin' } } }),
}));
vi.mock('@/lib/api/registry-reads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/registry-reads')>()),
  fetchManagedSystems: vi.fn(async () => ({ items: [] })),
}));
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [] }),
}));
vi.mock('./task-requests/TaskRequestPanelParts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./task-requests/TaskRequestPanelParts')>();
  const TaskRequestPanelBody = ({
    item,
    onDecisionComplete,
  }: { item: TaskRequestDto; onDecisionComplete?: (item: TaskRequestDto) => void }) => (
    <button type="button" onClick={() => onDecisionComplete?.({ ...item, status: 'approved' })}>
      Approve selected
    </button>
  );
  return {
    ...actual,
    TaskRequestPanelBody,
    // The real builder names its own Body, so the stub is swapped in on the parts it returns.
    buildTaskRequestPanelParts: (
      props: Parameters<typeof actual.buildTaskRequestPanelParts>[0],
    ) => ({
      ...actual.buildTaskRequestPanelParts(props),
      body: <TaskRequestPanelBody key={props.item.id} {...props} />,
    }),
  };
});

const MS = '30000000-0000-0000-0000-000000000003';
const TEAM = '20000000-0000-0000-0000-000000000002';
const first: TaskRequestDto = {
  id: 'a1',
  workspace_id: 'workspace',
  display_id: 'REQ-A',
  source_type: 'finding',
  source_id: 'finding',
  primary_managed_system_id: MS,
  evidence_summary: 'Evidence',
  requested_outcome: 'Request A',
  requester_actor_id: 'actor',
  status: 'pending_review',
  assigned_reviewer_actor_id: null,
  assigned_reviewer_team_id: null,
  reviewer_actor_id: null,
  decision_reason: null,
  decided_at: null,
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
};
const second = { ...first, id: 'b1', display_id: 'REQ-B', requested_outcome: 'Request B' };

type Recorded = { href: string; record: Record<string, string>; options?: { replace?: boolean } };
const navigated: Recorded[] = [];
let parts: TaskRequestPanelParts | null = null;
let absoluteHref: HostSeam['absoluteHref'];

const record = (href: string) =>
  Object.fromEntries(new URL(href, 'http://feedbackops.local').searchParams);

function renderDetail(next: TaskRequestPanelParts) {
  parts = next;
  return (
    <section data-testid="detail">
      <div>{next.title}</div>
      <div>{next.headerActions}</div>
      <div>{next.body}</div>
    </section>
  );
}

function Harness({ search, autoSelect = true }: { search: HostSearch; autoSelect?: boolean }) {
  const seam: HostSeam = {
    canLink: () => true,
    Link: ({ to, children }) => <a href={to}>{children}</a>,
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
    useNavigate: () => (href, options) => {
      navigated.push({ href, record: record(href), ...(options ? { options } : {}) });
    },
    useSearch: () => search,
    useTitle: () => {},
    ...(absoluteHref !== undefined ? { absoluteHref } : {}),
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <HostSeamProvider value={seam}>
        <TaskRequestsScreen autoSelect={autoSelect} renderDetail={renderDetail} />
      </HostSeamProvider>
    </QueryClientProvider>
  );
}

const BASE = { view: 'requests', managedSystem: MS };

beforeEach(() => {
  navigated.length = 0;
  parts = null;
  absoluteHref = undefined;
  api.fetchTaskRequests.mockReset();
  api.getTaskRequest.mockReset();
  api.fetchTaskRequests.mockImplementation(async (query) =>
    taskRequestPage([first, second], query),
  );
  api.getTaskRequest.mockImplementation(async (id: string) => (id === 'a1' ? first : second));
});

describe('TaskRequestsScreen over a bare host seam', () => {
  it('pushes the reviewer pick with managedSystem only, dropping param and the other reviewer key', async () => {
    render(<Harness search={{ ...BASE, param: 'a1', reviewerTeam: TEAM }} />);
    fireEvent.click(await screen.findByRole('combobox', { name: '검토자 필터' }));
    fireEvent.click(await screen.findByRole('option', { name: '내 검토 요청' }));
    expect(navigated).toHaveLength(1);
    expect(navigated[0]?.record).toEqual({ view: 'requests', managedSystem: MS, reviewer: 'me' });
    expect(navigated[0]?.options).toBeUndefined();
  });

  it('pushes a row click with param, and replaces without param when the host closes the panel', async () => {
    render(<Harness search={BASE} autoSelect={false} />);
    fireEvent.click(await screen.findByRole('button', { name: /REQ-B/ }));
    expect(navigated.at(-1)?.record).toEqual({ ...BASE, param: 'b1' });
    expect(navigated.at(-1)?.options).toBeUndefined();

    navigated.length = 0;
    render(<Harness search={{ ...BASE, param: 'a1' }} autoSelect={false} />);
    await screen.findAllByTestId('detail');
    parts?.requestClose();
    expect(navigated.at(-1)?.record).toEqual(BASE);
  });

  it('replaces the URL with the next request after an approval', async () => {
    render(<Harness search={{ ...BASE, param: 'a1' }} autoSelect={false} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve selected' }));
    await waitFor(() => expect(navigated.length).toBeGreaterThan(0));
    expect(navigated.at(-1)?.record).toEqual({ ...BASE, param: 'b1' });
    expect(navigated.at(-1)?.options).toEqual({ replace: true });
  });

  it('selects the first row without a navigate only when autoSelect is on', async () => {
    const off = render(<Harness search={BASE} autoSelect={false} />);
    await screen.findByRole('button', { name: /REQ-A/ });
    await waitFor(() => expect(api.fetchTaskRequests).toHaveBeenCalled());
    expect(parts).toBeNull();
    expect(navigated).toEqual([]);
    off.rerender(<Harness search={{ ...BASE, param: 'b1' }} autoSelect={false} />);
    await screen.findByTestId('detail');
    expect(parts?.displayId).toBe('REQ-B');
    off.unmount();

    render(<Harness search={BASE} />);
    await screen.findByTestId('detail');
    expect(parts?.displayId).toBe('REQ-A');
    expect(navigated).toEqual([]);
  });

  it('copies the host address, and offers no copy action when the host has none', async () => {
    // userEvent.setup() installs its own clipboard stub, so it runs before ours.
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true,
      writable: true,
    });
    try {
      const platformUrl = 'https://platform.test/feedbackops/task-requests?focus=a1';
      const spy = vi.fn((_to: string) => platformUrl);
      absoluteHref = spy;
      const { unmount } = render(<Harness search={{ ...BASE, param: 'a1' }} autoSelect={false} />);
      await user.click(await screen.findByRole('button', { name: '링크 복사' }));
      expect(record(spy.mock.calls[0]?.[0] ?? '')).toEqual({ view: 'requests', param: 'a1' });
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(platformUrl));
      unmount();

      absoluteHref = () => null;
      render(<Harness search={{ ...BASE, param: 'a1' }} autoSelect={false} />);
      await screen.findByTestId('detail');
      expect(screen.queryByRole('button', { name: '링크 복사' })).not.toBeInTheDocument();
    } finally {
      // biome-ignore lint/performance/noDelete: removing the shadow restores the real descriptor
      delete (navigator as { clipboard?: unknown }).clipboard;
      // biome-ignore lint/performance/noDelete: same, for the secure-context shim
      delete (window as { isSecureContext?: unknown }).isSecureContext;
      if (original) Object.defineProperty(navigator, 'clipboard', original);
    }
  });
});
