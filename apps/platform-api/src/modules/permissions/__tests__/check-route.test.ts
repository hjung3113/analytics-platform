import cookiePlugin from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { validatorCompiler } from 'fastify-type-provider-zod';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Db } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import type { SessionService } from '../../auth/session-service.js';
import { allManagedSystemIds } from '../../managed-systems/read-projections.js';
import { createCheckService, type CheckService, type Decision } from '../check-service.js';
import { createRequestService, type RequestServiceDeps } from '../request-service.js';
import { permissionsRoutes, type PermissionsRoutesOptions } from '../routes.js';

vi.mock('../../managed-systems/read-projections.js', async (original) => ({
  ...await original<typeof import('../../managed-systems/read-projections.js')>(),
  allManagedSystemIds: vi.fn(),
}));

const WORKSPACE = '11111111-1111-4111-8111-111111111111';
const ACTIVE = '22222222-2222-4222-8222-222222222222';
const ARCHIVED = '33333333-3333-4333-8333-333333333333';
const UNKNOWN = '44444444-4444-4444-8444-444444444444';

describe('GET /me/permissions/check exact Managed System', () => {
  let app: FastifyInstance;
  const checkCapability = vi.fn<CheckService['checkCapability']>();

  beforeAll(async () => {
    // The registry projection contains active systems only. There are no open requests.
    vi.mocked(allManagedSystemIds).mockResolvedValue([ACTIVE]);
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    } as unknown as Db;
    const checkService = { ...createCheckService({ db }), checkCapability };
    const requestService = createRequestService({ db, checkService } as unknown as RequestServiceDeps);
    const sessionService = {
      loadAndTouch: async () => ({ session: {
        id: 'session', actorId: 'developer', workspaceId: WORKSPACE, roleLevel: 'developer',
      } }),
    } as unknown as SessionService;

    app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    await app.register(cookiePlugin);
    await app.register(permissionsRoutes, {
      workspaceId: WORKSPACE, sessionService, checkService, requestService, selectedReadService: {},
    } as unknown as PermissionsRoutesOptions);
  });

  afterAll(() => app.close());

  async function check(managedSystemId: string, decision: Decision) {
    checkCapability.mockResolvedValueOnce(decision);
    const res = await app.inject({
      method: 'GET',
      url: `/me/permissions/check?capability=finding.read&managed_system_id=${managedSystemId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=session` },
    });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  it.each([
    ['archived', ARCHIVED, 'blocked_non_requestable', null],
    ['unknown', UNKNOWN, 'blocked_non_requestable', null],
    ['active', ACTIVE, 'request_access', [{ workspace_id: WORKSPACE, managed_system_id: ACTIVE }]],
  ] as const)('offers an exact request only when the Managed System is supported (%s)', async (_label, id, state, requestable) => {
    const decision: Decision = { allow: false, reason: 'no_grant', requestable: [{ workspace_id: WORKSPACE, managed_system_id: id }] };
    expect(await check(id, decision)).toEqual({
      state, decision: { ...decision, requestable },
    });
  });

  it('keeps a live allow for historical data in an archived Managed System', async () => {
    const decision = { allow: true, via: 'direct_grant' } as const;
    expect(await check(ARCHIVED, decision)).toEqual({ state: 'approved', decision });
  });
});
