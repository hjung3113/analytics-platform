import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { type HostSeam, HostSeamProvider } from '../host-seam';
import type { HostSearch } from '../search';
import { useHostSearchWriter } from '../useHostSearchWriter';

const validate = (raw: HostSearch): Record<string, string | undefined> => ({ ...raw });

function setup(initial: HostSearch) {
  const navigate = vi.fn();
  let current = initial;
  const seam = {
    useSearch: () => current,
    useNavigate: () => navigate,
  } as unknown as HostSeam;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <HostSeamProvider value={seam}>{children}</HostSeamProvider>
  );
  const hook = renderHook(() => useHostSearchWriter('/vocs', validate), { wrapper });
  return {
    navigate,
    hook,
    // A host navigation: the seam hands a new search object.
    navigateHost: (next: HostSearch) => {
      current = next;
      hook.rerender();
    },
  };
}

describe('useHostSearchWriter', () => {
  it('folds a second write onto the first before the host acknowledges it', () => {
    const { navigate, hook } = setup({ view: 'triage', tab: 'unassigned', selected: 'a' });
    act(() => {
      hook.result.current.write((prev: Record<string, unknown>) => ({
        ...prev,
        tab: 'high',
        selected: undefined,
      }));
      hook.result.current.write((prev: Record<string, unknown>) => ({ ...prev, selected: 'b' }), {
        replace: true,
      });
    });
    expect(navigate).toHaveBeenNthCalledWith(1, '/vocs?view=triage&tab=high');
    expect(navigate).toHaveBeenNthCalledWith(2, '/vocs?view=triage&tab=high&selected=b', {
      replace: true,
    });
  });

  it('drops the pending fold on any host navigation', () => {
    const { navigate, hook, navigateHost } = setup({ view: 'triage', selected: 'a' });
    act(() =>
      hook.result.current.write((prev: Record<string, unknown>) => ({ ...prev, tab: 'high' })),
    );
    act(() => navigateHost({ view: 'triage', selected: 'a' }));
    act(() =>
      hook.result.current.write((prev: Record<string, unknown>) => ({ ...prev, selected: 'b' })),
    );
    expect(navigate).toHaveBeenLastCalledWith('/vocs?view=triage&selected=b');
  });
});
