import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { COOKIE, WORKSPACE, stubCheckService, stubDb, stubSessionService, transportApp } from '../../../test-support/platform-route-stubs.js';
import { menuQueryRoutes } from '../../menu-query/routes.js';
import { createPlatformPermissionResolver, type PlatformPermissionResolver } from '../../platform-port/permissions.js';
import { platformPortRoutes, type PlatformPortOptions } from '../../platform-port/routes.js';
import { createSessionSnapshot } from '../../platform-port/session-snapshot.js';
import { sessionVersionOf } from '../../platform-port/session-version.js';
import { installAuthStore, installTokenGate } from '../../api-tokens/gate.js';
import { authStoreOf } from '../../api-tokens/request-state.js';
import type { ApiTokenService } from '../../api-tokens/service.js';
import { createCheckService } from '../../permissions/check-service.js';
import { createMenuForwarder } from '../forwarder.js';
import { createMenuDispatchRegistry } from '../registry.js';
import { testEndpoint } from './test-declarations.js';

let app: FastifyInstance | undefined;
afterEach(async () => { await app?.close(); app = undefined; });

describe('dispatch session identity', () => {
  it('forwards an allowed Bearer query without refusal markers or audit writes, and audits a real denial', async () => {
    const sessionService = stubSessionService();
    const loaded = await sessionService.loadAndTouch('session-1');
    if (!loaded) throw new Error('fixture session missing');
    const audit = vi.fn(async () => {});
    const tokens = {
      authenticate: async () => ({ ok: true, tokenId: 't', scopes: ['workspace.read'],
        actorId: loaded.actor.id, workspaceId: WORKSPACE, roleLevel: 'admin', actor: loaded.actor }),
      recordSessionRequiredDenied: audit,
    } as unknown as ApiTokenService;
    const db = stubDb().db;
    const checkService = createCheckService({ db });
    const permissions = createPlatformPermissionResolver([
      { permission: 'test:view', capability: 'workspace.read' },
      { permission: 'test:admin', capability: 'workspace.admin' },
    ]);
    const snapshot = createSessionSnapshot({ permissions, checkService });
    const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({
      outcome: 'ok', data: { forwarded: true }, assessments: [], trust: null, correlationId: 'cid',
    }) }));
    const forwarder = createMenuForwarder({ baseUrl: 'https://upstream.test/', timeoutMs: 1000,
      signer: { sign: () => 'signed' }, fetch });
    const { declaration } = testEndpoint();
    declaration.authorize = async (actor) => (await checkService.checkCapability(actor, 'workspace.read', { workspace_id: WORKSPACE })).allow;
    declaration.handle = async (args) => forwarder.forward({ endpointId: 'test.rows', path: '/rows', args: { ...args, correlationId: 'cid' } });
    const denied = { ...declaration, spec: { ...declaration.spec, id: 'test.admin' },
      authorize: async (actor: Parameters<typeof declaration.authorize>[0]) =>
        (await checkService.checkCapability(actor, 'workspace.admin', { workspace_id: WORKSPACE })).allow };
    const markers: string[][] = [];
    app = await transportApp(async (scoped) => {
      installAuthStore(scoped);
      installTokenGate(scoped, { tokens });
      scoped.addHook('preSerialization', (req, _reply, payload, done) => {
        markers.push([...(authStoreOf(req)?.sessionOnlyDenied ?? [])]);
        done(null, payload);
      });
      await scoped.register(menuQueryRoutes, {
        prefix: '/api/v1/menu-query', db, checkService, sessionService, workspaceId: WORKSPACE,
        registry: createMenuDispatchRegistry([{ endpoints: [declaration, denied] }]),
        sessionVersionOf: async (session) => sessionVersionOf(await snapshot(session)),
      });
    }, null);
    const send = (endpoint: string) => app?.inject({ method: 'POST', url: '/api/v1/menu-query',
      headers: { authorization: 'Bearer test-token' }, payload: { endpoint, context: {}, params: {} } });
    expect((await send('test.rows'))?.json()).toMatchObject({ outcome: 'ok', data: { forwarded: true } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(markers).toEqual([[]]);
    expect(audit).not.toHaveBeenCalled();
    expect((await send('test.admin'))?.json()).toMatchObject({ outcome: 'forbidden' });
    expect(markers[1]).toEqual(['workspace.admin']);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ capability: 'workspace.admin', tokenId: 't' }));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

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
