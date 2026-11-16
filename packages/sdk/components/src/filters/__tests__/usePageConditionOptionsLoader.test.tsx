import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineEndpoint, menuPermission, type ApiResponse, type PageConditionCategory, type PageConditionOptionsResponse } from '@ap/contracts';
import { useMenuFetch } from '@ap/kernel';
import { PageConditionOptionsError, usePageConditionOptionsLoader } from '../usePageConditionOptionsLoader';

vi.mock('@ap/kernel', async importOriginal => ({ ...await importOriginal<typeof import('@ap/kernel')>(), useMenuFetch: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const spec = defineEndpoint<{ term: string }, PageConditionOptionsResponse>({ id: 'demo.options', menuId: 'demo', paramKeys: { term: true }, permission: menuPermission('demo:read'), requiresScope: true, context: {}, kinds: [], mergeTimeDomain: false });
const category: PageConditionCategory = { id: 'choices', label: { ko: '선택', en: 'Choices' }, kind: { type: 'multi', key: 'choice', options: { endpoint: spec.id } } };
const response: ApiResponse<PageConditionOptionsResponse> = { outcome: 'ok', data: { options: [] }, assessments: [], trust: null, correlationId: 'synthetic' };
describe('usePageConditionOptionsLoader', () => {
  it('forwards declared params and cancellation to useMenuFetch', async () => {
    const fetch = vi.fn().mockResolvedValue(response);
    vi.mocked(useMenuFetch).mockReturnValue({ ready: true, fetch });
    const { result } = renderHook(() => usePageConditionOptionsLoader(spec, { term: 'alpha' }));
    const { signal } = new AbortController();
    expect(result.current.ready).toBe(true);
    await expect(result.current.loadOptions(category, { signal })).resolves.toEqual(response.data);
    expect(fetch).toHaveBeenCalledWith({ term: 'alpha' }, signal);
  });
  it('refuses an endpoint outside the category declaration before fetching', async () => {
    const fetch = vi.fn();
    vi.mocked(useMenuFetch).mockReturnValue({ ready: true, fetch });
    const { result } = renderHook(() => usePageConditionOptionsLoader({ ...spec, id: 'other' }, { term: '' }));
    await expect(result.current.loadOptions(category, { signal: new AbortController().signal })).rejects.toThrow('endpoint does not match');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['forbidden', 'timeout', 'too_large', 'error'] as const)('preserves the %s envelope for the existing outcome renderer', async outcome => {
    const refused = { ...response, outcome, data: null };
    vi.mocked(useMenuFetch).mockReturnValue({ ready: false, fetch: vi.fn().mockResolvedValue(refused) });
    const { result } = renderHook(() => usePageConditionOptionsLoader(spec, { term: '' }));
    expect(result.current.ready).toBe(false);
    const error = await result.current.loadOptions(category, { signal: new AbortController().signal }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(PageConditionOptionsError);
    expect((error as PageConditionOptionsError).response).toEqual(refused);
  });
});
