// The development project write actions (#1444 c, design §5): create, set stage, reopen, update. Right:
// `lifecycle.project.manage` (workspace-scoped; Admin passes through the module bypass, a User role is refused by the
// supported-scope policy). Rules: the workspace is the actor's; every write is one transaction holding the row change,
// the `development_event` row and the audit row; every change bumps `row_version`; the project row is locked by
// `currentVersion` before the event `seq` is allocated, so the history is gapless per project. A save that changes
// nothing answers `ok` with the current version and writes no event. `completed` is reached only through the Gate (node
// e): `projectSetStage` refuses it. Every status-dependent refusal is a `MenuActionInvalidError` thrown from `handle`.

import { createAuditService } from '../core/audit/audit-service.js';
import type { Tx } from '../../db/tx.js';
import {
  type ActionHandlerResult,
  type FieldError,
  type MenuActionDeclaration,
  MenuActionInvalidError,
} from '../menu-dispatch/types.js';
import { type CheckService, applyAdminModuleBypass } from '../permissions/check-service.js';
import type { PlatformActor } from '../platform-port/permissions.js';
import type { KnowledgeLookup } from '../log-knowledge/index.js';
import {
  LIFECYCLE_INPUT_KEYS,
  type LifecycleInput,
  parseLifecycleInput,
  validateLifecycleInput,
} from './domain/lifecycle-input.js';
import { canSetStage, isOpenStage, reopenTarget } from './domain/stage-transitions.js';
import { LOG_MODELS_MENU_ID } from './menu.js';
import {
  OPEN_PROJECT_CONSTRAINT,
  type ProjectPatch,
  type ProjectRow,
  actorInWorkspace,
  insertEvent,
  insertProject,
  lockProject,
  mapUnique,
  patchProject,
  stageBeforeLastCancel,
} from './repositories/lifecycle-write.js';

export const LIFECYCLE_PROJECT_PERMISSION = 'lifecycle.project.manage';
/** The menu permission the four actions declare: bootstrap lists it exactly for the users `LIFECYCLE_PROJECT_PERMISSION` lets write (`platform-port/permissions.ts`). */
export const LIFECYCLE_PROJECT_MENU_PERMISSION = 'lifecycle:project-manage';

/** The reads of the same menu that show what a project write changes. */
const INVALIDATES = [
  'logLifecycle.models',
  'logLifecycle.projectDetail',
  'logLifecycle.projectEvents',
  'logLifecycle.rounds',
] as const;

export interface ProjectActionDeps {
  checkService: CheckService;
  knowledgeLookup: KnowledgeLookup;
}

type ProjectOp = 'projectCreate' | 'projectSetStage' | 'projectReopen' | 'projectUpdate';

const invalid = (...errors: FieldError[]) => new MenuActionInvalidError(errors);
const openProjectExists = (path: string) => () => invalid({ path: [path], code: 'open_project_exists' });

export function projectActions(deps: ProjectActionDeps): MenuActionDeclaration[] {
  const audit = createAuditService();

  const authorize = async (actor: PlatformActor, tx: Tx) =>
    applyAdminModuleBypass(
      actor.role_level,
      LIFECYCLE_PROJECT_PERMISSION,
      await deps.checkService.checkCapability(actor, LIFECYCLE_PROJECT_PERMISSION, { workspace_id: actor.workspace_id }, { tx }),
    ).allow;

  const record = (
    tx: Tx,
    actor: PlatformActor,
    type: 'created' | 'updated' | 'stage_changed' | 'cancelled' | 'reopened',
    projectId: string,
    detail: Record<string, unknown>,
  ) =>
    audit.record(tx, {
      workspace_id: actor.workspace_id,
      actor_id: actor.actor_id,
      event_type: `lifecycle.project.${type}`,
      subject_type: 'development_project',
      subject_id: projectId,
      summary: `development project ${type}`,
      detail,
    });

  /** The parsed, normalised input; `validate` ran before the handler, so a failure here is a bug. */
  function parsed<Op extends ProjectOp>(op: Op, input: Record<string, unknown>): LifecycleInput<Op> {
    const result = parseLifecycleInput(op, input);
    if (!result.ok) throw new Error(`action ${op}: validate passed but parse failed`);
    return result.value;
  }

  /** Locks the project row; its row version is the concurrency token. `null` = missing or another workspace's. */
  const currentVersion = async (tx: Tx, actor: PlatformActor, input: Record<string, unknown>) => {
    const row = await lockProject(tx, actor.workspace_id, input.id as string);
    return row ? String(row.rowVersion) : null;
  };

  async function lockExisting(tx: Tx, actor: PlatformActor, id: string, action: string): Promise<ProjectRow> {
    const row = await lockProject(tx, actor.workspace_id, id);
    if (!row) throw new Error(`action ${action}: currentVersion judged not_found first`);
    return row;
  }

  const base = (op: ProjectOp, concurrency: 'none' | 'version') => ({
    id: `logLifecycle.${op}`,
    menuId: LOG_MODELS_MENU_ID,
    inputKeys: LIFECYCLE_INPUT_KEYS[op],
    permission: LIFECYCLE_PROJECT_MENU_PERMISSION,
    requiresScope: false,
    concurrency,
    invalidates: INVALIDATES,
  });

  const done = (version: number): ActionHandlerResult => ({ data: { version: String(version) }, version: String(version) });

  /** The software must be a version of the model of the workspace (refusal `softwareId: not_found`). */
  async function checkSoftware(tx: Tx, workspaceId: string, modelId: string, softwareId: string) {
    if (!(await deps.knowledgeLookup.getSoftware(tx, workspaceId, modelId, softwareId))) {
      throw invalid({ path: ['softwareId'], code: 'not_found' });
    }
  }

  // ---- create -------------------------------------------------------------------------------------------------
  const projectCreate: MenuActionDeclaration = {
    spec: base('projectCreate', 'none'),
    authorize,
    validate: (input) => validateLifecycleInput('projectCreate', input),
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = parsed('projectCreate', input);
      const model = await deps.knowledgeLookup.getModel(tx, ws, value.modelId);
      if (!model) throw invalid({ path: ['modelId'], code: 'not_found' });
      if (!model.active) throw invalid({ path: ['modelId'], code: 'inactive' });
      const softwareId = value.softwareId ?? null;
      if (softwareId !== null) await checkSoftware(tx, ws, value.modelId, softwareId);
      if (!(await actorInWorkspace(tx, ws, value.ownerActorId))) throw invalid({ path: ['ownerActorId'], code: 'not_found' });

      const project = await mapUnique(
        () =>
          insertProject(tx, {
            workspaceId: ws,
            actorId: actor.actor_id,
            modelId: value.modelId,
            softwareId,
            kind: value.kind,
            ownerActorId: value.ownerActorId,
            targetDate: value.targetDate ?? null,
          }),
        OPEN_PROJECT_CONSTRAINT,
        openProjectExists('modelId'),
      );
      await insertEvent(tx, {
        workspaceId: ws,
        projectId: project.id,
        actorId: actor.actor_id,
        kind: 'created',
        before: {},
        after: {
          modelId: project.modelId,
          softwareId: project.softwareId,
          kind: project.kind,
          ownerActorId: project.ownerActorId,
          targetDate: project.targetDate,
          stage: project.stage,
        },
      });
      await record(tx, actor, 'created', project.id, {
        modelId: project.modelId,
        softwareId: project.softwareId,
        kind: project.kind,
        ownerActorId: project.ownerActorId,
      });
      return { data: { projectId: project.id, version: String(project.rowVersion) }, version: null };
    },
  };

  // ---- set stage ----------------------------------------------------------------------------------------------
  const projectSetStage: MenuActionDeclaration = {
    spec: base('projectSetStage', 'version'),
    authorize,
    validate: (input) => validateLifecycleInput('projectSetStage', input),
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = parsed('projectSetStage', input);
      const row = await lockExisting(tx, actor, value.id, 'projectSetStage');
      // `completed` is the Gate's (node e); same-stage, backward and every other pair is illegal. The answer does not
      // depend on the version the caller holds: a conflict replay lands on `invalid`, never on `conflict` again.
      const verdict = canSetStage(row.stage, value.toStage);
      if (verdict === 'gate_required') throw invalid({ path: ['toStage'], code: 'gate_required' });
      if (verdict !== 'ok') throw invalid({ path: ['toStage'], code: 'illegal_transition' });

      const from = row.stage;
      const to = value.toStage;
      const version = await patchProject(tx, ws, row.id, actor.actor_id, { stage: to });
      const cancelled = to === 'cancelled';
      await insertEvent(tx, {
        workspaceId: ws,
        projectId: row.id,
        actorId: actor.actor_id,
        kind: cancelled ? 'cancelled' : 'stage_changed',
        before: { stage: from },
        after: { stage: to },
        reason: value.reason ?? null,
      });
      if (cancelled) await record(tx, actor, 'cancelled', row.id, { from });
      else await record(tx, actor, 'stage_changed', row.id, { from, to });
      return done(version);
    },
  };

  // ---- reopen -------------------------------------------------------------------------------------------------
  const projectReopen: MenuActionDeclaration = {
    spec: base('projectReopen', 'version'),
    authorize,
    validate: (input) => validateLifecycleInput('projectReopen', input),
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = parsed('projectReopen', input);
      const row = await lockExisting(tx, actor, value.id, 'projectReopen');
      const from = row.stage;
      const before = from === 'cancelled' ? await stageBeforeLastCancel(tx, ws, row.id) : null;
      const to = reopenTarget(from, before);
      if (to === null) throw invalid({ path: ['id'], code: 'illegal_transition' });
      // The partial unique index is the one judge: another open project of the model refuses the reopen.
      const version = await mapUnique(
        () => patchProject(tx, ws, row.id, actor.actor_id, { stage: to }),
        OPEN_PROJECT_CONSTRAINT,
        openProjectExists('id'),
      );
      await insertEvent(tx, {
        workspaceId: ws,
        projectId: row.id,
        actorId: actor.actor_id,
        kind: 'reopened',
        before: { stage: from },
        after: { stage: to },
        reason: value.reason,
      });
      await record(tx, actor, 'reopened', row.id, { from, to });
      return done(version);
    },
  };

  // ---- update -------------------------------------------------------------------------------------------------
  const projectUpdate: MenuActionDeclaration = {
    spec: base('projectUpdate', 'version'),
    authorize,
    validate: (input) => validateLifecycleInput('projectUpdate', input),
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = parsed('projectUpdate', input);
      const row = await lockExisting(tx, actor, value.id, 'projectUpdate');
      // A completed or cancelled project is history: changing its software or owner would rewrite what the Gate saw.
      if (!isOpenStage(row.stage)) throw invalid({ path: ['id'], code: 'project_not_open' });

      const patch: ProjectPatch = {};
      const ownerBefore: Record<string, unknown> = {};
      const ownerAfter: Record<string, unknown> = {};
      const targetBefore: Record<string, unknown> = {};
      const targetAfter: Record<string, unknown> = {};
      const changed: string[] = [];
      if (value.ownerActorId !== undefined && value.ownerActorId !== row.ownerActorId) {
        if (!(await actorInWorkspace(tx, ws, value.ownerActorId))) throw invalid({ path: ['ownerActorId'], code: 'not_found' });
        patch.ownerActorId = value.ownerActorId;
        ownerBefore.ownerActorId = row.ownerActorId;
        ownerAfter.ownerActorId = value.ownerActorId;
        changed.push('ownerActorId');
      }
      if (value.targetDate !== undefined && value.targetDate !== row.targetDate) {
        patch.targetDate = value.targetDate;
        targetBefore.targetDate = row.targetDate;
        targetAfter.targetDate = value.targetDate;
        changed.push('targetDate');
      }
      if (value.softwareId !== undefined && value.softwareId !== row.softwareId) {
        if (value.softwareId !== null) await checkSoftware(tx, ws, row.modelId, value.softwareId);
        patch.softwareId = value.softwareId;
        targetBefore.softwareId = row.softwareId;
        targetAfter.softwareId = value.softwareId;
        changed.push('softwareId');
      }
      // Nothing changed: ok with the current version, no event, no bump.
      if (changed.length === 0) return done(row.rowVersion);

      const version = await patchProject(tx, ws, row.id, actor.actor_id, patch);
      if (patch.ownerActorId !== undefined) {
        await insertEvent(tx, { workspaceId: ws, projectId: row.id, actorId: actor.actor_id, kind: 'owner_changed', before: ownerBefore, after: ownerAfter });
      }
      if (patch.targetDate !== undefined || patch.softwareId !== undefined) {
        await insertEvent(tx, { workspaceId: ws, projectId: row.id, actorId: actor.actor_id, kind: 'target_changed', before: targetBefore, after: targetAfter });
      }
      await record(tx, actor, 'updated', row.id, { changed });
      return done(version);
    },
  };

  return [projectCreate, projectSetStage, projectReopen, projectUpdate];
}

