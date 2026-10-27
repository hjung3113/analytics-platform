// Managed System, Analytics Area and workspace settings draw their own PageShell title standalone; under a host that owns the title (the platform page head) they do not (#764 p2, D8).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HostSeamProvider, useHostSeam } from '@/lib/host/host-seam';

vi.mock('../permissions/permission-gate.js', () => ({ PermissionGate: () => null }));
vi.mock('../settings/use-workspace-settings.js', () => ({
  useWorkspaceSettings: () => ({ data: undefined, isPending: true }),
  useUpdateWorkspaceSettings: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
}));

import { AnalyticsAreasAdminPage } from '../analytics-areas/AnalyticsAreasScreen';
import { ManagedSystemsAdminPage } from '../managed-systems/ManagedSystemsScreen';
import { WorkspaceSettingsScreen } from '../settings/WorkspaceSettingsScreen';

afterEach(cleanup);

const NO_SEARCH = {};
const noNavigate = () => {};
const useNoSearch = () => NO_SEARCH;
const useNoNavigate = () => noNavigate;
const useHere = () => '/admin';

function Host({ hostOwnsTitle, children }: { hostOwnsTitle: boolean; children: ReactElement }) {
  const base = useHostSeam();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <HostSeamProvider
        value={{
          ...base,
          useSearch: useNoSearch,
          useNavigate: useNoNavigate,
          useHere,
          hostOwnsTitle,
        }}
      >
        {children}
      </HostSeamProvider>
    </QueryClientProvider>
  );
}

describe('admin screen titles', () => {
  it.each([
    ['Managed System', () => <ManagedSystemsAdminPage />],
    ['Analytics Area', () => <AnalyticsAreasAdminPage />],
    ['워크스페이스 설정', () => <WorkspaceSettingsScreen />],
  ])('%s: drawn standalone, absent when the host owns the title', (title, screenEl) => {
    const standalone = render(<Host hostOwnsTitle={false}>{screenEl()}</Host>);
    expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    standalone.unmount();
    render(<Host hostOwnsTitle>{screenEl()}</Host>);
    expect(screen.queryByRole('heading', { name: title })).toBeNull();
  });
});
