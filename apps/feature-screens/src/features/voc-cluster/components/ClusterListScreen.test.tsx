import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClusterListScreen } from './ClusterListScreen';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const MS = '99999999-9999-4999-8999-999999999999';

const shell = vi.hoisted(() => ({
  props: null as null | {
    onSelect: (id: string) => void;
    onCloseDetail: (opts?: { reconcile?: boolean }) => void;
    selectedId: string | null;
    managedSystemId: string | undefined;
    renderDetail?: unknown;
  },
}));
const list = vi.hoisted(() => ({ items: [] as Array<{ id: string }> }));

vi.mock('@/features/voc-cluster/components/detail/VocClusterListShell', () => ({
  VocClusterListShell: (props: NonNullable<typeof shell.props>) => {
    shell.props = props;
    return <div data-testid="shell" />;
  },
}));
vi.mock('@/features/voc-cluster/hooks/useVocClusterList', () => ({
  useVocClusterList: () => ({ isSuccess: true, data: { items: list.items } }),
}));
vi.mock('@/lib/api/me', () => ({
  useMeBridge: () => ({ data: { actor: { role_level: 'viewer' } } }),
}));

const navigate = vi.fn();

function mount(search: Record<string, string>, renderDetail?: () => undefined) {
  const host: HostSeam = {
    canLink: () => true,
    Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
    useNavigate: () => navigate,
    useSearch: () => search,
  };
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <HostSeamProvider value={host}>
        <ClusterListScreen
          onCreated={vi.fn()}
          {...(renderDetail !== undefined ? { renderDetail } : {})}
        />
      </HostSeamProvider>
    </QueryClientProvider>,
  );
}

describe('ClusterListScreen selection through the host seam', () => {
  beforeEach(() => {
    navigate.mockClear();
    shell.props = null;
    list.items = [];
  });

  it('reads the selection and the scope from the host search', () => {
    mount({ selected: A, managedSystem: MS });
    expect(shell.props).toMatchObject({ selectedId: A, managedSystemId: MS });
  });

  it('selects by spreading the current search into the cluster path, as a push', () => {
    mount({ managedSystem: MS });
    act(() => shell.props?.onSelect(B));
    expect(navigate).toHaveBeenCalledWith(`/voc-clusters?managedSystem=${MS}&selected=${B}`);
  });

  it('closes by dropping selected: a push for a user close, a replace when reconciling', () => {
    mount({ managedSystem: MS, selected: A });
    act(() => shell.props?.onCloseDetail());
    expect(navigate).toHaveBeenLastCalledWith(`/voc-clusters?managedSystem=${MS}`, {
      replace: false,
    });
    act(() => shell.props?.onCloseDetail({ reconcile: true }));
    expect(navigate).toHaveBeenLastCalledWith(`/voc-clusters?managedSystem=${MS}`, {
      replace: true,
    });
  });

  it('defaults to the first row once, with replace, when the search has no selection', () => {
    list.items = [{ id: A }, { id: B }];
    mount({});
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(`/voc-clusters?selected=${A}`, { replace: true });
  });

  it('does not override a selection the search already carries', () => {
    list.items = [{ id: A }];
    mount({ selected: B });
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByTestId('shell')).toBeInTheDocument();
  });

  it('hands renderDetail to the shell only when the host gives one', () => {
    mount({ selected: A });
    expect(shell.props).not.toHaveProperty('renderDetail');
    const renderDetail = () => undefined;
    mount({ selected: A }, renderDetail);
    expect(shell.props?.renderDetail).toBe(renderDetail);
  });
});
