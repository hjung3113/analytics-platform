// #1442 — fail closed when a token request loses its AsyncLocalStorage auth context (ADR-0116).

import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { runAsToken, runWithAuthStore } from '../../../lib/auth-context.js';
import { createAuthenticator } from '../../platform-port/transport.js';
import { refuseLostTokenContext } from '../gate.js';
import { setTokenSession } from '../request-state.js';

function fakeReply() {
  const send = vi.fn();
  const code = vi.fn(() => ({ send }));
  return { reply: { code } as unknown as FastifyReply, code, send };
}

function tokenRequest(): FastifyRequest {
  const req = { id: 'req-1', headers: {}, cookies: {}, log: { error: vi.fn(), warn: vi.fn() } } as unknown as FastifyRequest;
  setTokenSession(req, {
    session: { id: 'token:t1', actorId: 'a1', workspaceId: 'w1', roleLevel: 'admin' },
    actor: {} as never,
  });
  return req;
}

describe('refuseLostTokenContext', () => {
  it('refuses with a logged 500 when a token session has no token auth context (store lost)', () => {
    const { reply, code, send } = fakeReply();
    const req = tokenRequest();
    expect(refuseLostTokenContext(req, reply)).toBe(true);
    expect(code).toHaveBeenCalledWith(500);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ code: 'internal.unexpected' }));
    expect((req.log as unknown as { error: ReturnType<typeof vi.fn> }).error).toHaveBeenCalledOnce();
  });

  it('refuses when the surviving context is a plain session', () => {
    const { reply } = fakeReply();
    const result = runWithAuthStore({ ctx: { kind: 'session' } }, () => refuseLostTokenContext(tokenRequest(), reply));
    expect(result).toBe(true);
  });

  it('lets a token request through while its token context is intact', () => {
    const { reply, code } = fakeReply();
    const result = runAsToken('t1', ['workspace.read'], () => refuseLostTokenContext(tokenRequest(), reply));
    expect(result).toBe(false);
    expect(code).not.toHaveBeenCalled();
  });

  it('never touches a cookie request (no token session)', () => {
    const { reply } = fakeReply();
    const req = { id: 'r', headers: {}, log: { error: vi.fn() } } as unknown as FastifyRequest;
    expect(refuseLostTokenContext(req, reply)).toBe(false);
  });

  it('the authenticator returns null and answers 500 instead of handing back the token session', async () => {
    const { reply, code } = fakeReply();
    const authenticate = createAuthenticator({ sessionService: {} as never, workspaceId: 'w1' });
    expect(await authenticate(tokenRequest(), reply, true)).toBeNull();
    expect(code).toHaveBeenCalledWith(500);
  });
});
