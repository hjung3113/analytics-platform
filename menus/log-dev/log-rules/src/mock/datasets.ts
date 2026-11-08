import { filterRows, validateFilters, type ColumnFilter, type ColumnFilterSpec, type PageSort } from '@ap/contracts';
import { defineMockAction, defineMockEndpoint, MockActionInvalid, type AnyMockAction, type AnyMockEndpoint } from '@ap/mock-server';
import { datasetActions, datasetEndpoints, isUuid } from '../endpoints';
import { AT, BASE, DRAFT, DS, REV, RUN, RUN2, SUITE, baselineDetail, baselineRows, comparison, datasetDetail, datasetRows, events, labels, revisionIdFor, runs, suite, suiteB, suiteDetail, suiteDetailB } from './datasets-fixtures';
export { BASE, DRAFT, DS, REV, RUN, RUN2, SUITE } from './datasets-fixtures';

const statusSpec: Record<string, ColumnFilterSpec> = { status: { kind: 'enum', options: ['active', 'archived'].map(value => ({ value, label: value })), ops: ['in', 'notIn'] } };
const comparisonSpecs: Record<string, ColumnFilterSpec> = { classification: { kind: 'enum', options: ['regressed', 'new', 'fixed', 'not_comparable', 'missing', 'unchanged'].map(value => ({ value, label: value })), ops: ['in', 'notIn'] } };
function page<T>(rows: T[], p: Record<string, unknown>) { const start = Number(p.page ?? 0) * Number(p.pageSize ?? 50); return { rows: rows.slice(start, start + Number(p.pageSize ?? 50)), total: rows.length }; }
function read(name: string, p: Record<string, unknown>) {
  if (name === 'datasets') {
    const q = String(p.q ?? '').toLowerCase();
    const rows = filterRows(datasetRows.filter(d => `${d.name} ${d.purpose}`.toLowerCase().includes(q)), p.filters as ColumnFilter[] ?? [], (r, id) => r[id as 'status'], { specs: statusSpec });
    const sort = (p.sorting as PageSort[] | undefined)?.[0];
    if (sort) rows.sort((a,b) => String(a[sort.id as 'name']).localeCompare(String(b[sort.id as 'name'])) * (sort.desc ? -1 : 1));
    return page(rows, p);
  }
  if (name === 'datasetDetail') return datasetDetail(String(p.datasetId));
  if (name === 'baselines') { const row = datasetRows.find(d => revisionIdFor(d.id) === p.datasetRevisionId); return row ? { datasetId: row.id, datasetRevisionId: p.datasetRevisionId, revisionSeq: 3, rows: row.id === DS ? baselineRows : [] } : null; }
  if (name === 'baselineDetail') return baselineDetail(String(p.baselineId));
  if (name === 'suites') return page((!p.datasetId || p.datasetId === DS) ? [suite, suiteB].filter(s => !p.q || s.name.includes(String(p.q))) : [], p);
  if (name === 'suiteDetail') return p.suiteId === SUITE ? suiteDetail() : p.suiteId === suiteB.id ? suiteDetailB() : null;
  if (name === 'suiteRuns') return [SUITE, suiteB.id].includes(String(p.suiteId)) ? { ...page(runs.filter(r => r.suiteId === p.suiteId), p), suiteId: p.suiteId } : null;
  if (name === 'comparison') {
    const c = comparison(String(p.suiteRunId)); if (!c) return null;
    const rows = p.ordinal && p.ordinal !== 1 ? [] : filterRows(c.rules.rows, p.filters as ColumnFilter[] ?? [], (r, id) => r[id as 'classification'], { specs: comparisonSpecs });
    return { ...c, rules: page(rows, p) };
  }
  if (name === 'rerunDiff') return p.fromRunId !== p.toRunId && runs.some(r => r.id === p.fromRunId) && runs.some(r => r.id === p.toRunId && r.suiteId === runs.find(from => from.id === p.fromRunId)?.suiteId) ? { from: { id: p.fromRunId }, to: { id: p.toRunId }, revisions: [{ datasetRevisionId: REV, datasetName: datasetRows[0]!.name, revisionSeq: 3, status: 'compared' }], diffs: { rows: [], total: 0 } } : null;
  return null;
}
export const datasetsMock: readonly AnyMockEndpoint[] = Object.entries(datasetEndpoints).map(([name, spec]) => defineMockEndpoint(spec, { mart: false,
  validate: ({ params }) => {
    for (const key of ['datasetId', 'datasetRevisionId', 'baselineId', 'suiteId', 'suiteRunId', 'fromRunId', 'toRunId']) if (params[key] !== undefined && (typeof params[key] !== 'string' || !isUuid(params[key] as string))) return `${key} must be UUID`;
    if (params.page !== undefined && (!Number.isInteger(params.page) || Number(params.page) < 0)) return 'page must be non-negative';
    if (params.pageSize !== undefined && (!Number.isInteger(params.pageSize) || Number(params.pageSize) < 1 || Number(params.pageSize) > (name === 'suiteRuns' ? 50 : 200))) return 'invalid pageSize';
    if (params.filters !== undefined && (!Array.isArray(params.filters) || !validateFilters(params.filters, name === 'datasets' ? statusSpec : comparisonSpecs).ok)) return 'invalid filters';
    return null;
  }, handle: ({ params }) => read(name, params),
}));
const field = (path: string, code: string) => ({ path: [path], code });
export const datasetActionsMock: readonly AnyMockAction[] = Object.entries(datasetActions).map(([name, spec]) => defineMockAction(spec, {
  version: ({ input }) => baselineRows.find(b => b.id === input.id)?.version ?? null,
  validate: input => name === 'suiteRun' ? typeof input.idempotencyKey === 'string' && input.idempotencyKey.length ? [] : [field('idempotencyKey', 'required')] : typeof input.reason === 'string' && input.reason.trim() ? [] : [field('reason', 'required')],
  handle: ({ input, actor }) => {
    if (name === 'baselineApprove') {
      const b = baselineRows.find(b => b.id === input.id);
      if (!b || b.status !== 'draft') throw new MockActionInvalid([field('id', 'illegal_transition')]);
      baselineRows.filter(old => old.status === 'approved').forEach(old => { old.status = 'superseded'; old.version = String(Number(old.version) + 1); old.supersededAt = AT; });
      b.status = 'approved'; b.version = String(Number(b.version) + 1); b.approvedBy = { id: actor, displayName: actor }; b.approvedAt = AT;
      events[b.id]!.push({ id: crypto.randomUUID(), kind: 'approved', before: { status: 'draft' }, after: { status: 'approved' }, reason: String(input.reason), actor: { id: actor, displayName: actor }, selfApproved: b.author.id === actor, at: AT });
      return { data: { version: b.version, supersededBaselineId: BASE, selfApproved: b.author.id === actor }, version: b.version };
    }
    if (name === 'suiteRun') {
      if (![SUITE, suiteB.id].includes(String(input.suiteId))) throw new MockActionInvalid([field('suiteId', 'not_found')]);
      if (runs.filter(r => r.state === 'queued').length >= 3) throw new MockActionInvalid([field('suiteId', 'suite.run_limit')]);
      const fresh = structuredClone(runs.find(r => r.id === RUN)!); fresh.id = crypto.randomUUID(); fresh.suiteId = String(input.suiteId); fresh.engineProfileRef = input.suiteId === suiteB.id ? suiteB.engineProfileRef : suite.engineProfileRef; fresh.state = 'queued'; fresh.items[0]!.requestState = 'queued'; fresh.items[0]!.attemptCount = 0; fresh.items[0]!.latestVerdict = null; fresh.counts = { queued: 1, claimed: 0, succeeded: 0, failed: 0, cancelled: 0, expired: 0 }; runs.unshift(fresh);
      return { data: { suiteRunId: fresh.id, items: [] }, version: null };
    }
    if (input.suiteRunId !== RUN && input.suiteRunId !== RUN2) throw new MockActionInvalid([field('suiteRunId', 'not_found')]);
    if (input.datasetRevisionId !== REV) throw new MockActionInvalid([field('datasetRevisionId', 'not_found')]);
    const key = `${input.suiteRunId}:${input.ruleId}`;
    (labels[key] ??= []).push({ label: String(input.label), reason: String(input.reason), actorId: actor, at: AT });
    return { data: { labelId: crypto.randomUUID(), at: AT }, version: null };
  },
}));
/** Fresh draft ids keep versioned conformance writes independent from the browser fixture. */
export function stageDatasetBaseline() {
  const b = { ...baselineRows[0]!, id: crypto.randomUUID(), status: 'draft', version: '1' }; baselineRows.push(b); events[b.id] = []; return b.id;
}

/** Conformance cases stage independent capacity; browser fixtures retain their queued requests. */
export function stageDatasetSuiteRun() {
  for (let i = runs.length - 1; i >= 0; i--) if (runs[i]!.state === 'queued') runs.splice(i, 1);
  return SUITE;
}
