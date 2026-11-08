import { viewerOf } from '../log-knowledge/index.js';
// The log lifecycle reads (#1444 c, design §5) as menu-dispatch declarations: the model list with the open project
// and latest round, one project, its history, its rounds and one round. Same read right and workspace rule as the other
// direct list menus (`platform:view`, `requiresScope: false`, the workspace is the session actor's, never a param).
// The dispatch outcome set has no `not_found`, so an unknown or other-workspace id answers `ok` with `data: null`
// (`rounds` and `projectEvents` of an unknown project: an empty page). The reads write nothing.

import type { EndpointResult, MenuEndpointDeclaration, ParamsJudgment } from '../menu-dispatch/types.js';
import { gateAvailability } from './gate-availability.js';
import { holdsPlatformPermission, type PlatformActor } from '../platform-port/permissions.js';
import type { LogLifecycleDeps } from './deps.js';
import { listAttachmentsByParent } from '../attachments/index.js';
import {
  EVENT_PARAM_KEYS,
  EVIDENCE_PARAM_KEYS,
  MODEL_PARAM_KEYS,
  PROJECT_PARAM_KEYS,
  ROUNDS_PARAM_KEYS,
  ROUND_PARAM_KEYS,
  parseEventParams,
  parseEvidenceParams,
  parseModelParams,
  parseProjectParams,
  parseRoundParams,
  parseRoundsParams,
} from './domain/lifecycle-params.js';
import { LOG_MODELS_MENU_ID } from './menu.js';
import { HIERARCHY_PARAM_KEYS, parseHierarchyParams } from './domain/hierarchy-params.js';
import { hierarchyReader } from './hierarchy-read.js';
import { gateHistoryOfRound, projectGateState } from './repositories/gate.js';
import { gateTargetFor } from './domain/stage-transitions.js';
import { getProjectDetail, getRoundDetail, listModels, listProjectEvents, listRounds, roundInWorkspace } from './repositories/lifecycle-read.js';

type Judge = (params: Record<string, unknown>) => ParamsJudgment;
type Actor = PlatformActor;

function declareRead(
  deps: LogLifecycleDeps,
  name: string,
  paramKeys: readonly string[],
  judge: Judge,
  run: (actor: Actor, params: Record<string, unknown>) => Promise<EndpointResult>,
): MenuEndpointDeclaration {
  return {
    spec: {
      id: `logLifecycle.${name}`,
      menuId: LOG_MODELS_MENU_ID,
      paramKeys,
      permission: 'platform:view',
      requiresScope: false,
      context: {},
      mergeTimeDomain: false,
    },
    authorize: (actor, tx) => holdsPlatformPermission(deps.checkService, actor, 'platform:view', tx ? { tx } : {}),
    validate: (params) => judge(params),
    async handle(args) {
      const judged = judge(args.params);
      if (!judged.ok) return { outcome: 'error', data: null, message: judged.message };
      return run(args.actor, args.params);
    },
  };
}

const judgeOf = (parse: (p: Record<string, unknown>) => ParamsJudgment): Judge => (p) => parse(p);

export function lifecycleEndpoints(deps: LogLifecycleDeps): MenuEndpointDeclaration[] {
  const readHierarchy = hierarchyReader(deps);
  return [
    declareRead(deps, 'hierarchy', HIERARCHY_PARAM_KEYS, parseHierarchyParams, async (actor, params) => {
      const parsed = parseHierarchyParams(params);
      return parsed.ok ? readHierarchy(actor, parsed.value) : { outcome: 'error', data: null, message: parsed.message };
    }),
    declareRead(deps, 'models', MODEL_PARAM_KEYS, judgeOf(parseModelParams), async (actor, params) => {
      const parsed = parseModelParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      return { outcome: 'ok', data: await listModels(deps.db, { ...parsed.value, workspaceId: actor.workspace_id }, viewerOf(actor)) };
    }),
    declareRead(deps, 'projectDetail', PROJECT_PARAM_KEYS, judgeOf(parseProjectParams), async (actor, params) => {
      const parsed = parseProjectParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      const detail = await getProjectDetail(deps.db, actor.workspace_id, parsed.value, viewerOf(actor));
      if (!detail) return { outcome: 'ok', data: null };
      // Current Gate state (#1446 e): the stage the Gate would take the project to, and the newest decision (basis summary only).
      const gate = await projectGateState(deps.db, actor.workspace_id, detail.id, viewerOf(actor));
      return { outcome: 'ok', data: { ...detail, gateTarget: gateTargetFor(detail.stage), gate } };
    }),
    declareRead(deps, 'projectEvents', EVENT_PARAM_KEYS, judgeOf(parseEventParams), async (actor, params) => {
      const parsed = parseEventParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      return { outcome: 'ok', data: await listProjectEvents(deps.db, actor.workspace_id, parsed.value, viewerOf(actor)) };
    }),
    declareRead(deps, 'rounds', ROUNDS_PARAM_KEYS, judgeOf(parseRoundsParams), async (actor, params) => {
      const parsed = parseRoundsParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      return { outcome: 'ok', data: await listRounds(deps.db, actor.workspace_id, parsed.value, viewerOf(actor)) };
    }),
    declareRead(deps, 'roundDetail', ROUND_PARAM_KEYS, judgeOf(parseRoundParams), async (actor, params) => {
      const parsed = parseRoundParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      const detail = await getRoundDetail(deps.db, actor.workspace_id, parsed.value, viewerOf(actor));
      if (!detail) return { outcome: 'ok', data: null };
      // The Gate decision history of the Round, oldest first. Readers of the Round read every decider's reason text.
      return { outcome: 'ok', data: { ...detail, gateDecisions: await gateHistoryOfRound(deps.db, actor.workspace_id, detail.id, viewerOf(actor)), gateAvailability: await gateAvailability(deps, actor, detail) } };
    }),
    // Manual validation attachment of a round (#1451): the attachments linked to it. Same read right and visibility as the round
    // itself; an unknown or other-workspace round answers `ok` with `data: null`. The bytes go through
    // `GET /attachments/:id/download`, judged by the `validation_round` parent reader.
    declareRead(deps, 'roundEvidence', EVIDENCE_PARAM_KEYS, judgeOf(parseEvidenceParams), async (actor, params) => {
      const parsed = parseEvidenceParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      if (!(await roundInWorkspace(deps.db, actor.workspace_id, parsed.value, viewerOf(actor)))) return { outcome: 'ok', data: null };
      const rows = await listAttachmentsByParent(deps.db, {
        workspaceId: actor.workspace_id,
        parentKind: 'validation_round',
        parentId: parsed.value,
      });
      return { outcome: 'ok', data: { rows } };
    }),
  ];
}
