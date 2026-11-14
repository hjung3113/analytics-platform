import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchManagedSystems } from '../registry-reads';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('../client', () => ({ apiRequest }));

beforeEach(() => apiRequest.mockReset());

describe('Managed System catalog pagination', () => {
  it.each([undefined, 500])('reads beyond the first page (page size %s)', async (limit) => {
    const signal = new AbortController().signal;
    apiRequest
      .mockResolvedValueOnce({ data: { items: [{ id: 'system-a' }], total: 3 } })
      .mockResolvedValueOnce({ data: { items: [{ id: 'system-b' }], total: 3 } })
      .mockResolvedValueOnce({ data: { items: [{ id: 'system-c' }], total: 3 } });
    const result = await fetchManagedSystems({ includeArchived: true, signal, ...(limit ? { limit } : {}) });
    expect(result).toEqual({ items: [{ id: 'system-a' }, { id: 'system-b' }, { id: 'system-c' }], total: 3 });
    const urls = apiRequest.mock.calls.map((call) => new URL(String(call[1]), 'https://example.test'));
    expect(urls.map((url) => url.searchParams.get('offset'))).toEqual([null, '1', '2']);
    expect(urls.every((url) => url.searchParams.get('include_archived') === 'true')).toBe(true);
    expect(apiRequest.mock.calls.every((call) => call[3].signal === signal)).toBe(true);
  });

  it('rejects a later failure rather than returning a partial catalog', async () => {
    apiRequest.mockResolvedValueOnce({ data: { items: [{ id: 'system-a' }], total: 2 } })
      .mockRejectedValueOnce(new Error('catalog unavailable'));
    await expect(fetchManagedSystems()).rejects.toThrow('catalog unavailable');
  });

  it('rejects an empty intermediate page instead of silently truncating', async () => {
    apiRequest.mockResolvedValueOnce({ data: { items: [], total: 1 } });
    await expect(fetchManagedSystems()).rejects.toThrow();
  });
});
