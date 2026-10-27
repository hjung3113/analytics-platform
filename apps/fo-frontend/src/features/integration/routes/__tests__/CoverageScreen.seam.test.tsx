// CoverageScreen.seam.test.tsx — every URL write and every outbound link of Coverage through the host seam (#762 c):
// the complete FeedbackOps href, absent means cleared, push (no replace flag), `canLink` deciding link versus
// non-link, and no workspace.admin request when the settings target cannot link (P11).

import { type HostLinkProps, type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { areaReportFixture } from '../../../../../tests/visual/fixtures/area-report';
import {
  COVERAGE_IDS as IDS,
  coverageAnalyticsAreasFixture,
  coverageManagedSystemsFixture,
  coverageSummaryFixture,
} from '../../../../../tests/visual/fixtures/coverage';
import { CoverageScreen } from '../CoverageScreen';

const SETTINGS = '/admin/settings#coverage';
const FINDINGS_HOP = '/findings?execution=none';
const PERMISSION_HOP = '/admin/permissions/requests';

const navigated: Array<{ href: string; options: { replace?: boolean } | undefined }> = [];
const requests: URL[] = [];
let linkable: (to: string) => boolean = () => true;
let role: 'admin' | 'user' = 'admin';
let permissionState: 'approved' | 'rejected' = 'approved';

const SearchContext = React.createContext<Record<string, string>>({});

function AnchorLink({ to, children, ref, ...rest }: HostLinkProps) {
  return (
    <a href={to} ref={ref as React.Ref<HTMLAnchorElement>} {...rest}>
      {children}
    </a>
  );
}

function Harness({
  initial,
  children,
}: { initial: Record<string, string>; children: React.ReactNode }) {
  const [search, setSearch] = React.useState(initial);
  const navigate = React.useCallback((href: string, options?: { replace?: boolean }) => {
    navigated.push({ href, options });
    setSearch(Object.fromEntries(new URL(href, 'http://feedbackops.local').searchParams));
  }, []);
  const seam = React.useMemo<HostSeam>(
    () => ({
      canLink: (to) => linkable(to),
      Link: AnchorLink,
      notifyError: () => {},
      notifySuccess: () => {},
      useNavigate: () => navigate,
      useSearch: () => React.useContext(SearchContext),
    }),
    [navigate],
  );
  return (
    <SearchContext.Provider value={search}>
      <HostSeamProvider value={seam}>{children}</HostSeamProvider>
    </SearchContext.Provider>
  );
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input, 'http://localhost');
      requests.push(url);
      if (url.pathname === '/me/permissions/check')
        return json({
          state: permissionState,
          decision: { allow: permissionState === 'approved' },
        });
      if (url.pathname === '/me')
        return json({
          workspace_id: IDS.workspace,
          actor: {
            id: IDS.systemB,
            role_level: role,
            email: 'a@example.test',
            external_id: 'a',
            display_name: 'A',
          },
        });
      if (url.pathname === '/dashboard/summary') return json(coverageSummaryFixture);
      if (url.pathname === '/dashboard/analytics-areas') return json(areaReportFixture);
      if (url.pathname === '/managed-systems') return json(coverageManagedSystemsFixture);
      if (url.pathname === '/analytics-areas') return json(coverageAnalyticsAreasFixture);
      return json({ code: 'internal.unexpected', message: input }, 500);
    }),
  );
}

async function mount(initial: Record<string, string> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harness initial={initial}>
        <CoverageScreen />
      </Harness>
    </QueryClientProvider>,
  );
  await screen.findByTestId('integration-coverage');
}

function written(index = -1) {
  const entry = navigated.at(index);
  if (entry === undefined) throw new Error('nothing was written');
  const url = new URL(entry.href, 'http://feedbackops.local');
  return {
    path: url.pathname,
    search: Object.fromEntries(url.searchParams),
    replace: entry.options?.replace === true,
  };
}

async function pickSystem(name: string) {
  fireEvent.click(screen.getByTestId('coverage-filter-button'));
  fireEvent.keyDown(screen.getByTestId('coverage-filter-managed-system'), { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('option', { name }));
}

const permissionChecks = () => requests.filter((url) => url.pathname === '/me/permissions/check');

beforeAll(() => {
  // jsdom lacks Pointer Capture; Radix Select's trigger path needs the stubs.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
});

beforeEach(() => {
  navigated.length = 0;
  requests.length = 0;
  linkable = () => true;
  role = 'admin';
  permissionState = 'approved';
  stubFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CoverageScreen writes through the host seam', () => {
  it('the areas tab adds view and keeps the rest', async () => {
    await mount({ managedSystem: IDS.systemA });
    await act(async () => {
      fireEvent.mouseDown(screen.getByRole('tab', { name: 'Analytics Area별 현황' }));
    });
    expect(written()).toEqual({
      path: '/integration/coverage',
      search: { managedSystem: IDS.systemA, view: 'areas' },
      replace: false,
    });
  });

  it('the overview tab drops view, area and cursor and keeps managedSystem', async () => {
    await mount({
      view: 'areas',
      'filter.analytics_area': IDS.areaA,
      cursor: 'page-2',
      managedSystem: IDS.systemA,
    });
    await act(async () => {
      fireEvent.mouseDown(screen.getByRole('tab', { name: '개요' }));
    });
    expect(written()).toEqual({
      path: '/integration/coverage',
      search: { managedSystem: IDS.systemA },
      replace: false,
    });
  });

  it('the next page adds the cursor', async () => {
    await mount({ view: 'areas', managedSystem: IDS.systemA });
    fireEvent.click(await screen.findByRole('button', { name: '다음' }));
    expect(written().search).toEqual({
      view: 'areas',
      managedSystem: IDS.systemA,
      cursor: 'page-2',
    });
  });

  it('the area select sets the area and drops the cursor', async () => {
    await mount({ view: 'areas', managedSystem: IDS.systemA, cursor: 'old' });
    fireEvent.click(screen.getByTestId('coverage-filter-button'));
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Analytics Area' }), {
      key: 'ArrowDown',
    });
    fireEvent.click(await screen.findByRole('option', { name: '성장 지표' }));
    expect(written().search).toEqual({
      view: 'areas',
      managedSystem: IDS.systemA,
      'filter.analytics_area': IDS.areaA,
    });
  });

  it.each([
    ['uuid area, other system', IDS.areaA, 'Data Warehouse', { managedSystem: IDS.systemB }],
    [
      'unset area, other system',
      'unset',
      'Data Warehouse',
      { managedSystem: IDS.systemB, 'filter.analytics_area': 'unset' },
    ],
    [
      'uuid area, all systems',
      IDS.areaA,
      '전체 Managed System',
      { 'filter.analytics_area': IDS.areaA },
    ],
  ])('a system switch with a %s', async (_name, area, option, expected) => {
    await mount({
      view: 'areas',
      managedSystem: IDS.systemA,
      'filter.analytics_area': area,
      cursor: 'old',
    });
    await pickSystem(option);
    expect(written().search).toEqual({ view: 'areas', ...expected });
    expect(written().replace).toBe(false);
  });
});

describe('CoverageScreen links go through canLink and the seam Link', () => {
  it('renders a hop as the seam Link when linkable and as a plain, href-less row when not', async () => {
    linkable = (to) => to !== FINDINGS_HOP && to !== PERMISSION_HOP;
    await mount();
    await screen.findByTestId('coverage-row-voc-task');
    expect(screen.getByTestId('coverage-row-voc-task')).toHaveAttribute(
      'href',
      '/vocs?view=inbox&tab=no-task',
    );
    const unlinkedRow = screen.getByTestId('coverage-row-finding-execution');
    expect(unlinkedRow).not.toHaveAttribute('href');
    expect(unlinkedRow.closest('a[href]')).toBeNull();
    expect(
      screen.getByTestId('coverage-queue-row-permission-requests-pending'),
    ).not.toHaveAttribute('href');
    expect(screen.getByTestId('coverage-queue-row-high-severity-unlinked')).toHaveAttribute('href');
  });

  it('gives the seam Link the hop as its to when linkable', async () => {
    await mount();
    await screen.findByTestId('coverage-row-finding-execution');
    expect(screen.getByTestId('coverage-row-finding-execution')).toHaveAttribute(
      'href',
      FINDINGS_HOP,
    );
    expect(screen.getByTestId('coverage-queue-row-permission-requests-pending')).toHaveAttribute(
      'href',
      PERMISSION_HOP,
    );
  });
});

describe('CoverageScreen P11: the admin read follows the settings link', () => {
  it('asks no permission and shows no settings link when the target cannot link', async () => {
    linkable = (to) => to !== SETTINGS;
    await mount();
    await screen.findByTestId('coverage-row-voc-task');
    await screen.findByTestId('coverage-by-system');
    expect(permissionChecks()).toHaveLength(0);
    expect(screen.queryByTestId('coverage-settings-link')).toBeNull();
  });

  it('asks once and links the settings page when the target can link and the check is approved', async () => {
    await mount();
    const link = await screen.findByTestId('coverage-settings-link');
    expect(link).toHaveAttribute('href', SETTINGS);
    await waitFor(() => expect(permissionChecks()).toHaveLength(1));
    expect(permissionChecks()[0]?.searchParams.get('capability')).toBe('workspace.admin');
  });
});
