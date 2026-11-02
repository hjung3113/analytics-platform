// SEED_MODE=bootstrap (#1266 b2): workspace + system actor only, idempotent.
// Uses a fresh workspace id so the shared throwaway workspace is untouched.

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { type DbHandle, createDb } from '../../db/client.js';
import { runSeed } from '../index.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && process.env.WORKSPACE_ID);

const COUNTED_TABLES = [
  'core.actors',
  'core.managed_systems',
  'core.analytics_areas',
  'core.teams',
  'voc.vocs',
  'permission.permission_grants',
] as const;

describe.skipIf(!runIntegration)('bootstrap seed', () => {
  const workspaceId = randomUUID();
  let app: DbHandle;
  let migrate: DbHandle;

  async function counts(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const t of COUNTED_TABLES) {
      const r = await migrate.pool.query<{ n: string }>(
        `select count(*)::text as n from ${t} where workspace_id = $1`,
        [workspaceId],
      );
      out[t] = Number(r.rows[0]?.n);
    }
    const ws = await migrate.pool.query<{ n: string }>(
      'select count(*)::text as n from core.workspaces where id = $1',
      [workspaceId],
    );
    out['core.workspaces'] = Number(ws.rows[0]?.n);
    return out;
  }

  beforeAll(() => {
    app = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
  });

  afterAll(async () => {
    await migrate?.pool.query('delete from core.audit_log where workspace_id = $1', [workspaceId]);
    await migrate?.pool.query('delete from core.actors where workspace_id = $1', [workspaceId]);
    await migrate?.pool.query('delete from core.workspaces where id = $1', [workspaceId]);
    await app?.close();
    await migrate?.close();
  });

  it('creates exactly the workspace and the system actor, then a rerun changes nothing', async () => {
    vi.stubEnv('WORKSPACE_ID', workspaceId);
    vi.stubEnv('WORKSPACE_NAME', 'Bootstrap Test');
    vi.stubEnv('SEED_MODE', 'bootstrap');
    try {
      const before = await counts();
      expect(Object.values(before).every((n) => n === 0)).toBe(true);

      const first = await runSeed(app);
      expect(first.workspaceInserted).toBe(true);
      expect(first.actorsInserted).toBe(1);
      expect(first.vocsInserted).toBe(0);
      expect(first.managedSystemsInserted).toBe(0);

      const after = await counts();
      expect(after).toEqual({
        'core.workspaces': 1,
        'core.actors': 1,
        'core.managed_systems': 0,
        'core.analytics_areas': 0,
        'core.teams': 0,
        'voc.vocs': 0,
        'permission.permission_grants': 0,
      });
      const actor = await migrate.pool.query<{
        external_id: string;
        role_level: string;
        actor_type: string;
      }>('select external_id, role_level, actor_type from core.actors where workspace_id = $1', [
        workspaceId,
      ]);
      expect(actor.rows).toEqual([
        { external_id: 'system', role_level: 'admin', actor_type: 'system' },
      ]);

      const second = await runSeed(app);
      expect(second.workspaceInserted).toBe(false);
      expect(second.actorsInserted).toBe(0);
      expect(await counts()).toEqual(after);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
