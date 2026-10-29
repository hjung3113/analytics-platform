import type { TaskDto, TaskRequestDto } from '@ap/feature-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useTaskRequestLink } from './useTaskRequestLink';

const api = vi.hoisted(() => ({
  fetchPermissionCheck: vi.fn(),
  linkExistingTask: vi.fn(),
  listTasks: vi.fn(),
}));
const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }));

vi.mock('@/lib/api', () => ({
  fetchPermissionCheck: api.fetchPermissionCheck,
  linkExistingTask: api.linkExistingTask,
  listTasks: api.listTasks,
}));
vi.mock('@/lib/api/tasks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/tasks')>()),
  linkExistingTask: (...args: unknown[]) => api.linkExistingTask(...args),
  listTasks: (...args: unknown[]) => api.listTasks(...args),
}));
vi.mock('@/lib/api/permission-reads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/permission-reads')>()),
  fetchPermissionCheckViaClient: (...args: unknown[]) => api.fetchPermissionCheck(...args),
}));
vi.mock('sonner', () => ({ toast }));

const request = {
  id: '10000000-0000-0000-0000-000000000001',
  primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
  status: 'approved',
} as TaskRequestDto;
const task = { id: '50000000-0000-0000-0000-000000000005', display_id: 'TASK-901' } as TaskDto;

function LinkHarness() {
  const link = useTaskRequestLink({ item: request, currentRole: 'admin' });
  return (
    <button type="button" onClick={() => link.link(task.id)}>
      Link Task
    </button>
  );
}

describe('useTaskRequestLink', () => {
  it('shows a Korean success toast after linking a Task', async () => {
    api.linkExistingTask.mockResolvedValue(task);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <LinkHarness />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Link Task' }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Task TASK-901을 연결했습니다.'),
    );
  });
  it('keeps the picker open on a rerender with the same item object and closes it for a new object with an equal id', () => {
    api.fetchPermissionCheck.mockResolvedValue({ state: 'approved' });
    api.listTasks.mockResolvedValue({ items: [] });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderHook(
      ({ item }: { item: TaskRequestDto }) => useTaskRequestLink({ item, currentRole: 'admin' }),
      {
        initialProps: { item: request },
        wrapper: ({ children }: PropsWithChildren) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      },
    );
    act(() => result.current.setOpen(true));
    expect(result.current.open).toBe(true);

    rerender({ item: request });
    expect(result.current.open).toBe(true);

    rerender({ item: { ...request } });
    expect(result.current.open).toBe(false);
  });
});
