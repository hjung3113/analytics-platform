import { useState, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { useHostSeam } from '@/lib/host/host-seam';
import { mountAt, warmPages } from '../test-support';

/** The three FeedbackOps entries are doubles that record how the page drives them; the value check (FeedbackOps' real tasks-search schema) is not mocked. */
const fo = vi.hoisted(() => ({
  list: [] as { view: string; autoSelect: boolean; renderDetail: () => unknown }[],
  detailArgs: [] as Record<string, unknown>[],
  moved: vi.fn(),
  boardClose: vi.fn(),
  mounts: 0,
  requests: [] as { autoSelect: boolean }[],
  requestClose: vi.fn(),
  milestoneRenders: [] as ((parts: Record<string, unknown>) => ReactNode)[],
}));
vi.mock('@ap/feature-screens/operator-screens/task-list', () => ({
  TaskListScreen: (props: { view: string; autoSelect: boolean; renderDetail: () => unknown }) => {
    fo.list.push(props);
    const seam = useHostSeam();
    return <div data-testid="list" data-view={props.view} data-here={seam.useHere!()} />;
  },
}));
vi.mock('@ap/feature-screens/operator-screens/task-board', () => ({
  TaskBoardScreen: (props: { renderDetail: (id: string, options: Record<string, unknown>) => ReactNode }) => {
    const [selected, setSelected] = useState<string | null>(null);
    const seam = useHostSeam();
    return <div data-testid="board" data-here={seam.useHere!()}>
      <button type="button" onClick={() => setSelected(TASK_A)}>선택</button>
      {selected !== null && props.renderDetail(selected, { actorNamesById: new Map(), managedSystemNamesById: new Map(), hasActionFooter: true, onMoveToNextStatus: fo.moved, onClose: fo.boardClose })}
    </div>;
  },
}));
vi.mock('@ap/feature-screens/operator-screens/task-requests', () => ({
  TaskRequestsScreen: (props: { autoSelect: boolean; renderDetail: (parts: Record<string, unknown>) => ReactNode }) => {
    fo.requests.push(props);
    const seam = useHostSeam();
    const param = seam.useSearch!().param;
    return <div data-testid="requests" data-param={param ?? ''} data-here={seam.useHere!()}>
      {param !== undefined && props.renderDetail({ title: `요청 ${param}`, body: <p>요청 본문 {param}</p>, requestClose: fo.requestClose, displayId: 'TR-1' })}
    </div>;
  },
}));
vi.mock('@ap/feature-screens/operator-screens/milestones', () => ({
  MilestonesScreen: (props: { renderDetail: (parts: Record<string, unknown>) => ReactNode }) => {
    const [creating, setCreating] = useState(false);
    const seam = useHostSeam();
    const navigate = seam.useNavigate!();
    const param = seam.useSearch!().param;
    return <div data-testid="milestones" data-param={param ?? ''}>
      <button type="button" onClick={() => setCreating(true)}>Milestone 생성</button>
      {/* eslint-disable-next-line ap/no-hand-built-url -- a FeedbackOps href as the screen's dirty-decline restore passes it to the seam, not menu code building a link */}
      <button type="button" onClick={() => navigate('/tasks?view=milestones&param=m-1')}>복원</button>
      {creating && props.renderDetail({ kind: 'create', title: 'Milestone 생성', body: <p>생성 본문</p>, requestClose: fo.requestClose })}
      {!creating && param !== undefined && props.renderDetail({ kind: 'detail', title: `Milestone ${param}`, body: <p>Milestone 본문 {param}</p>, requestClose: fo.requestClose })}
    </div>;
  },
}));
vi.mock('@ap/feature-screens/operator-screens/task-detail', () => ({
  useWorkspaceActors: () => ({ actors: [{ id: 'actor-1', display_name: '김담당' }] }),
  useTaskManagedSystemNames: () => new Map([['sys-1', '시스템 하나']]),
  useTaskDetailParts: (args: { taskId: string; onClose: () => void; actorNamesById: ReadonlyMap<string, string>; hasActionFooter?: boolean; onMoveToNextStatus?: (id: string) => void }) => {
    const [instance] = useState(() => ++fo.mounts);
    fo.detailArgs.push({ ...args, actorName: args.actorNamesById.get('actor-1') });
    return {
      title: `Task ${args.taskId}`, body: <p data-instance={instance}>상세 본문 {args.taskId}</p>, requestClose: args.onClose, view: { kind: 'loading' },
      ...(args.onMoveToNextStatus !== undefined ? { footer: <button type="button" onClick={() => args.onMoveToNextStatus!(args.taskId)}>다음 상태로</button> } : {}),
    };
  },
}));

const SYSTEM = '33333333-3333-4333-8333-333333333333';
const TASK_A = '99999999-9999-4999-8999-99999999999a';
const TASK_B = '99999999-9999-4999-8999-99999999999b';
const request = vi.fn();

beforeAll(warmPages, 60_000);
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('fetch', request);
  fo.list.length = 0; fo.requests.length = 0; fo.requestClose.mockReset(); fo.detailArgs.length = 0; fo.mounts = 0; fo.moved.mockReset(); fo.boardClose.mockReset(); request.mockReset();
});
afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

const PAGES = [
  ['Task Requests', '/feedbackops/task-requests', 'requests'],
  ['Milestones', '/feedbackops/milestones', 'milestones'],
  ['Tasks', '/feedbackops/tasks', 'board'],
  ['내 Task', '/feedbackops/my-tasks', 'list'],
  ['Task 목록', '/feedbackops/tasks/list', 'list'],
] as const;

describe.each(PAGES)('%s without a FeedbackOps API (mock preview)', (_name, path, testId) => {
  it('shows 실서버 필요 and mounts no screen', async () => {
    mountAt(path);
    await screen.findByRole('heading', { name: _name }, { timeout: 3000 });
    expect(screen.getByRole('status').textContent).toContain('실서버 필요');
    expect(screen.queryByTestId(testId)).toBeNull();
  });
});

describe.each([['내 Task', '/feedbackops/fo-my-tasks', 'my'], ['Task 목록', '/feedbackops/fo-task-list', 'backlog']] as const)('%s through the FeedbackOps bridge', (_name, path, view) => {
  beforeEach(() => { setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() }); });

  it(`mounts the list with view ${view}, no auto-select and no detail node for FO's ListShell`, async () => {
    mountAt(`${path}?q=pump&managedSystem=${SYSTEM}`);
    const list = await screen.findByTestId('list');
    expect(list.getAttribute('data-view')).toBe(view);
    expect(fo.list.at(-1)).toMatchObject({ view, autoSelect: false });
    expect(fo.list.at(-1)!.renderDetail()).toBeUndefined();
    const here = new URL(list.getAttribute('data-here')!, 'http://x');
    expect(here.pathname).toBe('/tasks');
    expect(Object.fromEntries(here.searchParams)).toEqual({ view, q: 'pump', managedSystem: SYSTEM });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fo.detailArgs).toEqual([]);
  });

  it('opens the Task detail in the shell detail slot on focus, with the name maps, remounting per Task', async () => {
    mountAt(`${path}?focus=${TASK_A}`);
    const aside = await screen.findByRole('complementary', { name: '상세 패널' });
    const dialog = await within(aside).findByRole('dialog');
    expect(within(dialog).getByText(`상세 본문 ${TASK_A}`).getAttribute('data-instance')).toBe('1');
    // One tab draws no tab row (06 §13, #886 UX-8).
    expect(within(dialog).queryByRole('tablist', { name: '상세 탭' })).toBeNull();
    expect(fo.detailArgs.at(-1)).toMatchObject({ taskId: TASK_A, view, actorName: '김담당' });
    window.history.replaceState(null, '', `${path}?focus=${TASK_B}`);
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect((await screen.findByText(`상세 본문 ${TASK_B}`)).getAttribute('data-instance')).toBe('2');
  });

  it('closing the drawer removes focus, keeps the rest and returns focus to the opener', async () => {
    render(<button type="button">열기</button>);
    const opener = screen.getByRole('button', { name: '열기' });
    opener.focus();
    mountAt(`${path}?q=pump`);
    await screen.findByTestId('list');
    window.history.replaceState(null, '', `${path}?q=pump&focus=${TASK_A}`);
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    fireEvent.click(await screen.findByRole('button', { name: '상세 닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const params = new URLSearchParams(window.location.search);
    expect(params.has('focus')).toBe(false);
    expect(params.get('q')).toBe('pump');
    expect(document.activeElement).toBe(opener);
  });
});

describe('Task Requests through the FeedbackOps bridge', () => {
  beforeEach(() => { setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() }); });

  it('mounts the queue without auto-select, reading the page as the FO requests path', async () => {
    mountAt(`/feedbackops/task-requests?reviewer=me&managedSystem=${SYSTEM}`);
    const screenNode = await screen.findByTestId('requests');
    expect(fo.requests.at(-1)).toMatchObject({ autoSelect: false });
    const here = new URL(screenNode.getAttribute('data-here')!, 'http://x');
    expect(here.pathname).toBe('/tasks');
    expect(Object.fromEntries(here.searchParams)).toEqual({ view: 'requests', reviewer: 'me', managedSystem: SYSTEM });
  });

  it('reads focus as the screen param and renders the panel parts in the shell slot; its close is requestClose', async () => {
    mountAt(`/feedbackops/task-requests?focus=${TASK_A}`);
    expect((await screen.findByTestId('requests')).getAttribute('data-param')).toBe(TASK_A);
    const dialog = await within(await screen.findByRole('complementary', { name: '상세 패널' })).findByRole('dialog');
    expect(within(dialog).getByText(`요청 본문 ${TASK_A}`)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '상세 닫기' }));
    expect(fo.requestClose).toHaveBeenCalledOnce();
    // The drawer never writes focus itself: the screen clears `param` through the seam.
    expect(new URLSearchParams(window.location.search).get('focus')).toBe(TASK_A);
  });
});

describe('Milestones through the FeedbackOps bridge', () => {
  beforeEach(() => { setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() }); });

  it('renders the detail parts on focus and the create parts of Milestone 생성 in the shell slot', async () => {
    mountAt('/feedbackops/milestones?focus=m-1');
    const aside = await screen.findByRole('complementary', { name: '상세 패널' });
    expect(await within(aside).findByText('Milestone 본문 m-1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Milestone 생성' }));
    expect(await within(aside).findByText('생성 본문')).toBeTruthy();
    fireEvent.click(within(aside).getByRole('button', { name: '상세 닫기' }));
    expect(fo.requestClose).toHaveBeenCalledOnce();
  });

  it('moves focus when the screen navigates to a Milestone href (the dirty-decline restore)', async () => {
    mountAt('/feedbackops/milestones?managedSystem=' + SYSTEM);
    fireEvent.click(await screen.findByRole('button', { name: '복원' }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('focus')).toBe('m-1'));
    expect(new URLSearchParams(window.location.search).get('managedSystem')).toBe(SYSTEM);
  });
});

describe('Tasks board through the FeedbackOps bridge', () => {
  beforeEach(() => { setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() }); });

  it('mounts the board with the page read as the FO board path', async () => {
    mountAt(`/feedbackops/tasks?publicUpdate=missing&managedSystem=${SYSTEM}`);
    const here = new URL((await screen.findByTestId('board')).getAttribute('data-here')!, 'http://x');
    expect(here.pathname).toBe('/tasks');
    expect(Object.fromEntries(here.searchParams)).toEqual({ view: 'board', public_update: 'missing', managedSystem: SYSTEM });
  });

  it('renders the Task detail the screen asks for in place, in the slot, with the next-status footer, and moves through the screen', async () => {
    mountAt('/feedbackops/tasks');
    fireEvent.click(await screen.findByRole('button', { name: '선택' }));
    const dialog = await within(await screen.findByRole('complementary', { name: '상세 패널' })).findByRole('dialog');
    expect(within(dialog).getByText(`상세 본문 ${TASK_A}`)).toBeTruthy();
    expect(fo.detailArgs.at(-1)).toMatchObject({ taskId: TASK_A, view: 'board', hasActionFooter: true, actorName: undefined });
    fireEvent.click(within(dialog).getByRole('button', { name: '다음 상태로' }));
    expect(fo.moved).toHaveBeenCalledWith(TASK_A);
  });

  it('closes through the screen (its onClose), not by writing focus itself', async () => {
    mountAt('/feedbackops/tasks');
    fireEvent.click(await screen.findByRole('button', { name: '선택' }));
    fireEvent.click(await screen.findByRole('button', { name: '상세 닫기' }));
    expect(fo.boardClose).toHaveBeenCalledOnce();
  });
});

const REJECTED = [
  ['Task Requests', '/feedbackops/task-requests', 'requests', 'reviewer', 'x'],
  ['Task Requests', '/feedbackops/task-requests', 'requests', 'reviewerTeam', 'x'],
  ['Milestones', '/feedbackops/milestones', 'milestones', 'managedSystem', 'x'],
  ['Tasks', '/feedbackops/tasks', 'board', 'publicUpdate', 'x'],
  ['Tasks', '/feedbackops/tasks', 'board', 'managedSystem', 'x'],
  ['내 Task', '/feedbackops/my-tasks', 'list', 'publicUpdate', 'x'],
  ['내 Task', '/feedbackops/my-tasks', 'list', 'managedSystem', 'x'],
  ['내 Task', '/feedbackops/my-tasks', 'list', 'status', 'bogus'],
  ['Task 목록', '/feedbackops/tasks/list', 'list', 'status', 'bogus'],
  ['Task 목록', '/feedbackops/tasks/list', 'list', 'managedSystem', 'x'],
] as const;

describe('Task pages with an invalid address value', () => {
  beforeEach(() => { setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() }); });

  it.each(REJECTED)('%s (%s) rejects an invalid %s, keeps the address and requests nothing', async (_name, path, testId, key, value) => {
    const search = `?${key}=${encodeURIComponent(value)}`;
    mountAt(`${path}${search}`);
    expect(await screen.findByText(`주소의 ${key} 값이 올바르지 않습니다`, undefined, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByTestId(testId)).toBeNull();
    expect(fo.list).toEqual([]);
    expect(fo.detailArgs).toEqual([]);
    expect(request).not.toHaveBeenCalled();
    expect(window.location.search).toBe(search);
  });

  it('clears only the rejected key, then mounts the screen with the other keys kept', async () => {
    mountAt(`/feedbackops/tasks?publicUpdate=x&q=pump`);
    fireEvent.click(await screen.findByRole('button', { name: '값 지우기' }, { timeout: 3000 }));
    expect(await screen.findByTestId('board')).toBeTruthy();
    const params = new URLSearchParams(window.location.search);
    expect(params.has('publicUpdate')).toBe(false);
    expect(params.get('q')).toBe('pump');
  });

  it('mounts the board when only an extra key (status, not a board key) is invalid', async () => {
    mountAt('/feedbackops/tasks?status=bogus');
    expect(await screen.findByTestId('board')).toBeTruthy();
  });
});
