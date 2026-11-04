/**
 * Mock half of the catalog import (#1195 c): `importPaste`, `importValidate`, `importResolve`, `importApply`, `importCancel` and the
 * `importDetail` read, answered like the server's names-only model sheet (`apps/platform-api/src/modules/log-knowledge/import-*.ts`,
 * contract `docs/architecture/platform-api/api/log-knowledge.md` §Catalog import): headers by alias, a plan per row with `creates`,
 * conflicts, a seal-then-apply state machine that works a few rows per call, versions on the job.
 *
 * Nothing touches the catalog store before an apply call; apply writes through the store's `insert`/`touch`/`setProcesses`.
 * Differences: no 5,000-row upload, no `importMap`, no audit rows, no `busy` apply answer, no `partial_failure` (no row can fail here).
 * The mock catalog has no natural duplicate names, so one fixture rule stands in: a model named just `Alpha` under 'Alpha Semicap'
 * names both Alpha 100 and Alpha 200 (`ambiguous_name`). The server finds real ones by code key and name key.
 */
import { validateFilters, type ColumnFilter, type FieldError } from '@ap/contracts';
import { MockRequestError, defineMockAction, defineMockEndpoint, type AnyMockAction, type AnyMockEndpoint } from '@ap/mock-server';
import {
  IMPORT_APPLY_STATUSES, importApply, importCancel, importDetailEndpoint, importPaste, importResolve, importRowFilterSpecs, importValidate,
  type ImportApplyCounts, type ImportApplyResult, type ImportApplyStatus, type ImportDetail, type ImportDetailParams, type ImportJobStatus, type ImportPlanState, type ImportRowView,
} from '../endpoints';
import { all, byId, insert, processIdsOf, setProcesses, toCodeKey, touch, type Rec } from './store';

export const MOCK_IMPORT_MAX_ROWS = 1000;
const MAX_BYTES = 256 * 1024;
const RESOLVE_MAX = 500;
const CODE_MAX = 64;
/** Rows one apply call works before it answers `applying` (the server's budget is time; a small count makes the loop visible). */
export const MOCK_APPLY_BATCH = 40;
const ALIASES = {
  vendor: ['메이커명', '메이커', '제조사', 'vendor_name'], model: ['모델명', '모델', 'model_name'], process: ['공정명', '공정', 'process_names'],
} as const;
const ambiguousFixtureName = 'alpha';

type Cells = { vendor: string; model: string; processes: string[]; processesMapped: boolean };
type Plan = { state: ImportPlanState; errors: { field: string; code: string }[]; targetId: string | null; targetVersion: number | null; creates: { vendor?: string; processes: string[] } | null };
type Row = {
  rowNo: number; raw: Record<string, string>; cells: Cells; plan: Plan; resolution: 'skip' | null;
  applyStatus: ImportApplyStatus | null; applyError: string | null; resultTargetId: string | null;
};
type Job = {
  id: string; fileName: string; fileSize: number; headers: string[]; mapping: Record<string, string>; status: ImportJobStatus;
  planVersion: number; rowVersion: number; rows: Row[]; sealed: boolean; createdAt: string; updatedAt: string;
};

let jobs = new Map<string, Job>();
let sequence = 0;
export function resetImports(): void { jobs = new Map(); sequence = 0; }

const norm = (value: string): string => value.normalize('NFKC').trim();
const jobUuid = (n: number): string => `00000007-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const err = (path: readonly string[], code: string): FieldError => ({ path, code });

/** Minimal delimited-text reader (RFC 4180 quotes). */
function parseText(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); cell = ''; rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

const refusal = (code: string, headers: readonly string[] = []): FieldError[] => [err(['text'], code), ...headers.map(h => err(['text', 'headers', h], code))];

/** The paste's file-level judgment; `null` when the text is a model sheet. */
function pasteRefusal(text: string): { errors: FieldError[] } | { header: string[]; rows: string[][]; mapping: Record<string, string> } {
  if (new TextEncoder().encode(text).length > MAX_BYTES) return { errors: refusal('file_too_large') };
  const clean = text.replace(/^﻿/, '');
  const first = clean.split(/\r\n|\n|\r/).find(line => line.trim() !== '');
  if (first === undefined) return { errors: refusal('empty') };
  const table = parseText(clean, first.includes('\t') ? '\t' : ',');
  const header = (table[0] ?? []).map(norm);
  if (header.length > 50) return { errors: refusal('too_many_columns') };
  if (header.some(h => h === '')) return { errors: refusal('invalid_headers') };
  const mapping: Record<string, string> = {};
  const fieldOf: [keyof typeof ALIASES, string][] = [['vendor', 'vendor_name'], ['model', 'model_name'], ['process', 'process_names']];
  for (const [kind, field] of fieldOf) {
    const found = header.filter(h => (ALIASES[kind] as readonly string[]).includes(h.toLowerCase()) || (ALIASES[kind] as readonly string[]).includes(h));
    if (found.length > 1) return { errors: refusal('duplicate_header', found) };
    if (found[0] !== undefined) mapping[field] = found[0];
  }
  const missing = [!mapping['vendor_name'] ? '메이커명' : null, !mapping['model_name'] ? '모델명' : null].filter((h): h is string => h !== null);
  if (missing.length > 0) return { errors: refusal('missing_header', missing) };
  const rows = table.slice(1);
  if (rows.length > MOCK_IMPORT_MAX_ROWS) return { errors: refusal('too_many_rows') };
  if (rows.some(r => r.length !== header.length)) return { errors: refusal('unreadable') };
  return { header, rows, mapping };
}

const matches = (rows: Rec[], key: string): Rec[] => rows.filter(r => r.key === key || toCodeKey(r.name) === key);

/** Plans one row against the catalog and the rows before it (duplicate in file). */
function planRow(cells: Cells, seen: Set<string>): Plan {
  const errors: { field: string; code: string }[] = [];
  const conflicts: { field: string; code: string }[] = [];
  const creates: { vendor?: string; processes: string[] } = { processes: [] };
  const name = cells.model.trim(), vendorName = cells.vendor.trim();
  if (vendorName === '') errors.push({ field: 'vendor_name', code: 'required' });
  if (name === '') errors.push({ field: 'model_name', code: 'required' });
  if ([...vendorName].length > CODE_MAX) errors.push({ field: 'vendor_name', code: 'too_long' });
  if ([...name].length > CODE_MAX) errors.push({ field: 'model_name', code: 'too_long' });
  if (errors.length > 0) return { state: 'error', errors, targetId: null, targetVersion: null, creates: null };

  const vendors = matches(all('vendor'), toCodeKey(vendorName));
  const vendor = vendors.length === 1 ? vendors[0]! : null;
  if (vendors.length > 1) conflicts.push({ field: 'vendor_name', code: 'ambiguous_parent' });
  else if (vendor && !vendor.active) conflicts.push({ field: 'vendor_name', code: 'parent_inactive' });
  else if (!vendor) creates.vendor = vendorName;

  const linked = new Set<string>();
  for (const p of cells.processes) {
    const found = matches(all('process'), toCodeKey(p));
    if (found.length > 1) conflicts.push({ field: 'process_names', code: 'ambiguous_parent' });
    else if (found.length === 1 && !found[0]!.active) conflicts.push({ field: 'process_names', code: 'parent_inactive' });
    else if (found.length === 1) linked.add(found[0]!.id);
    else creates.processes.push(p);
  }

  const key = `${toCodeKey(vendorName)}\u0000${toCodeKey(name)}`;
  if (seen.has(key)) errors.push({ field: 'model_name', code: 'duplicate_in_file' });
  seen.add(key);
  if (errors.length > 0) return { state: 'error', errors, targetId: null, targetVersion: null, creates: null };

  let existing: Rec | null = null;
  if (vendor) {
    const models = all('model').filter(m => m.parentId === vendor.id);
    const found = matches(models, toCodeKey(name));
    if (found.length > 1 || (vendor.name === 'Alpha Semicap' && toCodeKey(name) === ambiguousFixtureName.toUpperCase())) conflicts.push({ field: 'model_code', code: 'ambiguous_name' });
    else existing = found[0] ?? null;
  }
  if (conflicts.length > 0) return { state: 'conflict', errors: conflicts, targetId: existing?.id ?? null, targetVersion: existing?.rowVersion ?? null, creates: null };
  const outCreates = creates.vendor !== undefined || creates.processes.length > 0 ? creates : null;
  if (!existing) return { state: 'new', errors: [], targetId: null, targetVersion: null, creates: outCreates };
  // An inactive existing model keeps its key: it is a conflict with a target and no error code.
  if (!existing.active) return { state: 'conflict', errors: [], targetId: existing.id, targetVersion: existing.rowVersion, creates: null };
  // Like the server: a mapped process column replaces the whole set (extra links go, an empty cell clears); an omitted column leaves it alone.
  const have = new Set(processIdsOf(existing.id));
  const changesProcesses = cells.processesMapped && (creates.processes.length > 0 || linked.size !== have.size || [...linked].some(id => !have.has(id)));
  const renamed = existing.name !== name;
  return { state: changesProcesses || renamed ? 'update' : 'unchanged', errors: [], targetId: existing.id, targetVersion: existing.rowVersion, creates: changesProcesses ? outCreates : null };
}

const cellsOf = (raw: Record<string, string>, mapping: Record<string, string>): Cells => ({
  vendor: raw[mapping['vendor_name']!] ?? '', model: raw[mapping['model_name']!] ?? '',
  processesMapped: mapping['process_names'] !== undefined,
  processes: [...new Map((raw[mapping['process_names'] ?? ''] ?? '').split(',').map(p => p.trim()).filter(p => p !== '').map(p => [toCodeKey(p), p] as const)).values()],
});

const touchJob = (job: Job, plan: boolean): void => {
  job.rowVersion += 1; if (plan) job.planVersion += 1; job.updatedAt = new Date().toISOString();
};

const countPlan = (job: Job): Record<ImportPlanState, number> => {
  const counts: Record<ImportPlanState, number> = { pending: 0, new: 0, unchanged: 0, update: 0, conflict: 0, error: 0 };
  for (const r of job.rows) counts[r.plan.state] += 1;
  return counts;
};

const applyCounts = (job: Job): ImportApplyCounts => {
  const counts = Object.fromEntries([...IMPORT_APPLY_STATUSES, 'remaining'].map(k => [k, 0])) as ImportApplyCounts;
  for (const r of job.rows) if (r.applyStatus) counts[r.applyStatus] += 1;
  counts.remaining = job.sealed ? job.rows.filter(r => r.applyStatus === null).length : 0;
  return counts;
};

const stepResult = (job: Job) => ({ jobId: job.id, status: job.status, planVersion: job.planVersion });
const done = (job: Job, data: unknown) => ({ data, version: String(job.rowVersion) });
const jobOf = (input: Record<string, unknown>): Job | undefined => (typeof input['jobId'] === 'string' ? jobs.get(input['jobId']) : undefined);
const versionOf = ({ input }: { input: Record<string, unknown> }): string | null => { const job = jobOf(input); return job ? String(job.rowVersion) : null; };
const OPEN: readonly ImportJobStatus[] = ['mapped', 'validated', 'review_required'];

/** Works up to MOCK_APPLY_BATCH eligible rows: a new row creates the maker, processes and model (code = name); an update links processes. */
function applySome(job: Job): void {
  let budget = MOCK_APPLY_BATCH;
  for (const row of job.rows) {
    if (budget === 0) break;
    if (row.applyStatus !== null) continue;
    budget -= 1;
    const { cells, plan } = row;
    const vendorKey = toCodeKey(cells.vendor);
    const vendor = matches(all('vendor'), vendorKey)[0] ?? insert('vendor', cells.vendor.trim(), cells.vendor.trim(), null);
    const processIds = cells.processes.map(p => (matches(all('process'), toCodeKey(p))[0] ?? insert('process', p, p, null)).id);
    if (plan.state === 'new') {
      const model = insert('model', cells.model.trim(), cells.model.trim(), vendor.id);
      setProcesses(model.id, processIds);
      row.resultTargetId = model.id;
    } else {
      const target = byId(plan.targetId)!;
      touch(target, { name: cells.model.trim() });
      if (cells.processesMapped) setProcesses(target.id, processIds);
      row.resultTargetId = target.id;
    }
    row.applyStatus = 'applied';
  }
  const left = job.rows.some(r => r.applyStatus === null);
  job.status = left ? 'applying' : job.rows.some(r => r.applyStatus === 'failed') ? 'partial_failure' : 'completed';
  touchJob(job, false);
}

/** First apply call seals the plan: rows that never write get their final status; the rest wait for `applySome`. */
function seal(job: Job): void {
  for (const r of job.rows) {
    const { state } = r.plan;
    if (state === 'unchanged') r.applyStatus = 'unchanged';
    else if (state === 'error') r.applyStatus = 'excluded';
    else if (state === 'conflict') r.applyStatus = r.resolution === 'skip' ? 'skipped' : 'unresolved';
  }
  job.sealed = true;
}

export const importActionsMock: readonly AnyMockAction[] = [
  defineMockAction(importPaste, {
    validate: input => {
      if (typeof input.text !== 'string') return [err(['text'], 'required')];
      if (input.sourceName !== undefined && typeof input.sourceName !== 'string') return [err(['sourceName'], 'invalid')];
      const result = pasteRefusal(input.text);
      return 'errors' in result ? result.errors : [];
    },
    handle: ({ input }) => {
      const parsed = pasteRefusal(input.text) as Exclude<ReturnType<typeof pasteRefusal>, { errors: FieldError[] }>;
      const rows: Row[] = parsed.rows.map((cells, i) => {
        const raw = Object.fromEntries(parsed.header.map((h, c) => [h, cells[c] ?? '']));
        return { rowNo: i + 1, raw, cells: cellsOf(raw, parsed.mapping), plan: { state: 'pending', errors: [], targetId: null, targetVersion: null, creates: null }, resolution: null, applyStatus: null, applyError: null, resultTargetId: null };
      });
      const at = new Date().toISOString();
      const delimiter = input.text.split(/\r\n|\n|\r/).find((l: string) => l.trim() !== '')?.includes('\t') ? 'tsv' : 'csv';
      const job: Job = {
        id: jobUuid(++sequence), fileName: (input.sourceName ?? '').trim() === '' ? `붙여넣기.${delimiter}` : String(input.sourceName).replace(/[\u0000-\u001f/\\]/g, '_').slice(0, 255),
        fileSize: new TextEncoder().encode(input.text).length, headers: parsed.header, mapping: parsed.mapping, status: 'mapped', planVersion: 1, rowVersion: 1, rows, sealed: false, createdAt: at, updatedAt: at,
      };
      jobs.set(job.id, job);
      return { data: { jobId: job.id, rowCount: rows.length, status: 'mapped' }, version: null };
    },
  }),
  defineMockAction(importValidate, {
    version: versionOf,
    validate: input => (jobOf(input) ? (OPEN.includes(jobOf(input)!.status) ? [] : [err(['jobId'], 'state')]) : []),
    handle: ({ input }) => {
      const job = jobOf(input)!;
      const seen = new Set<string>();
      for (const row of job.rows) { row.plan = planRow(row.cells, seen); row.resolution = null; }
      job.status = job.rows.some(r => r.plan.state === 'error' || r.plan.state === 'conflict') ? 'review_required' : 'validated';
      touchJob(job, true);
      return done(job, { ...stepResult(job), counts: countPlan(job) });
    },
  }),
  defineMockAction(importResolve, {
    version: versionOf,
    validate: input => {
      const job = jobOf(input);
      if (!job) return [];
      if (!OPEN.includes(job.status) || job.status === 'mapped') return [err(['jobId'], 'state')];
      if (!Array.isArray(input.resolutions) || input.resolutions.length === 0) return [err(['resolutions'], 'required')];
      if (input.resolutions.length > RESOLVE_MAX) return [err(['resolutions'], 'too_long')];
      return input.resolutions.flatMap((r: { rowNo: number; resolution: string }, i: number): FieldError[] => {
        const row = job.rows.find(x => x.rowNo === r.rowNo);
        if (!row) return [err(['resolutions', String(i), 'rowNo'], 'not_found')];
        return r.resolution === 'skip' ? [] : [err(['resolutions', String(i), 'resolution'], 'not_allowed')];
      });
    },
    handle: ({ input }) => {
      const job = jobOf(input)!;
      for (const r of input.resolutions as { rowNo: number }[]) job.rows.find(x => x.rowNo === r.rowNo)!.resolution = 'skip';
      touchJob(job, true);
      return done(job, { ...stepResult(job), resolved: input.resolutions.length });
    },
  }),
  defineMockAction(importCancel, {
    version: versionOf,
    validate: input => (jobOf(input) && !(OPEN.includes(jobOf(input)!.status)) ? [err(['jobId'], 'state')] : []),
    handle: ({ input }) => {
      const job = jobOf(input)!;
      job.status = 'cancelled';
      touchJob(job, false);
      return done(job, stepResult(job));
    },
  }),
  defineMockAction(importApply, {
    validate: input => (Number.isInteger(input.expectedPlanVersion) && input.expectedPlanVersion > 0 ? [] : [err(['expectedPlanVersion'], 'invalid')]),
    handle: ({ input }): { data: ImportApplyResult; version: string | null } => {
      const job = jobOf(input);
      if (!job) return { data: { outcome: 'not_found' }, version: null };
      if (job.planVersion !== input.expectedPlanVersion) return { data: { outcome: 'conflict', reason: 'plan_version' }, version: null };
      if (!(['validated', 'review_required', 'applying', 'partial_failure'] as ImportJobStatus[]).includes(job.status)) return { data: { outcome: 'conflict', reason: 'state' }, version: null };
      if (!job.sealed) seal(job);
      if (job.rows.some(r => r.applyStatus === null)) applySome(job);
      else { job.status = job.rows.some(r => r.applyStatus === 'failed') ? 'partial_failure' : 'completed'; touchJob(job, false); }
      return { data: { outcome: 'progress', ...stepResult(job), remaining: applyCounts(job).remaining, counts: applyCounts(job) }, version: null };
    },
  }),
];

const rowView = (job: Job, r: Row): ImportRowView => ({
  rowNo: r.rowNo, raw: r.raw, normalized: { vendor: r.cells.vendor, model: r.cells.model, processes: r.cells.processes }, errors: r.plan.errors,
  planState: r.plan.state, targetId: r.plan.targetId, targetVersion: r.plan.targetVersion, resolution: r.resolution, mapTargetId: null,
  applyStatus: r.applyStatus, applyError: r.applyError, resultTargetId: r.resultTargetId, creates: r.plan.creates,
});

function keep(row: Row, filters: readonly ColumnFilter[]): boolean {
  return filters.every(f => {
    if (f.op !== 'in' && f.op !== 'notIn') return true;
    const value = f.id === 'planState' ? row.plan.state : row.applyStatus;
    const hit = value !== null && f.value.includes(value);
    return f.op === 'in' ? hit : !hit;
  });
}

export const importReadsMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(importDetailEndpoint, {
    mart: false,
    validate: ({ params }) => {
      const { jobId, page = 0, pageSize = 50, sorting = [], filters = [] } = params as Partial<ImportDetailParams>;
      if (typeof jobId !== 'string') return 'jobId must be a string';
      if (!Number.isInteger(page) || page < 0) return 'page must be a non-negative integer (0-based)';
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) return 'pageSize must be an integer from 1 to 200';
      if (sorting.some(s => s.id !== 'rowNo')) return 'sorting by this id is not supported';
      const check = validateFilters(filters, importRowFilterSpecs);
      return check.ok ? null : `invalid filter ${check.filter.id}:${check.filter.op} (${check.reason})`;
    },
    handle: ({ params }): ImportDetail => {
      const job = jobs.get(params.jobId);
      if (!job) throw new MockRequestError('not_found');
      const { page = 0, pageSize = 50, sorting = [], filters = [] } = params;
      const rows = job.rows.filter(r => keep(r, filters));
      if (sorting[0]?.desc) rows.reverse();
      return {
        job: {
          id: job.id, entityType: 'model', fileName: job.fileName, fileSize: job.fileSize, fileType: 'csv', fileSha256: '0'.repeat(64), headers: job.headers, mapping: job.mapping,
          status: job.status, planVersion: job.planVersion, rowVersion: job.rowVersion, createdAt: job.createdAt, updatedAt: job.updatedAt,
        },
        rows: rows.slice(page * pageSize, (page + 1) * pageSize).map(r => rowView(job, r)), total: rows.length, applyCounts: applyCounts(job),
      };
    },
  }),
];
