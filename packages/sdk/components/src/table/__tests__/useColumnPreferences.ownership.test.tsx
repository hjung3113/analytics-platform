import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PreferenceController } from '@ap/kernel';
import { useColumnPreferences } from '../useColumnPreferences';

let controller: PreferenceController | null = null;
const loading = { status: 'loading', failure: null, version: 0 } as const;
vi.mock('@ap/kernel', async original => ({
  ...await original<typeof import('@ap/kernel')>(),
  usePlatformOptional: () => ({ session: { user: { id: 'alice' } } }),
  usePreferenceController: () => controller,
  usePreferenceState: () => loading,
}));
function generation(): PreferenceController {
  return {
    state: () => loading, subscribe: () => () => {}, get: () => undefined,
    set: vi.fn(), remove: vi.fn(), tableKey: async () => null, setTable: vi.fn(),
    start: vi.fn(), stop: vi.fn(), retry: vi.fn(),
  };
}
afterEach(() => { cleanup(); controller = null; });

describe('column edit ownership before persistence effects', () => {
  it.each(['width', 'visibility'] as const)('sends the batched %s edit only to its original controller generation', edit => {
    const original = generation();
    const replacement = generation();
    controller = original;
    const { result, rerender } = renderHook(() => useColumnPreferences('table'));
    act(() => {
      if (edit === 'width') result.current.onColumnSizingChange({ a: 177 });
      else result.current.onColumnVisibilityChange({ a: false });
      controller = replacement;
      rerender();
    });
    expect(original.setTable).toHaveBeenCalledExactlyOnceWith('table', expect.objectContaining(
      edit === 'width' ? { sizing: { a: 177 } } : { visibility: { a: false } },
    ));
    expect(replacement.setTable).not.toHaveBeenCalled();
    expect(result.current.preferences.sizing).toEqual({});
    expect(result.current.preferences.visibility).toEqual({});
  });
});
