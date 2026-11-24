// VOC list view scope resolution and shared scope membership helper.
import type { ListVocsQuery } from '@ap/feature-shared';
import pg from 'pg';
import type { Db } from '../../../db/client.js';
import { HttpError } from '../../../lib/errors.js';
import type { CheckService } from '../../permissions/check-service.js';
import { checkPermissionRequestTarget } from '../../permissions/read-projections.js';
import { scopeIncludes, scopeIsNonEmpty } from '../../permissions/scope-service.js';
import type { Scope } from '../authorization.js';
import type { ReadActorContext } from '../read-service.js';

// ── Scope helpers ────────────────────────────────────────────────────────────

/** A failure of the database itself (a PostgreSQL error, a lost or refused connection), not a bug in the caller. */
function isDatabaseFailure(error: unknown): boolean {
  if (error instanceof pg.DatabaseError) return true;
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  return (typeof code === 'string' && /^E[A-Z]+$/.test(code)) || /^Connection terminated|timeout exceeded when trying to connect/.test(error.message);
}

export function msInScope(scope: Scope, msId: string): boolean {
  return scopeIncludes(scope, msId);
}

function intersectScopes(a: Scope, b: Scope): Scope {
  if (a.kind === 'all' && b.kind === 'all') return { kind: 'all' };
  const aIds = a.kind === 'all' ? null : a.managedSystemIds;
  const bIds = b.kind === 'all' ? null : b.managedSystemIds;
  if (aIds === null && bIds !== null) return { kind: 'scoped', managedSystemIds: bIds };
  if (bIds === null && aIds !== null) return { kind: 'scoped', managedSystemIds: aIds };
  if (aIds !== null && bIds !== null) {
    const bSet = new Set(bIds);
    return { kind: 'scoped', managedSystemIds: aIds.filter((id) => bSet.has(id)) };
  }
  return { kind: 'all' };
}

type ResolvedVocListScope = {
  scopeFilter: Scope;
  actorIdForMyFilter?: string;
};

/**
 * Resolve the view's VOC scope. List denials may include a hint to request access
 * or view the actor's own pending or needs_more_info request. Count callers
 * consume the denial code and can skip hints entirely.
 */
export async function resolveVocListScope(args: {
  actor: ReadActorContext;
  db: Db;
  checkService: Pick<CheckService, 'checkCapability' | 'capabilities'>;
  query: Pick<ListVocsQuery, 'view' | 'managed_system_id'>;
  readScope: Scope;
  triageScope: Scope | undefined;
  withRequestHint?: boolean;
}): Promise<ResolvedVocListScope> {
  const { actor, db, checkService, query, readScope, triageScope, withRequestHint = true } = args;
  const { view, managed_system_id } = query;

  async function requestablePermissionDetail(
    permission: 'voc.read' | 'voc.triage',
    managedSystemId: string | null,
  ) {
    if (!withRequestHint) return undefined;
    if (managedSystemId !== null) {
      try {
        const { requestAvailability } = await checkPermissionRequestTarget(db, checkService, actor, permission, {
          workspace_id: actor.workspace_id,
          managed_system_id: managedSystemId,
        });
        if (requestAvailability === 'none') return undefined;
      } catch (error) {
        // The scope already denied the list read: a database that cannot answer the hint lookup must not turn that 403
        // into a 500. Any other error is a bug in the lookup and propagates.
        if (isDatabaseFailure(error)) return undefined;
        throw error;
      }
    }
    return { requestable_permission: { permission, managed_system_id: managedSystemId } };
  }

  if (view === 'my') {
    if (managed_system_id === 'all') {
      throw new HttpError('validation.failed', 'managed_system_id=all not allowed for view=my', {
        fields: [{ path: ['managed_system_id'], code: 'invalid' }],
      });
    }
    return {
      scopeFilter:
        managed_system_id && managed_system_id !== 'all'
          ? { kind: 'scoped', managedSystemIds: [managed_system_id] }
          : { kind: 'all' },
      actorIdForMyFilter: actor.actor_id,
    };
  }

  if (view === 'inbox') {
    if (readScope.kind === 'scoped' && readScope.managedSystemIds.length === 0) {
      if (actor.role_level === 'developer') {
        throw new HttpError(
          'permission.scope_required',
          'voc.read capability required; developer needs MS-scoped grant',
          {
            requiredScope: [],
            ...(await requestablePermissionDetail('voc.read', null)),
          },
        );
      }
      throw new HttpError('permission.denied', 'no voc.read scope for actor', {
        reason: 'no_grant',
      });
    }
    if (managed_system_id && managed_system_id !== 'all') {
      if (!msInScope(readScope, managed_system_id)) {
        throw new HttpError(
          'permission.scope_required',
          'managed_system_id not in voc.read scope',
          {
            requiredScope: [managed_system_id],
            ...(await requestablePermissionDetail('voc.read', managed_system_id)),
          },
        );
      }
      return { scopeFilter: { kind: 'scoped', managedSystemIds: [managed_system_id] } };
    }
    return { scopeFilter: readScope };
  }

  if (!triageScope) {
    throw new HttpError(
      'permission.denied',
      'no voc.triage scope for actor',
      await requestablePermissionDetail('voc.triage', null),
    );
  }
  const triage = triageScope;
  const intersected = intersectScopes(readScope, triage);
  const selected = managed_system_id && managed_system_id !== 'all' ? managed_system_id : undefined;
  if (intersected.kind === 'scoped' && intersected.managedSystemIds.length === 0) {
    const holdsTriage = selected ? msInScope(triage, selected) : scopeIsNonEmpty(triage);
    if (holdsTriage) {
      // #1170: `voc.read` is requestable only per Managed System. With no
      // selection, a triage scope held on exactly one System names it so the
      // request validates; several Systems (or workspace-wide) leave the
      // choice to the actor.
      const fallbackSystemId =
        triage.kind === 'scoped' && triage.managedSystemIds.length === 1
          ? (triage.managedSystemIds[0] ?? null)
          : null;
      throw new HttpError(
        'permission.denied',
        'voc.read required to use voc.triage scope',
        await requestablePermissionDetail('voc.read', selected ?? fallbackSystemId),
      );
    }
    throw new HttpError(
      'permission.denied',
      'no voc.triage scope for actor',
      await requestablePermissionDetail('voc.triage', null),
    );
  }
  if (selected) {
    if (!msInScope(intersected, selected)) {
      const asksForRead = msInScope(triage, selected) && !msInScope(readScope, selected);
      throw new HttpError(
        'permission.scope_required',
        asksForRead
          ? 'voc.read required for the selected managed system'
          : 'managed_system_id not in voc.triage scope',
        {
          requiredScope: [selected],
          ...(await requestablePermissionDetail(
            asksForRead ? 'voc.read' : 'voc.triage',
            selected,
          )),
        },
      );
    }
    return { scopeFilter: { kind: 'scoped', managedSystemIds: [selected] } };
  }
  return { scopeFilter: intersected };
}
