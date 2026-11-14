// set-actor-role CLI core (#1266 b2): audited, serialized, refuses unsafe changes.
// Fresh workspace per suite. Runs as the migrate role (the CLI's role); the
// runtime role is not used because the backend never receives the migrate URL.

import { randomUUID } from 'node:crypto';

import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../db/client.js';
import { HttpError } from '../../lib/errors.js';
import { createAuditService } from '../../modules/core/audit/audit-service.js';
import { createIdempotencyService } from '../../modules/core/idempotency/idempotency-service.js';
import {
  NOTIFICATION_DISPATCH_QUEUE,
  createNotificationNotifier,
  createPgBossNotificationDispatcher,
} from '../../modules/notifications/index.js';
import { createCheckService } from '../../modules/permissions/check-service.js';
import { createGrantAdminService } from '../../modules/permissions/grant-admin-service.js';
import { runBootstrapSeed } from '../../seed/bootstrap.js';
import { SetActorRoleError, parseArgs, setActorRole } from '../set-actor-role.js';

const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const runIntegration = Boolean(MIGRATE_URL && process.env.WORKSPACE_ID);

describe.skipIf(!runIntegration)('set-actor-role', () => {
  const workspaceId = randomUUID();
  let h: DbHandle;
  let h2: DbHandle;
  let boss: PgBoss;
  let notify: ReturnType<typeof createNotificationNotifier>;

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
    await h.pool.query('delete from permission.permission_grants where workspace_id = $1', [workspaceId]);
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
    // Real pg-boss enqueue inside the caller's transaction (no start), as the CLI wires it.
    boss = new PgBoss({
      db: { executeSql: (text, values) => h.pool.query(text, values as unknown[] | undefined) },
      schema: 'pgboss',
      migrate: false,
      createSchema: false,
      supervise: false,
      schedule: false,
    });
    boss.on('error', () => {});
    await boss.createQueue(NOTIFICATION_DISPATCH_QUEUE).catch(() => {});
    notify = createNotificationNotifier(createPgBossNotificationDispatcher(boss));
  });

  afterAll(async () => {
    await h?.pool.query(
      `delete from pgboss.job where name = $1 and data ->> 'workspace_id' = $2`,
      [NOTIFICATION_DISPATCH_QUEUE, workspaceId],
    );
    await h?.pool.query('delete from permission.permission_grants where workspace_id = $1', [workspaceId]);
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
    let signalCounted: () => void = () => undefined;
    const aCounted = new Promise<void>((r) => {
      signalCounted = r;
    });
    let release: () => void = () => undefined;
    const released = new Promise<void>((r) => {
      release = r;
    });
    // A pauses inside its transaction after counting admins; B starts only then.
    const a = setActorRole(
      h,
      { workspaceId, externalId: 'sub-c', role: 'user' },
      {
        afterAdminCount: async () => {
          signalCounted();
          await released;
        },
      },
    );
    await aCounted;
    const b = setActorRole(h2, { workspaceId, externalId: 'sub-d', role: 'user' });
    const bSettled = b.then(
      () => 'ok',
      () => 'rejected',
    );
    // B must be blocked behind A's lock (or, without the lock, would race ahead).
    const early = await Promise.race([
      bSettled,
      new Promise<string>((r) => setTimeout(() => r('blocked'), 300)),
    ]);
    release();
    const results = await Promise.allSettled([a, b]);
    // Without the lock B finishes during the pause and both demote.
    expect(early).toBe('blocked');
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

  it('rolls the role change back when the audit write fails', async () => {
    await resetAdmins();
    await addActor('sub-e', 'user');
    await expect(
      setActorRole(
        h,
        { workspaceId, externalId: 'sub-e', role: 'admin' },
        {
          afterUpdate: async () => {
            throw new Error('audit unavailable');
          },
        },
      ),
    ).rejects.toThrow('audit unavailable');
    expect(await roleOf('sub-e')).toBe('user');
    expect(await auditRows()).toHaveLength(0);
  });

  async function systemId(): Promise<string> {
    const r = await h.pool.query<{ id: string }>(
      "select id from core.actors where workspace_id = $1 and actor_type = 'system'",
      [workspaceId],
    );
    return r.rows[0]?.id ?? '';
  }
  async function grant(actorId: string, extra = ''): Promise<string> {
    const r = await h.pool.query<{ id: string }>(
      `insert into permission.permission_grants (workspace_id, actor_id, capability, granted_by_actor_id${extra ? ', ' + extra.split('=')[0] : ''})
       values ($1, $2, 'workspace.admin', $3${extra ? ", " + extra.split('=')[1] : ''}) returning id`,
      [workspaceId, actorId, await systemId()],
    );
    return r.rows[0]?.id ?? '';
  }
  async function canAdmin(actorId: string, role: 'admin' | 'user'): Promise<boolean> {
    const decision = await createCheckService({ db: h.db }).checkCapability(
      { workspace_id: workspaceId, actor_id: actorId, role_level: role },
      'workspace.admin',
      { workspace_id: workspaceId },
    );
    return decision.allow;
  }
  async function revokedAudit(): Promise<Array<{ subject_id: string; actor_id: string; detail: Record<string, unknown> }>> {
    const r = await h.pool.query(
      `select subject_id, actor_id, detail from core.audit_log
       where workspace_id = $1 and event_type = 'permission_revoked'`,
      [workspaceId],
    );
    return r.rows;
  }

  async function queuedJobs(grantId: string): Promise<number> {
    const r = await h.pool.query<{ n: number }>(
      `select count(*)::int as n from pgboss.job where name = $1 and data ->> 'subject_id' = $2`,
      [NOTIFICATION_DISPATCH_QUEUE, grantId],
    );
    return r.rows[0]?.n ?? 0;
  }

  it('refuses demoting an admin who holds an active workspace.admin grant without the flag (exit 5)', async () => {
    await resetAdmins();
    const a = await addActor('sub-g1', 'admin');
    await addActor('sub-g2', 'admin');
    await grant(a, "expires_at=now() + interval '1 day'");
    const code = await exitCodeOf(setActorRole(h, { workspaceId, externalId: 'sub-g1', role: 'user' }));
    expect(code).toBe(5);
    const refused = await h.pool.query<{ id: string }>(
      'select id from permission.permission_grants where workspace_id = $1 and actor_id = $2',
      [workspaceId, a],
    );
    expect(await queuedJobs(refused.rows[0]?.id ?? '')).toBe(0);
    await expect(setActorRole(h, { workspaceId, externalId: 'sub-g1', role: 'user' })).rejects.toThrow(
      /1 active workspace\.admin grant/,
    );
    expect(await roleOf('sub-g1')).toBe('admin');
    expect(await auditRows()).toHaveLength(0);
    expect(await revokedAudit()).toHaveLength(0);
    const open = await h.pool.query(
      'select 1 from permission.permission_grants where workspace_id = $1 and revoked_at is null',
      [workspaceId],
    );
    expect(open.rowCount).toBe(1);
  });

  it('with revokeAdminGrants: demotes, revokes the grants, audits it as system, and workspace.admin is denied', async () => {
    await resetAdmins();
    const a = await addActor('sub-h1', 'admin');
    await addActor('sub-h2', 'admin');
    const g1 = await grant(a, "expires_at=now() + interval '1 day'");
    expect(await canAdmin(a, 'user')).toBe(true); // the leak the demotion used to leave open
    const r = await setActorRole(h, {
      workspaceId,
      externalId: 'sub-h1',
      role: 'user',
      reason: 'left the team',
      revokeAdminGrants: true,
    }, {}, { notify });
    expect(r.changed).toBe(true);
    expect(await roleOf('sub-h1')).toBe('user');
    const sys = await systemId();
    const rows = await revokedAudit();
    expect(rows.map((x) => x.subject_id)).toEqual([g1]);
    for (const row of rows) {
      expect(row.actor_id).toBe(sys);
      expect(row.detail).toMatchObject({
        capability: 'workspace.admin',
        grantee_actor_id: a,
        managed_system_id: null,
        reason: 'left the team',
      });
    }
    expect(await auditRows()).toHaveLength(1);
    const left = await h.pool.query(
      `select revoked_by_actor_id from permission.permission_grants where workspace_id = $1 and revoked_at is null`,
      [workspaceId],
    );
    expect(left.rowCount).toBe(0);
    expect(await canAdmin(a, 'user')).toBe(false);
    // One grantee notification, queued in the committing transaction.
    expect(await queuedJobs(g1)).toBe(1);
    const job = await h.pool.query<{ data: Record<string, unknown> }>(
      `select data from pgboss.job where name = $1 and data ->> 'subject_id' = $2`,
      [NOTIFICATION_DISPATCH_QUEUE, g1],
    );
    expect(job.rows[0]?.data).toMatchObject({
      actor_id: a,
      event_type: 'permission_grant.revoked',
      subject_type: 'permission_grant',
    });
  });

  it('ignores revoked, superseded and expired workspace.admin grants and lowers as before', async () => {
    await resetAdmins();
    const a = await addActor('sub-i1', 'admin');
    await addActor('sub-i2', 'admin');
    await grant(a, 'revoked_at=now()');
    await grant(a, 'superseded_at=now()');
    await grant(a, "expires_at=now() - interval '1 day'");
    const r = await setActorRole(h, { workspaceId, externalId: 'sub-i1', role: 'user' });
    expect(r.changed).toBe(true);
    expect(await revokedAudit()).toHaveLength(0);
  });

  it('lowers an admin without grants as before, and promotion ignores grants', async () => {
    await resetAdmins();
    await addActor('sub-j1', 'admin');
    await addActor('sub-j2', 'admin');
    const u = await addActor('sub-j3', 'user');
    await grant(u);
    const revokedJobs = async (): Promise<number> => {
      const r = await h.pool.query<{ n: number }>(
        `select count(*)::int as n from pgboss.job where name = $1 and data ->> 'workspace_id' = $2 and data ->> 'event_type' = 'permission_grant.revoked'`,
        [NOTIFICATION_DISPATCH_QUEUE, workspaceId],
      );
      return r.rows[0]?.n ?? 0;
    };
    const jobsBefore = await revokedJobs();
    expect((await setActorRole(h, { workspaceId, externalId: 'sub-j1', role: 'user' }, {}, { notify })).changed).toBe(true);
    expect((await setActorRole(h, { workspaceId, externalId: 'sub-j3', role: 'admin' }, {}, { notify })).changed).toBe(true);
    expect((await setActorRole(h, { workspaceId, externalId: 'sub-j3', role: 'admin' }, {}, { notify })).changed).toBe(false);
    expect(await revokedAudit()).toHaveLength(0);
    expect(await revokedJobs()).toBe(jobsBefore);
  });

  it('rolls the revoked grants back when the role change fails after revoking', async () => {
    await resetAdmins();
    const a = await addActor('sub-k1', 'admin');
    await addActor('sub-k2', 'admin');
    const g = await grant(a);
    await expect(
      setActorRole(
        h,
        { workspaceId, externalId: 'sub-k1', role: 'user', revokeAdminGrants: true },
        {
          afterUpdate: async () => {
            throw new Error('audit unavailable');
          },
        },
        { notify },
      ),
    ).rejects.toThrow('audit unavailable');
    expect(await queuedJobs(g)).toBe(0);
    const open = await h.pool.query(
      'select 1 from permission.permission_grants where workspace_id = $1 and revoked_at is null',
      [workspaceId],
    );
    expect(open.rowCount).toBe(1);
    expect(await revokedAudit()).toHaveLength(0);
  });

  it('a self-grant that waited on the demoted actor row is denied and writes nothing (#2057 C1)', async () => {
    await resetAdmins();
    const a = await addActor('sub-l1', 'admin');
    await addActor('sub-l2', 'admin');
    await grant(a);
    const service = createGrantAdminService({
      db: h2.db,
      checkService: createCheckService({ db: h2.db }),
      auditService: createAuditService(),
      idempotencyService: createIdempotencyService(),
      notify,
    });
    let signalSelected: () => void = () => undefined;
    const selected = new Promise<void>((r) => {
      signalSelected = r;
    });
    let release: () => void = () => undefined;
    const released = new Promise<void>((r) => {
      release = r;
    });
    // The CLI holds the actor row and the selected grants, paused before it writes.
    const cli = setActorRole(
      h,
      { workspaceId, externalId: 'sub-l1', role: 'user', revokeAdminGrants: true },
      {
        afterAdminCount: async () => {
          signalSelected();
          await released;
        },
      },
      { notify },
    );
    await selected;
    // Session role is still admin, so the early gate passes; then it waits for the actor row.
    const selfGrant = service
      .grant(
        { workspace_id: workspaceId, actor_id: a, role_level: 'admin' },
        {
          actor_id: a,
          capability: 'workspace.admin',
          reason: 'restore my own access',
          self_approval: { policy_citation: 'policy 1', peer_reviewer_absence: 'no peer available' },
        },
      )
      .then(
        () => 'granted',
        (e: unknown) => (e instanceof HttpError ? e.code : 'error'),
      );
    const early = await Promise.race([
      selfGrant,
      new Promise<string>((r) => setTimeout(() => r('blocked'), 400)),
    ]);
    expect(early).toBe('blocked');
    release();
    expect((await cli).changed).toBe(true);
    expect(await selfGrant).toBe('permission.denied');
    const active = await h.pool.query(
      `select 1 from permission.permission_grants
        where workspace_id = $1 and actor_id = $2 and revoked_at is null and superseded_at is null`,
      [workspaceId, a],
    );
    expect(active.rowCount).toBe(0);
    const granted = await h.pool.query(
      `select 1 from core.audit_log where workspace_id = $1 and event_type = 'permission_granted'`,
      [workspaceId],
    );
    expect(granted.rowCount).toBe(0);
    expect(await canAdmin(a, 'user')).toBe(false);
  });

  it('parseArgs reads --revoke-admin-grants as a flag without a value', () => {
    expect(parseArgs(['--external-id', 'x', '--role', 'user', '--revoke-admin-grants'])).toEqual({
      externalId: 'x',
      role: 'user',
      revokeAdminGrants: true,
    });
    expect(
      parseArgs(['--revoke-admin-grants', '--external-id', 'x', '--role', 'user', '--reason', 'r']),
    ).toEqual({ externalId: 'x', role: 'user', reason: 'r', revokeAdminGrants: true });
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
