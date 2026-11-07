// Reads the catalog side of the spec coverage (#1494 R-d): the current active Revisions of the accepted catalog and the
// Rules of them that declare at least one requirement id. Read-only, every statement scoped to the workspace. «Current»
// is the R-b rule (`loadGroups`: accepted, not superseded reports; the active head of each RuleSet); a retired Revision or
// a Rule of an older Revision never reaches the computation. One query for the Revisions' digests, one for the declaring
// Rules (a Rule without a requirement id changes nothing, so it is not read).

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { catalogReports, ruleSetRevisions, ruleTargets, rules } from '../../../db/schema/log-rules.js';
import type { Tx } from '../../../db/tx.js';
import type { CoverageCatalogInput, CoverageRevision, CoverageRule, RuleSupport } from '../domain/coverage.js';
import { loadGroups } from './catalog-read.js';

export async function loadCoverageCatalog(tx: Tx, workspaceId: string): Promise<CoverageCatalogInput> {
  const [report] = await tx
    .select({ id: catalogReports.id })
    .from(catalogReports)
    .where(and(eq(catalogReports.workspaceId, workspaceId), eq(catalogReports.outcome, 'accepted'), isNull(catalogReports.supersededAt)))
    .limit(1);
  if (!report) return { received: false, revisions: [], rules: [] };
  const groups = await loadGroups(tx, workspaceId);
  const current = groups.flatMap((g) => (g.current ? [{ ruleSetKey: g.ruleSetKey, ...g.current }] : []));
  if (current.length === 0) return { received: true, revisions: [], rules: [] };
  const ids = current.map((c) => c.id);
  const digests = await tx
    .select({ id: ruleSetRevisions.id, revisionDigest: ruleSetRevisions.revisionDigest })
    .from(ruleSetRevisions)
    .where(and(eq(ruleSetRevisions.workspaceId, workspaceId), inArray(ruleSetRevisions.id, ids)));
  const digestById = new Map(digests.map((d) => [d.id, d.revisionDigest]));
  const revisions: CoverageRevision[] = current.map((c) => ({
    ruleSetKey: c.ruleSetKey,
    revision: c.revision,
    resultRef: c.resultRef,
    revisionDigest: digestById.get(c.id) ?? '',
  }));
  const byId = new Map(current.map((c) => [c.id, c]));
  const rows = await tx
    .select({
      ruleId: rules.id,
      revisionId: rules.ruleSetRevisionId,
      ruleKey: rules.ruleKey,
      support: rules.support,
      requirementIds: ruleTargets.requirementIds,
    })
    .from(rules)
    .innerJoin(ruleTargets, and(eq(ruleTargets.workspaceId, rules.workspaceId), eq(ruleTargets.ruleId, rules.id)))
    .where(
      and(
        eq(rules.workspaceId, workspaceId),
        inArray(rules.ruleSetRevisionId, ids),
        sql`coalesce(array_length(${ruleTargets.requirementIds}, 1), 0) > 0`,
      ),
    );
  const merged = new Map<string, CoverageRule & { ids: Set<string> }>();
  for (const row of rows) {
    const rev = byId.get(row.revisionId);
    if (!rev) continue;
    let entry = merged.get(row.ruleId);
    if (!entry) {
      entry = { ruleSetKey: rev.ruleSetKey, revision: rev.revision, ruleKey: row.ruleKey, support: row.support as RuleSupport, requirementIds: [], ids: new Set() };
      merged.set(row.ruleId, entry);
    }
    for (const id of row.requirementIds) entry.ids.add(id);
  }
  return {
    received: true,
    revisions,
    rules: [...merged.values()].map(({ ids, ...rule }) => ({ ...rule, requirementIds: [...ids] })),
  };
}
