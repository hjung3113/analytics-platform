// set-actor-role CLI core (#1266 b2): audited, serialized, refuses unsafe changes.
// Fresh workspace per suite. Runs as the migrate role (the CLI's role); the
// runtime role is not used because the backend never receives the migrate URL.

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../db/client.js';
import { runBootstrapSeed } from '../../seed/bootstrap.js';
import { SetActorRoleError, parseArgs, setActorRole } from '../set-actor-role.js';

const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const runIntegration = Boolean(MIGRATE_URL && process.env.WORKSPACE_ID);

describe.skipIf(!runIntegration)('set-actor-role', () => {
  const workspaceId = randomUUID();
  let h: DbHandle;
  let h2: DbHandle;

  async function addActor(externalId: string, role: string): Promise<string> {
    const r = await h.pool.query<{ id: string }>(
      `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, $2, $3, $2, $4, 'internal_member') returning id`,
      [workspaceId, externalId, `${externalId}@secret.example`, role],
    );
    return r.rows[0]?.id ?? '';
  }
  async function roleOf(externalId: string): Promise<string | undefined> {
    const r = await h.pool.query<{ role_level: string }>(
      'select role_level from core.actors where workspace_id = $1 and external_id = $2',
      [workspaceId, externalId],
    );
    return r.rows[0]?.role_level;
  }
  async function auditRows(): Promise<
    Array<{ subject_id: string; actor_id: string; detail: Record<string, unknown> }>
  > {
    const r = await h.pool.query(
      `select subject_id, actor_id, detail from core.audit_log
       where workspace_id = $1 and event_type = 'actor_role_changed' order by created_at`,
      [workspaceId],
    );
    return r.rows;
  }
  async function resetAdmins(): Promise<void> {
    await h.pool.query('delete from core.audit_log where workspace_id = $1', [workspaceId]);
    await h.pool.query(
      `delete from core.actors where workspace_id = $1 and actor_type <> 'system'`,
      [workspaceId],
    );
  }
  async function exitCodeOf(p: Promise<unknown>): Promise<number | undefined> {
    try {
      await p;
    } catch (e) {
      return e instanceof SetActorRoleError ? e.exitCode : -1;
    }
    return undefined;
  }

  beforeAll(async () => {
    h = createDb(MIGRATE_URL);
    h2 = createDb(MIGRATE_URL);
    await runBootstrapSeed(h, { workspaceId, workspaceName: 'Role CLI Test' });
  });

  afterAll(async () => {
    await h?.pool.query('delete from core.audit_log where workspace_id = $1', [workspaceId]);
    await h?.pool.query('delete from core.sessions where workspace_id = $1', [workspaceId]);
    await h?.pool.query('delete from core.actors where workspace_id = $1', [workspaceId]);
    await h?.pool.query('delete from core.workspaces where id = $1', [workspaceId]);
    await h?.close();
    await h2?.close();
  });

  it('promotes an existing actor and writes one audit row attributed to system', async () => {
    await resetAdmins();
    const id = await addActor('sub-promote', 'user');
    const r = await setActorRole(h, {
      workspaceId,
      externalId: 'sub-promote',
      role: 'admin',
      reason: 'first admin',
    });
    expect(r).toMatchObject({ changed: true, actorId: id, beforeRole: 'user', afterRole: 'admin' });
    expect(await roleOf('sub-promote')).toBe('admin');
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subject_id).toBe(id);
    expect(rows[0]?.detail).toEqual({
      before_role: 'user',
      after_role: 'admin',
      reason: 'first admin',
    });
    const sys = await h.pool.query<{ id: string }>(
      "select id from core.actors where workspace_id = $1 and actor_type = 'system'",
      [workspaceId],
    );
    expect(rows[0]?.actor_id).toBe(sys.rows[0]?.id);
    expect(JSON.stringify(r)).not.toContain('secret.example');
  });

  it('is a no-op without an audit row when the role is already set', async () => {
    await resetAdmins();
    await addActor('sub-noop', 'admin');
    const r = await setActorRole(h, { workspaceId, externalId: 'sub-noop', role: 'admin' });
    expect(r.changed).toBe(false);
    expect(await auditRows()).toHaveLength(0);
  });

  it('refuses an unknown external id (exit 2) and writes nothing', async () => {
    await resetAdmins();
    const code = await exitCodeOf(
      setActorRole(h, { workspaceId, externalId: 'nobody', role: 'admin' }),
    );
    expect(code).toBe(2);
    expect(await auditRows()).toHaveLength(0);
  });

  it('refuses the system actor (exit 4)', async () => {
    await resetAdmins();
    const code = await exitCodeOf(setActorRole(h, { workspaceId, externalId: 'system', role: 'user' }));
    expect(code).toBe(4);
    expect(await roleOf('system')).toBe('admin');
    expect(await auditRows()).toHaveLength(0);
  });

  it('refuses demoting the last non-system admin (exit 3) but allows it with a second admin', async () => {
    await resetAdmins();
    await addActor('sub-a', 'admin');
    expect(await exitCodeOf(setActorRole(h, { workspaceId, externalId: 'sub-a', role: 'user' }))).toBe(3);
    expect(await roleOf('sub-a')).toBe('admin');
    expect(await auditRows()).toHaveLength(0);

    await addActor('sub-b', 'admin');
    const r = await setActorRole(h, { workspaceId, externalId: 'sub-a', role: 'user' });
    expect(r.changed).toBe(true);
    expect(await roleOf('sub-a')).toBe('user');
    expect(await auditRows()).toHaveLength(1);
  });

  it('serializes concurrent demotions: one admin remains, only the committed change is audited', async () => {
    await resetAdmins();
    await addActor('sub-c', 'admin');
    await addActor('sub-d', 'admin');
    const results = await Promise.allSettled([
      setActorRole(h, { workspaceId, externalId: 'sub-c', role: 'user' }),
      setActorRole(h2, { workspaceId, externalId: 'sub-d', role: 'user' }),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const bad = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(bad).toHaveLength(1);
    const reason = (bad[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(SetActorRoleError);
    expect((reason as SetActorRoleError).exitCode).toBe(3);
    const admins = await h.pool.query(
      `select 1 from core.actors where workspace_id = $1 and role_level = 'admin' and actor_type <> 'system'`,
      [workspaceId],
    );
    expect(admins.rowCount).toBe(1);
    expect(await auditRows()).toHaveLength(1);
  });

  it.each([
    [[], '--external-id is required'],
    [['--external-id', 'x', '--role', 'developer'], '--role must be admin or user'],
    [['--external-id'], 'bad argument'],
  ])('parseArgs rejects %j', (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(message);
  });

  it('parseArgs reads external id, role and reason', () => {
    expect(parseArgs(['--external-id', 'x', '--role', 'admin', '--reason', 'why'])).toEqual({
      externalId: 'x',
      role: 'admin',
      reason: 'why',
    });
  });
});
