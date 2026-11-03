// The public-read rule has two faces (SQL + object). This puts both on ONE fixture and asserts they admit
// the same VOCs per actor shape, and that a `voc.read_public`-only grant leaves every ADR-0031 face
// (actorEffectiveScope, similarVocVisibilityPredicate, isVocVisibleToActor, canReadVocAsSource) closed.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { sqlUuidArray } from '../../../../db/sql-arrays.js';
import { createCheckService } from '../../../permissions/check-service.js';
import {
  actorEffectiveScope,
  canReadVocAsSource,
  isVocVisibleToActor,
  similarVocVisibilityPredicate,
} from '../../authorization.js';
import { isVocPubliclyVisible, publicVocVisibilityPredicate, resolvePublicReadRule } from '../rule.js';
import { WORKSPACE_ID, type World, createWorld, runIntegration } from './_world.js';

const TAG = 'it-pubpred';

describe.skipIf(!runIntegration)('public-read rule: SQL face = object face; ADR-0031 faces closed', () => {
  let w: World;

  beforeAll(async () => {
    w = await createWorld(TAG);
  });
  afterAll(async () => {
    await w?.teardown();
  });
  beforeEach(async () => {
    await w.migrate.pool.query(
      `delete from voc.vocs where primary_managed_system_id in (select id from core.managed_systems where slug like $1)`,
      [`${TAG}-%`],
    );
  });

  async function rows() {
    const mk = async (system: string, reporter: Parameters<World['insertVoc']>[1]) => w.insertVoc(system, reporter, 'x');
    await mk(w.systems.a, 'reporter');
    await mk(w.systems.a, 'admin');
    await mk(w.systems.b, 'reporter');
    await mk(w.systems.b, 'admin');
    await mk(w.systems.platform, 'admin');
    const res = await w.migrate.pool.query<{ id: string; primary_managed_system_id: string; reporter_id: string }>(
      `select v.id, v.primary_managed_system_id, v.reporter_id from voc.vocs v
        join core.managed_systems ms on ms.id = v.primary_managed_system_id where ms.slug like $1`,
      [`${TAG}-%`],
    );
    return res.rows;
  }

  it.each(['admin', 'plain', 'reporter', 'granted', 'operatorB', 'publicOnlyB'] as const)(
    'actor %s: the predicate admits exactly the rows the object face admits',
    async (who) => {
      const all = await rows();
      const actor = { actor_id: w.actors[who], workspace_id: WORKSPACE_ID, role_level: who === 'admin' ? 'admin' : who === 'operatorB' ? 'developer' : 'user' } as const;
      const rule = await resolvePublicReadRule(w.appHandle.db, actor);
      const bySql = await w.appHandle.db.execute<{ id: string }>(sql`
        select v.id from voc.vocs v where v.id = any(${sqlUuidArray(all.map((r) => r.id))})
          and ${publicVocVisibilityPredicate(rule, sql`v`)}`);
      const byObject = all.filter((r) => isVocPubliclyVisible(rule, r)).map((r) => r.id);
      expect(bySql.rows.map((r) => r.id).sort()).toEqual(byObject.sort());
      // Non-vacuous: every shape sees at least the platform row, and only admin sees everything.
      expect(byObject.length).toBeGreaterThan(0);
      if (who !== 'admin') expect(byObject.length).toBeLessThan(all.length);
    },
  );

  it('a voc.read_public-only grant leaves every ADR-0031 face closed', async () => {
    const all = await rows();
    const actor = { actor_id: w.actors.granted, workspace_id: WORKSPACE_ID, role_level: 'user' } as const;
    const scope = await actorEffectiveScope(w.appHandle.db, actor);
    expect(scope).toEqual({ kind: 'scoped', managedSystemIds: [] });
    const inA = all.filter((r) => r.primary_managed_system_id === w.systems.a && r.reporter_id !== w.actors.granted);
    expect(inA.length).toBeGreaterThan(0);
    for (const r of inA) expect(isVocVisibleToActor(scope, actor.actor_id, r)).toBe(false);
    const sqlVisible = await w.appHandle.db.execute<{ id: string }>(sql`
      select v.id from voc.vocs v where v.id = any(${sqlUuidArray(all.map((r) => r.id))})
        and ${similarVocVisibilityPredicate(scope, actor.actor_id, sql`v`)}`);
    expect(sqlVisible.rows).toEqual([]);
    const check = createCheckService({ db: w.appHandle.db });
    for (const r of inA) {
      expect(await canReadVocAsSource(check, actor, { managedSystemId: r.primary_managed_system_id, reporterId: r.reporter_id })).toBe(false);
    }
    // Positive control: the voc.read operator on B passes the same faces for B.
    const op = { actor_id: w.actors.operatorB, workspace_id: WORKSPACE_ID, role_level: 'developer' } as const;
    const inB = all.find((r) => r.primary_managed_system_id === w.systems.b);
    expect(inB).toBeDefined();
    expect(isVocVisibleToActor(await actorEffectiveScope(w.appHandle.db, op), op.actor_id, inB as NonNullable<typeof inB>)).toBe(true);
    expect(await canReadVocAsSource(check, op, { managedSystemId: w.systems.b, reporterId: null })).toBe(true);
  });
});
