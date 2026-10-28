import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/admin/permissions/permission-gate', () => ({
  PermissionGate: ({ capability, children }: { capability: string; children: ReactNode }) => (
    <div data-testid="permission-gate" data-capability={capability}>
      {children}
    </div>
  ),
}));
vi.mock('@/features/admin/permissions/permission-grants-screen', () => ({
  PermissionGrantsScreen: () => <div data-testid="permission-grants-screen" />,
}));

import { validatePermissionGrantsSearch } from '@/features/admin/permissions/permission-grants-search';
import { PermissionGrantsConsolePage } from '@/test/admin-host/screens';

const ID = '11111111-1111-4111-8111-111111111111';

describe('/admin/permissions/grants route', () => {
  it('validates only the deny tab and UUID selection', () => {
    expect(validatePermissionGrantsSearch({ tab: 'grants', selected: ID })).toEqual({
      selected: ID,
    });
    expect(validatePermissionGrantsSearch({ tab: 'denies', selected: ID })).toEqual({
      tab: 'denies',
      selected: ID,
    });
    expect(validatePermissionGrantsSearch({ tab: 'unknown', selected: 'bad' })).toEqual({});
  });

  it('renders the screen inside the workspace.admin PermissionGate', () => {
    render(<PermissionGrantsConsolePage />);

    expect(screen.getByTestId('permission-gate')).toHaveAttribute(
      'data-capability',
      'workspace.admin',
    );
    expect(screen.getByTestId('permission-grants-screen')).toBeInTheDocument();
  });
});
