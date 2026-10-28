import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sonner = vi.hoisted(() => {
  const toast = Object.assign(
    vi.fn(() => 'id-info'),
    {
      success: vi.fn(() => 'id-success'),
      error: vi.fn(() => 'id-error'),
      warning: vi.fn(() => 'id-warning'),
      custom: vi.fn(() => 7),
      dismiss: vi.fn(),
    },
  );
  return { toast };
});
vi.mock('sonner', () => sonner);

import { standaloneDashboardHost } from '@/test/host-adapters/features/home/standaloneHost';
import { tanstackHost } from '@/test/host-adapters/lib/host/tanstack-host';
import { HostSeamProvider, registerDefaultHost, useHostHere, useHostNotice } from '../host-seam';

const { toast } = sonner;

beforeEach(() => {
  for (const fn of Object.values(toast))
    if (typeof fn === 'function' && 'mockClear' in fn) fn.mockClear();
  toast.mockClear();
});

afterEach(() => {
  registerDefaultHost(tanstackHost);
});

describe.each([
  ['tanstackHost', tanstackHost],
  ['standaloneDashboardHost', standaloneDashboardHost],
])('%s notify', (_name, host) => {
  it.each([
    ['success', toast.success, 'id-success'],
    ['error', toast.error, 'id-error'],
    ['warning', toast.warning, 'id-warning'],
    ['info', toast, 'id-info'],
  ] as const)('shows a %s notice and returns the sonner id as a string', (tone, fn, id) => {
    expect(host.notify?.({ tone, message: '저장됨' })).toBe(id);
    expect(fn).toHaveBeenCalledWith('저장됨');
  });

  it('passes description, one action and the duration through', () => {
    const onAction = vi.fn();
    host.notify?.({
      tone: 'warning',
      message: '충돌',
      description: '다시 불러오세요',
      action: { label: '다시 불러오기', onAction },
      durationMs: 9000,
    });
    expect(toast.warning).toHaveBeenCalledWith('충돌', {
      description: '다시 불러오세요',
      action: { label: '다시 불러오기', onClick: onAction },
      duration: 9000,
    });
  });

  it('draws variant undo as UndoToast that owns the timer, and its action also dismisses', () => {
    const onAction = vi.fn();
    expect(
      host.notify?.({
        tone: 'success',
        message: 'VOC-1 Triage 확정됨',
        action: { label: '실행 취소', onAction },
        variant: 'undo',
      }),
    ).toBe('7');
    expect(toast.success).not.toHaveBeenCalled();
    const [render_, options] = toast.custom.mock.calls[0] as unknown as [
      (id: string) => React.ReactElement,
      { duration: number },
    ];
    expect(options).toEqual({ duration: Number.POSITIVE_INFINITY });

    const view = render(render_('toast-1'));
    expect(screen.getByText('VOC-1 Triage 확정됨')).toBeInTheDocument();
    act(() => screen.getByRole('button', { name: /실행 취소|Undo/ }).click());
    expect(onAction).toHaveBeenCalledOnce();
    expect(toast.dismiss).toHaveBeenCalledWith('toast-1');
    view.unmount();
  });

  it('dismisses by id, passing a numeric id back to sonner as a number', () => {
    host.dismiss?.('id-1');
    expect(toast.dismiss).toHaveBeenCalledWith('id-1');
    host.dismiss?.('7');
    expect(toast.dismiss).toHaveBeenCalledWith(7);
  });
});

describe('useHostNotice and useHostHere', () => {
  it('throw without a seam member', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bare = {
      canLink: () => true,
      Link: () => null,
      notifyError: vi.fn(),
      notifySuccess: vi.fn(),
    };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <HostSeamProvider value={bare}>{children}</HostSeamProvider>
    );
    expect(() => renderHook(() => useHostNotice(), { wrapper })).toThrow(
      'HostSeamProvider is missing',
    );
    expect(() => renderHook(() => useHostHere(), { wrapper })).toThrow(
      'HostSeamProvider is missing',
    );
    error.mockRestore();
  });

  it('useHostNotice returns the seam notify and dismiss', () => {
    const { result } = renderHook(() => useHostNotice());
    expect(result.current.notify).toBe(tanstackHost.notify);
    expect(result.current.dismiss).toBe(tanstackHost.dismiss);
  });
});

function routerAt(entry: string, probe: () => void) {
  const root = createRootRoute({
    component: function Probe() {
      probe();
      return null;
    },
  });
  const route = createRoute({ getParentRoute: () => root, path: '/vocs' });
  return createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [entry] }),
  });
}

describe('useHere', () => {
  it('is the router location as path + raw search + hash, and follows a navigation', async () => {
    let here = '';
    const router = routerAt('/vocs?view=inbox&q=123#top', () => {
      here = tanstackHost.useHere?.() ?? '';
    });
    render(<RouterProvider router={router} />);
    await vi.waitFor(() => expect(here).toBe('/vocs?view=inbox&q=123#top'));
    await act(async () => router.navigate({ href: '/vocs?view=triage' }));
    expect(here).toBe('/vocs?view=triage');
  });

  it('dashboard host reads the router location and is empty without a router', async () => {
    let here: string | undefined;
    const router = routerAt('/vocs?view=my', () => {
      here = standaloneDashboardHost.useHere?.() ?? '';
    });
    render(<RouterProvider router={router} />);
    await vi.waitFor(() => expect(here).toBe('/vocs?view=my'));
    await act(async () => router.navigate({ href: '/vocs?view=inbox' }));
    expect(here).toBe('/vocs?view=inbox');

    const bare = renderHook(() => standaloneDashboardHost.useHere?.() ?? '');
    expect(bare.result.current).toBe('');
  });
});
