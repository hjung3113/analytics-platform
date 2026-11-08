// Seal and apply of a catalog import (#1195 b, design v0.6 §6.2 ④–⑤). The apply is a resumable state machine:
//   * the first call seals the plan (row hashes + job hash) and sets the job `applying`;
//   * rows are applied one transaction each, in `row_no` order, until the time budget is spent (at least one row
//     per call); the client calls again to resume;
//   * a pass attempts each eligible row at most once (`apply_pass`); when none is left the job becomes `completed`,
//     or `partial_failure` when a row is `failed` or `conflict`; a later call retries only the `failed` rows.
// One runner per job: a session-scoped advisory lock (workspace + job) is held for the whole call, including the
// failure marking and the finish; a concurrent caller only reads the current progress.
// Nothing here reactivates a row or edits a code: update/map change a name and a model's process set only.

import type pg from 'pg';

import { type Db, dbOnClient } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { dbTimeoutKind } from '../../lib/db-timeout.js';
import { HttpError } from '../../lib/errors.js';
import type { PlatformActor } from '../platform-port/permissions.js';
import { recordCatalogAudit, recordIdentityMapped } from './catalog-audit.js';
import {
  type ApplyCounts,
  type ApplyStatus,
  decideRow,
  finalJobStatus,
  identityKey,
  isFinalApplyStatus,
  rowPlanHash,
  sealHash,
} from './domain/import-apply.js';
import type { ModelNormalized, SimpleNormalized, SoftwareNormalized } from './domain/import-plan.js';
import {
  type CatalogKind,
  type CatalogRow,
  DuplicateCatalogKeyError,
  changeModelProcesses,
  codeKeyTaken,
  insertRow,
  lockRow,
  modelProcessIds,
  updateRow,
} from './repositories/catalog-write.js';
import {
  IDENTITY_SOURCE_SYSTEM,
  applyCounts,
  claimIdentity,
  findIdentity,
  findModelByKey,
  findVendorByKey,
  lookupParent,
  finishJob,
  lockApplyRow,
  lockJob,
  markJobSealed,
  nextEligibleRow,
  readPlanRows,
  readResolutions,
  sealRows,
  setRowResult,
  startRetryPass,
} from './repositories/import-apply-repo.js';
import { type ImportJob, getJob } from './repositories/import-repo.js';

export const IMPORT_APPLY_BUDGET_MS = 15_000;

/** Test seams (module deps): none of these is used in production. */
export interface ImportApplyHooks {
  /** Before a row's transaction starts. */
  beforeRow?(rowNo: number): Promise<void>;
  /** In a create, after the `codeKeyTaken` pre-check and before the insert. */
  afterCodeKeyCheck?(rowNo: number, tx: Tx): Promise<void>;
  /** After a row's catalog/process/identity/audit writes, before its transaction commits. */
  beforeCommit?(rowNo: number): Promise<void>;
}

export interface ImportApplyConfig {
  budgetMs: number;
  hooks?: ImportApplyHooks;
  now?: () => number;
  /** Answer `busy` instead of throwing when the runner pool gives no connection in time (the action's pool). */
  busyOnNoConnection?: boolean;
}

export interface ApplyContext {
  db: Db;
  pool: pg.Pool;
  actor: PlatformActor;
  authorize: (actor: PlatformActor, tx: Tx) => Promise<boolean>;
  config: ImportApplyConfig;
}

export interface Progress {
  jobId: string;
  status: ImportJob['status'];
  planVersion: number;
  remaining: number;
  counts: ApplyCounts;
}

export type ApplyResult =
  | { kind: 'ok'; progress: Progress }
  | { kind: 'not_found' }
  | { kind: 'busy' }
  | { kind: 'conflict'; code: 'plan_version' | 'state' };

const denied = () => new HttpError('permission.denied', 'No permission knowledge.catalog.import');

async function progressOf(db: Db, ws: string, jobId: string): Promise<Progress | null> {
  const job = await getJob(db, ws, jobId);
  if (!job) return null;
  const counts = await applyCounts(db, ws, job.id, job.applyPass);
  return { jobId: job.id, status: job.status, planVersion: job.planVersion, remaining: counts.remaining, counts };
}

/**
 * The session-scoped runner lock. `run` gets a `Db` pinned to the connection that holds the lock, so the whole pass
 * needs no second connection; a caller that does not get the lock reads the contention progress on that same
 * connection (`busy`), so no path needs a connection beyond the one it acquired.
 */
async function withRunnerLock<T>(
  pool: pg.Pool,
  ws: string,
  jobId: string,
  run: (pinned: Db) => Promise<T>,
  busy: (pinned: Db) => Promise<T>,
  noConnection?: () => T,
): Promise<T> {
  let client: pg.PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    // Only the pool's acquisition timeout means "no connection in time"; auth/network errors propagate.
    if (noConnection && dbTimeoutKind(error) === 'pool_acquire') return noConnection();
    throw error;
  }
  let held: boolean;
  try {
    const got = await client.query<{ ok: boolean }>('select pg_try_advisory_lock(hashtext($1), hashtext($2)) as ok', [ws, jobId]);
    held = got.rows[0]?.ok === true;
  } catch (error) {
    client.release(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
  if (!held) {
    // The contention read uses the connection already held, never a second one.
    try {
      return await busy(dbOnClient(client));
    } finally {
      client.release();
    }
  }
  let broken = false;
  try {
    return await run(dbOnClient(client));
  } finally {
    try {
      await client.query('select pg_advisory_unlock(hashtext($1), hashtext($2))', [ws, jobId]);
    } catch {
      broken = true; // dropping the connection releases the session lock
    }
    client.release(broken ? new Error('advisory unlock failed') : undefined);
  }
}

export async function runApply(
  outer: ApplyContext,
  jobId: string,
  expectedPlanVersion: number,
): Promise<ApplyResult> {
  const ws = outer.actor.workspace_id;
  return withRunnerLock(
    outer.pool,
    ws,
    jobId,
    async (pinned) => {
      const ctx: ApplyContext = { ...outer, db: pinned };
      let job = await getJob(ctx.db, ws, jobId);
      if (!job) return { kind: 'not_found' };

      if (job.status === 'validated' || job.status === 'review_required') {
        if (job.planVersion !== expectedPlanVersion) return { kind: 'conflict', code: 'plan_version' };
        const sealed = await ctx.db.transaction((tx) => seal(tx, ctx, jobId, expectedPlanVersion));
        if (sealed !== 'ok') return { kind: 'conflict', code: sealed };
      } else if (job.status === 'partial_failure') {
        const started = await ctx.db.transaction((tx) => startRetry(tx, ctx, jobId));
        if (!started) return progressResult(ctx.db, ws, jobId);
      } else if (job.status !== 'applying') {
        if (job.status === 'completed') return progressResult(ctx.db, ws, jobId);
        return { kind: 'conflict', code: 'state' };
      }

      job = await getJob(ctx.db, ws, jobId);
      if (!job?.sealedPlanHash) return { kind: 'conflict', code: 'state' };
      const drained = await runPass(ctx, job);
      if (drained) await ctx.db.transaction((tx) => finish(tx, ctx, jobId));
      return progressResult(ctx.db, ws, jobId);
    },
    (pinned) => progressResult(pinned, ws, jobId),
    outer.config.busyOnNoConnection ? () => ({ kind: 'busy' }) : undefined,
  );
}

async function progressResult(db: Db, ws: string, jobId: string): Promise<ApplyResult> {
  const progress = await progressOf(db, ws, jobId);
  return progress ? { kind: 'ok', progress } : { kind: 'not_found' };
}

/** Seals the plan; `plan_version` is the one the caller saw. */
async function seal(tx: Tx, ctx: ApplyContext, jobId: string, expected: number): Promise<'ok' | 'plan_version' | 'state'> {
  const ws = ctx.actor.workspace_id;
  if (!(await ctx.authorize(ctx.actor, tx))) throw denied();
  const job = await lockJob(tx, ws, jobId, 'update');
  if (!job || (job.status !== 'validated' && job.status !== 'review_required')) return 'state';
  if (job.planVersion !== expected) return 'plan_version';
  const rows = await readPlanRows(tx, ws, jobId);
  const resolutions = await readResolutions(tx, ws, jobId, job.validationGeneration);
  const hashes: string[] = [];
  const entries = rows.map((row) => {
    const resolution = resolutions.get(row.rowNo) ?? null;
    const planHash = rowPlanHash({ ...row, resolution });
    hashes.push(planHash);
    const action = decideRow({ ...row, resolution });
    return { rowNo: row.rowNo, planHash, finalStatus: action.kind === 'final' ? action.status : null };
  });
  await sealRows(tx, ws, jobId, entries);
  await markJobSealed(tx, ws, jobId, ctx.actor.actor_id, sealHash(hashes));
  return 'ok';
}

/** A new pass over the `failed` rows; false when there is none (the job stays `partial_failure`). */
async function startRetry(tx: Tx, ctx: ApplyContext, jobId: string): Promise<boolean> {
  const ws = ctx.actor.workspace_id;
  if (!(await ctx.authorize(ctx.actor, tx))) throw denied();
  const job = await lockJob(tx, ws, jobId, 'update');
  if (!job || job.status !== 'partial_failure') return false;
  const counts = await applyCounts(tx, ws, jobId, job.applyPass + 1);
  if (counts.failed === 0) return false;
  await startRetryPass(tx, ws, jobId, ctx.actor.actor_id);
  return true;
}

async function finish(tx: Tx, ctx: ApplyContext, jobId: string): Promise<void> {
  const ws = ctx.actor.workspace_id;
  if (!(await ctx.authorize(ctx.actor, tx))) throw denied();
  const job = await lockJob(tx, ws, jobId, 'update');
  if (!job || job.status !== 'applying') return;
  const counts = await applyCounts(tx, ws, jobId, job.applyPass);
  if (counts.remaining > 0) return;
  await finishJob(tx, ws, jobId, ctx.actor.actor_id, finalJobStatus(counts));
}

/** Applies eligible rows until none is left (true) or the budget is spent after at least one attempt (false). */
async function runPass(ctx: ApplyContext, job: ImportJob): Promise<boolean> {
  const ws = ctx.actor.workspace_id;
  const now = ctx.config.now ?? Date.now;
  const started = now();
  let attempted = 0;
  for (;;) {
    const rowNo = await nextEligibleRow(ctx.db, ws, job.id, job.applyPass);
    if (rowNo === null) return true;
    if (attempted > 0 && now() - started >= ctx.config.budgetMs) return false;
    await ctx.config.hooks?.beforeRow?.(rowNo);
    await applyOne(ctx, job, rowNo);
    attempted += 1;
  }
}

async function applyOne(ctx: ApplyContext, job: ImportJob, rowNo: number): Promise<void> {
  try {
    await ctx.db.transaction((tx) => applyRowTx(tx, ctx, job, rowNo));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    // The row's transaction rolled back whole; record the failure on its own so the pass can go on.
    await ctx.db.transaction(async (tx) => {
      if (!(await ctx.authorize(ctx.actor, tx))) throw denied(); // the row stays non-final; the pass stops with 403
      const row = await lockApplyRow(tx, ctx.actor.workspace_id, job.id, rowNo);
      if (!row || isFinalApplyStatus(row.applyStatus)) return;
      const outcome: Outcome = error instanceof RowRefusal ? conflict(error.reason) : failed('unexpected');
      await setRowResult(tx, ctx.actor.workspace_id, job.id, rowNo, job.applyPass, outcome);
    });
  }
}

interface Outcome {
  status: ApplyStatus;
  error?: string;
  resultTargetId?: string | null;
}
/** Thrown after writes were made: the row's transaction rolls back whole, then the row is recorded as a conflict. */
class RowRefusal extends Error {
  constructor(readonly reason: string) {
    super(`catalog import row refused: ${reason}`);
  }
}
const failed = (error: string): Outcome => ({ status: 'failed', error });
const conflict = (error: string): Outcome => ({ status: 'conflict', error });

async function applyRowTx(tx: Tx, ctx: ApplyContext, job: ImportJob, rowNo: number): Promise<void> {
  const ws = ctx.actor.workspace_id;
  if (!(await ctx.authorize(ctx.actor, tx))) throw denied();
  const live = await lockJob(tx, ws, job.id, 'share');
  const row = await lockApplyRow(tx, ws, job.id, rowNo);
  if (!live || !row) throw new Error('catalog import row vanished');
  if (isFinalApplyStatus(row.applyStatus)) return; // exactly once
  const record = (outcome: Outcome) =>
    setRowResult(tx, ws, job.id, rowNo, job.applyPass, outcome);

  const resolution = (await readResolutions(tx, ws, job.id, live.validationGeneration, rowNo)).get(rowNo) ?? null;
  if (
    live.status !== 'applying' ||
    live.sealedPlanHash !== job.sealedPlanHash ||
    rowPlanHash({ ...row, resolution }) !== row.planHash
  ) {
    await record(failed('plan_changed'));
    return;
  }

  const action = decideRow({ ...row, resolution });
  let outcome: Outcome;
  if (action.kind === 'final') outcome = { status: action.status };
  else if (action.kind === 'create') outcome = await create(tx, ctx, job, row.rowNo, row.normalized);
  else outcome = await updateOrMap(tx, ctx, job, row.rowNo, row.normalized, action);
  await ctx.config.hooks?.beforeCommit?.(rowNo);
  await record(outcome);
}

const sourceOf = (job: ImportJob, rowNo: number) => ({ importJobId: job.id, rowNo });

/** One maker or process a row needs: an existing row, or a name to create when none exists. */
type ParentPlan =
  | { kind: 'existing'; id: string; active: boolean }
  | { kind: 'create'; code: string; name: string; key: string; nameKey: string | null }
  | { kind: 'refused'; error: string };

/** Looks a parent up (no write); `creatable` is the code/name to create it with when none exists. */
async function planParent(
  tx: Tx,
  ws: string,
  kind: 'vendor' | 'process',
  key: string,
  nameKey: string | null,
  creatable: { code: string; name: string } | null,
  missingError: string,
  inactiveError: string,
  allowInactive = false,
): Promise<ParentPlan> {
  const hit = await lookupParent(tx, kind, ws, key, nameKey);
  if (hit.kind === 'many') return { kind: 'refused', error: 'ambiguous_parent' };
  if (hit.kind === 'none') {
    return creatable ? { kind: 'create', ...creatable, key, nameKey } : { kind: 'refused', error: missingError };
  }
  if (!hit.row.active && !allowInactive) return { kind: 'refused', error: inactiveError };
  return { kind: 'existing', id: hit.row.id, active: hit.row.active };
}

/**
 * Insert-if-absent on the unique key, then read: a replay or a concurrent runner that created the same maker or
 * process meanwhile is found by the second lookup, so it is created and audited exactly once. Returns the row id.
 */
async function ensureParent(
  tx: Tx,
  ctx: ApplyContext,
  job: ImportJob,
  rowNo: number,
  kind: 'vendor' | 'process',
  plan: Extract<ParentPlan, { kind: 'create' }>,
): Promise<string> {
  const ws = ctx.actor.workspace_id;
  try {
    const created = await insertRow(tx, kind, { workspaceId: ws, actorId: ctx.actor.actor_id, code: plan.code, name: plan.name, parentId: null });
    await recordCatalogAudit(tx, ctx.actor, kind, 'created', created, undefined, sourceOf(job, rowNo));
    return created.id;
  } catch (error) {
    if (!(error instanceof DuplicateCatalogKeyError)) throw error;
  }
  const hit = await lookupParent(tx, kind, ws, plan.key, plan.nameKey);
  if (hit.kind !== 'one') throw new Error(`catalog import: ${kind} key taken but not readable`);
  // The race winner is judged like any parent found at planning: an inactive one refuses the row.
  if (!hit.row.active) throw new RowRefusal(kind === 'vendor' ? 'parent_inactive' : 'process_inactive');
  return hit.row.id;
}

async function create(tx: Tx, ctx: ApplyContext, job: ImportJob, rowNo: number, normalized: unknown): Promise<Outcome> {
  const ws = ctx.actor.workspace_id;
  const kind: CatalogKind = job.entityType;
  let parentId: string | null = null;
  const processIds: string[] = [];
  let modelVendor: ParentPlan | null = null;
  const processPlans: ParentPlan[] = [];
  let code: string;
  let codeKey: string;
  let name: string;

  if (kind === 'vendor' || kind === 'process') {
    const n = normalized as SimpleNormalized;
    ({ code, codeKey, name } = n);
  } else if (kind === 'model') {
    const n = normalized as ModelNormalized;
    ({ code, codeKey, name } = n);
    const vendorPlan = await planParent(
      tx, ws, 'vendor', n.vendorKey, n.vendorName !== '' ? n.vendorNameKey : null,
      n.vendorName !== '' ? { code: n.vendorCode, name: n.vendorName } : null,
      'parent_missing', 'parent_inactive',
    );
    if (vendorPlan.kind === 'refused') return failed(vendorPlan.error);
    modelVendor = vendorPlan;
    for (const [i, key] of n.processKeys.entries()) {
      const label = n.processCodes[i] as string;
      const p = await planParent(tx, ws, 'process', key, n.processCreatable ? key : null, n.processCreatable ? { code: label, name: label } : null, 'process_missing', 'process_inactive');
      if (p.kind === 'refused') return failed(p.error);
      processPlans.push(p);
    }
    // Existing parents are judged above; nothing is written before the model's own key check below.
    if (vendorPlan.kind === 'existing') parentId = vendorPlan.id;
  } else {
    const n = normalized as SoftwareNormalized;
    code = n.versionLabel;
    codeKey = n.versionKey;
    name = n.name;
    const vendor = await findVendorByKey(tx, ws, n.vendorKey);
    if (!vendor) return failed('parent_missing');
    const model = await findModelByKey(tx, ws, vendor.id, n.modelKey);
    if (!model) return failed('parent_missing');
    if (!model.active) return failed('parent_inactive');
    parentId = model.id;
  }

  // A model under a maker that is created now cannot exist yet, so the key check applies to an existing maker only.
  if (modelVendor?.kind !== 'create' && (await codeKeyTaken(tx, kind, ws, codeKey, parentId, null))) return conflict('taken');
  await ctx.config.hooks?.afterCodeKeyCheck?.(rowNo, tx);
  if (modelVendor?.kind === 'create') parentId = await ensureParent(tx, ctx, job, rowNo, 'vendor', modelVendor);
  let created: CatalogRow;
  try {
    created = await insertRow(tx, kind, { workspaceId: ws, actorId: ctx.actor.actor_id, code, name, parentId });
  } catch (error) {
    if (error instanceof DuplicateCatalogKeyError) return conflict('taken');
    throw error;
  }
  for (const plan of processPlans) {
    if (plan.kind === 'create') processIds.push(await ensureParent(tx, ctx, job, rowNo, 'process', plan));
    else if (plan.kind === 'existing') processIds.push(plan.id);
  }
  const uniqueProcessIds = [...new Set(processIds)];
  if (uniqueProcessIds.length > 0) await changeModelProcesses(tx, ws, created.id, ctx.actor.actor_id, uniqueProcessIds, []);
  await recordCatalogAudit(tx, ctx.actor, kind, 'created', created, undefined, sourceOf(job, rowNo));
  return { status: 'applied', resultTargetId: created.id };
}

async function updateOrMap(
  tx: Tx,
  ctx: ApplyContext,
  job: ImportJob,
  rowNo: number,
  normalized: unknown,
  action: { kind: 'update' | 'map'; targetId: string; expectedVersion: number },
): Promise<Outcome> {
  const ws = ctx.actor.workspace_id;
  const kind: CatalogKind = job.entityType;
  const key = identityKey(kind, normalized);

  // Judge first, write after: every refusal below leaves the catalog and the identity map untouched.
  let writeIdentity = false;
  if (action.kind === 'map') {
    const existing = await findIdentity(tx, ws, kind, key);
    if (existing) {
      if (existing.targetId !== action.targetId || existing.targetKind !== kind || existing.mappingState !== 'accepted') {
        return conflict('identity_conflict');
      }
    } else writeIdentity = true;
  }
  const target = await lockRow(tx, kind, { workspaceId: ws, actorId: ctx.actor.actor_id }, action.targetId);
  if (!target) return conflict('target_missing');
  if (target.rowVersion !== action.expectedVersion) return conflict('stale_target');
  if (!target.active) return conflict('inactive_target');

  const changes: Record<string, [unknown, unknown]> = {};
  let nextName: string;
  let add: string[] = [];
  let remove: string[] = [];
  const newProcesses: Extract<ParentPlan, { kind: 'create' }>[] = [];
  let wantedProcessIds = new Set<string>();
  let currentIds: string[] = [];
  let processesTouched = false;
  if (kind === 'software') {
    const n = normalized as SoftwareNormalized;
    nextName = n.nameMapped ? n.name : target.name;
  } else {
    const n = normalized as SimpleNormalized;
    nextName = n.name;
    if (kind === 'model' && (normalized as ModelNormalized).processesMapped) {
      const mn = normalized as ModelNormalized;
      const current = await modelProcessIds(tx, ws, target.id);
      const currentSet = new Set(current);
      const wanted = new Set<string>();
      for (const [i, k] of mn.processKeys.entries()) {
        const label = mn.processCodes[i] as string;
        // An existing inactive assignment may stay; a new one must be active (the plan's rule).
        const p = await planParent(
          tx, ws, 'process', k, mn.processCreatable ? k : null, mn.processCreatable ? { code: label, name: label } : null,
          'process_missing', 'process_inactive', true,
        );
        if (p.kind === 'refused') return failed(p.error);
        if (p.kind === 'create') newProcesses.push(p);
        else {
          wanted.add(p.id);
          if (!p.active && !currentSet.has(p.id)) return failed('process_inactive');
        }
      }
      wantedProcessIds = wanted;
      currentIds = current;
      add = [...wanted].filter((id) => !currentSet.has(id));
      remove = current.filter((id) => !wanted.has(id));
      processesTouched = add.length > 0 || remove.length > 0 || newProcesses.length > 0;
    }
  }
  if (nextName !== target.name) changes.name = [target.name, nextName];

  // Claim the identity key atomically before the first catalog write: a competing job that won the key for another
  // target makes this row a conflict with nothing written. (The claim cannot be undone — the runtime role has no
  // DELETE — so every refusal above comes first and a later failure rolls the whole transaction back.)
  if (writeIdentity) {
    const claim = await claimIdentity(tx, ws, ctx.actor.actor_id, job.id, rowNo, kind, key, action.targetId);
    if (!claim.claimed) {
      const won = claim.existing;
      if (won.targetId !== action.targetId || won.targetKind !== kind || won.mappingState !== 'accepted') {
        return conflict('identity_conflict');
      }
      writeIdentity = false; // the same mapping was claimed meanwhile: nothing to write or audit
    }
  }

  // Processes named but absent are created now: after every refusal and after the identity claim (a later failure
  // rolls the whole row back), insert-if-absent so a replay or a competing runner never makes a second row.
  if (newProcesses.length > 0) {
    for (const plan of newProcesses) {
      const id = await ensureParent(tx, ctx, job, rowNo, 'process', plan);
      wantedProcessIds.add(id);
      if (!currentIds.includes(id)) add.push(id);
    }
  }
  if (processesTouched) changes.processIds = [currentIds, [...wantedProcessIds].sort()];
  let result = target;
  const changed = Object.keys(changes).length > 0;
  if (changed) {
    try {
      result = await updateRow(tx, kind, ws, target.id, ctx.actor.actor_id, { code: target.code, name: nextName });
    } catch (error) {
      if (error instanceof DuplicateCatalogKeyError && !writeIdentity) return conflict('taken');
      throw error; // with a claim held, the transaction rolls back whole (the code never changes here)
    }
    if (kind === 'model') await changeModelProcesses(tx, ws, target.id, ctx.actor.actor_id, add, remove);
    await recordCatalogAudit(tx, ctx.actor, kind, 'updated', result, changes, sourceOf(job, rowNo));
  }
  if (writeIdentity) {
    await recordIdentityMapped(
      tx,
      ctx.actor,
      kind,
      result,
      { sourceSystem: IDENTITY_SOURCE_SYSTEM, sourceType: kind, externalKey: key },
      sourceOf(job, rowNo),
    );
  }
  return { status: changed || writeIdentity ? 'applied' : 'unchanged', resultTargetId: target.id };
}
