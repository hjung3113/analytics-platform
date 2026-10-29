import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import type { HostSearch } from '@/lib/host/search';
import type { TaskDto, TaskStatus } from '@ap/feature-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskBoardScreen } from './TaskBoardScreen';
import { listBoardTasks } from './taskBoardTestServer';

// #763 b: the board body under a host seam with no router and no sonner. Search, links and notices go through the seam;
// the Task detail comes from the host's `renderDetail`, rendered in place.

const MS = '30000000-0000-0000-0000-000000000003';
const ACTOR = '20000000-0000-0000-0000-000000000002';

const dnd = vi.hoisted(() => ({
  onDragStart: null as null | ((event: unknown) => void),
  onDragEnd: null as null | ((event: unknown) => void),
}));
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({
    children,
    onDragStart,
    onDragEnd,
  }: {
    children: React.ReactNode;
    onDragStart: (event: unknown) => void;
    onDragEnd: (event: unknown) => void;
  }) => {
    dnd.onDragStart = onDragStart;
    dnd.onDragEnd = onDragEnd;
    return children;
  },
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  KeyboardSensor: class {},
  PointerSensor: class {},
  useDraggable: () => ({ setNodeRef: vi.fn(), listeners: {}, attributes: {}, isDragging: false }),
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
  useSensor: () => ({}),
  useSensors: () => [],
}));
vi.mock('@ap/ui', async () => {
  const actual = await vi.importActual<typeof import('@ap/ui')>('@ap/ui');
  return {
    ...actual,
    WorkbenchShell: ({
      toolbar,
      children,
      detailPanel,
    }: {
      toolbar: { title: React.ReactNode; actions: React.ReactNode };
      children: React.ReactNode;
      detailPanel?: React.ReactNode;
    }) => (
      <div>
        <header>
          {toolbar.title}
          {toolbar.actions}
        </header>
        {children}
        <aside>{detailPanel}</aside>
      </div>
    ),
  };
});
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [{ id: ACTOR, display_name: '김담당' }] }),
}));
vi.mock('@/lib/api/registry-reads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/registry-reads')>()),
  fetchManagedSystems: vi.fn(async () => ({
    items: [{ id: MS, name: 'Billing Ops', archived_at: null }],
  })),
}));

function makeTask(n: number, status: TaskStatus): TaskDto {
  return {
    id: `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
    workspace_id: '90000000-0000-0000-0000-000000000009',
    display_id: `TASK-${n}`,
    primary_managed_system_id: MS,
    title: `Task ${n}`,
    status,
    priority: 'high',
    assignee_actor_id: null,
    assignee_team_id: null,
    due_date: null,
    milestone_id: null,
    analytics_area_id: null,
    source_task_request_id: null,
    created_by: ACTOR,
    created_at: '2026-07-10T00:00:00.000Z',
    updated_at: '2026-07-10T00:00:00.000Z',
  };
}

const tasks = [makeTask(1, 'backlog'), makeTask(2, 'todo')];
const patches: Array<{ id: string; body: { status: TaskStatus } }> = [];
let failPatch = false;
function stubFetch() {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/tasks') {
        return json(listBoardTasks(tasks, Object.fromEntries(url.searchParams)));
      }
      const detail = /^\/tasks\/([^/]+)$/.exec(url.pathname);
      if (detail) {
        const found = tasks.find((task) => task.id === detail[1]);
        if (init?.method === 'PATCH') {
          patches.push({ id: detail[1] as string, body: JSON.parse(String(init.body)) });
          if (failPatch) return json({ code: 'internal.unexpected', message: 'failed' }, 500);
          return json({ ...found, source: null });
        }
        return found ? json({ ...found, source: null }) : json({ code: 'not_found.record' }, 404);
      }
      if (url.pathname === '/milestones') return json({ items: [] });
      return json({ code: 'not_found.record', message: 'unstubbed' }, 404);
    }),
  );
}

const navigate = vi.fn<(href: string, options?: { replace?: boolean }) => void>();
const notifyError = vi.fn<(message: string) => void>();
let hostSearch: HostSearch;
let linkable: boolean;
const renderDetail = vi.fn();

function seam(): HostSeam {
  return {
    canLink: () => linkable,
    Link: ({ to, className, children }) => (
      <a href={to} className={className} data-seam-link="">
        {children}
      </a>
    ),
    notifyError,
    notifySuccess: vi.fn(),
    useNavigate: () => navigate,
    useSearch: () => hostSearch,
  };
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HostSeamProvider value={seam()}>
        <TaskBoardScreen renderDetail={renderDetail} />
      </HostSeamProvider>
    </QueryClientProvider>,
  );
}

function parse(href: string) {
  const url = new URL(href, 'http://platform.local');
  return { pathname: url.pathname, search: Object.fromEntries(url.searchParams) };
}
const lastNavigate = () => {
  const call = navigate.mock.calls.at(-1);
  if (!call) throw new Error('navigate was not called');
  return { ...parse(call[0]), options: call[1] };
};
const card = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}:`) });

describe('TaskBoardScreen under a host seam', () => {
  beforeEach(() => {
    tasks.splice(0, tasks.length, makeTask(1, 'backlog'), makeTask(2, 'todo'));
    patches.length = 0;
    failPatch = false;
    hostSearch = { view: 'board', q: 'Task', managedSystem: MS, public_update: 'missing' };
    linkable = true;
    navigate.mockReset();
    notifyError.mockReset();
    renderDetail.mockReset();
    renderDetail.mockReturnValue(null);
    stubFetch();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('pushes the selected Task as param and keeps every other board key', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /^TASK-1:/ }));
    expect(lastNavigate()).toEqual({
      pathname: '/tasks',
      search: {
        view: 'board',
        q: 'Task',
        managedSystem: MS,
        public_update: 'missing',
        param: tasks[0]?.id,
      },
      options: undefined,
    });
  });

  it('replaces without param when the detail closes', async () => {
    hostSearch = { ...hostSearch, param: tasks[0]?.id as string };
    mount();
    await waitFor(() => expect(renderDetail).toHaveBeenCalled());
    const options = renderDetail.mock.calls.at(-1)?.[1] as { onClose(): void };
    act(() => options.onClose());
    expect(lastNavigate()).toEqual({
      pathname: '/tasks',
      search: { view: 'board', q: 'Task', managedSystem: MS, public_update: 'missing' },
      options: { replace: true },
    });
  });

  it('hands the selected Task to renderDetail with the footer and next-status action', async () => {
    hostSearch = { ...hostSearch, param: tasks[0]?.id as string };
    mount();
    await waitFor(() => expect(renderDetail).toHaveBeenCalled());
    const [taskId, options] = renderDetail.mock.calls.at(-1) as [
      string,
      { hasActionFooter: boolean; onMoveToNextStatus(id: string): void },
    ];
    expect(taskId).toBe(tasks[0]?.id);
    expect(options.hasActionFooter).toBe(true);
    act(() => options.onMoveToNextStatus(taskId));
    await waitFor(() => expect(patches).toEqual([{ id: taskId, body: { status: 'todo' } }]));
  });

  it('commits a search as a replace write that keeps the other keys', async () => {
    mount();
    const input = await screen.findByRole('searchbox');
    fireEvent.change(input, { target: { value: 'Fix' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(lastNavigate()).toEqual({
      pathname: '/tasks',
      search: { view: 'board', q: 'Fix', managedSystem: MS, public_update: 'missing' },
      options: { replace: true },
    });
  });

  it('removes the public-update chip with a push that drops only public_update', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /제거|삭제|remove/i }));
    expect(lastNavigate()).toEqual({
      pathname: '/tasks',
      search: { view: 'board', q: 'Task', managedSystem: MS },
      options: undefined,
    });
  });

  it('shows the Task Request review link through the seam only when the host can link', async () => {
    const view = mount();
    await screen.findByLabelText('Backlog 열');
    const link = view.container.querySelector('[data-seam-link]');
    expect(link).not.toBeNull();
    expect(parse(link?.getAttribute('href') as string)).toEqual({
      pathname: '/tasks',
      search: { view: 'requests', managedSystem: MS },
    });
    cleanup();
    linkable = false;
    const unlinked = mount();
    await screen.findByLabelText('Backlog 열');
    expect(unlinked.container.querySelector('[data-seam-link]')).toBeNull();
    expect(screen.getByText(/Task는 Task Request에서 전환됩니다\./)).toBeInTheDocument();
  });

  it('notifies a rejected move through the seam and puts the card back', async () => {
    failPatch = true;
    mount();
    await screen.findByLabelText('Backlog 열');
    const task = tasks[0] as TaskDto;
    const active = { id: task.id, data: { current: { task } } };
    await act(async () => {
      dnd.onDragStart?.({ active, activatorEvent: new MouseEvent('pointerdown') });
      dnd.onDragEnd?.({
        active,
        over: { id: 'todo' },
        activatorEvent: new MouseEvent('pointerup'),
      });
      await Promise.resolve();
    });
    await waitFor(() => expect(notifyError).toHaveBeenCalledTimes(1));
    expect(typeof notifyError.mock.calls[0]?.[0]).toBe('string');
    await waitFor(() =>
      expect(
        within(screen.getByLabelText('Backlog 열')).getByRole('button', { name: /^TASK-1:/ }),
      ).toBeInTheDocument(),
    );
  });

  it('leaves no detail when renderDetail returns undefined', async () => {
    hostSearch = { ...hostSearch, param: tasks[0]?.id as string };
    renderDetail.mockReturnValue(undefined);
    const view = mount();
    await waitFor(() => expect(renderDetail).toHaveBeenCalled());
    expect(view.container.querySelector('aside')?.textContent).toBe('');
    expect(card('TASK-1')).toBeInTheDocument();
  });
});
