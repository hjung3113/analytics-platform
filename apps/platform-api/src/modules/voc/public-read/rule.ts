// apps/platform-api/src/modules/voc/public-read/rule.ts
//
// The VOC public-read rule (ADR-0110 decision 3). It is NOT the FO ADR-0031 rule and must never be
// merged into it: `authorization.ts` keeps `actorEffectiveScope`, `similarVocVisibilityPredicate`,
// `isVocVisibleToActor` and `canReadVocAsSource` untouched, so every operator, peer,
// recommendation, cluster and dashboard path is unchanged by `voc.read_public`.
//
// A VOC is publicly readable by an actor when ANY of these holds:
//   1. the actor reported it;
//   2. its Managed System is in `voc.read_public ∪ voc.read ∪ voc.triage` scope of the actor
//      (operators keep seeing what they already see, through the public shape);
//   3. its Managed System is the workspace's 「플랫폼」 system (`platformManagedSystemId`).
//
// One definition, two faces, pinned together by `__tests__/public-read-predicate.integration.test.ts`:
// `publicVocVisibilityPredicate` (SQL; callers pass the row alias) and `isVocPubliclyVisible`
// (already-loaded rows). Do not add a third.

import { sql } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import { sqlUuidArray } from '../../../db/sql-arrays.js';
import type { Tx } from '../../../db/tx.js';
import { platformManagedSystemId } from '../../managed-systems/read-projections.js';
import {
  type Scope,
  type ScopeActorContext,
  actorScopeForCapability,
  scopeIncludes,
  unionScopes,
} from '../../permissions/scope-service.js';
import { type ActorContextLite, actorEffectiveScope } from '../authorization.js';

export interface PublicReadRule {
  actorId: string;
  /** `voc.read_public` ∪ `voc.read` ∪ `voc.triage`. */
  scope: Scope;
  /** Null when the workspace has no single live 「플랫폼」 system: the platform arm is off. */
  platformManagedSystemId: string | null;
}

export async function resolvePublicReadRule(
  db: Db | Tx,
  actor: ActorContextLite,
): Promise<PublicReadRule> {
  const [publicScope, effectiveScope, platformId] = await Promise.all([
    actorScopeForCapability(db, actor as ScopeActorContext, 'voc.read_public'),
    actorEffectiveScope(db, actor),
    platformManagedSystemId(db, actor.workspace_id),
  ]);
  return {
    actorId: actor.actor_id,
    scope: unionScopes(publicScope, effectiveScope),
    platformManagedSystemId: platformId,
  };
}

/** SQL face. `vocAlias` is a table alias (e.g. sql`v`), not a value. */
export function publicVocVisibilityPredicate(
  rule: PublicReadRule,
  vocAlias: ReturnType<typeof sql>,
): ReturnType<typeof sql> {
  if (rule.scope.kind === 'all') return sql`true`;
  const arms = [
    sql`${vocAlias}.reporter_id = ${rule.actorId}`,
    sql`${vocAlias}.primary_managed_system_id = ANY(${sqlUuidArray(rule.scope.managedSystemIds)})`,
  ];
  if (rule.platformManagedSystemId !== null) {
    arms.push(sql`${vocAlias}.primary_managed_system_id = ${rule.platformManagedSystemId}`);
  }
  return sql`(${sql.join(arms, sql` OR `)})`;
}

/** Object face. */
export function isVocPubliclyVisible(
  rule: PublicReadRule,
  voc: { primary_managed_system_id: string; reporter_id: string },
): boolean {
  return (
    voc.reporter_id === rule.actorId ||
    scopeIncludes(rule.scope, voc.primary_managed_system_id) ||
    (rule.platformManagedSystemId !== null &&
      voc.primary_managed_system_id === rule.platformManagedSystemId)
  );
}
