import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TaskDto } from '@ap/feature-shared';
import { TaskBoardColumn } from './TaskBoardColumn';

const droppableNodes = vi.hoisted(() => new Map<string, HTMLElement>());

vi.mock('@dnd-kit/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@dnd-kit/core')>()),
  useDroppable: ({ id }: { id: string }) => ({
    setNodeRef: (node: HTMLElement | null) => {
      if (node) droppableNodes.set(id, node);
    },
    isOver: false,
  }),
}));

afterEach(() => {
  cleanup();
  droppableNodes.clear();
});

describe('TaskBoardColumn', () => {
  it('registers its droppable inside the column scroller so both scroll axes stay reachable', async () => {
    const { getScrollableAncestors } =
      await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core');
    render(
      <div data-testid="board">
        <TaskBoardColumn
          id="backlog"
          label="Backlog"
          tasks={[]}
          groupBy="status"
          selectedId={null}
          selectTask={() => {}}
          names={{ systems: new Map(), actors: new Map() }}
          enabled
        />
      </div>,
    );
    const board = screen.getByTestId('board');
    const column = screen.getByLabelText('Backlog 열');
    const columnScroller = column.querySelector('.overflow-y-auto') as HTMLElement;
    // jsdom applies no Tailwind CSS; mirror the scroll styles the classes give in the browser.
    columnScroller.style.overflowY = 'auto';
    board.style.overflowX = 'auto';
    expect(getScrollableAncestors(droppableNodes.get('backlog') ?? null)).toEqual([
      columnScroller,
      board,
    ]);
  });

  it('shares the board width instead of a fixed 288px column', () => {
    render(
      <TaskBoardColumn
        id="backlog"
        label="Backlog"
        tasks={[]}
        groupBy="status"
        selectedId={null}
        selectTask={() => {}}
        names={{ systems: new Map(), actors: new Map() }}
        enabled
      />,
    );
    const column = screen.getByLabelText('Backlog 열');
    expect(column).toHaveAttribute('data-task-board-column');
    expect(column).toHaveClass('flex-1', 'basis-0', 'min-w-40');
    expect(column).not.toHaveClass('w-72');
    expect(column).not.toHaveClass('shrink-0');
  });
  it('keeps the identifier and the priority badge on one unbroken line; only the title wraps', () => {
    const task = {
      id: '50000000-0000-4000-8000-000000000001',
      workspace_id: '50000000-0000-4000-8000-0000000000aa',
      display_id: 'TASK-1000',
      title: '아주 긴 제목이 좁은 열에서 여러 줄로 감싸져도 식별자는 그대로여야 한다',
      primary_managed_system_id: '50000000-0000-4000-8000-0000000000bb',
      status: 'backlog',
      priority: 'medium',
      assignee_actor_id: null,
      assignee_team_id: null,
      due_date: null,
      analytics_area_id: null,
      milestone_id: null,
      source_task_request_id: null,
      created_by: '50000000-0000-4000-8000-0000000000cc',
      created_at: '2026-10-13T00:00:00.000Z',
      updated_at: '2026-10-13T00:00:00.000Z',
    } as unknown as TaskDto;
    render(
      <TaskBoardColumn
        id="backlog"
        label="Backlog"
        tasks={[task]}
        groupBy="status"
        selectedId={null}
        selectTask={() => {}}
        names={{ systems: new Map(), actors: new Map() }}
        enabled
      />,
    );
    const identifier = screen.getByText('TASK-1000');
    expect(identifier).toHaveClass('shrink-0', 'whitespace-nowrap');
    const badge = screen.getByLabelText(/^우선순위 /);
    expect(badge).toHaveClass('shrink-0', 'whitespace-nowrap');
    const title = screen.getByText(task.title);
    expect(title).not.toHaveClass('whitespace-nowrap');
    expect(title).not.toHaveClass('truncate');
  });
});
