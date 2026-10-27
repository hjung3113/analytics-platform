import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  archiveAnalyticsArea,
  registerAnalyticsArea,
  updateAnalyticsArea,
} from '../analytics-areas';
import { configureApiClient } from '../client';
import {
  archiveManagedSystem,
  registerManagedSystem,
  updateManagedSystem,
} from '../managed-systems';
import { fetchPermissionRequestsAllViaClient } from '../permission-reads';
import { fetchPermissionRequestsAll } from '../permissions';
import {
  archiveAnalyticsArea as archiveAnalyticsAreaViaClient,
  archiveManagedSystem as archiveManagedSystemViaClient,
  registerAnalyticsArea as registerAnalyticsAreaViaClient,
  registerManagedSystem as registerManagedSystemViaClient,
  updateAnalyticsArea as updateAnalyticsAreaViaClient,
  updateManagedSystem as updateManagedSystemViaClient,
} from '../registry-writes';

const managedSystemBody = { slug: 'ops', name: 'Operations' };
const managedSystemUpdate = { name: 'Operations v2' };
const analyticsAreaBody = { managed_system_id: 'ms-1', slug: 'core', name: 'Core' };
const analyticsAreaUpdate = { name: 'Core v2' };

const calls = [
  [
    'register managed system',
    () => registerManagedSystem(managedSystemBody, { idempotencyKey: 'ms-register-key' }),
    '/managed-systems',
    'POST',
    managedSystemBody,
    'ms-register-key',
  ],
  [
    'update managed system',
    () => updateManagedSystem('ms-1', managedSystemUpdate, { idempotencyKey: 'ms-update-key' }),
    '/managed-systems/ms-1',
    'PATCH',
    managedSystemUpdate,
    'ms-update-key',
  ],
  [
    'archive managed system',
    () => archiveManagedSystem('ms-1', { idempotencyKey: 'ms-archive-key' }),
    '/managed-systems/ms-1/archive',
    'POST',
    undefined,
    'ms-archive-key',
  ],
  [
    'register analytics area',
    () => registerAnalyticsArea(analyticsAreaBody, { idempotencyKey: 'aa-register-key' }),
    '/analytics-areas',
    'POST',
    analyticsAreaBody,
    'aa-register-key',
  ],
  [
    'update analytics area',
    () => updateAnalyticsArea('aa-1', analyticsAreaUpdate, { idempotencyKey: 'aa-update-key' }),
    '/analytics-areas/aa-1',
    'PATCH',
    analyticsAreaUpdate,
    'aa-update-key',
  ],
  [
    'archive analytics area',
    () => archiveAnalyticsArea('aa-1', { idempotencyKey: 'aa-archive-key' }),
    '/analytics-areas/aa-1/archive',
    'POST',
    undefined,
    'aa-archive-key',
  ],
  [
    'fetch all permission requests',
    () => fetchPermissionRequestsAllViaClient({ status: 'all' }),
    '/permissions/requests?status=all',
    'GET',
    undefined,
    undefined,
  ],
] as const;

const originalFetch = global.fetch;

beforeEach(() => configureApiClient({ basePath: '/api/fo' }));
afterEach(() => {
  global.fetch = originalFetch;
  configureApiClient({ basePath: '' });
});

describe('client-based registry writes and admin permission list', () => {
  it.each(calls)(
    '%s sends the existing request under the host base path',
    async (_name, call, path, method, body, idempotencyKey) => {
      const payload = { fixture: 'response' };
      const requests: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
      global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push([input, init]);
        return new Response(JSON.stringify(payload), { status: 200 });
      }) as unknown as typeof fetch;

      await expect(call()).resolves.toEqual(payload);

      const request = requests[0];
      expect(request?.[0]).toBe(`/api/fo${path}`);
      expect(request?.[1]?.method).toBe(method);
      expect(request?.[1]?.body).toBe(body === undefined ? undefined : JSON.stringify(body));
      const headers = new Headers(request?.[1]?.headers);
      expect(headers.get('Idempotency-Key')).toBe(idempotencyKey ?? null);
      if (body !== undefined) expect(headers.get('Content-Type')).toBe('application/json');
    },
  );

  it('keeps the original exports as direct re-exports of the client twins', () => {
    expect(registerManagedSystem).toBe(registerManagedSystemViaClient);
    expect(updateManagedSystem).toBe(updateManagedSystemViaClient);
    expect(archiveManagedSystem).toBe(archiveManagedSystemViaClient);
    expect(registerAnalyticsArea).toBe(registerAnalyticsAreaViaClient);
    expect(updateAnalyticsArea).toBe(updateAnalyticsAreaViaClient);
    expect(archiveAnalyticsArea).toBe(archiveAnalyticsAreaViaClient);
    expect(fetchPermissionRequestsAll).toBe(fetchPermissionRequestsAllViaClient);
  });
});
