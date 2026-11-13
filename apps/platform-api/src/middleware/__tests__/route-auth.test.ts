// #1972: a route registered without a declared auth mode fails startup; each declared mode passes.
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';

import type { SessionService } from '../../modules/auth/session-service.js';
import { requireSession } from '../require-session.js';
import { installRouteAuthCheck, markAuthGuard } from '../route-auth.js';

const plainHook = async (_req: FastifyRequest, _reply: FastifyReply) => undefined;
const sessionService = {} as SessionService;

async function boot(register: (app: ReturnType<typeof Fastify>) => void) {
  const app = Fastify();
  installRouteAuthCheck(app);
  await app.register(async (child) => register(child as unknown as ReturnType<typeof Fastify>));
  await app.ready();
  return app;
}

describe('route auth declaration (#1972)', () => {
  it('fails startup for a route with no guard and no declaration', async () => {
    await expect(
      boot((app) => app.get('/undeclared', { preHandler: plainHook }, async () => ({}))),
    ).rejects.toThrow(/GET \/undeclared declares no auth mode/);
  });

  it.each([
    ['config.public', { config: { public: true } }],
    ['config.authInHandler', { config: { authInHandler: true } }],
    ['requireSession preHandler (single)', { preHandler: requireSession(sessionService) }],
    ['marked preHandler after an unmarked one in an array', { preHandler: [plainHook, markAuthGuard(async () => undefined)] }],
    ['marked onRequest', { onRequest: markAuthGuard(async () => undefined) }],
    ['marked preParsing', { preParsing: [markAuthGuard(async () => undefined)] }],
  ])('passes a route declared by %s', async (_name, options) => {
    const app = await boot((child) => child.post('/declared', options as never, async () => ({})));
    const res = await app.inject({ method: 'POST', url: '/declared', payload: {} });
    expect(res.statusCode).not.toBe(404);
    await app.close();
  });

  it('does not accept an unmarked hook beside config.public set to a non-true value', async () => {
    await expect(
      boot((app) => app.get('/x', { config: { public: 'yes' as never }, onRequest: plainHook }, async () => ({}))),
    ).rejects.toThrow(/declares no auth mode/);
  });
});
