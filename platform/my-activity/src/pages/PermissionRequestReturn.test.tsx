import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage } from '@ap/kernel/testing';
import type { Permission } from '@ap/contracts';
import { notificationsSlot } from '@ap/feature-bridge/notifications-slot';
import { featureQueryClient } from '@ap/feature-bridge';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { LAZY_MOUNT_WAIT } from '@ap/feature-bridge/testing';
import { ID_A, ID_B, json, listOf, mount, mountAt, notification, registry, stubFetch, switchableAdapter } from '../feature/test-support';

const origin = '/notices?v=1';
const label = '원래 화면으로';
const now = '2026-11-20T00:00:00.000Z';
const ownerPath = `/api/features/permission-requests/${ID_B}`;

function requestRow(status: string, return_route_intent: string | null) {
  return {
    id: ID_B, status, return_route_intent, reason: 'Need access',
    requested_capability: 'workspace.read', requested_managed_system_id: null,
    requested_object_type: null, requested_object_id: null, requested_expiration: null,
    source_object_type: null, source_object_id: null, source_action_id: null,
    revision: 1, created_at: now, updated_at: now,
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() });
});
afterEach(() => {
  cleanup();
  setFeatureApi(null);
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

async function openRequests(status: string, intent: string | null, permissions?: Permission[]) {
  stubFetch(url => {
    switch (url) {
      case '/api/features/permission-requests/mine?status=all':
        return json({ requests: [requestRow(status, intent)] });
      case '/api/features/managed-systems':
        return json({ items: [], total: 0 });
      case '/api/features/me/permissions/declared-capabilities':
      case '/api/features/permission-groups':
        return json({ items: [] });
      case '/api/features/me':
        return json({ actor: { id: 'user-a', external_id: 'user-a', email: '', display_name: 'Requester', role_level: 'user' }, workspace_id: 'workspace' });
      default:
        throw new Error(`Unexpected request: ${url}`);
    }
  });
  mountAt(switchableAdapter('user-a', permissions).adapter, '/permission-requests');
  // The page body mounts lazily; under CI load the default 1 s wait is too short (traps.md).
  return within((await screen.findByText('Need access', {}, LAZY_MOUNT_WAIT)).closest('li')!);
}

describe('Return from a requester row', () => {
  it('uses the row action line and navigates to the stored in-app address', async () => {
    const row = await openRequests('approved', origin);
    const button = row.getByRole('button', { name: label });
    expect(button.tagName).toBe('BUTTON');
    expect(button.closest('[data-row-actions]')).toBeTruthy();
    fireEvent.click(button);
    expect(window.location.pathname + window.location.search).toBe(origin);
  });

  it.each(['pending', 'rejected', 'cancelled', 'expired', 'needs_more_info', 'revoked'])(
    'offers no return for a %s request', async status => {
      const row = await openRequests(status, origin);
      expect(row.queryByRole('button', { name: label })).toBeNull();
    },
  );

  it.each([
    null, 'https://example.test/notices', 'http:example.test', 'javascript:void(0)',
    '//example.test', '/\\example.test', '%2F%2Fexample.test', '/%2Fexample.test',
    '/%5Cexample.test', '/unregistered', `/voc/${ID_B}`,
  ])('offers no return for missing, unsafe or unreachable intent %s', async intent => {
    const row = await openRequests('approved', intent);
    expect(row.queryByRole('button', { name: label })).toBeNull();
  });

  // #2637: a feature screen's in-place request dialog stores the feature path, not the platform address.
  it('maps a stored feature path to its platform menu and navigates there', async () => {
    const featurePath = '/vocs?view=my';
    expect(registry.matchRoute(featurePath.split('?')[0]!)).toBeNull();
    const row = await openRequests('approved', featurePath, ['platform:view', 'voc:view']);
    fireEvent.click(row.getByRole('button', { name: label }));
    expect(window.location.pathname).toBe(registry.menus.find(menu => menu.id === 'voc')!.path);
  });

  it('refuses a feature path that maps to a hidden detail menu, as it refuses the platform address', async () => {
    const row = await openRequests('approved', `/vocs?view=my&selected=${ID_B}`, ['platform:view', 'voc:view']);
    expect(row.queryByRole('button', { name: label })).toBeNull();
  });

  it('offers no return for a feature path whose menu the requester cannot open', async () => {
    const row = await openRequests('approved', '/vocs?view=my');
    expect(row.queryByRole('button', { name: label })).toBeNull();
  });

  it('offers no return for a feature path whose menu is not in the registry', async () => {
    expect(registry.menus.some(menu => menu.id === 'triage')).toBe(false);
    const row = await openRequests('approved', '/vocs?view=triage', ['platform:view', 'voc:view']);
    expect(row.queryByRole('button', { name: label })).toBeNull();
  });

  it('offers no return for a registered menu the requester cannot open', async () => {
    const gated = '/flow/inbox?v=1';
    expect(registry.safeReturnTo(gated)).toBe(gated);
    const row = await openRequests('approved', gated);
    expect(row.queryByRole('button', { name: label })).toBeNull();
  });
});

describe('Return from a decided notification in the bell popover', () => {
  it('puts the button on its own line under the body and marks the notification read on click', async () => {
    window.history.replaceState(null, '', '/notifications');
    const calls = stubFetch((url, method) => {
      if (method === 'POST') return json(notification(ID_A, { read_at: now }));
      if (url === '/api/features/notifications?limit=10') {
        return listOf(notification(ID_A, {
          event_type: 'permission_request.decided', subject_type: 'permission_request', subject_id: ID_B,
          detail: { status: 'approved', return_route_intent: origin },
        }));
      }
      return json({ items: [], page: { has_more: false }, unread_count: 1 });
    });
    render(
      <I18nProvider><PlatformProvider adapter={switchableAdapter().adapter} registry={registry}>
        <notificationsSlot.Recent />
      </PlatformProvider></I18nProvider>,
    );
    const row = within(await screen.findByTestId(`home-inbox-row-${ID_A}`));
    const button = await row.findByRole('button', { name: label });
    const below = row.getByTestId('home-inbox-return-below');
    expect(below.contains(button)).toBe(true);
    expect(row.getByRole('button', { name: '보관' }).parentElement?.contains(button)).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(calls.some(call => call.method === 'POST' && call.path.includes(ID_A))).toBe(true));
    expect(window.location.pathname + window.location.search).toBe(origin);
  });
});

async function openNotification(status: string, detailIntent?: string, owner = json({
  ...requestRow('approved', origin),
  requester_actor_id: ID_A, source_summary: null, latest_admin_question: null,
  editable_scope_candidates: [], allowed_actions: [],
})) {
  window.history.replaceState(null, '', '/notifications');
  const calls = stubFetch(url => {
    if (url === ownerPath) return owner;
    if (url === '/api/features/notifications?unread=true') {
      return listOf(notification(ID_A, {
        event_type: 'permission_request.decided', subject_type: 'permission_request', subject_id: ID_B,
        detail: { status, ...(detailIntent === undefined ? {} : { return_route_intent: detailIntent }) },
      }));
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  mount(switchableAdapter().adapter);
  const row = await screen.findByTestId(`home-inbox-row-${ID_A}`);
  return { row: within(row), calls };
}

describe('Return from a decided notification', () => {
  it.each([undefined, origin])('shows a button on the action line with payload intent %s', async detailIntent => {
    const { row, calls } = await openNotification('approved', detailIntent);
    const button = await row.findByRole('button', { name: label });
    expect(button.tagName).toBe('BUTTON');
    expect(button.parentElement).toBe(row.getByRole('button', { name: '보관' }).parentElement);
    expect(row.queryByTestId('home-inbox-return-below')).toBeNull();
    expect(calls.some(call => call.path === ownerPath)).toBe(detailIntent === undefined);
    expect(row.getByRole('link').getAttribute('href')).toContain('/permission-requests');
    fireEvent.click(button);
    expect(window.location.pathname + window.location.search).toBe(origin);
  });

  it('keeps the request link when the approved subject is inaccessible', async () => {
    const { row, calls } = await openNotification('approved', undefined, json({}, 404));
    await waitFor(() => expect(calls.some(call => call.path === ownerPath)).toBe(true));
    await waitFor(() => expect(featureQueryClient.isFetching()).toBe(0));
    expect(row.queryByRole('button', { name: label })).toBeNull();
    expect(row.getByRole('link').getAttribute('href')).toContain('/permission-requests');
  });

  it.each([
    ['rejected', origin],
    ['approved', '/flow/inbox?v=1'],
    ['approved', '/%2Fexample.test'],
  ])('keeps the request link for a %s notification with intent %s', async (status, intent) => {
    const { row, calls } = await openNotification(status, intent);
    expect(row.queryByRole('button', { name: label })).toBeNull();
    expect(row.getByRole('link').getAttribute('href')).toContain('/permission-requests');
    expect(calls.some(call => call.path === ownerPath)).toBe(false);
  });
});
