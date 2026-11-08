// `logKnowledge.specCoverage` (#1496 R-f, design log-rules §6.3 «연동 표시»): the 명세 커버리지 summary of one model (optionally one
// software version) for the model spec screen header. Owning menu `log-knowledge-models`, same read right as `modelSpec`
// (`platform:view`, no scope, workspace = the session actor's). The numbers come from the log-rules `RuleCoveragePort`, injected as
// a structural type by the assembly (this module never imports log-rules). It is configuration information, not a pass/fail:
// counts by coverage state, or the reason it cannot be computed. An unknown model / software answers `ok` with `data: null`.

import type { Tx } from '../../db/tx.js';
import type { EndpointResult, MenuEndpointDeclaration, ParamsJudgment } from '../menu-dispatch/types.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import { LOG_KNOWLEDGE_MODELS_MENU_ID } from './catalog-menu.js';
import type { LogKnowledgeDeps } from './deps.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SPEC_COVERAGE_STATES = ['no_rule', 'unsupported', 'unknown', 'partial', 'covered'] as const;

/** What the badge needs of `RuleCoveragePort.getCoverage` (structural: the port's own type satisfies it). */
export interface SpecCoverageSource {
  getCoverage(tx: Tx, workspaceId: string, modelId: string, softwareId?: string | null): Promise<
    | { computable: false; reason: string }
    | { computable: true; requirements: readonly { key: string; state: string }[]; coverageDigest: string }
  >;
}

export function specCoverageEndpoint(deps: LogKnowledgeDeps): MenuEndpointDeclaration {
  const judge = (params: Record<string, unknown>): { ok: true; modelId: string; softwareId: string | null } | { ok: false; message: string } => {
    const { modelId, softwareId = null } = params;
    if (typeof modelId !== 'string' || !UUID.test(modelId)) return { ok: false, message: 'modelId must be a uuid string' };
    if (softwareId !== null && (typeof softwareId !== 'string' || !UUID.test(softwareId))) return { ok: false, message: 'softwareId must be a uuid string' };
    return { ok: true, modelId: modelId.toLowerCase(), softwareId: softwareId === null ? null : softwareId.toLowerCase() };
  };
  return {
    spec: {
      id: 'logKnowledge.specCoverage',
      menuId: LOG_KNOWLEDGE_MODELS_MENU_ID,
      paramKeys: ['modelId', 'softwareId'],
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
    async handle(args): Promise<EndpointResult> {
      const judged = judge(args.params);
      if (!judged.ok) return { outcome: 'error', data: null, message: judged.message };
      // Not wired (a deployment without the rule catalog module): said as a reason, never as 0 coverage.
      if (!deps.ruleCoverage) return { outcome: 'ok', data: { computable: false, reason: 'unavailable' } };
      const result = await deps.ruleCoverage.getCoverage(deps.db, args.actor.workspace_id, judged.modelId, judged.softwareId);
      if (!result.computable) {
        if (result.reason === 'model_unknown') return { outcome: 'ok', data: null };
        return { outcome: 'ok', data: { computable: false, reason: result.reason } };
      }
      const counts = Object.fromEntries(SPEC_COVERAGE_STATES.map((s) => [s, 0])) as Record<(typeof SPEC_COVERAGE_STATES)[number], number>;
      for (const r of result.requirements) if (r.state in counts) counts[r.state as keyof typeof counts] += 1;
      return { outcome: 'ok', data: { computable: true, counts: { ...counts, total: result.requirements.length }, coverageDigest: result.coverageDigest } };
    },
  };
}
