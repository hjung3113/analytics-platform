// The model spec reads of the log knowledge hub (design v0.6 §15.4, #1196 a) as menu-dispatch declarations: the
// latest published spec of a model and the model's revision list. Owning menu `log-knowledge-models`, same read
// right and workspace rule as the item reads (`platform:view`, no scope, the workspace is the session actor's).
// `logKnowledge.specDraft` (#1196 b1) serves one draft's content to the people who may write specs: it is declared
// with `knowledge:spec-publish` and also needs `platform:view`; a revision that is not a draft answers `data: null`.
// An unknown or other-workspace model answers `ok` with `data: null` (modelSpec) or an empty page (revisions).

import type { EndpointResult, MenuEndpointDeclaration, ParamsJudgment } from '../menu-dispatch/types.js';
import { holdsMenuPermission, holdsPlatformPermission } from '../platform-port/permissions.js';
import { LOG_KNOWLEDGE_MODELS_MENU_ID } from './catalog-menu.js';
import type { LogKnowledgeDeps } from './deps.js';
import { PAGE_SIZE_MAX } from '../../lib/list-params/list-params.js';
import {
  getEffectiveModelSpec,
  getModelSpec,
  getSpecDraft,
  listModelSpecRevisions,
  listSpecChanges,
} from './repositories/spec-read.js';
import { SPEC_MENU_PERMISSION, SPEC_PERMISSION } from './spec-actions.js';
import { type Viewer, canSeeModel, canSeeSoftware } from './repositories/access-visibility.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Judged =
  | { ok: true; modelId: string; softwareId: string | null; page: number; pageSize: number }
  | { ok: false; message: string };

function judgeParams(params: Record<string, unknown>, paged: boolean): Judged {
  const modelId = params.modelId;
  if (typeof modelId !== 'string' || !UUID.test(modelId)) return { ok: false, message: 'modelId must be a uuid string' };
  // `softwareId` (modelSpec only, #1196 c): the version whose effective spec is read.
  const softwareId = params.softwareId ?? null;
  if (softwareId !== null && (typeof softwareId !== 'string' || !UUID.test(softwareId))) {
    return { ok: false, message: 'softwareId must be a uuid string' };
  }
  if (!paged) return { ok: true, modelId, softwareId, page: 0, pageSize: 0 };
  const page = params.page === undefined ? 0 : params.page;
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 0 || page > 1_000_000) {
    return { ok: false, message: 'page must be a non-negative integer (0-based)' };
  }
  const pageSize = params.pageSize === undefined ? 50 : params.pageSize;
  if (typeof pageSize !== 'number' || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGE_SIZE_MAX) {
    return { ok: false, message: `pageSize must be an integer from 1 to ${PAGE_SIZE_MAX}` };
  }
  return { ok: true, modelId, softwareId, page, pageSize };
}

function declareSpecRead(
  deps: LogKnowledgeDeps,
  id: string,
  paramKeys: readonly string[],
  paged: boolean,
  run: (viewer: Viewer, judged: Extract<Judged, { ok: true }>) => Promise<EndpointResult>,
): MenuEndpointDeclaration {
  return {
    spec: {
      id,
      menuId: LOG_KNOWLEDGE_MODELS_MENU_ID,
      paramKeys,
      permission: 'platform:view',
      requiresScope: false,
      context: {},
      mergeTimeDomain: false,
    },
    authorize: (actor, tx) => holdsPlatformPermission(deps.checkService, actor, 'platform:view', tx ? { tx } : {}),
    validate(params): ParamsJudgment {
      const judged = judgeParams(params, paged);
      return judged.ok ? { ok: true } : judged;
    },
    async handle(args) {
      const judged = judgeParams(args.params, paged);
      if (!judged.ok) return { outcome: 'error', data: null, message: judged.message };
      return run({ workspaceId: args.actor.workspace_id, actorId: args.actor.actor_id }, judged);
    },
  };
}

function declareSpecDraft(deps: LogKnowledgeDeps): MenuEndpointDeclaration {
  const judge = (params: Record<string, unknown>) =>
    typeof params.revisionId === 'string' && UUID.test(params.revisionId)
      ? ({ ok: true, revisionId: params.revisionId } as const)
      : ({ ok: false, message: 'revisionId must be a uuid string' } as const);
  return {
    spec: {
      id: 'logKnowledge.specDraft',
      menuId: LOG_KNOWLEDGE_MODELS_MENU_ID,
      paramKeys: ['revisionId'],
      permission: SPEC_MENU_PERMISSION,
      requiresScope: false,
      context: {},
      mergeTimeDomain: false,
    },
    authorize: async (actor, tx) =>
      (await holdsPlatformPermission(deps.checkService, actor, 'platform:view', tx ? { tx } : {})) &&
      (await holdsMenuPermission(deps.checkService, actor, SPEC_PERMISSION, tx ? { tx } : {})),
    validate(params): ParamsJudgment {
      const judged = judge(params);
      return judged.ok ? { ok: true } : judged;
    },
    async handle(args) {
      const judged = judge(args.params);
      if (!judged.ok) return { outcome: 'error', data: null, message: judged.message };
      const viewer = { workspaceId: args.actor.workspace_id, actorId: args.actor.actor_id };
      return { outcome: 'ok', data: await getSpecDraft(deps.db, viewer, judged.revisionId) };
    },
  };
}

const CHANGE_STATUSES = ['open', 'retired', 'all'] as const;

/** `logKnowledge.specChanges` (#1196 c): the SW change rows of one model, filtered, newest first. */
function declareSpecChanges(deps: LogKnowledgeDeps): MenuEndpointDeclaration {
  type Query = { modelId: string; softwareId?: string; needsRevalidation?: boolean; status: (typeof CHANGE_STATUSES)[number]; page: number; pageSize: number };
  const judge = (params: Record<string, unknown>): { ok: true; value: Query } | { ok: false; message: string } => {
    const base = judgeParams(params, true);
    if (!base.ok) return base;
    const status = params.status === undefined ? 'open' : params.status;
    if (typeof status !== 'string' || !(CHANGE_STATUSES as readonly string[]).includes(status)) {
      return { ok: false, message: `status must be one of ${CHANGE_STATUSES.join(', ')}` };
    }
    const flag = params.needsRevalidation;
    if (flag !== undefined && typeof flag !== 'boolean') return { ok: false, message: 'needsRevalidation must be a boolean' };
    return {
      ok: true,
      value: {
        modelId: base.modelId,
        ...(base.softwareId === null ? {} : { softwareId: base.softwareId }),
        ...(flag === undefined ? {} : { needsRevalidation: flag }),
        status: status as Query['status'],
        page: base.page,
        pageSize: base.pageSize,
      },
    };
  };
  return {
    spec: {
      id: 'logKnowledge.specChanges',
      menuId: LOG_KNOWLEDGE_MODELS_MENU_ID,
      paramKeys: ['modelId', 'softwareId', 'needsRevalidation', 'status', 'page', 'pageSize'],
      permission: 'platform:view',
      requiresScope: false,
      context: {},
      mergeTimeDomain: false,
    },
    authorize: (actor, tx) => holdsPlatformPermission(deps.checkService, actor, 'platform:view', tx ? { tx } : {}),
    validate(params): ParamsJudgment {
      const judged = judge(params);
      return judged.ok ? { ok: true } : judged;
    },
    async handle(args) {
      const judged = judge(args.params);
      if (!judged.ok) return { outcome: 'error', data: null, message: judged.message };
      const { modelId, page, pageSize, ...filters } = judged.value;
      const viewer = { workspaceId: args.actor.workspace_id, actorId: args.actor.actor_id };
      // A model the viewer cannot see answers like a model that does not exist: an empty page.
      if (!(await canSeeModel(deps.db, viewer, modelId))) return { outcome: 'ok', data: { total: 0, rows: [] } };
      return { outcome: 'ok', data: await listSpecChanges(deps.db, viewer, modelId, filters, { page, pageSize }) };
    },
  };
}

export function specEndpoints(deps: LogKnowledgeDeps): MenuEndpointDeclaration[] {
  return [
    declareSpecRead(deps, 'logKnowledge.modelSpec', ['modelId', 'softwareId'], false, async (viewer, { modelId, softwareId }) => {
      const { workspaceId } = viewer;
      // Hidden model or SW version: `null`, exactly like an id that does not exist.
      if (!(await canSeeModel(deps.db, viewer, modelId))) return { outcome: 'ok', data: null };
      if (softwareId !== null && !(await canSeeSoftware(deps.db, viewer, softwareId))) return { outcome: 'ok', data: null };
      return {
        outcome: 'ok',
        data:
          softwareId === null
            ? await getModelSpec(deps.db, workspaceId, modelId)
            : await getEffectiveModelSpec(deps.db, viewer, modelId, softwareId),
      };
    }),
    declareSpecRead(
      deps,
      'logKnowledge.modelSpecRevisions',
      ['modelId', 'page', 'pageSize'],
      true,
      async (viewer, { modelId, page, pageSize }) => ({
        outcome: 'ok',
        data: (await canSeeModel(deps.db, viewer, modelId))
          ? await listModelSpecRevisions(deps.db, viewer.workspaceId, modelId, { page, pageSize })
          : { total: 0, rows: [] },
      }),
    ),
    declareSpecDraft(deps),
    declareSpecChanges(deps),
  ];
}
