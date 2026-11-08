// The coverage reads (#1494 R-d, design log-rules §3.3/§5.2) as menu-dispatch declarations on the `log-rules` menu:
// `logRules.coverage` (one model, optionally one software version) and `logRules.coverageSummary` (state counts for a
// list of models). Read right `platform:view`; the current actor also passes the knowledge object visibility rule. Unknown model / software, or one of another workspace, answers `ok`
// with `data: null` (the dispatch has no not_found). Nothing is written and no rule body exists to return.

import type { EndpointResult, MenuEndpointDeclaration, ParamsJudgment } from '../menu-dispatch/types.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import {
  COVERAGE_PARAM_KEYS,
  COVERAGE_SUMMARY_PARAM_KEYS,
  MODEL_OPTION_PARAM_KEYS,
  SOFTWARE_OPTION_PARAM_KEYS,
  DECLARED_REF_CAP,
  parseCoverageParams,
  parseCoverageSummaryParams,
  parseModelOptionParams,
  parseSoftwareOptionParams,
} from './domain/coverage-params.js';
import { sortRequirements } from './domain/coverage.js';
import type { LogRulesContributionDeps } from './deps.js';
import { computeModelCoverage } from './coverage-service.js';
import { LOG_RULES_MENU_ID } from './menu.js';
import { loadCoverageCatalog } from './repositories/coverage-read.js';

type Actor = { actor_id: string; workspace_id: string };

function declareRead(
  deps: LogRulesContributionDeps,
  name: string,
  paramKeys: readonly string[],
  judge: (params: Record<string, unknown>) => ParamsJudgment,
  run: (actor: Actor, params: Record<string, unknown>) => Promise<EndpointResult>,
): MenuEndpointDeclaration {
  return {
    spec: { id: `logRules.${name}`, menuId: LOG_RULES_MENU_ID, paramKeys, permission: 'platform:view', requiresScope: false, context: {}, mergeTimeDomain: false },
    authorize: (actor, tx) => holdsPlatformPermission(deps.checkService, actor, 'platform:view', tx ? { tx } : {}),
    validate: (params) => judge(params),
    async handle(args) {
      const judged = judge(args.params);
      if (!judged.ok) return { outcome: 'error', data: null, message: judged.message };
      return run(args.actor, args.params);
    },
  };
}

export function coverageEndpoints(deps: LogRulesContributionDeps): MenuEndpointDeclaration[] {
  const knowledge = { knowledge: deps.knowledgeLookup };
  return [
    declareRead(deps, 'coverage', COVERAGE_PARAM_KEYS, parseCoverageParams, async (actor, params) => {
      const parsed = parseCoverageParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      const q = parsed.value;
      // One transaction: the catalog snapshot and the model-locked spec read; the single lock is taken last.
      const result = await deps.db.transaction((tx) => computeModelCoverage(knowledge, tx, actor.workspace_id, q.modelId, q.softwareId, actor.actor_id));
      if (!result.computable) {
        if (result.reason === 'model_unknown') return { outcome: 'ok', data: null };
        return { outcome: 'ok', data: result };
      }
      const sorted = sortRequirements(result.requirements);
      const rows = sorted.slice(q.page * q.pageSize, (q.page + 1) * q.pageSize).map((r) => ({
        key: r.key,
        state: r.state,
        declaredCount: r.declaredBy.length,
        declaredBy: r.declaredBy.slice(0, DECLARED_REF_CAP),
      }));
      return {
        outcome: 'ok',
        data: {
          computable: true,
          specPin: result.specPin,
          coverageDigest: result.coverageDigest,
          counts: result.counts,
          ruleSetRevisions: result.ruleSetRevisions,
          rows,
          total: sorted.length,
          page: q.page,
          pageSize: q.pageSize,
        },
      };
    }),
    // Picker options (#1496 R-f): ids and display text of models / software versions, paged and searchable. `platform:view`
    // like every log-knowledge read with object visibility applied; an unknown or hidden model answers an empty list.
    declareRead(deps, 'modelOptions', MODEL_OPTION_PARAM_KEYS, parseModelOptionParams, async (actor, params) => {
      const parsed = parseModelOptionParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      const { rows, total } = await deps.knowledgeLookup.listModels(deps.db, actor.workspace_id, parsed.value, actor.actor_id);
      return { outcome: 'ok', data: { rows, total, page: parsed.value.page, pageSize: parsed.value.pageSize } };
    }),
    declareRead(deps, 'softwareOptions', SOFTWARE_OPTION_PARAM_KEYS, parseSoftwareOptionParams, async (actor, params) => {
      const parsed = parseSoftwareOptionParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      return { outcome: 'ok', data: { rows: await deps.knowledgeLookup.listSoftware(deps.db, actor.workspace_id, parsed.value, actor.actor_id) } };
    }),
    declareRead(deps, 'coverageSummary', COVERAGE_SUMMARY_PARAM_KEYS, parseCoverageSummaryParams, async (actor, params) => {
      const parsed = parseCoverageSummaryParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      // The catalog is read once; each model is then read on the pool handle so its model lock lives only for that
      // model's own transaction (no lock held while waiting for the next: two summaries cannot deadlock).
      const catalog = await loadCoverageCatalog(deps.db, actor.workspace_id);
      const rows = [];
      for (const modelId of parsed.value) {
        const result = await computeModelCoverage(knowledge, deps.db, actor.workspace_id, modelId, null, actor.actor_id, catalog);
        rows.push(
          result.computable
            ? { modelId, computable: true, counts: result.counts, coverageDigest: result.coverageDigest }
            : { modelId, computable: false, reason: result.reason },
        );
      }
      return { outcome: 'ok', data: { rows } };
    }),
  ];
}
