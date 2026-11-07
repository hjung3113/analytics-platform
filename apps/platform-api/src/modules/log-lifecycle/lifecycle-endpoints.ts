// The log lifecycle reads (#1444 c, design §5) as menu-dispatch declarations: the model list with the open project
// and latest round, one project, its history, its rounds and one round. Same read right and workspace rule as the other
// direct list menus (`platform:view`, `requiresScope: false`, the workspace is the session actor's, never a param).
// The dispatch outcome set has no `not_found`, so an unknown or other-workspace id answers `ok` with `data: null`
// (`rounds` and `projectEvents` of an unknown project: an empty page). The reads write nothing.

import type { EndpointResult, MenuEndpointDeclaration, ParamsJudgment } from '../menu-dispatch/types.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import type { LogLifecycleDeps } from './deps.js';
import {
  EVENT_PARAM_KEYS,
  MODEL_PARAM_KEYS,
  PROJECT_PARAM_KEYS,
  ROUNDS_PARAM_KEYS,
  ROUND_PARAM_KEYS,
  parseEventParams,
  parseModelParams,
  parseProjectParams,
  parseRoundParams,
  parseRoundsParams,
} from './domain/lifecycle-params.js';
import { LOG_MODELS_MENU_ID } from './menu.js';
import { getProjectDetail, getRoundDetail, listModels, listProjectEvents, listRounds } from './repositories/lifecycle-read.js';

type Judge = (params: Record<string, unknown>) => ParamsJudgment;
type Actor = { actor_id: string; workspace_id: string };

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
  return [
    declareRead(deps, 'models', MODEL_PARAM_KEYS, judgeOf(parseModelParams), async (actor, params) => {
      const parsed = parseModelParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      return { outcome: 'ok', data: await listModels(deps.db, { ...parsed.value, workspaceId: actor.workspace_id }) };
    }),
    declareRead(deps, 'projectDetail', PROJECT_PARAM_KEYS, judgeOf(parseProjectParams), async (actor, params) => {
      const parsed = parseProjectParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      return { outcome: 'ok', data: await getProjectDetail(deps.db, actor.workspace_id, parsed.value) };
    }),
    declareRead(deps, 'projectEvents', EVENT_PARAM_KEYS, judgeOf(parseEventParams), async (actor, params) => {
      const parsed = parseEventParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      return { outcome: 'ok', data: await listProjectEvents(deps.db, actor.workspace_id, parsed.value) };
    }),
    declareRead(deps, 'rounds', ROUNDS_PARAM_KEYS, judgeOf(parseRoundsParams), async (actor, params) => {
      const parsed = parseRoundsParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      return { outcome: 'ok', data: await listRounds(deps.db, actor.workspace_id, parsed.value) };
    }),
    declareRead(deps, 'roundDetail', ROUND_PARAM_KEYS, judgeOf(parseRoundParams), async (actor, params) => {
      const parsed = parseRoundParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      return { outcome: 'ok', data: await getRoundDetail(deps.db, actor.workspace_id, parsed.value) };
    }),
  ];
}
