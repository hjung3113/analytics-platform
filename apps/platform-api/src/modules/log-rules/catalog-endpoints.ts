// The catalog reads (#1492 R-b, design log-rules §5.2) as menu-dispatch declarations: RuleSets, one RuleSet's Revision
// history, the Rule page, one Rule and the catalog status. Same read right and workspace rule as the other direct list menus
// (`platform:view`, `requiresScope: false`, the workspace is the session actor's, never a param). The dispatch outcome set
// has no `not_found`, so an unknown or other-workspace id answers `ok` with `data: null`. The reads write nothing and
// hold no rule body: only identifiers, short display text, support levels and declared targets (verbatim).

import type { EndpointResult, MenuEndpointDeclaration, ParamsJudgment } from '../menu-dispatch/types.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import {
  CATALOG_STATUS_PARAM_KEYS,
  RULE_DETAIL_PARAM_KEYS,
  RULE_PARAM_KEYS,
  RULE_SET_DETAIL_PARAM_KEYS,
  RULE_SET_PARAM_KEYS,
  parseCatalogStatusParams,
  parseRuleDetailParams,
  parseRuleParams,
  parseRuleSetDetailParams,
  parseRuleSetParams,
} from './domain/catalog-params.js';
import type { LogRulesReadDeps } from './deps.js';
import { LOG_RULES_MENU_ID } from './menu.js';
import { getCatalogStatus, getRuleDetail, getRuleSetDetail, listRuleSets, listRules } from './repositories/catalog-read.js';

type Judge = (params: Record<string, unknown>) => ParamsJudgment;
type Actor = { actor_id: string; workspace_id: string };

function declareRead(
  deps: LogRulesReadDeps,
  name: string,
  paramKeys: readonly string[],
  judge: Judge,
  run: (actor: Actor, params: Record<string, unknown>) => Promise<EndpointResult>,
): MenuEndpointDeclaration {
  return {
    spec: {
      id: `logRules.${name}`,
      menuId: LOG_RULES_MENU_ID,
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

export function catalogEndpoints(deps: LogRulesReadDeps): MenuEndpointDeclaration[] {
  return [
    declareRead(deps, 'ruleSets', RULE_SET_PARAM_KEYS, parseRuleSetParams, async (actor, params) => {
      const parsed = parseRuleSetParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      return { outcome: 'ok', data: await listRuleSets(deps.db, { ...parsed.value, workspaceId: actor.workspace_id }) };
    }),
    declareRead(deps, 'ruleSetDetail', RULE_SET_DETAIL_PARAM_KEYS, parseRuleSetDetailParams, async (actor, params) => {
      const parsed = parseRuleSetDetailParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      return { outcome: 'ok', data: await getRuleSetDetail(deps.db, actor.workspace_id, parsed.value) };
    }),
    declareRead(deps, 'rules', RULE_PARAM_KEYS, parseRuleParams, async (actor, params) => {
      const parsed = parseRuleParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      return { outcome: 'ok', data: await listRules(deps.db, { ...parsed.value, workspaceId: actor.workspace_id }) };
    }),
    declareRead(deps, 'ruleDetail', RULE_DETAIL_PARAM_KEYS, parseRuleDetailParams, async (actor, params) => {
      const parsed = parseRuleDetailParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      return { outcome: 'ok', data: await getRuleDetail(deps.db, actor.workspace_id, parsed.value) };
    }),
    declareRead(deps, 'catalogStatus', CATALOG_STATUS_PARAM_KEYS, parseCatalogStatusParams, async (actor) => ({
      outcome: 'ok',
      data: await getCatalogStatus(deps.db, actor.workspace_id),
    })),
  ];
}
