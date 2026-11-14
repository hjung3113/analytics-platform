// SER-2: exercise the route's transport with synthetic PostgreSQL failures; no database needed.
import cookiePlugin from '@fastify/cookie';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import type { Db } from '../../../db/client.js';
import type { Tx } from '../../../db/tx.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import type { SessionService } from '../../auth/session-service.js';
import type { CheckService } from '../../permissions/check-service.js';
import { platformSavedViewRoutes } from '../routes.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const sessionService = {
  loadAndTouch: async () => ({
    session: { id: 'synthetic-cookie', workspaceId },
    actor: { id: '22222222-2222-4222-8222-222222222222', roleLevel: 'user' },
  }),
  getCsrfToken: async () => 'synthetic-csrf',
} as unknown as SessionService;
const checkService = {
  checkCapability: async () => ({ allow: false, via: 'none' }),
  capabilityScope: async () => null,
} as unknown as CheckService;

async function post(db: Db, command: Record<string, unknown>) {
  const app = Fastify();
  await app.register(cookiePlugin);
  await app.register(platformSavedViewRoutes, {
    prefix: '/api/v1/platform', sessionService, checkService, workspaceId, db,
  });
  try {
    return await app.inject({
      method: 'POST',
      url: '/api/v1/platform/saved-views/commands',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=synthetic-cookie`,
        'x-csrf-token': 'synthetic-csrf',
      },
      payload: command,
    });
  } finally {
    await app.close();
  }
}

describe('saved-view shared transport (SER-2)', () => {
  it.each(['55P03', '57014'])('a database timeout %s returns retryable 503 and no-store', async (code) => {
    const transaction = vi.fn(async () => {
      throw Object.assign(new Error('synthetic database timeout'), { code });
    });
    const response = await post({ transaction } as unknown as Db, {
      version: 1, op: 'createGroup', name: 'Synthetic group', memberIds: [],
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      code: 'service.unavailable', message: 'service temporarily unavailable',
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('a missing get remains the literal JSON null', async () => {
    const db = {
      transaction: async (work: (tx: Tx) => Promise<unknown>) => work({} as Tx),
    } as unknown as Db;
    const response = await post(db, { version: 1, op: 'get', id: 'synthetic-missing-id' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('null');
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
