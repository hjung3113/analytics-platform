// One read gate for platform entities (ADR-0069 decisions 6 and 9): `getEntity` and `entityAudit`
// both go through `gateEntity`, whose read decision is the owning module's detail-read decision — never a repo and
// never the entity-link provider `canRead` (looser than the screen detail endpoints: Finding/Task do
// not require the elevated role there). A denial carries no row fields.

import { HttpError } from '../../lib/errors.js';
import type { FindingsService } from '../findings/index.js';
import type { TasksService } from '../tasks/index.js';
import type { VocReadService } from '../voc/index.js';
import { ENTITY_READABLE_TYPES, isUuid, parseEntityRef } from './audit-query.js';
import type { Outcome } from './envelope.js';
import type { PlatformActor } from './permissions.js';

export type PlatformEntityType = (typeof ENTITY_READABLE_TYPES)[number];

/** The `getEntity` projection: identifiers, title and status fields only (no free text beyond the title). */
export type PlatformEntity =
  | { type: 'voc'; id: string; displayId: string; title: string; status: string }
  | {
      type: 'finding';
      id: string;
      displayId: string;
      title: string;
      status: string;
      severity: string;
      managedSystemId: string;
    }
  | {
      type: 'task';
      id: string;
      displayId: string;
      title: string;
      status: string;
      priority: string;
      managedSystemId: string;
      dueDate: string | null;
    };

export interface EntityReadDeps {
  vocReadService: Pick<VocReadService, 'resolveVocReference'>;
  findingsService: Pick<FindingsService, 'getFinding'>;
  tasksService: Pick<TasksService, 'getTask'>;
}

export type EntityGate =
  | { ok: true; ref: { type: PlatformEntityType; id: string }; entity: PlatformEntity }
  | { ok: false; outcome: Outcome; message: string };

const ROLE_LEVELS = ['admin', 'developer', 'user'] as const;

/** A module refusing the read (missing or not permitted) is "not readable"; anything else is a fault. */
function refusal(error: unknown): null {
  if (
    error instanceof HttpError &&
    (error.code.startsWith('not_found') || error.code === 'permission.denied')
  ) {
    return null;
  }
  throw error;
}

export function createEntityReader(deps: EntityReadDeps) {
  async function readEntity(
    actor: PlatformActor,
    type: PlatformEntityType,
    id: string,
  ): Promise<PlatformEntity | null> {
    const roleLevel = ROLE_LEVELS.find((r) => r === actor.role_level) ?? 'user';
    const ctx = {
      actor_id: actor.actor_id,
      workspace_id: actor.workspace_id,
      role_level: roleLevel,
    };
    try {
      switch (type) {
        case 'voc': {
          const ref = await deps.vocReadService.resolveVocReference({ actor: ctx, vocId: id });
          if (ref.visibility_state !== 'allowed') return null;
          return {
            type,
            id: ref.id,
            displayId: ref.display_id,
            title: ref.title,
            status: ref.reporter_facing_status,
          };
        }
        case 'finding': {
          const f = await deps.findingsService.getFinding({ actor: ctx, findingId: id });
          return {
            type,
            id: f.id,
            displayId: f.display_id,
            title: f.title,
            status: f.status,
            severity: f.severity,
            managedSystemId: f.primary_managed_system_id,
          };
        }
        case 'task': {
          const t = await deps.tasksService.getTask({ actor: ctx, taskId: id });
          return {
            type,
            id: t.id,
            displayId: t.display_id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            managedSystemId: t.primary_managed_system_id,
            dueDate: t.due_date,
          };
        }
      }
    } catch (error) {
      return refusal(error);
    }
  }

  /**
   * Order shared by both methods: parse → `error`; scoped → `error`; type → `error`; a non-uuid id,
   * a missing row and an unreadable row → one `forbidden` "Not readable" (existence is never revealed).
   */
  async function gateEntity(actor: PlatformActor, body: unknown): Promise<EntityGate> {
    const ref = parseEntityRef(body);
    if (!ref) return { ok: false, outcome: 'error', message: 'Invalid entity reference' };
    if (ref.scopeId !== null)
      return { ok: false, outcome: 'error', message: 'Entity has no scope' };
    if (!(ENTITY_READABLE_TYPES as readonly string[]).includes(ref.type)) {
      return { ok: false, outcome: 'error', message: 'Unknown entity type' };
    }
    const type = ref.type as PlatformEntityType;
    const entity = isUuid(ref.id) ? await readEntity(actor, type, ref.id) : null;
    if (!entity) return { ok: false, outcome: 'forbidden', message: 'Not readable' };
    return { ok: true, ref: { type, id: ref.id }, entity };
  }

  return { gateEntity };
}

export type EntityReader = ReturnType<typeof createEntityReader>;
