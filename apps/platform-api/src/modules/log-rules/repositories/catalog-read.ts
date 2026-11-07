// Read side of the validation rule catalog (#1492 R-b, design log-rules §5.2). The «current catalog» is the set of
// accepted, not superseded reports of the workspace (a rejected or superseded report never appears here); a RuleSet is
// shown through its Revisions in those reports. Every statement is scoped to the caller's workspace. Nothing here writes,
// and no rule body exists to read: titles, summaries, support levels and declared targets only (verbatim).

import { type SQL, and, asc, count, desc, eq, exists, ilike, inArray, isNull, notInArray, or, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { catalogReports, ruleSetRevisions, ruleTargets, rules } from '../../../db/schema/log-rules.js';
import type { Tx } from '../../../db/tx.js';
import type { FilterCondition } from '../../../lib/list-params/catalog-filters.js';
import type { ListQuery, Page } from '../../../lib/list-params/types.js';
import { escapeLikePattern } from '../../../lib/sql-like.js';
import type { RuleQuery } from '../domain/catalog-params.js';
import { SUPPORTS } from '../domain/catalog-params.js';
import {
  type RevisionChanges,
  currentRevision,
  diffRules,
  orderRevisions,
  predecessorOf,
} from '../domain/revision-order.js';

const iso = (value: Date | string): string => (value instanceof Date ? value : new Date(value)).toISOString();

const rv = ruleSetRevisions;
const rl = rules;
const tg = ruleTargets;

interface RevisionRow {
  id: string;
  revision: string;
  resultRef: string;
  status: 'active' | 'retired';
  supersedes: string | null;
}
/** One RuleSet of the current catalog: its Revisions in order, the current one and the report it came from. */
interface RuleSetGroup {
  ruleSetKey: string;
  reportId: string;
  sourceSystem: string;
  validatorVersion: string;
  reportedAt: Date;
  revisions: RevisionRow[];
  current: RevisionRow | null;
  headCount: number;
}

/**
 * Every RuleSet of the current catalog (optionally one key). A key reported by two sources in the current reports is
 * shown from the most recently reported one (a key is the stable id; the Validator is expected to be one source).
 */
async function loadGroups(tx: Tx, workspaceId: string, ruleSetKey?: string): Promise<RuleSetGroup[]> {
  const rows = await tx
    .select({
      id: rv.id,
      reportId: rv.reportId,
      ruleSetKey: rv.ruleSetKey,
      revision: rv.revision,
      resultRef: rv.resultRef,
      status: rv.status,
      supersedes: rv.supersedes,
      sourceSystem: catalogReports.sourceSystem,
      validatorVersion: catalogReports.validatorVersion,
      reportedAt: catalogReports.reportedAt,
    })
    .from(rv)
    .innerJoin(catalogReports, and(eq(catalogReports.workspaceId, rv.workspaceId), eq(catalogReports.id, rv.reportId)))
    .where(
      and(
        eq(rv.workspaceId, workspaceId),
        eq(catalogReports.outcome, 'accepted'),
        isNull(catalogReports.supersededAt),
        ruleSetKey === undefined ? undefined : eq(rv.ruleSetKey, ruleSetKey),
      ),
    )
    .orderBy(desc(catalogReports.reportedAt), desc(catalogReports.id));
  const grouped = new Map<string, { head: (typeof rows)[number]; revisions: RevisionRow[] }>();
  for (const row of rows) {
    const found = grouped.get(row.ruleSetKey);
    if (found && found.head.reportId !== row.reportId) continue;
    const revision: RevisionRow = {
      id: row.id,
      revision: row.revision,
      resultRef: row.resultRef,
      status: row.status as 'active' | 'retired',
      supersedes: row.supersedes,
    };
    if (found) found.revisions.push(revision);
    else grouped.set(row.ruleSetKey, { head: row, revisions: [revision] });
  }
  return [...grouped.values()].map(({ head, revisions }) => {
    const ordered = orderRevisions(revisions);
    const { current, headCount } = currentRevision(ordered);
    return {
      ruleSetKey: head.ruleSetKey,
      reportId: head.reportId,
      sourceSystem: head.sourceSystem ?? '',
      validatorVersion: head.validatorVersion ?? '',
      reportedAt: head.reportedAt,
      revisions: ordered,
      current,
      headCount,
    };
  });
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// ── logRules.ruleSets ───────────────────────────────────────────────────────────────────────────────────────────────

export interface SupportCounts {
  supported: number;
  partial: number;
  unsupported: number;
  unknown: number;
  total: number;
}
const emptyCounts = (): SupportCounts => ({ supported: 0, partial: 0, unsupported: 0, unknown: 0, total: 0 });

export interface RuleSetRow {
  ruleSetKey: string;
  sourceSystem: string;
  validatorVersion: string;
  lastReportedAt: string;
  revisionCount: number;
  /** The current active Revision; null when every Revision is retired. */
  currentRevision: { revision: string; resultRef: string; supersedes: string | null } | null;
  /** More than one active Revision no other active Revision supersedes: the current one is the last in order. */
  ambiguousCurrent: boolean;
  /** `support` counts of the current Revision's Rules; zeros when there is none. */
  supportCounts: SupportCounts;
}

function inList(condition: FilterCondition | undefined, value: string): boolean {
  if (!condition) return true;
  return condition.op === 'notIn' ? !condition.values.includes(value) : condition.values.includes(value);
}

async function countsByRevision(tx: Tx, workspaceId: string, revisionIds: string[]): Promise<Map<string, SupportCounts>> {
  const out = new Map<string, SupportCounts>();
  if (revisionIds.length === 0) return out;
  const rows = await tx
    .select({ revisionId: rl.ruleSetRevisionId, support: rl.support, n: count() })
    .from(rl)
    .where(and(eq(rl.workspaceId, workspaceId), inArray(rl.ruleSetRevisionId, revisionIds)))
    .groupBy(rl.ruleSetRevisionId, rl.support);
  for (const row of rows) {
    const c = out.get(row.revisionId) ?? emptyCounts();
    if ((SUPPORTS as readonly string[]).includes(row.support)) c[row.support as keyof Omit<SupportCounts, 'total'>] += Number(row.n);
    c.total += Number(row.n);
    out.set(row.revisionId, c);
  }
  return out;
}

/** RuleSets are few (a report carries at most 50), so the list is filtered, sorted and paged in memory over the current catalog. */
export async function listRuleSets(tx: Tx, q: ListQuery): Promise<Page<RuleSetRow>> {
  const groups = await loadGroups(tx, q.workspaceId);
  const needle = q.q === null || q.q.trim() === '' ? null : q.q.trim().toLowerCase();
  const kept = groups.filter(
    (g) =>
      inList(q.conditions.ruleSetKey, g.ruleSetKey) &&
      inList(q.conditions.sourceSystem, g.sourceSystem) &&
      (needle === null || g.ruleSetKey.toLowerCase().includes(needle)),
  );
  const counts = await countsByRevision(
    tx,
    q.workspaceId,
    kept.flatMap((g) => (g.current ? [g.current.id] : [])),
  );
  const rows = kept.map((g) => ({
    row: {
      ruleSetKey: g.ruleSetKey,
      sourceSystem: g.sourceSystem,
      validatorVersion: g.validatorVersion,
      lastReportedAt: iso(g.reportedAt),
      revisionCount: g.revisions.length,
      currentRevision: g.current
        ? { revision: g.current.revision, resultRef: g.current.resultRef, supersedes: g.current.supersedes }
        : null,
      ambiguousCurrent: g.headCount > 1,
      supportCounts: (g.current && counts.get(g.current.id)) || emptyCounts(),
    } satisfies RuleSetRow,
    reportedAt: g.reportedAt.getTime(),
  }));
  const value = (r: (typeof rows)[number], id: string): string | number => {
    switch (id) {
      case 'sourceSystem':
        return r.row.sourceSystem;
      case 'revisionCount':
        return r.row.revisionCount;
      case 'ruleCount':
        return r.row.supportCounts.total;
      case 'reportedAt':
        return r.reportedAt;
      default:
        return r.row.ruleSetKey;
    }
  };
  rows.sort((a, b) => {
    for (const s of q.sorting) {
      const x = value(a, s.id);
      const y = value(b, s.id);
      const d = typeof x === 'number' && typeof y === 'number' ? x - y : cmp(String(x), String(y));
      if (d !== 0) return s.desc ? -d : d;
    }
    return cmp(a.row.ruleSetKey, b.row.ruleSetKey);
  });
  return {
    total: rows.length,
    rows: rows.slice(q.page * q.pageSize, (q.page + 1) * q.pageSize).map((r) => r.row),
  };
}

// ── logRules.ruleSetDetail ──────────────────────────────────────────────────────────────────────────────────────────

export interface RevisionHistoryRow {
  revision: string;
  resultRef: string;
  status: 'active' | 'retired';
  retired: boolean;
  supersedes: string | null;
  isCurrent: boolean;
  ruleCount: number;
  supportCounts: SupportCounts;
  /** The Revision this one supersedes in the same snapshot; null at the first Revision of a chain (no change is claimed against nothing). */
  previousRevision: string | null;
  changes: RevisionChanges | null;
}
export interface RuleSetDetail {
  ruleSetKey: string;
  sourceSystem: string;
  validatorVersion: string;
  lastReportedAt: string;
  currentRevision: string | null;
  ambiguousCurrent: boolean;
  revisions: RevisionHistoryRow[];
}

export async function getRuleSetDetail(tx: Tx, workspaceId: string, ruleSetKey: string): Promise<RuleSetDetail | null> {
  const group = (await loadGroups(tx, workspaceId, ruleSetKey))[0];
  if (!group) return null;
  const supportByRevision = new Map<string, Map<string, string>>();
  const ruleRows = await tx
    .select({ revisionId: rl.ruleSetRevisionId, ruleKey: rl.ruleKey, support: rl.support })
    .from(rl)
    .where(and(eq(rl.workspaceId, workspaceId), inArray(rl.ruleSetRevisionId, group.revisions.map((r) => r.id))));
  for (const row of ruleRows) {
    const map = supportByRevision.get(row.revisionId) ?? new Map<string, string>();
    map.set(row.ruleKey, row.support);
    supportByRevision.set(row.revisionId, map);
  }
  const rowsOf = (id: string): Map<string, string> => supportByRevision.get(id) ?? new Map();
  const revisions = group.revisions.map((r): RevisionHistoryRow => {
    const own = rowsOf(r.id);
    const counts = emptyCounts();
    for (const support of own.values()) {
      if ((SUPPORTS as readonly string[]).includes(support)) counts[support as keyof Omit<SupportCounts, 'total'>] += 1;
      counts.total += 1;
    }
    const previous = predecessorOf(group.revisions, r);
    return {
      revision: r.revision,
      resultRef: r.resultRef,
      status: r.status,
      retired: r.status === 'retired',
      supersedes: r.supersedes,
      isCurrent: group.current?.id === r.id,
      ruleCount: counts.total,
      supportCounts: counts,
      previousRevision: previous?.revision ?? null,
      changes: previous ? diffRules(rowsOf(previous.id), own) : null,
    };
  });
  return {
    ruleSetKey: group.ruleSetKey,
    sourceSystem: group.sourceSystem,
    validatorVersion: group.validatorVersion,
    lastReportedAt: iso(group.reportedAt),
    currentRevision: group.current?.revision ?? null,
    ambiguousCurrent: group.headCount > 1,
    revisions,
  };
}

// ── logRules.rules ──────────────────────────────────────────────────────────────────────────────────────────────────

export interface RuleRow {
  ruleSetKey: string;
  revision: string;
  ruleKey: string;
  title: string;
  summary: string;
  support: string;
  scope: Record<string, unknown> | null;
  requiredDefault: boolean | null;
  targetCount: number;
  requirementIdCount: number;
  /** The first declared target, verbatim; null = the Rule declares none. */
  firstTarget: { format: string; target: string } | null;
}

const targetOf = (ruleIdColumn: AnyPgColumn, workspaceColumn: AnyPgColumn) =>
  and(eq(tg.workspaceId, workspaceColumn), eq(tg.ruleId, ruleIdColumn));

function presenceFilter(condition: FilterCondition | undefined, present: SQL): SQL | undefined {
  if (!condition) return undefined;
  return condition.op === 'isNotEmpty' ? present : sql`not (${present})`;
}

const SUPPORT_RANK = sql`case ${rl.support} when 'supported' then 0 when 'partial' then 1 when 'unsupported' then 2 else 3 end`;

export async function listRules(tx: Tx, q: RuleQuery): Promise<Page<RuleRow>> {
  const groups = await loadGroups(tx, q.workspaceId);
  const currentIds = groups.flatMap((g) => (g.current ? [g.current.id] : []));
  if (currentIds.length === 0) return { total: 0, rows: [] };
  const support = q.conditions.support;
  const setKey = q.conditions.ruleSetKey;
  const declaresScope = sql`(${rl.scope} is not null and ${rl.scope} <> '{}'::jsonb)`;
  const declaresIds = exists(
    tx
      .select({ one: sql`1` })
      .from(tg)
      .where(and(targetOf(rl.id, rl.workspaceId), sql`coalesce(array_length(${tg.requirementIds}, 1), 0) > 0`)),
  );
  const like = (text: string) => `%${escapeLikePattern(text.trim())}%`;
  const where = and(
    eq(rl.workspaceId, q.workspaceId),
    inArray(rl.ruleSetRevisionId, currentIds),
    support ? (support.op === 'notIn' ? notInArray(rl.support, support.values) : inArray(rl.support, support.values)) : undefined,
    setKey ? (setKey.op === 'notIn' ? notInArray(rv.ruleSetKey, setKey.values) : inArray(rv.ruleSetKey, setKey.values)) : undefined,
    presenceFilter(q.conditions.scope, declaresScope),
    presenceFilter(q.conditions.requirementIds, declaresIds),
    q.q === null || q.q.trim() === ''
      ? undefined
      : or(ilike(rl.ruleKey, like(q.q)), ilike(rl.title, like(q.q)), ilike(rl.summary, like(q.q))),
    q.targetQ === null
      ? undefined
      : exists(tx.select({ one: sql`1` }).from(tg).where(and(targetOf(rl.id, rl.workspaceId), ilike(tg.target, like(q.targetQ))))),
  );
  const targetCount = sql<number>`(select count(*)::int from ${tg} t where t.workspace_id = ${rl.workspaceId} and t.rule_id = ${rl.id})`;
  const requirementIdCount = sql<number>`(select coalesce(sum(coalesce(array_length(t.requirement_ids, 1), 0)), 0)::int from ${tg} t where t.workspace_id = ${rl.workspaceId} and t.rule_id = ${rl.id})`;
  const first = (column: 'format' | 'target') =>
    sql<string | null>`(select t.${sql.raw(column)} from ${tg} t where t.workspace_id = ${rl.workspaceId} and t.rule_id = ${rl.id} order by t.position asc limit 1)`;
  const sortable: Record<string, SQL | AnyPgColumn> = {
    ruleSetKey: rv.ruleSetKey,
    ruleKey: rl.ruleKey,
    title: rl.title,
    support: SUPPORT_RANK,
    revision: rv.revision,
    targetCount,
    requirementIdCount,
  };
  const order = (expr: SQL | AnyPgColumn, descending: boolean): SQL => (descending ? desc(expr) : asc(expr));
  const from = tx
    .select({
      ruleSetKey: rv.ruleSetKey,
      revision: rv.revision,
      ruleKey: rl.ruleKey,
      title: rl.title,
      summary: rl.summary,
      support: rl.support,
      scope: rl.scope,
      requiredDefault: rl.requiredDefault,
      targetCount,
      requirementIdCount,
      firstFormat: first('format'),
      firstTarget: first('target'),
    })
    .from(rl)
    .innerJoin(rv, and(eq(rv.workspaceId, rl.workspaceId), eq(rv.id, rl.ruleSetRevisionId)))
    .where(where);
  const rows = await from
    // RuleSet key, Rule key and id close every order, so a page never repeats or skips a row.
    .orderBy(...q.sorting.map((s) => order(sortable[s.id] as SQL | AnyPgColumn, s.desc)), asc(rv.ruleSetKey), asc(rl.ruleKey), asc(rl.id))
    .limit(q.pageSize)
    .offset(q.page * q.pageSize);
  const [totalRow] = await tx
    .select({ n: count() })
    .from(rl)
    .innerJoin(rv, and(eq(rv.workspaceId, rl.workspaceId), eq(rv.id, rl.ruleSetRevisionId)))
    .where(where);
  return {
    total: Number(totalRow?.n ?? 0),
    rows: rows.map((r) => ({
      ruleSetKey: r.ruleSetKey,
      revision: r.revision,
      ruleKey: r.ruleKey,
      title: r.title,
      summary: r.summary,
      support: r.support,
      scope: (r.scope as Record<string, unknown> | null) ?? null,
      requiredDefault: r.requiredDefault,
      targetCount: Number(r.targetCount),
      requirementIdCount: Number(r.requirementIdCount),
      firstTarget: r.firstTarget === null || r.firstFormat === null ? null : { format: r.firstFormat, target: r.firstTarget },
    })),
  };
}

// ── logRules.ruleDetail ─────────────────────────────────────────────────────────────────────────────────────────────

export interface RuleDetail {
  ruleSetKey: string;
  ruleKey: string;
  /** The Revision the fields below come from: the RuleSet's current one, else the latest one that carries the Rule. */
  revision: string;
  inCurrentRevision: boolean;
  sourceSystem: string;
  lastReportedAt: string;
  title: string;
  summary: string;
  support: string;
  scope: Record<string, unknown> | null;
  requiredDefault: boolean | null;
  /** In declaration order, verbatim; `requirementIds` are the declared strings, not matched against any spec here. */
  targets: { position: number; format: string; target: string; requirementIds: string[] }[];
  /** Every Revision of the RuleSet in order; `support` is null where the Revision does not carry the Rule. */
  revisions: { revision: string; status: 'active' | 'retired'; retired: boolean; isCurrent: boolean; support: string | null }[];
}

export async function getRuleDetail(
  tx: Tx,
  workspaceId: string,
  input: { ruleSetKey: string; ruleKey: string },
): Promise<RuleDetail | null> {
  const group = (await loadGroups(tx, workspaceId, input.ruleSetKey))[0];
  if (!group) return null;
  const ruleRows = await tx
    .select()
    .from(rl)
    .where(
      and(
        eq(rl.workspaceId, workspaceId),
        eq(rl.ruleKey, input.ruleKey),
        inArray(rl.ruleSetRevisionId, group.revisions.map((r) => r.id)),
      ),
    );
  if (ruleRows.length === 0) return null;
  const byRevision = new Map(ruleRows.map((r) => [r.ruleSetRevisionId, r]));
  const chosen =
    (group.current && byRevision.has(group.current.id) ? group.current : null) ??
    [...group.revisions].reverse().find((r) => byRevision.has(r.id));
  const rule = chosen ? byRevision.get(chosen.id) : undefined;
  if (!chosen || !rule) return null;
  const targets = await tx
    .select({ position: tg.position, format: tg.format, target: tg.target, requirementIds: tg.requirementIds })
    .from(tg)
    .where(and(eq(tg.workspaceId, workspaceId), eq(tg.ruleId, rule.id)))
    .orderBy(asc(tg.position));
  return {
    ruleSetKey: group.ruleSetKey,
    ruleKey: rule.ruleKey,
    revision: chosen.revision,
    inCurrentRevision: group.current?.id === chosen.id,
    sourceSystem: group.sourceSystem,
    lastReportedAt: iso(group.reportedAt),
    title: rule.title,
    summary: rule.summary,
    support: rule.support,
    scope: (rule.scope as Record<string, unknown> | null) ?? null,
    requiredDefault: rule.requiredDefault,
    targets,
    revisions: group.revisions.map((r) => ({
      revision: r.revision,
      status: r.status,
      retired: r.status === 'retired',
      isCurrent: group.current?.id === r.id,
      support: byRevision.get(r.id)?.support ?? null,
    })),
  };
}

// ── logRules.catalogStatus ──────────────────────────────────────────────────────────────────────────────────────────

export interface CatalogStatus {
  /** false = no accepted report yet: «카탈로그 미수신». */
  received: boolean;
  lastReportedAt: string | null;
  /** From the most recently reported current report. */
  sourceSystem: string | null;
  validatorVersion: string | null;
  /** Every source with a current accepted report, most recent first. */
  sources: { sourceSystem: string; validatorVersion: string; reportedAt: string }[];
  ruleSetCount: number;
  /** Rules of the current Revisions, the set `logRules.rules` lists. */
  ruleCount: number;
  /** false = received, but no Rule of the current Revisions declares a requirement id: «요구사항 ID 미선언». null = not received. */
  requirementIdsDeclared: boolean | null;
}

export async function getCatalogStatus(tx: Tx, workspaceId: string): Promise<CatalogStatus> {
  const reports = await tx
    .select({ sourceSystem: catalogReports.sourceSystem, validatorVersion: catalogReports.validatorVersion, reportedAt: catalogReports.reportedAt })
    .from(catalogReports)
    .where(and(eq(catalogReports.workspaceId, workspaceId), eq(catalogReports.outcome, 'accepted'), isNull(catalogReports.supersededAt)))
    .orderBy(desc(catalogReports.reportedAt), desc(catalogReports.id));
  const latest = reports[0];
  if (!latest) {
    return { received: false, lastReportedAt: null, sourceSystem: null, validatorVersion: null, sources: [], ruleSetCount: 0, ruleCount: 0, requirementIdsDeclared: null };
  }
  const groups = await loadGroups(tx, workspaceId);
  const currentIds = groups.flatMap((g) => (g.current ? [g.current.id] : []));
  let ruleCount = 0;
  let declared = false;
  if (currentIds.length > 0) {
    const [n] = await tx.select({ n: count() }).from(rl).where(and(eq(rl.workspaceId, workspaceId), inArray(rl.ruleSetRevisionId, currentIds)));
    ruleCount = Number(n?.n ?? 0);
    const hit = await tx
      .select({ one: sql`1` })
      .from(tg)
      .innerJoin(rl, and(eq(rl.workspaceId, tg.workspaceId), eq(rl.id, tg.ruleId)))
      .where(and(eq(tg.workspaceId, workspaceId), inArray(rl.ruleSetRevisionId, currentIds), sql`coalesce(array_length(${tg.requirementIds}, 1), 0) > 0`))
      .limit(1);
    declared = hit.length > 0;
  }
  return {
    received: true,
    lastReportedAt: iso(latest.reportedAt),
    sourceSystem: latest.sourceSystem,
    validatorVersion: latest.validatorVersion,
    sources: reports.map((r) => ({ sourceSystem: r.sourceSystem ?? '', validatorVersion: r.validatorVersion ?? '', reportedAt: iso(r.reportedAt) })),
    ruleSetCount: groups.length,
    ruleCount,
    requirementIdsDeclared: declared,
  };
}
