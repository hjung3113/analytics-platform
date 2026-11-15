import type { TaskDto, TaskRequestDto } from '@ap/feature-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchAllTaskRequests, listAllTasks } from '../list-all';

const api = vi.hoisted(() => ({ listTasks: vi.fn(), fetchTaskRequests: vi.fn() }));
vi.mock('../tasks', () => ({ listTasks: api.listTasks }));
vi.mock('../task-requests', () => ({ fetchTaskRequests: api.fetchTaskRequests }));

const task = (id: string) => ({ id }) as TaskDto;
const request = (id: string) => ({ id }) as TaskRequestDto;

beforeEach(() => {
  api.listTasks.mockReset();
  api.fetchTaskRequests.mockReset();
});

describe('listAllTasks', () => {
  it('returns a single page as the server sent it, asking for the page cap', async () => {
    api.listTasks.mockResolvedValue({ items: [task('a')], page: { has_more: false, total: 1 } });
    await expect(listAllTasks({ status_group: 'open' })).resolves.toEqual({
      items: [task('a')],
      page: { has_more: false, total: 1 },
    });
    expect(api.listTasks).toHaveBeenCalledTimes(1);
    expect(api.listTasks).toHaveBeenCalledWith({ status_group: 'open', limit: 100 });
  });

  it('follows the cursor until the last page and merges the items in order', async () => {
    api.listTasks
      .mockResolvedValueOnce({ items: [task('a')], page: { has_more: true, cursor: 'c1', total: 3 } })
      .mockResolvedValueOnce({ items: [task('b')], page: { has_more: true, cursor: 'c2' } })
      .mockResolvedValueOnce({ items: [task('c')], page: { has_more: false } });
    const all = await listAllTasks({ milestone_id: 'm' });
    expect(all.items.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(all.page).toEqual({ has_more: false, total: 3 });
    expect(api.listTasks.mock.calls.map(([options]) => options.cursor)).toEqual([
      undefined,
      'c1',
      'c2',
    ]);
  });

  it('rejects when a later page fails instead of returning a truncated set', async () => {
    api.listTasks
      .mockResolvedValueOnce({ items: [task('a')], page: { has_more: true, cursor: 'c1' } })
      .mockRejectedValueOnce(new Error('boom'));
    await expect(listAllTasks()).rejects.toThrow('boom');
  });
});

describe('fetchAllTaskRequests', () => {
  it('follows the cursor and merges every page', async () => {
    api.fetchTaskRequests
      .mockResolvedValueOnce({ items: [request('a')], page: { has_more: true, cursor: 'c1' } })
      .mockResolvedValueOnce({ items: [request('b')], page: { has_more: false } });
    const all = await fetchAllTaskRequests({ status: 'pending_review' });
    expect(all.items.map((item) => item.id)).toEqual(['a', 'b']);
    expect(api.fetchTaskRequests).toHaveBeenLastCalledWith({
      status: 'pending_review',
      limit: 100,
      cursor: 'c1',
    });
  });
});
