import cookiePlugin from '@fastify/cookie';
import Fastify, { type preHandlerHookHandler } from 'fastify';
import { describe, expect, it } from 'vitest';

import type { SessionService } from '../../modules/auth/session-service.js';
import { requireCsrf } from '../../modules/platform-port/index.js';
import { SESSION_COOKIE_NAME, requireSession } from '../require-session.js';
import { requireWorkspace } from '../require-workspace.js';

const SESSION_COOKIE = `${SESSION_COOKIE_NAME}=session-token`;

function fakeSessionService(
  workspaceId: string | null,
  csrfToken = 'expected-token',
): SessionService {
  return {
    async loadAndTouch() {
      if (workspaceId === null) return null;
      return {
        session: {
          id: 'session-1',
          actorId: 'actor-1',
          workspaceId,
          roleLevel: 'user',
        },
        actor: {},
      };
    },
    async getCsrfToken() {
      return csrfToken;
    },
  } as unknown as SessionService;
}

async function buildGuardedApp(preHandler: preHandlerHookHandler | preHandlerHookHandler[]) {
  const app = Fastify();
  await app.register(cookiePlugin);
  app.addHook('onSend', async (req, reply) => {
    // Let the preHandler settle while the response pipeline is still pending.
    await Promise.resolve();
    reply.header('X-Correlation-Id', req.id);
  });

  let routeCalls = 0;
  app.get('/guarded', { preHandler }, async () => {
    routeCalls += 1;
    return { ok: true };
  });

  return { app, routeCalls: () => routeCalls };
}

const denialCases: Array<{
  name: string;
  preHandler: preHandlerHookHandler | preHandlerHookHandler[];
  headers?: Record<string, string>;
  expectedStatus: number;
  expectedCode: string;
}> = [
  {
    name: 'missing session cookie',
    preHandler: requireSession(fakeSessionService(null)),
    expectedStatus: 401,
    expectedCode: 'auth.session_invalid',
  },
  {
    name: 'inactive session',
    preHandler: requireSession(fakeSessionService(null)),
    headers: { cookie: SESSION_COOKIE },
    expectedStatus: 401,
    expectedCode: 'auth.session_invalid',
  },
  {
    name: 'workspace mismatch',
    preHandler: [requireSession(fakeSessionService('ws-other')), requireWorkspace('ws-expected')],
    headers: { cookie: SESSION_COOKIE },
    expectedStatus: 403,
    expectedCode: 'auth.workspace_mismatch',
  },
  {
    name: 'workspace guard without session',
    preHandler: requireWorkspace('ws-expected'),
    expectedStatus: 401,
    expectedCode: 'auth.session_invalid',
  },
  {
    name: 'invalid CSRF token',
    preHandler: requireCsrf(fakeSessionService(null)),
    headers: { cookie: SESSION_COOKIE, 'x-csrf-token': 'wrong-token' },
    expectedStatus: 403,
    expectedCode: 'csrf.invalid',
  },
];

describe('preHandler denial replies', () => {
  it.each(denialCases)(
    '$name stops before the route handler',
    async ({ preHandler, headers, expectedStatus, expectedCode }) => {
      const { app, routeCalls } = await buildGuardedApp(preHandler);
      try {
        const response = await app.inject({
          method: 'GET',
          url: '/guarded',
          ...(headers === undefined ? {} : { headers }),
        });

        expect(response.statusCode).toBe(expectedStatus);
        expect(response.json().code).toBe(expectedCode);
        expect(routeCalls()).toBe(0);
      } finally {
        await app.close();
      }
    },
  );

  it('allows the route handler for a session in the expected workspace', async () => {
    const preHandler = [
      requireSession(fakeSessionService('ws-expected')),
      requireWorkspace('ws-expected'),
    ];
    const { app, routeCalls } = await buildGuardedApp(preHandler);
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/guarded',
        headers: { cookie: SESSION_COOKIE },
      });

      expect(response.statusCode).toBe(200);
      expect(routeCalls()).toBe(1);
    } finally {
      await app.close();
    }
  });
});
