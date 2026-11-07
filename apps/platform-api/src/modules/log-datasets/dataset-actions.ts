// The log test dataset write actions (#1477 D-a, design log-test-datasets §6): dataset create / update / archive, revision create,
// candidate create / decide. Right: `dataset.manage` (workspace-scoped; Admin passes through the module bypass, a User role is refused by the
// supported-scope policy). Rules: the workspace is the actor's; a `private` dataset is its owner's alone (another actor gets `not_found`,
// like another workspace); every write is one transaction holding the row change and its audit row, and every change to a dataset or
// candidate bumps `row_version`. A revision is immutable and never edited: a different file list is a new revision. A save that changes
// nothing answers `ok` with the current version and writes no audit row. Every status-dependent refusal is a `MenuActionInvalidError`.
// Not here: baselines, suites, runs, comparison, review labels (nodes b-d). A candidate holds data references only: no field takes code.

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
import type { LogDatasetsDeps } from './deps.js';
import { summarizeAvailability } from './domain/availability.js';
import {
  DATASET_INPUT_KEYS,
  type DatasetInput,
  parseDatasetInput,
  validateDatasetInput,
} from './domain/dataset-input.js';
import { parseSampleSet, sampleManifestDigest } from './domain/sample-manifest.js';
import { LOG_DATASETS_MENU_ID } from './menu.js';
import {
  type DatasetPatch,
  REVISION_DIGEST_CONSTRAINT,
  countRevisions,
  decideCandidate,
  insertCandidate,
  insertDataset,
  insertRevision,
  lockCandidate,
  lockDataset,
  mapUnique,
  patchDataset,
} from './repositories/dataset-write.js';
import { checkSampleSetFilesFor } from './source-check.js';

export const DATASET_MANAGE_PERMISSION = 'dataset.manage';
/** The menu permission the actions declare: bootstrap lists it exactly for the users `DATASET_MANAGE_PERMISSION` lets write (`platform-port/permissions.ts`). */
export const DATASET_MANAGE_MENU_PERMISSION = 'dataset:manage';

const INVALIDATES = ['logDataset.datasets', 'logDataset.datasetDetail'] as const;

type DatasetActionOp = 'datasetCreate' | 'datasetUpdate' | 'datasetArchive' | 'revisionCreate' | 'candidateCreate' | 'candidateDecide';

const invalid = (...errors: FieldError[]) => new MenuActionInvalidError(errors);
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

export function datasetActions(deps: LogDatasetsDeps): MenuActionDeclaration[] {
  const audit = createAuditService();

  const authorize = async (actor: PlatformActor, tx: Tx) =>
    applyAdminModuleBypass(
      actor.role_level,
      DATASET_MANAGE_PERMISSION,
      await deps.checkService.checkCapability(actor, DATASET_MANAGE_PERMISSION, { workspace_id: actor.workspace_id }, { tx }),
    ).allow;

  const record = (
    tx: Tx,
    actor: PlatformActor,
    eventType: AuditEventType,
    subjectType: 'dataset' | 'dataset_revision' | 'dataset_candidate',
    subjectId: string,
    detail: Record<string, unknown>,
  ) =>
    audit.record(tx, {
      workspace_id: actor.workspace_id,
      actor_id: actor.actor_id,
      event_type: eventType,
      subject_type: subjectType,
      subject_id: subjectId,
      summary: eventType.replace('.', ' ').replace('_', ' '),
      detail,
    });

  /** The parsed, normalised input; `validate` ran before the handler, so a failure here is a bug. */
  function parsed<Op extends 'datasetCreate' | 'datasetUpdate' | 'datasetArchive' | 'candidateDecide'>(op: Op, input: Record<string, unknown>): DatasetInput<Op> {
    const result = parseDatasetInput(op, input);
    if (!result.ok) throw new Error(`action ${op}: validate passed but parse failed`);
    return result.value;
  }

  const base = (op: DatasetActionOp, concurrency: 'none' | 'version') => ({
    id: `logDataset.${op}`,
    menuId: LOG_DATASETS_MENU_ID,
    inputKeys: DATASET_INPUT_KEYS[op],
    permission: DATASET_MANAGE_MENU_PERMISSION,
    requiresScope: false,
    concurrency,
    invalidates: INVALIDATES,
  });

  const done = (version: number): ActionHandlerResult => ({ data: { version: String(version) }, version: String(version) });

  /** Locks the dataset the actor may see; its row version is the concurrency token. `null` = missing, another workspace's or another owner's private one. */
  const datasetVersion = async (tx: Tx, actor: PlatformActor, input: Record<string, unknown>) => {
    const row = await lockDataset(tx, actor.workspace_id, actor.actor_id, input.id as string);
    return row ? String(row.rowVersion) : null;
  };

  // ---- datasetCreate ------------------------------------------------------------------------------------------
  const datasetCreate: MenuActionDeclaration = {
    spec: base('datasetCreate', 'none'),
    authorize,
    validate: (input) => validateDatasetInput('datasetCreate', input),
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const value = parsed('datasetCreate', input);
      const row = await insertDataset(tx, {
        workspaceId: actor.workspace_id,
        actorId: actor.actor_id,
        ownerActorId: actor.actor_id,
        name: value.name,
        purpose: value.purpose ?? '',
        shareScope: value.shareScope ?? 'private',
        modelIds: value.modelIds ?? [],
        scenarioTags: value.scenarioTags ?? [],
        synthetic: value.synthetic ?? false,
      });
      await record(tx, actor, 'dataset.created', 'dataset', row.id, {
        shareScope: row.shareScope,
        scenarioTags: row.scenarioTags,
        modelCount: row.modelIds.length,
        synthetic: row.synthetic,
      });
      return { data: { datasetId: row.id, version: String(row.rowVersion) }, version: null };
    },
  };

  // ---- datasetUpdate ------------------------------------------------------------------------------------------
  const datasetUpdate: MenuActionDeclaration = {
    spec: base('datasetUpdate', 'version'),
    authorize,
    validate: (input) => validateDatasetInput('datasetUpdate', input),
    currentVersion: datasetVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const value = parsed('datasetUpdate', input);
      const row = await lockDataset(tx, actor.workspace_id, actor.actor_id, value.id);
      if (!row) throw new Error('action datasetUpdate: currentVersion judged not_found first');
      if (row.status === 'archived') throw invalid({ path: ['id'], code: 'illegal_transition' });
      const patch: DatasetPatch = {};
      const changed: string[] = [];
      if (value.name !== undefined && value.name !== row.name) {
        patch.name = value.name;
        changed.push('name');
      }
      if (value.purpose !== undefined && value.purpose !== row.purpose) {
        patch.purpose = value.purpose;
        changed.push('purpose');
      }
      if (value.shareScope !== undefined && value.shareScope !== row.shareScope) {
        // Hiding or sharing a dataset is the owner's call: another editor could lock themselves out of it.
        if (row.ownerActorId !== actor.actor_id) throw invalid({ path: ['shareScope'], code: 'owner_only' });
        patch.shareScope = value.shareScope;
        changed.push('shareScope');
      }
      if (value.modelIds !== undefined && !sameSet(value.modelIds, row.modelIds)) {
        patch.modelIds = value.modelIds;
        changed.push('modelIds');
      }
      if (value.scenarioTags !== undefined && !sameSet(value.scenarioTags, row.scenarioTags)) {
        patch.scenarioTags = value.scenarioTags;
        changed.push('scenarioTags');
      }
      if (changed.length === 0) return done(row.rowVersion);
      const version = await patchDataset(tx, actor.workspace_id, row.id, actor.actor_id, patch);
      await record(tx, actor, 'dataset.updated', 'dataset', row.id, { changed });
      return done(version);
    },
  };

  // ---- datasetArchive -----------------------------------------------------------------------------------------
  const datasetArchive: MenuActionDeclaration = {
    spec: base('datasetArchive', 'version'),
    authorize,
    validate: (input) => validateDatasetInput('datasetArchive', input),
    currentVersion: datasetVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const value = parsed('datasetArchive', input);
      const row = await lockDataset(tx, actor.workspace_id, actor.actor_id, value.id);
      if (!row) throw new Error('action datasetArchive: currentVersion judged not_found first');
      // Archived is final: the same answer whatever version the caller holds.
      if (row.status === 'archived') throw invalid({ path: ['id'], code: 'illegal_transition' });
      const version = await patchDataset(tx, actor.workspace_id, row.id, actor.actor_id, { status: 'archived' });
      await record(tx, actor, 'dataset.archived', 'dataset', row.id, {
        revisionCount: await countRevisions(tx, actor.workspace_id, row.id),
      });
      return done(version);
    },
  };

  // ---- revisionCreate -----------------------------------------------------------------------------------------
  const revisionCreate: MenuActionDeclaration = {
    spec: base('revisionCreate', 'none'),
    authorize,
    validate: (input) => validateDatasetInput('revisionCreate', input),
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const result = parseDatasetInput('revisionCreate', input);
      if (!result.ok) throw new Error('action revisionCreate: validate passed but parse failed');
      const value = result.value;
      // The Source is asked BEFORE the dataset row is locked, so a slow adapter never holds the lock. No port = no check = `unverified`;
      // a check that could not settle never blocks the revision (it is created, and shown unconfirmed).
      const states = await checkSampleSetFilesFor(deps.sourceRead, deps.sourceOwnerAccess, actor, value.sampleSet);
      const summary = summarizeAvailability(states, value.sampleSet.files.length);
      const dataset = await lockDataset(tx, ws, actor.actor_id, value.datasetId);
      if (!dataset) throw invalid({ path: ['datasetId'], code: 'not_found' });
      if (dataset.status === 'archived') throw invalid({ path: ['datasetId'], code: 'illegal_transition' });
      const digest = sampleManifestDigest(value.sampleSet);
      const revision = await mapUnique(
        () =>
          insertRevision(tx, {
            workspaceId: ws,
            actorId: actor.actor_id,
            datasetId: dataset.id,
            sampleSet: value.sampleSet,
            sampleManifestDigest: digest,
            inputMeta: value.inputMeta ?? {},
            note: value.note ?? null,
          }),
        REVISION_DIGEST_CONSTRAINT,
        () => invalid({ path: ['sampleSet'], code: 'duplicate' }),
      );
      await record(tx, actor, 'dataset.revision_created', 'dataset_revision', revision.id, {
        datasetId: dataset.id,
        seq: revision.seq,
        fileCount: summary.fileCount,
        digest,
        availability: summary.availability,
      });
      return {
        data: {
          revisionId: revision.id,
          seq: revision.seq,
          digest,
          availability: summary.availability,
          availabilityChecked: states !== null,
          fileCount: summary.fileCount,
          counts: summary.counts,
        },
        version: null,
      };
    },
  };

  // ---- candidateCreate ----------------------------------------------------------------------------------------
  const candidateCreate: MenuActionDeclaration = {
    spec: base('candidateCreate', 'none'),
    authorize,
    validate: (input) => validateDatasetInput('candidateCreate', input),
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const result = parseDatasetInput('candidateCreate', input);
      if (!result.ok) throw new Error('action candidateCreate: validate passed but parse failed');
      const value = result.value;
      // The proposer is the session's human actor; there is no field through which a model's proposal could name another proposer.
      const candidate = await insertCandidate(tx, {
        workspaceId: actor.workspace_id,
        actorId: actor.actor_id,
        origin: value.origin,
        sourceRef: { ...(value.roundId === undefined ? {} : { roundId: value.roundId }), evidenceRefs: value.evidenceRefs },
        proposal: {
          name: value.name,
          purpose: value.purpose ?? '',
          modelIds: value.modelIds ?? [],
          scenarioTags: value.scenarioTags ?? [],
          sampleSet: value.sampleSet,
          inputMeta: value.inputMeta ?? {},
          note: value.note ?? null,
        },
      });
      await record(tx, actor, 'dataset.candidate_created', 'dataset_candidate', candidate.id, {
        origin: value.origin,
        fileCount: value.sampleSet.files.length,
        evidenceCount: value.evidenceRefs.length,
      });
      return { data: { candidateId: candidate.id, version: String(candidate.rowVersion) }, version: null };
    },
  };

  // ---- candidateDecide ----------------------------------------------------------------------------------------
  const candidateDecide: MenuActionDeclaration = {
    spec: base('candidateDecide', 'version'),
    authorize,
    validate: (input) => validateDatasetInput('candidateDecide', input),
    async currentVersion(tx, actor, input) {
      const row = await lockCandidate(tx, actor.workspace_id, input.id as string);
      return row ? String(row.rowVersion) : null;
    },
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = parsed('candidateDecide', input);
      const candidate = await lockCandidate(tx, ws, value.id);
      if (!candidate) throw new Error('action candidateDecide: currentVersion judged not_found first');
      // A decision is final: the same answer whatever version the caller holds.
      if (candidate.status !== 'draft') throw invalid({ path: ['id'], code: 'illegal_transition' });

      if (value.decision === 'reject') {
        if (value.reason === undefined || value.reason === null) throw invalid({ path: ['reason'], code: 'required' });
        const version = await decideCandidate(tx, ws, candidate.id, {
          status: 'rejected',
          reviewerActorId: actor.actor_id,
          reason: value.reason,
          datasetId: null,
        });
        await record(tx, actor, 'dataset.candidate_rejected', 'dataset_candidate', candidate.id, { reasonLength: [...value.reason].length });
        return done(version);
      }

      // Approve: the dataset, its first revision and the decision are ONE transaction; any failure below rolls all three back.
      const proposal = candidate.proposal as {
        name: string;
        purpose: string;
        modelIds: string[];
        scenarioTags: string[];
        sampleSet: unknown;
        inputMeta: Record<string, unknown>;
        note: string | null;
      };
      const set = parseSampleSet(proposal.sampleSet);
      if (!set.ok) throw new Error('action candidateDecide: stored proposal sample set no longer parses');
      const dataset = await insertDataset(tx, {
        workspaceId: ws,
        actorId: actor.actor_id,
        // The proposer owns what they proposed; a candidate has no share scope, so the dataset is shared with the workspace
        // (a private dataset the approving reviewer could not see would hide the result of their own decision).
        ownerActorId: candidate.proposedBy,
        name: proposal.name,
        purpose: proposal.purpose,
        shareScope: 'workspace',
        modelIds: proposal.modelIds,
        scenarioTags: proposal.scenarioTags,
        synthetic: false,
      });
      const digest = sampleManifestDigest(set.value);
      const revision = await insertRevision(tx, {
        workspaceId: ws,
        actorId: actor.actor_id,
        datasetId: dataset.id,
        sampleSet: set.value,
        sampleManifestDigest: digest,
        inputMeta: proposal.inputMeta,
        note: proposal.note,
      });
      const version = await decideCandidate(tx, ws, candidate.id, {
        status: 'approved',
        reviewerActorId: actor.actor_id,
        reason: value.reason ?? null,
        datasetId: dataset.id,
      });
      await record(tx, actor, 'dataset.created', 'dataset', dataset.id, {
        shareScope: dataset.shareScope,
        scenarioTags: dataset.scenarioTags,
        modelCount: dataset.modelIds.length,
        synthetic: dataset.synthetic,
      });
      await record(tx, actor, 'dataset.revision_created', 'dataset_revision', revision.id, {
        datasetId: dataset.id,
        seq: revision.seq,
        fileCount: set.value.files.length,
        digest,
        availability: 'unverified',
      });
      await record(tx, actor, 'dataset.candidate_approved', 'dataset_candidate', candidate.id, {
        datasetId: dataset.id,
        revisionId: revision.id,
        fileCount: set.value.files.length,
      });
      return { data: { datasetId: dataset.id, revisionId: revision.id, version: String(version) }, version: String(version) };
    },
  };

  return [datasetCreate, datasetUpdate, datasetArchive, revisionCreate, candidateCreate, candidateDecide];
}
