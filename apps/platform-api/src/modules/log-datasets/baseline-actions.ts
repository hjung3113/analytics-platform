// The log test dataset baseline write actions (#1478 D-b, design log-test-datasets §3.3 / §5 / §6): baselineDraftCreate, baselineUpdateDraft,
// baselineApprove. Rights: `dataset.manage` for the draft actions (as D-a), `dataset.baseline.approve` for the approval (Workspace scope,
// sensitive, session-only, NO Admin role bypass: the approver holds the grant themselves). Self-approval is NOT blocked; it is recorded
// (`selfApproved` in the event and the audit row), like log-lifecycle D3.
// Rules: the workspace is the actor's; a baseline of a `private` dataset is its owner's alone (another actor gets `not_found`, like another
// workspace); an archived dataset's baselines are frozen. Every write is one transaction holding the row change, its `baseline_event` row
// and its audit row. Approving a draft marks the revision's previously approved baseline `superseded` IN THE SAME TRANSACTION, under the
// dataset row lock, so a revision never has two approved baselines (the partial unique index is the wall). Nothing here changes a
// baseline from run results. Lock order: dataset, then baselines (see repositories/baseline-write.ts).

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
import { BASELINE_INPUT_KEYS, type BaselineInput, type BaselineOp, parseBaselineInput, validateBaselineInput } from './domain/baseline-input.js';
import { type BaselineStatus, canTransition, isEditable, snapshotOf } from './domain/baseline-state.js';
import { LOG_DATASETS_MENU_ID } from './menu.js';
import {
  type BaselineRow,
  type DraftPatch,
  appendEvent,
  findBaselineOwner,
  findRevision,
  insertDraft,
  lockApprovedOf,
  lockBaseline,
  markApproved,
  markSuperseded,
  patchDraft,
} from './repositories/baseline-write.js';
import { lockDataset } from './repositories/dataset-write.js';
import type { SampleSet } from './domain/sample-manifest.js';

export const BASELINE_APPROVE_PERMISSION = 'dataset.baseline.approve';
/** The menu permission the approve action declares: bootstrap lists it exactly for the users `BASELINE_APPROVE_PERMISSION` lets approve (`platform-port/permissions.ts`). */
export const BASELINE_APPROVE_MENU_PERMISSION = 'dataset:baseline-approve';

const INVALIDATES = ['logDataset.datasetDetail', 'logDataset.baselines', 'logDataset.baselineDetail'] as const;

const invalid = (...errors: FieldError[]) => new MenuActionInvalidError(errors);

export function baselineActions(deps: LogDatasetsDeps): MenuActionDeclaration[] {
  const audit = createAuditService();

  const allowed = async (actor: PlatformActor, tx: Tx, capability: typeof DATASET_MANAGE_PERMISSION | typeof BASELINE_APPROVE_PERMISSION) =>
    // A User never approves, even with a live grant (a grantee demoted to User keeps the row): the CURRENT role is checked on every call.
    !(capability === BASELINE_APPROVE_PERMISSION && actor.role_level === 'user') &&
    applyAdminModuleBypass(
      actor.role_level,
      capability,
      await deps.checkService.checkCapability(actor, capability, { workspace_id: actor.workspace_id }, { tx }),
    ).allow;

  const record = (tx: Tx, actor: PlatformActor, eventType: AuditEventType, subjectId: string, detail: Record<string, unknown>) =>
    audit.record(tx, {
      workspace_id: actor.workspace_id,
      actor_id: actor.actor_id,
      event_type: eventType,
      subject_type: 'dataset_baseline',
      subject_id: subjectId,
      summary: eventType.replace('.', ' ').replace('_', ' '),
      detail,
    });

  function parsed<Op extends BaselineOp>(op: Op, input: Record<string, unknown>): BaselineInput<Op> {
    const result = parseBaselineInput(op, input);
    if (!result.ok) throw new Error(`action ${op}: validate passed but parse failed`);
    return result.value;
  }

  const base = (op: BaselineOp, concurrency: 'none' | 'version', approve = false) => ({
    id: `logDataset.${op}`,
    menuId: LOG_DATASETS_MENU_ID,
    inputKeys: BASELINE_INPUT_KEYS[op],
    permission: approve ? BASELINE_APPROVE_MENU_PERMISSION : DATASET_MANAGE_MENU_PERMISSION,
    requiresScope: false,
    concurrency,
    invalidates: INVALIDATES,
  });

  /**
   * Locks, in the one order, the dataset the actor may see and then the baseline. `null` = the baseline is missing, in another workspace,
   * or belongs to a dataset the actor cannot see (the same absence).
   */
  async function lockBaselineOf(tx: Tx, actor: PlatformActor, baselineId: string) {
    const owner = await findBaselineOwner(tx, actor.workspace_id, baselineId);
    if (!owner) return null;
    const dataset = await lockDataset(tx, actor.workspace_id, actor.actor_id, owner.datasetId);
    if (!dataset) return null;
    const baseline = await lockBaseline(tx, actor.workspace_id, baselineId);
    return baseline ? { dataset, baseline, revisionId: owner.revisionId } : null;
  }

  const currentVersion = async (tx: Tx, actor: PlatformActor, input: Record<string, unknown>) => {
    const found = await lockBaselineOf(tx, actor, input.id as string);
    return found ? String(found.baseline.rowVersion) : null;
  };

  const done = (version: number, extra: Record<string, unknown> = {}): ActionHandlerResult => ({
    data: { version: String(version), ...extra },
    version: String(version),
  });

  // ---- baselineDraftCreate ------------------------------------------------------------------------------------
  const baselineDraftCreate: MenuActionDeclaration = {
    spec: base('baselineDraftCreate', 'none'),
    authorize: (actor, tx) => allowed(actor, tx, DATASET_MANAGE_PERMISSION),
    validate: (input) => validateBaselineInput('baselineDraftCreate', input),
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = parsed('baselineDraftCreate', input);
      // Lock order: the revision is a plain read (it is immutable), then the dataset row under which `seq` is allocated.
      const revision = await findRevision(tx, ws, value.datasetRevisionId.toLowerCase());
      const dataset = revision ? await lockDataset(tx, ws, actor.actor_id, revision.datasetId) : null;
      if (!revision || !dataset) throw invalid({ path: ['datasetRevisionId'], code: 'not_found' });
      if (dataset.status === 'archived') throw invalid({ path: ['datasetRevisionId'], code: 'illegal_transition' });
      const row = await insertDraft(tx, { workspaceId: ws, actorId: actor.actor_id, revisionId: revision.id });
      await appendEvent(tx, { workspaceId: ws, baselineId: row.id, kind: 'created', before: null, after: snapshotOf(row), actorId: actor.actor_id });
      await record(tx, actor, 'dataset.baseline_created', row.id, {
        datasetId: dataset.id,
        revisionId: revision.id,
        seq: row.seq,
        expectationCount: 0,
        copied: false,
      });
      return { data: { baselineId: row.id, seq: row.seq, version: String(row.rowVersion) }, version: null };
    },
  };

  // ---- baselineUpdateDraft ------------------------------------------------------------------------------------
  const baselineUpdateDraft: MenuActionDeclaration = {
    spec: base('baselineUpdateDraft', 'version'),
    authorize: (actor, tx) => allowed(actor, tx, DATASET_MANAGE_PERMISSION),
    validate: (input) => validateBaselineInput('baselineUpdateDraft', input),
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = parsed('baselineUpdateDraft', input);
      const found = await lockBaselineOf(tx, actor, value.id.toLowerCase());
      if (!found) throw new Error('action baselineUpdateDraft: currentVersion judged not_found first');
      const { dataset, baseline, revisionId } = found;
      if (dataset.status === 'archived' || !isEditable(baseline.status as BaselineStatus)) throw invalid({ path: ['id'], code: 'illegal_transition' });

      const patch: DraftPatch = {};
      const changed: string[] = [];
      const pinnedSoftware = value.profilePin?.specPin;
      if (pinnedSoftware?.softwareId && !(await deps.knowledgeLookup.getSoftware(tx, ws, pinnedSoftware.modelId, pinnedSoftware.softwareId))) {
        // A software that is not of the pinned model in this workspace names no spec: refused here, `unknown` at read time if it vanishes later.
        throw invalid({ path: ['profilePin', 'specPin', 'softwareId'], code: 'not_found' });
      }
      if (value.profilePin !== undefined && !isDeepStrictEqual(value.profilePin, baseline.profilePin)) {
        patch.profilePin = value.profilePin;
        changed.push('profilePin');
      }
      if (value.expectedScope !== undefined && !isDeepStrictEqual(value.expectedScope, baseline.expectedScope)) {
        patch.expectedScope = value.expectedScope;
        changed.push('expectedScope');
      }
      if (value.expectations !== undefined) {
        // An evidence location must point into THIS revision's files: a reference to another file cannot be right.
        const revision = await findRevision(tx, ws, revisionId);
        const fileRefs = new Set(((revision?.sampleSet ?? { files: [] }) as SampleSet).files.map((f) => f.fileRef));
        const errors: FieldError[] = [];
        value.expectations.forEach((e, i) =>
          e.evidence?.forEach((ev, j) => {
            if (!fileRefs.has(ev.fileRef)) errors.push({ path: ['expectations', String(i), 'evidence', String(j), 'fileRef'], code: 'not_found' });
          }),
        );
        if (errors.length > 0) throw invalid(...errors);
        if (!isDeepStrictEqual(value.expectations, baseline.expectations)) {
          patch.expectations = value.expectations;
          changed.push('expectations');
        }
      }
      if (value.parserGoldenRef !== undefined && !isDeepStrictEqual(value.parserGoldenRef, baseline.parserGoldenRef)) {
        patch.parserGoldenRef = value.parserGoldenRef;
        changed.push('parserGoldenRef');
      }
      // A save that changes nothing answers `ok` with the current version and writes no event or audit row.
      if (changed.length === 0) return done(baseline.rowVersion);
      const version = await patchDraft(tx, ws, baseline.id, patch);
      const after = { ...baseline, ...patch, status: baseline.status } as BaselineRow;
      await appendEvent(tx, {
        workspaceId: ws,
        baselineId: baseline.id,
        kind: 'updated',
        before: snapshotOf(baseline),
        after: { ...snapshotOf(after), changed },
        actorId: actor.actor_id,
      });
      await record(tx, actor, 'dataset.baseline_updated', baseline.id, { changed, expectationCount: snapshotOf(after).expectationCount });
      return done(version);
    },
  };

  // ---- baselineApprove ----------------------------------------------------------------------------------------
  const baselineApprove: MenuActionDeclaration = {
    spec: base('baselineApprove', 'version', true),
    authorize: (actor, tx) => allowed(actor, tx, BASELINE_APPROVE_PERMISSION),
    validate: (input) => validateBaselineInput('baselineApprove', input),
    currentVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = parsed('baselineApprove', input);
      const found = await lockBaselineOf(tx, actor, value.id.toLowerCase());
      if (!found) throw new Error('action baselineApprove: currentVersion judged not_found first');
      const { dataset, baseline, revisionId } = found;
      // An archived dataset is frozen; only a draft can be approved (an approved one is already, a superseded one is final).
      if (dataset.status === 'archived' || !canTransition(baseline.status as BaselineStatus, 'approved')) throw invalid({ path: ['id'], code: 'illegal_transition' });
      // An empty baseline expects nothing: approving it would pass every run as unchanged.
      if (!Array.isArray(baseline.expectations) || baseline.expectations.length === 0) throw invalid({ path: ['id'], code: 'empty' });

      // Supersede the previous approved baseline first (the unique index allows one approved per revision), then approve: one transaction,
      // under the dataset lock every approver of this dataset takes, so two approvals of the revision are strictly ordered.
      const previous = await lockApprovedOf(tx, ws, revisionId);
      if (previous) {
        await markSuperseded(tx, ws, previous.id);
        await appendEvent(tx, {
          workspaceId: ws,
          baselineId: previous.id,
          kind: 'superseded',
          before: snapshotOf(previous),
          after: { ...snapshotOf({ ...previous, status: 'superseded' }), bySeq: baseline.seq },
          actorId: actor.actor_id,
        });
        await record(tx, actor, 'dataset.baseline_superseded', previous.id, {
          datasetId: dataset.id,
          revisionId,
          seq: previous.seq,
          bySeq: baseline.seq,
          from: 'approved',
        });
      }
      const version = await markApproved(tx, ws, baseline.id, actor.actor_id);
      const selfApproved = baseline.authorActorId === actor.actor_id;
      await appendEvent(tx, {
        workspaceId: ws,
        baselineId: baseline.id,
        kind: 'approved',
        before: snapshotOf(baseline),
        after: { ...snapshotOf({ ...baseline, status: 'approved' }), supersededSeq: previous?.seq ?? null },
        reason: value.reason,
        actorId: actor.actor_id,
        selfApproved,
      });
      await record(tx, actor, 'dataset.baseline_approved', baseline.id, {
        datasetId: dataset.id,
        revisionId,
        seq: baseline.seq,
        expectationCount: snapshotOf(baseline).expectationCount,
        supersededSeq: previous?.seq ?? null,
        reasonLength: [...value.reason].length,
        selfApproved,
      });
      return done(version, { supersededBaselineId: previous?.id ?? null, selfApproved });
    },
  };

  return [baselineDraftCreate, baselineUpdateDraft, baselineApprove];
}
