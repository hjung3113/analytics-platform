// The comparison reads (#1480 D-d, design log-test-datasets §3.6 / §6): `logDataset.comparison` (one suite run: per item summary, the rule
// classification list with server page and the ADR-0105 table filters, coverage, labels) and `logDataset.rerunDiff` (two runs of the SAME
// revisions). Same read right, workspace rule and session-only rule as the other dataset reads (`declareRead`); an unknown, other-workspace or
// invisible run answers `ok` with `data: null`. COMPUTED at read time from the pinned baseline and the latest succeeded attempt's rule
// results (through the lifecycle barrel ports); nothing is copied, stored or changed. Rule ids, classifications, counts and ids only.

import type { MenuEndpointDeclaration } from '../menu-dispatch/types.js';
import { declareRead } from './dataset-endpoints.js';
import type { LogDatasetsDeps } from './deps.js';
import { countDiffs, diffRuns } from './domain/comparison.js';
import { filterRules, pageOf, sortRules, type RuleRow } from './domain/comparison-page.js';
import {
  COMPARISON_PARAM_KEYS,
  RERUN_DIFF_PARAM_KEYS,
  parseComparisonParams,
  parseRerunDiffParams,
} from './domain/comparison-params.js';
import { type ComparedItem, type ComparedRun, compareRun } from './repositories/comparison-read.js';

type Visible = Extract<ComparedItem, { restricted: false }>;
const visibleItems = (run: ComparedRun): Visible[] => run.items.filter((x): x is Visible => !x.restricted);

export function comparisonEndpoints(deps: LogDatasetsDeps): MenuEndpointDeclaration[] {
  const ports = { requests: deps.lifecycleRequests, results: deps.lifecycleResults };

  return [
    declareRead(deps, 'comparison', COMPARISON_PARAM_KEYS, (p) => parseComparisonParams(p), async (actor, params) => {
      const parsed = parseComparisonParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      const { suiteRunId, ordinal, list } = parsed.value;
      // One transaction-bound snapshot of the run, its requests and its results (the ports read with the caller's transaction).
      const compared = await deps.db.transaction(async (tx) => compareRun(tx, ports, actor.workspace_id, actor.actor_id, suiteRunId));
      if (!compared) return { outcome: 'ok', data: null };
      const items = compared.items.map((x) =>
        x.restricted
          ? x
          : {
              ordinal: x.ordinal,
              restricted: false as const,
              datasetId: x.datasetId,
              datasetName: x.datasetName,
              datasetRevisionId: x.datasetRevisionId,
              revisionSeq: x.revisionSeq,
              baselineId: x.baselineId,
              baselineSeq: x.baselineSeq,
              baselineStale: x.baselineStale,
              requestId: x.requestId,
              requestState: x.requestState,
              observed: x.observed,
              counts: x.counts,
              coverage: x.coverage,
              labelCount: x.labelCount,
            },
      );
      const selected = visibleItems(compared).filter((x) => ordinal === null || x.ordinal === ordinal);
      const all: RuleRow[] = selected.flatMap((x) =>
        x.rules.map((rule) => ({
          ordinal: x.ordinal,
          ruleId: rule.ruleId,
          classification: rule.classification,
          expected: rule.expected,
          observed: rule.observed,
          required: rule.required,
          label: x.labels.get(rule.ruleId)?.label ?? null,
        })),
      );
      const page = pageOf(sortRules(filterRules(all, list.conditions, list.q), list.sorting), list.page, list.pageSize);
      const labelOf = (row: RuleRow) => selected.find((x) => x.ordinal === row.ordinal)?.labels.get(row.ruleId) ?? null;
      return {
        outcome: 'ok',
        data: {
          run: compared.run,
          items,
          rules: { total: page.total, rows: page.rows.map((row) => ({ ...row, label: labelOf(row) })) },
          labels: { total: selected.reduce((n, x) => n + x.labelCount, 0) },
        },
      };
    }),

    declareRead(deps, 'rerunDiff', RERUN_DIFF_PARAM_KEYS, (p) => parseRerunDiffParams(p), async (actor, params) => {
      const parsed = parseRerunDiffParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      const q = parsed.value;
      const mismatch = (code: string) => ({ outcome: 'error' as const, data: { fieldErrors: [{ path: ['toRunId'], code }] }, message: `toRunId: ${code}` });
      if (q.fromRunId === q.toRunId) return mismatch('same_run');
      const pair = await deps.db.transaction(async (tx) => {
        const from = await compareRun(tx, ports, actor.workspace_id, actor.actor_id, q.fromRunId);
        const to = await compareRun(tx, ports, actor.workspace_id, actor.actor_id, q.toRunId);
        return from && to ? { from, to } : null;
      });
      if (!pair) return { outcome: 'ok', data: null };
      const a = new Map(visibleItems(pair.from).map((x) => [x.datasetRevisionId, x]));
      const b = new Map(visibleItems(pair.to).map((x) => [x.datasetRevisionId, x]));
      // Only runs of the same revisions can be diffed: the sets of (visible) revisions must be equal.
      if (a.size !== b.size || [...a.keys()].some((id) => !b.has(id))) return mismatch('revision_mismatch');

      const revisions = [];
      const rows: { datasetRevisionId: string; ruleId: string; kind: string; from: unknown; to: unknown }[] = [];
      for (const [revisionId, left] of a) {
        const right = b.get(revisionId) as Visible;
        const complete = left.observed !== null && right.observed !== null;
        const diffs = complete ? diffRuns(left.rules, right.rules) : [];
        revisions.push({
          datasetRevisionId: revisionId,
          datasetName: left.datasetName,
          revisionSeq: left.revisionSeq,
          // A side without a succeeded attempt has nothing to compare: the revision is reported `incomplete`, never as "no change".
          status: complete ? ('compared' as const) : ('incomplete' as const),
          from: { ordinal: left.ordinal, baselineId: left.baselineId, observed: left.observed, counts: left.counts },
          to: { ordinal: right.ordinal, baselineId: right.baselineId, observed: right.observed, counts: right.counts },
          diffCounts: countDiffs(diffs),
        });
        for (const diff of diffs) if (q.kinds.length === 0 ? diff.kind !== 'same' : q.kinds.includes(diff.kind)) rows.push({ datasetRevisionId: revisionId, ruleId: diff.ruleId, kind: diff.kind, from: diff.from, to: diff.to });
      }
      const page = pageOf(rows, q.page, q.pageSize);
      return {
        outcome: 'ok',
        data: {
          from: { id: pair.from.run.id, suiteId: pair.from.run.suiteId, createdAt: pair.from.run.createdAt, state: pair.from.run.state },
          to: { id: pair.to.run.id, suiteId: pair.to.run.suiteId, createdAt: pair.to.run.createdAt, state: pair.to.run.state },
          revisions,
          diffs: page,
        },
      };
    }),
  ];
}
