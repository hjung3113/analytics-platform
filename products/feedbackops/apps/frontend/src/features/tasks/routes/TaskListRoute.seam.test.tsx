// TaskListRoute.seam.test.tsx — every URL write of the Task list through the host seam (#763 l): the
// complete FeedbackOps href, carried keys kept, absent means cleared, and the replace flag of the old
// router calls (replace only for the q draft and the panel close).

import { SEARCH_DEBOUNCE_MS } from '@/lib/forms/search-debounce';
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import type { TaskDto } from '@fops/shared';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@fops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskListScreen } from './TaskListScreen';

const MS = '30000000-0000-0000-0000-000000000003';
const AREA = '11111111-1111-4111-8111-111111111111';
const ME = '20000000-0000-0000-0000-000000000002';

const navigateMock = vi.hoisted(() => vi.fn());
const listTasksMock = vi.hoisted(() => vi.fn());
const getTaskMock = vi.hoisted(() => vi.fn());
let searchState: Record<string, string> = {};

vi.mock('@/lib/api/tasks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/tasks')>()),
  listTasks: (...args: unknown[]) => listTasksMock(...args),
  getTask: (...args: unknown[]) => getTaskMock(...args),
}));
vi.mock('@/lib/api/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/me')>()),
  useMeBridge: () => ({ data: { actor: { id: ME, role_level: 'admin' } } }),
}));
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [] }),
}));
vi.mock('@/lib/api/registry-reads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/registry-reads')>()),
  fetchManagedSystems: async () => ({ items: [] }),
}));
vi.mock('@/lib/useAnalyticsAreaFilterLabel', () => ({
  useAnalyticsAreaFilterLabel: () => 'Analytics Area: Revenue',
}));

function makeTask(n: number): TaskDto {
  return {
    id: `10000000-0000-0000-0000-00000000000${n}`,
    workspace_id: '90000000-0000-0000-0000-000000000009',
    display_id: `TASK-${n}`,
    primary_managed_system_id: MS,
    title: `Task ${n}`,
    status: 'backlog',
    priority: 'high',
    assignee_actor_id: ME,
    assignee_team_id: null,
    due_date: null,
    milestone_id: null,
    analytics_area_id: null,
    source_task_request_id: null,
    created_by: ME,
    created_at: '2026-07-10T00:00:00.000Z',
    updated_at: '2026-07-10T00:00:00.000Z',
  };
}
const FIRST = makeTask(1);
const SECOND = makeTask(2);

const SEAM: HostSeam = {
  canLink: () => true,
  Link: ({ to, children }) => <a href={to}>{children}</a>,
  notifyError: () => {},
  notifySuccess: () => {},
  useNavigate: () => navigateMock,
  useSearch: () => searchState,
};

function DetailSlotHost() {
  const { ref } = useDetailPanelSlotHost();
  return <div ref={ref} data-testid="slot" />;
}

const renderDetail = vi.fn(
  (taskId: string, { onClose }: { onClose: () => void }): ReactNode => (
    <button type="button" onClick={onClose}>
      {`상세 닫기 ${taskId}`}
    </button>
  ),
);

function mount(view: 'backlog' | 'my' = 'backlog', autoSelect = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <HostSeamProvider value={SEAM}>
        <DetailPanelSlotProvider>
          <TaskListScreen view={view} autoSelect={autoSelect} renderDetail={renderDetail} />
          <DetailSlotHost />
        </DetailPanelSlotProvider>
      </HostSeamProvider>
    </QueryClientProvider>,
  );
}

function written(index = -1) {
  const [href, options] = navigateMock.mock.calls.at(index) as [
    string,
    { replace?: boolean } | undefined,
  ];
  const url = new URL(href, 'http://feedbackops.local');
  return {
    path: url.pathname,
    search: Object.fromEntries(url.searchParams),
    replace: options?.replace === true,
  };
}

const CARRIED = {
  returnTo: '/home',
  platformReturn: 'https://p.example/x',
  view: 'backlog',
  managedSystem: MS,
};

beforeAll(() => {
  // jsdom lacks Pointer Capture; Radix Select's trigger path needs the stubs.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
});

beforeEach(() => {
  navigateMock.mockClear();
  renderDetail.mockClear();
  listTasksMock.mockReset();
  getTaskMock.mockReset();
  listTasksMock.mockResolvedValue({ items: [FIRST, SECOND], page: { total: 2, has_more: false } });
  getTaskMock.mockImplementation(async (id: string) => (id === SECOND.id ? SECOND : FIRST));
  searchState = { ...CARRIED };
});

describe('TaskListScreen URL writes', () => {
  it('commits a q draft as a replace with the complete search, trimmed', async () => {
    mount();
    const box = await screen.findByRole('searchbox');
    fireEvent.change(box, { target: { value: '  쿼리  ' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(written()).toEqual({
      path: '/tasks',
      search: { ...CARRIED, q: '쿼리' },
      replace: true,
    });
    expect(SEARCH_DEBOUNCE_MS).toBeGreaterThan(0);
  });

  it('drops q when the committed draft is empty and writes nothing when it is unchanged', async () => {
    searchState = { ...CARRIED, q: '쿼리' };
    mount();
    const box = await screen.findByRole('searchbox');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(navigateMock).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: '' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(written()).toEqual({ path: '/tasks', search: CARRIED, replace: true });
  });

  it('removes the first filter chip (Area) and keeps the others, as a push', async () => {
    searchState = { ...CARRIED, status: 'backlog', overdue: 'true', 'filter.analytics_area': AREA };
    mount();
    fireEvent.click((await screen.findAllByRole('button', { name: /제거/ }))[0] as HTMLElement);
    expect(written()).toEqual({
      path: '/tasks',
      search: { ...CARRIED, status: 'backlog', overdue: 'true' },
      replace: false,
    });
  });

  it('clears every list filter and keeps the carried keys', async () => {
    searchState = { ...CARRIED, q: 'x', status: 'backlog', overdue: 'true', param: FIRST.id };
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /모두 지우기|전체 해제|초기화/ }));
    expect(written()).toEqual({
      path: '/tasks',
      search: { ...CARRIED, param: FIRST.id },
      replace: false,
    });
  });

  it.each([
    ['전체 상태', {}],
    ['Todo·Doing·Review', { status_group: 'in-flight' }],
    ['Backlog', { status: 'backlog' }],
  ])('내 Task status %s replaces the status filter, as a push', async (option, expected) => {
    searchState = { ...CARRIED, view: 'my', status: 'review' };
    mount('my');
    await userEvent.click(await screen.findByRole('combobox', { name: 'Task 상태' }));
    await userEvent.click(await screen.findByRole('option', { name: new RegExp(option) }));
    expect(written()).toEqual({
      path: '/tasks',
      search: {
        returnTo: CARRIED.returnTo,
        platformReturn: CARRIED.platformReturn,
        view: 'my',
        managedSystem: MS,
        ...expected,
      },
      replace: false,
    });
  });

  it('a row click writes view and param as a push', async () => {
    mount();
    fireEvent.click(await screen.findByText('Task 2'));
    expect(written()).toEqual({
      path: '/tasks',
      search: { ...CARRIED, view: 'backlog', param: SECOND.id },
      replace: false,
    });
  });

  it("the host detail's onClose removes param as a replace", async () => {
    searchState = { ...CARRIED, param: SECOND.id };
    mount();
    fireEvent.click(await screen.findByRole('button', { name: `상세 닫기 ${SECOND.id}` }));
    expect(written()).toEqual({ path: '/tasks', search: CARRIED, replace: true });
  });
});

describe('TaskListScreen selection', () => {
  it('autoSelect false selects nothing and never calls renderDetail or navigate', async () => {
    mount('backlog', false);
    await screen.findByText('Task 1');
    expect(renderDetail).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('autoSelect true selects the first row without a navigate', async () => {
    mount('backlog', true);
    await screen.findByRole('button', { name: `상세 닫기 ${FIRST.id}` });
    expect(renderDetail.mock.calls[0]?.[0]).toBe(FIRST.id);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('renderDetail returning undefined leaves the detail slot empty', async () => {
    renderDetail.mockReturnValue(undefined);
    searchState = { ...CARRIED, param: SECOND.id };
    mount();
    await screen.findByText('Task 2');
    expect(renderDetail).toHaveBeenCalled();
    expect(screen.getByTestId('slot')).toBeEmptyDOMElement();
  });
});
