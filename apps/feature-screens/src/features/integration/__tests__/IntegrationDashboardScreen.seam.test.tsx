import { HOME_QUEUE_COPY } from '@/lib/copy/home';
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import {
  RECOVERY_VISUAL_ID,
  recoveryVisualDetail,
  recoveryVisualList,
} from '@/test/fixtures/recovery';
import { DetailPanelSlotProvider } from '@ap/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RecoveryPanelParts } from '../recovery/RecoveryPanel';
import { IntegrationDashboardScreen } from '../routes/IntegrationDashboardScreen';

const SYSTEM = '11111111-1111-4111-8111-111111111111';
const SOURCE = '22222222-2222-4222-8222-222222222222';
const HERE = '/integration?category=unassigned-voc';
const time = '2026-07-20T08:00:00.000Z';

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

const actor = {
  id: SYSTEM,
  external_id: 'ext-admin',
  email: 'admin@example.com',
  display_name: '관리자',
  role_level: 'admin',
};

const summary = {
  computed_at: time,
  kpis: {},
  action_queues: [
    {
      id: 'unassigned-voc',
      severity: 'warn',
      count: 0,
      next_action: { label: 'VOC 담당자 배정', route: '/vocs?view=triage', intent: 'triage' },
      secondary_action: null,
    },
  ],
  coverage: [],
  by_managed_system: [],
};

type Calls = { path: string; method: string }[];
function installFetch(
  options: {
    patchStatus?: number;
    listCursorError?: boolean;
    actions?: boolean;
    queueCount?: number;
  } = {},
) {
  const calls: Calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input, 'http://localhost');
      const method = init?.method ?? 'GET';
      calls.push({ path: url.pathname, method });
      if (url.pathname === '/me') return response({ actor, workspace_id: SYSTEM });
      if (url.pathname === '/dashboard/summary')
        return response({
          ...summary,
          action_queues: summary.action_queues.map((q) => ({
            ...q,
            count: options.queueCount ?? 0,
          })),
        });
      if (url.pathname === '/managed-systems') return response({ items: [] });
      if (url.pathname === '/dashboard/recovery-items') {
        if (options.listCursorError === true && url.searchParams.has('cursor'))
          return response({ code: 'validation.failed', message: 'bad cursor' }, 422);
        return response(recoveryVisualList('active'));
      }
      if (method === 'PATCH')
        return response({ code: 'internal.unexpected' }, options.patchStatus ?? 500);
      if (url.pathname === `/dashboard/recovery-items/${RECOVERY_VISUAL_ID}`)
        return response({
          ...recoveryVisualDetail(),
          ...(options.actions === false ? { next_actions: [] } : {}),
        });
      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    }),
  );
  return calls;
}

function record(href: string) {
  const url = new URL(href, 'http://platform.local');
  return { path: url.pathname, search: Object.fromEntries(url.searchParams) };
}

type Harness = {
  search: Record<string, string>;
  navigate: ReturnType<typeof vi.fn>;
  canLink: ReturnType<typeof vi.fn>;
  denied: Set<string>;
  hostCarriesReturn: boolean;
  parts: RecoveryPanelParts[];
  notifyError: ReturnType<typeof vi.fn>;
  renderRequestAccess: ReturnType<typeof vi.fn>;
};
let harness: Harness;
beforeEach(() => {
  // Radix Select in jsdom.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
  const denied = new Set<string>();
  harness = {
    search: {},
    navigate: vi.fn(),
    canLink: vi.fn((to: string) => !denied.has(to.split('?')[0] ?? to)),
    denied,
    hostCarriesReturn: false,
    parts: [],
    notifyError: vi.fn(),
    renderRequestAccess: vi.fn(() => null),
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount() {
  const search = harness.search;
  const seam: HostSeam = {
    canLink: (to) => harness.canLink(to),
    Link: ({ to, children, ref, ...rest }) => (
      <a href={to} ref={ref as React.Ref<HTMLAnchorElement>} {...rest}>
        {children}
      </a>
    ),
    notifyError: (message) => harness.notifyError(message),
    notifySuccess: harness.notifyError,
    useNavigate: () => (to, options) => harness.navigate(to, options),
    useSearch: () => search,
    useHere: () => HERE,
    ...(harness.hostCarriesReturn ? { hostCarriesReturn: true } : {}),
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const renderDetail = (parts: RecoveryPanelParts): ReactNode => {
    harness.parts.push(parts);
    return (
      <div data-testid="in-place-detail">
        {parts.title}
        {parts.body}
      </div>
    );
  };
  return render(
    <QueryClientProvider client={client}>
      <DetailPanelSlotProvider>
        <HostSeamProvider value={seam}>
          <IntegrationDashboardScreen
            renderDetail={renderDetail}
            renderRequestAccess={harness.renderRequestAccess as never}
          />
        </HostSeamProvider>
      </DetailPanelSlotProvider>
    </QueryClientProvider>,
  );
}

const lastNavigation = () => {
  const [href, options] = harness.navigate.mock.lastCall as [string, unknown];
  return { ...record(href), options };
};

it('writes the tab and category through the host with a complete href and no cursor', async () => {
  installFetch();
  harness.search = { cursor: 'c1', managedSystem: SYSTEM };
  mount();
  const queue = await screen.findByTestId('recovery-queue');
  const tab = (name: string) => within(queue).getByRole('tab', { name });
  fireEvent.mouseDown(tab('내 화면에서 숨긴 항목'), { button: 0, ctrlKey: false });
  expect(lastNavigation()).toMatchObject({
    path: '/integration',
    search: { managedSystem: SYSTEM, presentation: 'hidden' },
  });
  fireEvent.mouseDown(tab('최근 처리 이력'), { button: 0, ctrlKey: false });
  expect(lastNavigation().search).toEqual({ managedSystem: SYSTEM, history: 'true' });
  cleanup();
  harness.search = { history: 'true', cursor: 'c1', managedSystem: SYSTEM };
  mount();
  fireEvent.mouseDown(
    within(await screen.findByTestId('recovery-queue')).getByRole('tab', { name: '표시 중' }),
    { button: 0, ctrlKey: false },
  );
  expect(lastNavigation().search).toEqual({ managedSystem: SYSTEM });
});

it('picks a category without a cursor', async () => {
  installFetch();
  harness.search = { cursor: 'c1', managedSystem: SYSTEM };
  mount();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('combobox', { name: '항목 종류' }));
  await user.click(
    await screen.findByRole('option', { name: HOME_QUEUE_COPY['unassigned-voc'].title }),
  );
  expect(lastNavigation().search).toEqual({ managedSystem: SYSTEM, category: 'unassigned-voc' });
});

it('drops an invalid cursor with a replace navigation and keeps the other keys', async () => {
  installFetch({ listCursorError: true });
  harness.search = { cursor: 'bad', managedSystem: SYSTEM, category: 'unassigned-voc' };
  mount();
  await waitFor(() => expect(harness.navigate).toHaveBeenCalled());
  expect(lastNavigation()).toMatchObject({
    search: { managedSystem: SYSTEM, category: 'unassigned-voc' },
    options: { replace: true },
  });
});

it('selects nothing by itself, selects on a row click and clears on requestClose', async () => {
  installFetch();
  mount();
  await screen.findByText('월간 리포트 다운로드 오류');
  expect(harness.navigate).not.toHaveBeenCalled();
  expect(harness.parts).toEqual([]);
  fireEvent.click(screen.getByText('월간 리포트 다운로드 오류'));
  expect(lastNavigation().search).toEqual({ selected: RECOVERY_VISUAL_ID });
  cleanup();
  harness.navigate.mockClear();
  harness.search = { selected: RECOVERY_VISUAL_ID };
  mount();
  await screen.findByRole('button', { name: '내 화면에서 1일 숨기기' });
  const parts = harness.parts.at(-1) as RecoveryPanelParts;
  parts.requestClose();
  expect(lastNavigation().search).toEqual({});
});

it('shows a failed snooze inline and raises no notice', async () => {
  installFetch({ patchStatus: 500 });
  harness.search = { selected: RECOVERY_VISUAL_ID };
  mount();
  fireEvent.click(await screen.findByRole('button', { name: '내 화면에서 1일 숨기기' }));
  const detail = screen.getByTestId('in-place-detail');
  await waitFor(() => expect(within(detail).getByRole('alert')).toBeInTheDocument());
  expect(harness.notifyError).not.toHaveBeenCalled();
});

it('adds no feature returnTo when the host carries the return path, and guards every link', async () => {
  installFetch({ actions: false });
  harness.hostCarriesReturn = true;
  harness.search = { selected: RECOVERY_VISUAL_ID, returnTo: '/home' };
  mount();
  const source = await screen.findByRole('link', { name: /VOC-42/ });
  const route = `/vocs?selected=${SOURCE}&view=triage&managedSystem=${SYSTEM}`;
  expect(source).toHaveAttribute('href', route);
  expect(harness.canLink).toHaveBeenCalledWith(route);
  expect(screen.queryByRole('link', { name: '목록으로 돌아가기' })).toBeNull();
});

it('gives an available action the bare route when the host carries the return path', async () => {
  installFetch();
  harness.hostCarriesReturn = true;
  harness.search = { selected: RECOVERY_VISUAL_ID };
  mount();
  const route = `/vocs?selected=${SOURCE}&view=triage&managedSystem=${SYSTEM}`;
  expect(await screen.findByRole('link', { name: 'VOC 담당자 배정' })).toHaveAttribute(
    'href',
    route,
  );
  expect(harness.canLink).toHaveBeenCalledWith(route);
});

it('leaves the source link out when the host cannot link it', async () => {
  installFetch({ actions: false });
  harness.hostCarriesReturn = true;
  harness.denied.add('/vocs');
  harness.search = { selected: RECOVERY_VISUAL_ID };
  mount();
  await screen.findByRole('button', { name: '내 화면에서 1일 숨기기' });
  expect(screen.queryByRole('link', { name: /VOC-42/ })).toBeNull();
});

it('carries returnTo and the back link without the host flag', async () => {
  installFetch({ actions: false });
  harness.search = { selected: RECOVERY_VISUAL_ID, returnTo: '/home' };
  mount();
  const source = await screen.findByRole('link', { name: /VOC-42/ });
  const href = record(source.getAttribute('href') as string);
  expect(href.search.returnTo).toBe(HERE);
  expect(screen.getByRole('link', { name: '목록으로 돌아가기' })).toHaveAttribute('href', '/home');
});

it('hands renderRequestAccess the screen URL under both hosts', async () => {
  installFetch();
  const blocked = recoveryVisualDetail();
  blocked.next_actions = [
    {
      ...blocked.next_actions[0],
      availability: 'blocked_requestable',
      blocked_reason: '권한 요청이 필요합니다.',
      requestable_permission: { permission: 'voc.triage', managed_system_id: SYSTEM },
    },
  ] as never;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input, 'http://localhost');
      if (url.pathname === '/me') return response({ actor, workspace_id: SYSTEM });
      if (url.pathname === '/dashboard/summary') return response(summary);
      if (url.pathname === '/managed-systems') return response({ items: [] });
      if (url.pathname === '/dashboard/recovery-items')
        return response(recoveryVisualList('active'));
      return response(blocked);
    }),
  );
  harness.hostCarriesReturn = true;
  harness.search = { selected: RECOVERY_VISUAL_ID };
  mount();
  await screen.findByText('권한 요청이 필요합니다.');
  expect(harness.renderRequestAccess).toHaveBeenCalledWith(
    { permission: 'voc.triage', managed_system_id: SYSTEM },
    HERE,
  );
});

it('leaves a jump card out when the host cannot link it', async () => {
  installFetch();
  harness.denied.add('/integration/evidence');
  mount();
  await screen.findByTestId('integration-surface-coverage');
  expect(screen.queryByTestId('integration-surface-evidence')).toBeNull();
  expect(screen.getByTestId('integration-surface-links')).toBeInTheDocument();
});

it('shows the primary card link only when the host can link it', async () => {
  installFetch({ queueCount: 3 });
  mount();
  expect(await screen.findByTestId('integration-queue-primary-unassigned-voc')).toBeInTheDocument();
  cleanup();
  harness.denied.add('/vocs');
  mount();
  await screen.findByTestId('integration-queue-card-unassigned-voc');
  expect(screen.queryByTestId('integration-queue-primary-unassigned-voc')).toBeNull();
});
