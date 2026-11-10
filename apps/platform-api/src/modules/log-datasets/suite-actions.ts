// The regression suite write actions (#1479 D-c, design log-test-datasets §3.5 / §5 / §6): suiteCreate, suiteUpdate (`dataset.manage`) and
// suiteRun (`dataset.suite.run`: Workspace scope, session-only, non-sensitive; the Admin role holds it, a Developer by grant, a User NEVER —
// the CURRENT role is checked on every call, so a grantee demoted to User keeps the row but loses the right, as `baselineApprove`).
// Rules: the workspace is the actor's; a suite may only name datasets the actor can see (a `private` dataset of another owner is the same
// absence as a missing one); every write is one transaction holding the row change(s) and the audit row. A run:
//   * is idempotent by (suite, actor, `idempotencyKey`): the same key answers the same run (`replayed`), writes and audits nothing more;
//   * counts the user's ACTIVE runs (derived from the requests' states, through the lifecycle port) under a per-user advisory lock and is
//     refused at `SUITE_RUN_CONCURRENT_LIMIT` (`suite.run_limit`);
//   * resolves every item to an APPROVED baseline and its revision (an omitted revision = the latest approved baseline's revision) and PINS
//     revision, baseline, digests and the 기준 낡음 badge in `suite_run_item`; a stale baseline does not block, it is recorded;
//   * asks the Source (behind the Source-owner ACL, with deadlines) BEFORE writing, never keeps an adapter error;
//   * registers one execution request per item through the lifecycle port (never a lifecycle table); the run has no stored state.
// Nothing here changes a baseline from results. Audit detail is body-free (ids, counts, state names).

import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import type { AuditEventType } from '@ap/feature-shared';
import { createAuditService } from '../core/audit/audit-service.js';
import type { Tx } from '../../db/tx.js';
import {
  type ActionHandlerResult,
  type FieldError,
  type MenuActionDeclaration,
  MenuActionInvalidError,
} from '../menu-dispatch/types.js';
import { applyAdminModuleBypass } from '../permissions/check-service.js';
import type { PlatformActor } from '../platform-port/permissions.js';
import { DATASET_MANAGE_MENU_PERMISSION, DATASET_MANAGE_PERMISSION } from './dataset-actions.js';
import type { LogDatasetsDeps } from './deps.js';
import { baselineDigest } from './domain/suite-digest.js';
import { SUITE_INPUT_KEYS, type SuiteInput, type SuiteOp, parseSuiteInput, validateSuiteInput } from './domain/suite-input.js';
import { SUITE_RUN_CONCURRENT_LIMIT } from './domain/suite-state.js';
import type { StaleSummary } from './domain/baseline-stale.js';
import { LOG_DATASETS_MENU_ID } from './menu.js';
import { runItems } from './repositories/suite-read.js';
import {
  type ResolvedItem,
  type SuitePatch,
  checkItemRefs,
  findRunByKey,
  insertRun,
  insertRunItem,
  insertSuite,
  lockSuite,
  patchSuite,
  resolveItem,
} from './repositories/suite-write.js';
import { staleOf } from './stale-read.js';
import { checkSampleSetFilesFor } from './source-check.js';

export const SUITE_RUN_PERMISSION = 'dataset.suite.run';
/** The menu permission the run action declares: bootstrap lists it exactly for the users `SUITE_RUN_PERMISSION` lets run (`platform-port/permissions.ts`). */
export const SUITE_RUN_MENU_PERMISSION = 'dataset:suite-run';
/** Field code of the per-user cap on concurrent suite runs (design §5, D7). */
export const SUITE_RUN_LIMIT_CODE = 'suite.run_limit';

const INVALIDATES = ['logDataset.suites', 'logDataset.suiteDetail', 'logDataset.suiteRuns'] as const;

const invalid = (...errors: FieldError[]) => new MenuActionInvalidError(errors);

export function suiteActions(deps: LogDatasetsDeps): MenuActionDeclaration[] {
  const audit = createAuditService();

  const allowed = async (actor: PlatformActor, tx: Tx, capability: typeof DATASET_MANAGE_PERMISSION | typeof SUITE_RUN_PERMISSION) =>
    // A User never holds this capability, even with a live grant: the check service drops it for the CURRENT role (#1531, `NOT_FOR_USER_ROLE`).
    applyAdminModuleBypass(
      actor.role_level,
      capability,
      await deps.checkService.checkCapability(actor, capability, { workspace_id: actor.workspace_id }, { tx }),
    ).allow;

  const record = (tx: Tx, actor: PlatformActor, eventType: AuditEventType, subjectType: 'regression_suite' | 'suite_run', subjectId: string, detail: Record<string, unknown>) =>
    audit.record(tx, {
      workspace_id: actor.workspace_id,
      actor_id: actor.actor_id,
      event_type: eventType,
      subject_type: subjectType,
      subject_id: subjectId,
      summary: eventType.replace('.', ' ').replace('_', ' '),
      detail,
    });

  function parsed<Op extends SuiteOp>(op: Op, input: Record<string, unknown>): SuiteInput<Op> {
    const result = parseSuiteInput(op, input);
    if (!result.ok) throw new Error(`action ${op}: validate passed but parse failed`);
    return result.value;
  }

  const base = (op: SuiteOp, concurrency: 'none' | 'version', run = false) => ({
    id: `logDataset.${op}`,
    menuId: LOG_DATASETS_MENU_ID,
    inputKeys: SUITE_INPUT_KEYS[op],
    permission: run ? SUITE_RUN_MENU_PERMISSION : DATASET_MANAGE_MENU_PERMISSION,
    requiresScope: false,
    concurrency,
    invalidates: INVALIDATES,
  });

  /** `items.<i>.<field>` errors for every item that names a dataset / revision / baseline the actor cannot see or that does not belong together. */
  async function itemErrors(tx: Tx, actor: PlatformActor, items: readonly SuiteInput<'suiteCreate'>['items'][number][]): Promise<FieldError[]> {
    const errors: FieldError[] = [];
    for (const [i, item] of items.entries()) {
      for (const p of await checkItemRefs(tx, actor.workspace_id, actor.actor_id, item)) errors.push({ path: ['items', String(i), p.field], code: p.code });
    }
    return errors;
  }

  // ---- suiteCreate --------------------------------------------------------------------------------------------
  const suiteCreate: MenuActionDeclaration = {
    spec: base('suiteCreate', 'none'),
    authorize: (actor, tx) => allowed(actor, tx, DATASET_MANAGE_PERMISSION),
    validate: (input) => validateSuiteInput('suiteCreate', input),
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const value = parsed('suiteCreate', input);
      const errors = await itemErrors(tx, actor, value.items);
      if (errors.length > 0) throw invalid(...errors);
      const row = await insertSuite(tx, {
        workspaceId: actor.workspace_id,
        actorId: actor.actor_id,
        name: value.name,
        items: value.items,
        engineProfileRef: value.engineProfileRef ?? null,
        requiredPin: value.requiredPin ?? {},
      });
      await record(tx, actor, 'dataset.suite_created', 'regression_suite', row.id, {
        itemCount: value.items.length,
        hasEngineProfile: row.engineProfileRef !== null,
        hasRequiredPin: Object.keys(row.requiredPin as object).length > 0,
      });
      return { data: { suiteId: row.id, version: String(row.rowVersion) }, version: null };
    },
  };

  // ---- suiteUpdate --------------------------------------------------------------------------------------------
  const suiteUpdate: MenuActionDeclaration = {
    spec: base('suiteUpdate', 'version'),
    authorize: (actor, tx) => allowed(actor, tx, DATASET_MANAGE_PERMISSION),
    validate: (input) => validateSuiteInput('suiteUpdate', input),
    async currentVersion(tx, actor, input) {
      const row = await lockSuite(tx, actor.workspace_id, input.id as string);
      return row ? String(row.rowVersion) : null;
    },
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const value = parsed('suiteUpdate', input);
      const row = await lockSuite(tx, actor.workspace_id, value.id.toLowerCase());
      if (!row) throw new Error('action suiteUpdate: currentVersion judged not_found first');
      const patch: SuitePatch = {};
      const changed: string[] = [];
      if (value.name !== undefined && value.name !== row.name) {
        patch.name = value.name;
        changed.push('name');
      }
      if (value.items !== undefined && !isDeepStrictEqual(value.items, row.items)) {
        const errors = await itemErrors(tx, actor, value.items);
        if (errors.length > 0) throw invalid(...errors);
        patch.items = value.items;
        changed.push('items');
      }
      if (value.engineProfileRef !== undefined && value.engineProfileRef !== row.engineProfileRef) {
        patch.engineProfileRef = value.engineProfileRef;
        changed.push('engineProfileRef');
      }
      if (value.requiredPin !== undefined && !isDeepStrictEqual(value.requiredPin, row.requiredPin)) {
        patch.requiredPin = value.requiredPin;
        changed.push('requiredPin');
      }
      // A save that changes nothing answers `ok` with the current version and writes no audit row.
      if (changed.length === 0) return { data: { version: String(row.rowVersion) }, version: String(row.rowVersion) };
      const version = await patchSuite(tx, actor.workspace_id, row.id, actor.actor_id, patch);
      await record(tx, actor, 'dataset.suite_updated', 'regression_suite', row.id, {
        changed,
        itemCount: (patch.items ?? (row.items as unknown[])).length,
      });
      return { data: { version: String(version) }, version: String(version) };
    },
  };

  // ---- suiteRun -----------------------------------------------------------------------------------------------
  const suiteRun: MenuActionDeclaration = {
    spec: base('suiteRun', 'none', true),
    authorize: (actor, tx) => allowed(actor, tx, SUITE_RUN_PERMISSION),
    validate: (input) => validateSuiteInput('suiteRun', input),
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = parsed('suiteRun', input);
      const suite = await lockSuite(tx, ws, value.suiteId.toLowerCase());
      if (!suite) throw invalid({ path: ['suiteId'], code: 'not_found' });
      const stored = suite.items as SuiteInput<'suiteCreate'>['items'];

      // One user's replay check, cap count and registration are one critical section.
      await deps.lifecycleRequests.lockRunQuota(tx, ws, actor.actor_id);
      const existing = await findRunByKey(tx, ws, suite.id, actor.actor_id, value.idempotencyKey);
      if (existing) {
        const items = await runItems(tx, ws, existing.id);
        return { data: { suiteRunId: existing.id, replayed: true, itemCount: items.length, items }, version: null };
      }
      const active = await deps.lifecycleRequests.countActiveRuns(tx, ws, actor.actor_id);
      if (active >= SUITE_RUN_CONCURRENT_LIMIT) throw invalid({ path: ['suiteId'], code: SUITE_RUN_LIMIT_CODE });

      // Resolve every item first: any item that cannot run refuses the whole run (nothing is half-requested).
      const resolved: ResolvedItem[] = [];
      const errors: FieldError[] = [];
      for (const [i, item] of stored.entries()) {
        const out = await resolveItem(tx, ws, actor.actor_id, item);
        if (typeof out === 'string') errors.push({ path: ['items', String(i), 'datasetId'], code: out });
        else resolved.push(out);
      }
      if (errors.length > 0) throw invalid(...errors);

      // The Source is asked once per distinct revision, in parallel, BEFORE any row is written (Source-owner ACL first, deadlines enforced
      // inside `checkSampleSetFilesFor`); a check that cannot settle makes the badge `unknown`, never blocks the run.
      const staleByRevision = new Map<string, StaleSummary>();
      await Promise.all(
        [...new Map(resolved.map((x) => [x.revisionId, x])).values()].map(async (x) => {
          const files = await checkSampleSetFilesFor(deps.sourceRead, deps.sourceOwnerAccess, actor, x.sampleSet);
          staleByRevision.set(x.revisionId, await staleOf(deps, ws, x.profilePin, files, actor.actor_id, tx));
        }),
      );

      const run = await insertRun(tx, {
        workspaceId: ws,
        suiteId: suite.id,
        actorId: actor.actor_id,
        idempotencyKey: value.idempotencyKey,
        engineProfileRef: suite.engineProfileRef,
        requiredPin: suite.requiredPin as never,
      });
      const tally = { fresh: 0, stale: 0, unknown: 0 };
      for (const [index, item] of resolved.entries()) {
        const stale = staleByRevision.get(item.revisionId) as StaleSummary;
        tally[stale.state] += 1;
        const itemId = randomUUID();
        const request = await deps.lifecycleRequests.register(tx, {
          workspaceId: ws,
          actorId: actor.actor_id,
          suiteRunId: run.id,
          suiteRunItemId: itemId,
          sampleSet: item.sampleSet,
          sampleManifestDigest: item.sampleManifestDigest,
          engineProfileRef: suite.engineProfileRef,
        });
        await insertRunItem(tx, {
          id: itemId,
          workspaceId: ws,
          suiteRunId: run.id,
          ordinal: index + 1,
          datasetId: item.datasetId,
          datasetRevisionId: item.revisionId,
          baselineId: item.baselineId,
          sampleManifestDigest: item.sampleManifestDigest,
          baselineDigest: baselineDigest(item),
          baselineStale: stale,
          requestId: request.requestId,
        });
      }
      await record(tx, actor, 'dataset.suite_run_requested', 'suite_run', run.id, {
        suiteId: suite.id,
        itemCount: resolved.length,
        stale: tally,
        activeRuns: active,
      });
      const items = await runItems(tx, ws, run.id);
      return { data: { suiteRunId: run.id, replayed: false, itemCount: items.length, items }, version: null };
    },
  };

  return [suiteCreate, suiteUpdate, suiteRun];
}
