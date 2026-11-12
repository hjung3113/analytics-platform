import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { COOKIE, WORKSPACE, stubCheckService, stubDb, stubSessionService, transportApp } from '../../../test-support/platform-route-stubs.js';
import { menuQueryRoutes } from '../../menu-query/routes.js';
import type { PlatformPermissionResolver } from '../../platform-port/permissions.js';
import { platformPortRoutes, type PlatformPortOptions } from '../../platform-port/routes.js';
import { createSessionSnapshot } from '../../platform-port/session-snapshot.js';
import { sessionVersionOf } from '../../platform-port/session-version.js';
import { createMenuDispatchRegistry } from '../registry.js';
import { testEndpoint } from './test-declarations.js';

let app: FastifyInstance | undefined;
afterEach(async () => { await app?.close(); app = undefined; });

describe('dispatch session identity', () => {
  it('lazily reads once and matches bootstrap and session-state for the same actor', async () => {
    const sessionService = stubSessionService();
    sessionService.ensureCsrfToken = async () => 'csrf';
    const resolve = vi.fn(async () => ['platform:view', 'test:view']);
    const permissions = { resolve } as unknown as PlatformPermissionResolver;
    const checkService = stubCheckService(false);
    const db = stubDb().db;
    const snapshot = createSessionSnapshot({ permissions, checkService });
    const readVersion = vi.fn(async (loaded: Parameters<typeof snapshot>[0]) => sessionVersionOf(await snapshot(loaded)));
    const { declaration } = testEndpoint();
    let read = false;
    declaration.handle = async ({ scopes, sessionVersion }) => {
      expect(scopes).toEqual([]);
      return { outcome: 'ok', data: read ? await Promise.all([sessionVersion(), sessionVersion()]) : null };
    };
    app = await transportApp(async (scoped) => {
      await scoped.register(platformPortRoutes, {
        prefix: '/api/v1/platform', db, sessionService, checkService, permissions, workspaceId: WORKSPACE,
        vocReadService: {} as PlatformPortOptions['vocReadService'],
        findingsService: {} as PlatformPortOptions['findingsService'],
        tasksService: {} as PlatformPortOptions['tasksService'],
      });
      await scoped.register(menuQueryRoutes, {
        prefix: '/api/v1/menu-query', db, checkService, sessionService, workspaceId: WORKSPACE,
        registry: createMenuDispatchRegistry([{ endpoints: [declaration] }]), sessionVersionOf: readVersion,
      });
    }, null);
    const bootstrap = (await app.inject({ url: '/api/v1/platform/bootstrap', headers: COOKIE })).json();
    expect(bootstrap.session).toEqual({ user: { id: expect.any(String), name: 'A', title: { ko: '관리자', en: 'Admin' }, permissions: ['platform:view', 'test:view'] }, scopes: [] });
    const send = () => app?.inject({ method: 'POST', url: '/api/v1/menu-query', headers: COOKIE,
      payload: { endpoint: 'test.rows', context: {}, params: {} } });
    expect((await send())?.json().outcome).toBe('ok');
    expect(readVersion).not.toHaveBeenCalled();
    read = true;
    expect((await send())?.json().data).toEqual([bootstrap.sessionVersion, bootstrap.sessionVersion]);
    expect(readVersion).toHaveBeenCalledTimes(1);
    expect((await app.inject({ url: '/api/v1/platform/session-state', headers: COOKIE })).json()).toEqual({ sessionVersion: bootstrap.sessionVersion });
  });
});
