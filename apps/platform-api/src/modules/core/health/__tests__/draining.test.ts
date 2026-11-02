import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type pg from 'pg';
import { afterEach, describe, expect, it } from 'vitest';

import { createDrainState } from '../../../../lib/shutdown.js';
import type { StorageBackend } from '../../../../lib/storage/index.js';
import { healthRoutes } from '../routes.js';

const pool = { query: async () => ({ rows: [] }) } as unknown as pg.Pool;
const storage = { exists: async () => false } as unknown as StorageBackend;

describe('GET /health/ready draining (#1266 b3)', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => {
    await app?.close();
  });

  async function build(drain = createDrainState()) {
    app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(healthRoutes, {
      pool,
      boss: { getDb: () => ({ executeSql: async () => ({}) }) } as never,
      storage,
      drain,
    });
    await app.ready();
    return { app, drain };
  }

  it('is 200 with the existing body until draining starts', async () => {
    const { app } = await build();
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: 'ok',
      checks: { database: 'ok', pg_boss: 'ok', storage: 'ok' },
    });
  });

  it('turns 503 with reason draining once draining is set, liveness stays 200', async () => {
    const { app, drain } = await build();
    drain.beginDraining();
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      status: 'unavailable',
      checks: { database: 'fail', pg_boss: 'fail', storage: 'fail' },
      reason: 'draining',
    });
    const live = await app.inject({ method: 'GET', url: '/health/live' });
    expect(live.statusCode).toBe(200);
  });

  it('draining state is per app: another app is unaffected', async () => {
    const first = await build();
    first.drain.beginDraining();
    const firstApp = first.app;
    const second = await build();
    const res = await second.app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
    await firstApp.close();
  });
});
