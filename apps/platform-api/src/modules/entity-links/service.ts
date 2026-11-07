import type {
  DetachedEntityLinkResponse,
  EntityLinkDto,
  EntityLinkEntityType,
  EntityLinkPair,
  EntityLinkRef,
  EntityLinkRelationType,
  EntityLinkStatusCounts,
  EntityLinkTargetSummary,
  EntityLinkVisibilityState,
  TaskReporterSummary,
  VocDetailEnvelope,
} from '@ap/feature-shared';
import {
  isNoManagedSystemEntityLinkPair,
  isRegisteredEntityLinkPair,
  registeredEntityLinkPairs,
} from '@ap/feature-shared';
import { lockRecoveryCommand } from '../../db/recovery-command-lock.js';
import type { RecoveryRecorder, RecoverySubject } from '../dashboard/recorder.js';
import { actorFindingReadScope, isFindingInReadScope } from '../findings/authorization.js';
import type { FindingExecutionReconciler } from '../findings/execution-projection.js';
import { readVocClusterMemberships } from '../voc-clusters/read-projections.js';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import { normalizePgTimestampToIso } from '../../lib/pg-timestamp.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { CheckService } from '../permissions/check-service.js';
import { decodeEntityLinksInventoryCursor, encodeEntityLinksInventoryCursor } from './cursor.js';
import { type LinkVisibilityDecision, evaluateLinkVisibility } from './evaluate-visibility.js';
import type {
  EntityLinkProvider,
  EntityLinkProviderRegistry,
  EntityLinksActor,
  ReporterSummaryResult,
} from './provider-types.js';
import { requireEndpointManagedSystemId } from './provider-types.js';
import {
  type EntityLinkRow,
  type LinkEndpointRow,
  detachEntityLink,
  insertActiveEntityLink,
  selectActiveLinksForEndpoint,
  selectActiveLinksForEndpointPage,
  selectEntityLinkById,
  selectLinkScanBatch,
  selectLinksByWorkspace,
  selectVocFollowUpRoots,
} from './repo.js';

export type { EntityLinksActor, ReporterSummaryResult } from './provider-types.js';

export interface EntityLinksServiceDeps {
  reconcileFindingExecution?: FindingExecutionReconciler;
  recoveryRecorder?: RecoveryRecorder;
  db: Db;
  checkService: CheckService;
  auditService: AuditService;
  providers: EntityLinkProviderRegistry;
}

interface EndpointSummaries {
  sourceSummary?: EntityLinkTargetSummary;
  targetSummary?: EntityLinkTargetSummary;
}

// Generic surfaces never carry a no-Managed-System tuple (ADR-0123: command-only); a NULL here is a bug, so fail closed.
function dtoManagedSystemId(row: EntityLinkRow): string {
  if (row.managed_system_id === null) throw new Error('generic entity link surface reached a no-managed-system link');
  return row.managed_system_id;
}

function toAllowedDto(
  row: EntityLinkRow,
  { sourceSummary, targetSummary }: EndpointSummaries = {},
): EntityLinkDto {
  return {
    id: row.id,
    source_type: row.source_type,
    source_id: row.source_id,
    ...(sourceSummary !== undefined ? { source_summary: sourceSummary } : {}),
    target_type: row.target_type,
    target_id: row.target_id,
    ...(targetSummary !== undefined ? { target_summary: targetSummary } : {}),
    relation_type: row.relation_type,
    visibility: row.visibility,
    status: row.status,
    managed_system_id: dtoManagedSystemId(row),
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at ? row.updated_at.toISOString() : null,
    visibility_state: 'allowed',
  };
}

function toAuditMetadataDto(
  row: EntityLinkRow,
  visibilityState: Extract<EntityLinkVisibilityState, 'hidden' | 'denied'>,
): EntityLinkDto {
  return {
    id: row.id,
    source_type: row.source_type,
    target_type: row.target_type,
    relation_type: row.relation_type,
    status: row.status,
    managed_system_id: dtoManagedSystemId(row),
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at ? row.updated_at.toISOString() : null,
    visibility_state: visibilityState,
  };
}

function toSummaryVisibleDto(row: EntityLinkRow, summary: TaskReporterSummary): EntityLinkDto {
  return {
    id: row.id,
    source_type: row.source_type,
    target_type: row.target_type,
    relation_type: row.relation_type,
    status: row.status,
    managed_system_id: dtoManagedSystemId(row),
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at ? row.updated_at.toISOString() : null,
    visibility_state: 'summary_visible',
    summary,
  };
}

/** Stored rows per keyset batch of the `q` search scan (#1374). */
const INVENTORY_SCAN_BATCH = 500;

/** The row's identity text: display id by prefix, title by substring, like the sibling list searches. */
function endpointSummaryMatches(
  summary: EntityLinkTargetSummary | undefined,
  needle: string,
): boolean {
  if (summary === undefined) return false;
  if (summary.display_id.toLocaleLowerCase().startsWith(needle)) return true;
  return 'title' in summary && summary.title.toLocaleLowerCase().includes(needle);
}

function toDtoForDecision(
  row: EntityLinkRow,
  decision: LinkVisibilityDecision,
  summary?: TaskReporterSummary,
  endpointSummaries?: EndpointSummaries,
): EntityLinkDto {
  if (decision === 'allowed') return toAllowedDto(row, endpointSummaries);
  if (decision === 'hidden' || decision === 'denied') return toAuditMetadataDto(row, decision);
  if (summary !== undefined) return toSummaryVisibleDto(row, summary);
  throw new HttpError(
    'internal.unexpected',
    'summary-visible entity link decision missing summary resolver',
  );
}

function toDetachedResponse(row: EntityLinkRow): DetachedEntityLinkResponse {
  if (row.status !== 'detached' || row.detached_at === null) {
    throw new HttpError('internal.unexpected', 'detached entity link row missing detach fields');
  }
  return {
    id: row.id,
    status: 'detached',
    detached_at: row.detached_at.toISOString(),
  };
}

/**
 * Create-time Managed System compatibility gate (#388). Both endpoints of an
 * entity link must resolve to the same Managed System; a mismatch is rejected
 * after endpoint authorization and before insert. This is the single
 * authoritative seam — the polymorphic entity_links table cannot express it
 * as a CHECK/FK.
 */
export function assertLinkManagedSystemCompatibility(
  sourceManagedSystemId: string | null,
  targetManagedSystemId: string | null,
  field: { path: (string | number)[] } = { path: ['target', 'id'] },
): void {
  // ADR-0123: a Managed System end paired with a no-Managed-System end (or two NULLs on a generic tuple) never matches.
  if (
    sourceManagedSystemId === null ||
    targetManagedSystemId === null ||
    sourceManagedSystemId !== targetManagedSystemId
  ) {
    throw new HttpError(
      'validation.failed',
      'entity link source and target must belong to the same managed system',
      { fields: [{ path: field.path, code: 'managed_system_mismatch' }] },
    );
  }
}

// Recovery projections know the Managed-System entity types only; the no-Managed-System ends (ADR-0123) are written by
// `createNoManagedSystemLink` and never reach the generic create/detach paths that call this.
function recoverySubjectOf(ref: EntityLinkRef): RecoverySubject {
  if (ref.type === 'validation_round' || ref.type === 'manual_validation_attachment') {
    throw new Error('no-managed-system entity link end reached a recovery subject');
  }
  return { type: ref.type, id: ref.id };
}

function providerFor(
  providers: EntityLinkProviderRegistry,
  type: EntityLinkEntityType,
): EntityLinkProvider {
  return providers[type];
}

// The registry is the DB/audit allowlist. Some registered tuples are written only by
// domain commands, whose compound authorization and audit obligations cannot be
// represented by the generic endpoints.
const genericEntityLinkPairs = registeredEntityLinkPairs.filter(
  (pair) =>
    !(
      pair.source_type === 'voc_cluster' &&
      pair.target_type === 'finding' &&
      pair.relation_type === 'evidence_of'
    ) &&
    // Survey-response tuples are command-only until C4 owns their compound
    // authorization, audit, and privacy obligations.
    pair.source_type !== 'survey_response' &&
    // ADR-0123: no-Managed-System tuples are written only by the owning module's command.
    !isNoManagedSystemEntityLinkPair(pair),
);
// #760: /vocs/:id/request-task and /voc-clusters/:id/request-task own these writes.
const creatableEntityLinkPairs = genericEntityLinkPairs.filter(
  (pair) =>
    !(
      (pair.source_type === 'voc' || pair.source_type === 'voc_cluster') &&
      pair.target_type === 'task_request' &&
      pair.relation_type === 'requested_task'
    ),
);
const listVisibleEntityLinkPairs = genericEntityLinkPairs;

function tupleListIncludes(
  pairs: readonly EntityLinkPair[],
  input: {
    sourceType: EntityLinkEntityType;
    targetType: EntityLinkEntityType;
    relationType: EntityLinkRelationType;
  },
): boolean {
  return pairs.some(
    (pair) =>
      pair.source_type === input.sourceType &&
      pair.target_type === input.targetType &&
      pair.relation_type === input.relationType,
  );
}

function isCreatableTuple(input: {
  sourceType: EntityLinkEntityType;
  targetType: EntityLinkEntityType;
  relationType: EntityLinkRelationType;
}): boolean {
  return (
    isRegisteredEntityLinkPair({
      source_type: input.sourceType,
      target_type: input.targetType,
      relation_type: input.relationType,
    }) && tupleListIncludes(creatableEntityLinkPairs, input)
  );
}

function isListVisibleTuple(input: {
  sourceType: EntityLinkEntityType;
  targetType: EntityLinkEntityType;
  relationType: EntityLinkRelationType;
}): boolean {
  return (
    isRegisteredEntityLinkPair({
      source_type: input.sourceType,
      target_type: input.targetType,
      relation_type: input.relationType,
    }) && tupleListIncludes(listVisibleEntityLinkPairs, input)
  );
}

async function resolveEndpointForRow(
  deps: Pick<EntityLinksServiceDeps, 'db' | 'providers'>,
  actor: EntityLinksActor,
  endpoint: EntityLinkRef,
  resolvedByEndpoint: Map<string, LinkEndpointRow | null>,
): Promise<LinkEndpointRow | null> {
  const key = `${endpoint.type}:${endpoint.id}`;
  if (resolvedByEndpoint.has(key)) return resolvedByEndpoint.get(key) ?? null;
  const provider = providerFor(deps.providers, endpoint.type);
  const row = await provider.getPermissionSubject(deps.db, actor.workspace_id, endpoint.id);
  resolvedByEndpoint.set(key, row);
  return row;
}

async function evaluateRowVisibility(
  deps: Pick<EntityLinksServiceDeps, 'db' | 'checkService' | 'providers'>,
  actor: EntityLinksActor,
  row: EntityLinkRow,
  resolvedByEndpoint: Map<string, LinkEndpointRow | null>,
  reporterSummaries: ReadonlyMap<string, ReporterSummaryResult>,
  sourceReadabilityByEndpoint: Map<string, boolean>,
): Promise<{ decision: LinkVisibilityDecision; summary?: TaskReporterSummary }> {
  const sourceRef = { type: row.source_type, id: row.source_id };
  const targetRef = { type: row.target_type, id: row.target_id };
  const [source, target] = await Promise.all([
    resolveEndpointForRow(deps, actor, sourceRef, resolvedByEndpoint),
    resolveEndpointForRow(deps, actor, targetRef, resolvedByEndpoint),
  ]);
  const sourceProvider = providerFor(deps.providers, row.source_type);
  const targetSummary: ReporterSummaryResult = reporterSummaries.get(
    `${row.target_type}:${row.target_id}`,
  ) ?? { available: false };
  const sourceKey = `${row.source_type}:${row.source_id}`;
  const cachedSourceReadable = sourceReadabilityByEndpoint.get(sourceKey);
  const [sourceReadable, targetReadable] = await Promise.all([
    cachedSourceReadable ?? (source ? sourceProvider.canRead(deps, actor, source) : false),
    target ? providerFor(deps.providers, row.target_type).canRead(deps, actor, target) : false,
  ]);
  sourceReadabilityByEndpoint.set(sourceKey, sourceReadable);

  const decision = evaluateLinkVisibility({
    visibility: row.visibility,
    actorContext: {
      actor_id: actor.actor_id,
      role_level: actor.role_level,
    },
    sourceReadable,
    targetReadable,
    targetSummaryAvailable: targetSummary.available,
    sourceReporterId: source?.reporter_id ?? null,
    targetReporterId: target?.reporter_id ?? null,
  });
  return targetSummary.available ? { decision, summary: targetSummary.summary } : { decision };
}

async function preloadReporterSummaries(
  deps: Pick<EntityLinksServiceDeps, 'db' | 'checkService' | 'providers'>,
  actor: EntityLinksActor,
  rows: readonly EntityLinkRow[],
  resolvedByEndpoint: Map<string, LinkEndpointRow | null>,
): Promise<{
  reporterSummaries: Map<string, ReporterSummaryResult>;
  sourceReadabilityByEndpoint: Map<string, boolean>;
}> {
  const sourceReadabilityByEndpoint = new Map<string, boolean>();
  if (actor.role_level !== 'user') {
    return { reporterSummaries: new Map(), sourceReadabilityByEndpoint };
  }

  const summaryCandidateRows = rows.filter(
    (row) =>
      row.visibility === 'summary_visible' &&
      row.target_type === 'task' &&
      isListVisibleTuple({
        sourceType: row.source_type,
        targetType: row.target_type,
        relationType: row.relation_type,
      }),
  );
  const sourceRefs = new Map(
    summaryCandidateRows.map((row) => [
      `${row.source_type}:${row.source_id}`,
      { type: row.source_type, id: row.source_id } satisfies EntityLinkRef,
    ]),
  );
  const sourceReadability = await Promise.all(
    [...sourceRefs].map(async ([key, sourceRef]) => {
      const source = await resolveEndpointForRow(deps, actor, sourceRef, resolvedByEndpoint);
      const readable = source
        ? await providerFor(deps.providers, sourceRef.type).canRead(deps, actor, source)
        : false;
      return [key, readable] as const;
    }),
  );
  for (const [key, readable] of sourceReadability) sourceReadabilityByEndpoint.set(key, readable);

  const taskIds = [
    ...new Set(
      summaryCandidateRows
        .filter((row) => sourceReadabilityByEndpoint.get(`${row.source_type}:${row.source_id}`))
        .map((row) => row.target_id),
    ),
  ];
  const summaries = await deps.providers.task.getReporterSummaries?.(
    deps.db,
    actor.workspace_id,
    taskIds,
  );
  return {
    reporterSummaries: new Map(
      [...(summaries ?? new Map<string, ReporterSummaryResult>())].map(([id, summary]) => [
        `task:${id}`,
        summary,
      ]),
    ),
    sourceReadabilityByEndpoint,
  };
}

async function forEachInBatches<T>(
  items: readonly T[],
  batchSize: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  for (let index = 0; index < items.length; index += batchSize) {
    await Promise.all(items.slice(index, index + batchSize).map(task));
  }
}

function endpointKey(endpoint: EntityLinkRef): string {
  return `${endpoint.type}:${endpoint.id}`;
}

function inventoryEndpointRefs(rows: readonly EntityLinkRow[]): Map<string, EntityLinkRef> {
  const refs = new Map<string, EntityLinkRef>();
  for (const row of rows) {
    for (const endpoint of [
      { type: row.source_type, id: row.source_id },
      { type: row.target_type, id: row.target_id },
    ]) {
      refs.set(endpointKey(endpoint), endpoint);
    }
  }
  return refs;
}

async function preloadInventoryEndpointPermissions(
  deps: Pick<EntityLinksServiceDeps, 'db' | 'checkService' | 'providers'>,
  actor: EntityLinksActor,
  rows: readonly EntityLinkRow[],
): Promise<{
  resolvedByEndpoint: Map<string, LinkEndpointRow | null>;
  readableByEndpoint: Map<string, boolean>;
}> {
  const resolvedByEndpoint = new Map<string, LinkEndpointRow | null>();
  const readableByEndpoint = new Map<string, boolean>();
  const refs = [...inventoryEndpointRefs(rows)];
  await forEachInBatches(refs, 8, async ([key, endpoint]) => {
    const provider = providerFor(deps.providers, endpoint.type);
    const subject = await provider.getPermissionSubject(deps.db, actor.workspace_id, endpoint.id);
    resolvedByEndpoint.set(key, subject);
    readableByEndpoint.set(key, subject ? await provider.canRead(deps, actor, subject) : false);
  });
  return { resolvedByEndpoint, readableByEndpoint };
}

async function preloadInventoryReporterSummaries(
  deps: Pick<EntityLinksServiceDeps, 'db' | 'providers'>,
  actor: EntityLinksActor,
  rows: readonly EntityLinkRow[],
  readableByEndpoint: ReadonlyMap<string, boolean>,
): Promise<Map<string, ReporterSummaryResult>> {
  if (actor.role_level !== 'user') return new Map();

  const summaryCandidateRows = rows.filter(
    (row) =>
      row.visibility === 'summary_visible' &&
      row.target_type === 'task' &&
      isListVisibleTuple({
        sourceType: row.source_type,
        targetType: row.target_type,
        relationType: row.relation_type,
      }),
  );
  const taskIds = [
    ...new Set(
      summaryCandidateRows
        .filter((row) =>
          readableByEndpoint.get(endpointKey({ type: row.source_type, id: row.source_id })),
        )
        .map((row) => row.target_id),
    ),
  ];
  const summaries = await deps.providers.task.getReporterSummaries?.(
    deps.db,
    actor.workspace_id,
    taskIds,
  );
  return new Map(
    [...(summaries ?? new Map<string, ReporterSummaryResult>())].map(([id, summary]) => [
      `task:${id}`,
      summary,
    ]),
  );
}

function evaluateInventoryRowVisibility(
  actor: EntityLinksActor,
  row: EntityLinkRow,
  resolvedByEndpoint: ReadonlyMap<string, LinkEndpointRow | null>,
  readableByEndpoint: ReadonlyMap<string, boolean>,
  reporterSummaries: ReadonlyMap<string, ReporterSummaryResult>,
): { decision: LinkVisibilityDecision; summary?: TaskReporterSummary } {
  const sourceKey = endpointKey({ type: row.source_type, id: row.source_id });
  const targetKey = endpointKey({ type: row.target_type, id: row.target_id });
  const source = resolvedByEndpoint.get(sourceKey) ?? null;
  const target = resolvedByEndpoint.get(targetKey) ?? null;
  const targetSummary: ReporterSummaryResult = reporterSummaries.get(targetKey) ?? {
    available: false,
  };
  const decision = evaluateLinkVisibility({
    visibility: row.visibility,
    actorContext: {
      actor_id: actor.actor_id,
      role_level: actor.role_level,
    },
    sourceReadable: readableByEndpoint.get(sourceKey) === true,
    targetReadable: readableByEndpoint.get(targetKey) === true,
    targetSummaryAvailable: targetSummary.available,
    sourceReporterId: source?.reporter_id ?? null,
    targetReporterId: target?.reporter_id ?? null,
  });
  return targetSummary.available ? { decision, summary: targetSummary.summary } : { decision };
}

async function preloadInventoryInternalSummaries(
  deps: Pick<EntityLinksServiceDeps, 'db' | 'providers'>,
  actor: EntityLinksActor,
  rows: readonly EntityLinkRow[],
): Promise<Map<string, EntityLinkTargetSummary | null>> {
  const summaries = new Map<string, EntityLinkTargetSummary | null>();
  const refs = [...inventoryEndpointRefs(rows)];
  await forEachInBatches(refs, 8, async ([key, endpoint]) => {
    const summary = await providerFor(deps.providers, endpoint.type).getInternalSummary(
      deps.db,
      actor.workspace_id,
      endpoint.id,
    );
    summaries.set(key, summary);
  });
  return summaries;
}

function inventorySummariesForRow(
  row: EntityLinkRow,
  summariesByEndpoint: ReadonlyMap<string, EntityLinkTargetSummary | null>,
): EndpointSummaries {
  const sourceSummary = summariesByEndpoint.get(
    endpointKey({ type: row.source_type, id: row.source_id }),
  );
  const targetSummary = summariesByEndpoint.get(
    endpointKey({ type: row.target_type, id: row.target_id }),
  );
  return {
    ...(sourceSummary != null ? { sourceSummary } : {}),
    ...(targetSummary != null ? { targetSummary } : {}),
  };
}

async function getTargetInternalSummary(
  providers: EntityLinkProviderRegistry,
  db: Db | Tx,
  actor: EntityLinksActor,
  row: Pick<EntityLinkRow, 'target_type' | 'target_id'>,
): Promise<EntityLinkTargetSummary | undefined> {
  const summary = await providerFor(providers, row.target_type).getInternalSummary(
    db,
    actor.workspace_id,
    row.target_id,
  );
  return summary ?? undefined;
}

async function getSourceInternalSummary(
  providers: EntityLinkProviderRegistry,
  db: Db | Tx,
  actor: EntityLinksActor,
  row: Pick<EntityLinkRow, 'source_type' | 'source_id'>,
): Promise<EntityLinkTargetSummary | undefined> {
  const summary = await providerFor(providers, row.source_type).getInternalSummary(
    db,
    actor.workspace_id,
    row.source_id,
  );
  return summary ?? undefined;
}

async function getEndpointInternalSummaries(
  providers: EntityLinkProviderRegistry,
  db: Db | Tx,
  actor: EntityLinksActor,
  row: EntityLinkRow,
): Promise<EndpointSummaries> {
  const [sourceSummary, targetSummary] = await Promise.all([
    getSourceInternalSummary(providers, db, actor, row),
    getTargetInternalSummary(providers, db, actor, row),
  ]);
  return {
    ...(sourceSummary !== undefined ? { sourceSummary } : {}),
    ...(targetSummary !== undefined ? { targetSummary } : {}),
  };
}

export function createEntityLinksService(deps: EntityLinksServiceDeps) {
  function readDependencies(tx?: Tx): EntityLinksServiceDeps {
    if (!tx) return deps;
    // Providers predate Tx in their interface. Bind both their queries and the
    // permission service to the caller's transaction without changing policy.
    return {
      ...deps,
      db: tx as Db,
      checkService: {
        capabilityScope: (actor, capability, subject, options) =>
          deps.checkService.capabilityScope(actor, capability, subject, { ...options, tx }),
        checkCapability: (actor, capability, subject, options) =>
          deps.checkService.checkCapability(actor, capability, subject, { ...options, tx }),
      },
    };
  }

  async function createLink(args: {
    actor: EntityLinksActor;
    source: EntityLinkRef;
    target: EntityLinkRef;
    relation_type: EntityLinkRelationType;
    visibility?: 'internal_only' | 'summary_visible';
    /** Internal-only capability; HTTP routes never supply this. */
    internalWritePath?: 'task_request_conversion';
    tx?: Tx;
  }): Promise<{ link: EntityLinkDto; status: 200 | 201 }> {
    const { actor, source, target } = args;
    const visibility = args.visibility ?? 'internal_only';

    if (
      !isCreatableTuple({
        sourceType: source.type,
        targetType: target.type,
        relationType: args.relation_type,
      })
    ) {
      throw new HttpError('validation.failed', 'unsupported entity link tuple', {
        fields: [{ path: [], code: 'unsupported_tuple' }],
      });
    }
    const isConversionSummaryLink =
      visibility === 'summary_visible' &&
      args.internalWritePath === 'task_request_conversion' &&
      source.type === 'voc' &&
      target.type === 'task' &&
      args.relation_type === 'evidence_of';
    if (visibility !== 'internal_only' && !isConversionSummaryLink) {
      throw new HttpError('validation.failed', 'unsupported visibility', {
        fields: [{ path: ['visibility'], code: 'unsupported_visibility' }],
      });
    }
    if (source.id === target.id) {
      throw new HttpError('validation.failed', 'entity link source and target must differ', {
        fields: [{ path: ['target', 'id'], code: 'self_link' }],
      });
    }

    const db = args.tx ?? deps.db;
    const sourceProvider = providerFor(deps.providers, source.type);
    const targetProvider = providerFor(deps.providers, target.type);
    const [sourceRow, targetRow] = await Promise.all([
      sourceProvider.assertExists(db, actor.workspace_id, source.id),
      targetProvider.assertExists(db, actor.workspace_id, target.id),
    ]);
    if (!sourceRow || !targetRow) {
      throw new HttpError('not_found.record', 'entity link endpoint not found');
    }

    const sourceAllowed = await sourceProvider.canRead(deps, actor, sourceRow);
    if (!sourceAllowed) {
      throw new HttpError('permission.denied', 'missing source VOC read scope');
    }

    const targetAllowed =
      targetProvider.canCreateTarget !== undefined
        ? await targetProvider.canCreateTarget(deps, actor, targetRow)
        : await targetProvider.canRead(deps, actor, targetRow);
    if (!targetAllowed) {
      throw new HttpError('not_found.record', 'entity link endpoint not found');
    }

    assertLinkManagedSystemCompatibility(sourceRow.managed_system_id, targetRow.managed_system_id);

    const persist = async (tx: Tx) => {
      if (!args.tx) await lockRecoveryCommand(tx, actor.workspace_id);
      const recovery = args.tx
        ? undefined
        : await deps.recoveryRecorder?.capture(tx, actor.workspace_id, [recoverySubjectOf(source), recoverySubjectOf(target)]);
      const inserted = await insertActiveEntityLink(tx, {
        workspaceId: actor.workspace_id,
        sourceType: source.type,
        sourceId: source.id,
        targetType: target.type,
        targetId: target.id,
        relationType: args.relation_type,
        managedSystemId: requireEndpointManagedSystemId(sourceRow),
        createdBy: actor.actor_id,
        visibility,
        ...(args.internalWritePath !== undefined
          ? { internalWritePath: args.internalWritePath }
          : {}),
      });

      if (inserted.inserted) {
        await deps.auditService.record(tx, {
          workspace_id: actor.workspace_id,
          actor_id: actor.actor_id,
          event_type: 'entity_link.created',
          subject_type: 'entity_link',
          subject_id: inserted.row.id,
          summary: 'Entity link created',
          detail: {
            link_id: inserted.row.id,
            source,
            target,
            relation_type: args.relation_type,
            visibility,
          },
        });
      }

      if (recovery) await deps.recoveryRecorder?.finish(tx, recovery, actor.actor_id, 'createLink');
      return inserted;
    };

    const result = args.tx ? await persist(args.tx) : await deps.db.transaction(persist);

    const endpointSummaries = await getEndpointInternalSummaries(
      deps.providers,
      db,
      actor,
      result.row,
    );

    return {
      link: toAllowedDto(result.row, endpointSummaries),
      status: result.inserted ? 201 : 200,
    };
  }

  async function canReadEndpoint(args: {
    actor: EntityLinksActor;
    endpoint: EntityLinkRef;
  }): Promise<boolean> {
    const { actor, endpoint } = args;
    const provider = providerFor(deps.providers, endpoint.type);
    const focus = await provider.getPermissionSubject(deps.db, actor.workspace_id, endpoint.id);
    if (!focus) return false;
    return provider.canRead(deps, actor, focus);
  }

  async function resolveReadableEndpointSummary(args: {
    actor: EntityLinksActor;
    endpoint: EntityLinkRef;
  }): Promise<EntityLinkTargetSummary | null> {
    const { actor, endpoint } = args;
    const provider = providerFor(deps.providers, endpoint.type);
    const subject = await provider.getPermissionSubject(deps.db, actor.workspace_id, endpoint.id);
    if (!subject || !(await provider.canRead(deps, actor, subject))) return null;
    return provider.getInternalSummary(deps.db, actor.workspace_id, endpoint.id);
  }

  /** Internal callers: every visible link of the endpoint (complete set, not paged). */
  async function listLinks(args: {
    actor: EntityLinksActor;
    endpoint: EntityLinkRef;
    side?: 'source' | 'target';
    /** Default 'not_found': GET /entity-links must not leak existence. */
    onUnreadableFocus?: 'not_found' | 'empty';
    tx?: Tx;
  }): Promise<EntityLinkDto[]> {
    return (await listEndpointLinks(args)).items;
  }

  /** GET /entity-links endpoint mode: one keyset page; the cursor is opaque. */
  async function listLinksPage(args: {
    actor: EntityLinksActor;
    endpoint: EntityLinkRef;
    side?: 'source' | 'target';
    limit: number;
    cursor?: string;
  }): Promise<{ items: EntityLinkDto[]; page: { has_more: boolean; cursor?: string } }> {
    // Decode before any lookup so a malformed cursor is a validation error, not an existence probe.
    const decoded =
      args.cursor !== undefined ? decodeEntityLinksInventoryCursor(args.cursor) : undefined;
    const result = await listEndpointLinks({
      actor: args.actor,
      endpoint: args.endpoint,
      ...(args.side === undefined ? {} : { side: args.side }),
      page: { limit: args.limit, ...(decoded === undefined ? {} : { cursor: decoded }) },
    });
    return {
      items: result.items,
      page: {
        has_more: result.hasMore,
        ...(result.nextCursor !== undefined
          ? { cursor: encodeEntityLinksInventoryCursor(result.nextCursor) }
          : {}),
      },
    };
  }

  async function listEndpointLinks(args: {
    actor: EntityLinksActor;
    endpoint: EntityLinkRef;
    side?: 'source' | 'target';
    onUnreadableFocus?: 'not_found' | 'empty';
    tx?: Tx;
    page?: { limit: number; cursor?: { createdAt: string; id: string } };
  }): Promise<{
    items: EntityLinkDto[];
    hasMore: boolean;
    nextCursor?: { createdAtRaw: string; id: string };
  }> {
    const { actor, endpoint, side } = args;
    const db = args.tx ?? deps.db;
    const readDeps = readDependencies(args.tx);
    const provider = providerFor(deps.providers, endpoint.type);
    const focus = await provider.getPermissionSubject(db, actor.workspace_id, endpoint.id);
    if (!focus) {
      throw new HttpError('not_found.record', 'entity link endpoint not found');
    }
    const focusAllowed = await provider.canRead(readDeps, actor, focus);
    if (!focusAllowed) {
      if (args.onUnreadableFocus === 'empty') {
        return { items: [], hasMore: false };
      }
      throw new HttpError('not_found.record', 'entity link endpoint not found');
    }

    const listArgs = {
      workspaceId: actor.workspace_id,
      endpointType: endpoint.type,
      endpointId: endpoint.id,
    };
    const endpointArgs = side === undefined ? listArgs : { ...listArgs, side };
    const paged =
      args.page === undefined
        ? undefined
        : await selectActiveLinksForEndpointPage(db, { ...endpointArgs, ...args.page });
    const rows = paged?.items ?? (await selectActiveLinksForEndpoint(db, endpointArgs));

    const resolvedByEndpoint = new Map<string, LinkEndpointRow | null>([
      [`${endpoint.type}:${endpoint.id}`, focus],
    ]);
    const { reporterSummaries, sourceReadabilityByEndpoint } = await preloadReporterSummaries(
      readDeps,
      actor,
      rows,
      resolvedByEndpoint,
    );
    const items: EntityLinkDto[] = [];
    for (const row of rows) {
      if (
        !isListVisibleTuple({
          sourceType: row.source_type,
          targetType: row.target_type,
          relationType: row.relation_type,
        })
      ) {
        continue;
      }
      const { decision, summary } = await evaluateRowVisibility(
        readDeps,
        actor,
        row,
        resolvedByEndpoint,
        reporterSummaries,
        sourceReadabilityByEndpoint,
      );
      const endpointSummaries =
        decision === 'allowed'
          ? await getEndpointInternalSummaries(deps.providers, db, actor, row)
          : undefined;
      items.push(toDtoForDecision(row, decision, summary, endpointSummaries));
    }
    return {
      items,
      hasMore: paged?.hasMore ?? false,
      ...(paged?.nextCursor !== undefined ? { nextCursor: paged.nextCursor } : {}),
    };
  }

  /** VOC-only projection. Generic Entity Links APIs retain their non-transitive registry. */
  async function readVocFollowUp(args: {
    actor: EntityLinksActor;
    vocId: string;
    tx?: Tx;
  }): Promise<VocDetailEnvelope['linked_execution']> {
    const { actor, vocId } = args;
    const db = args.tx ?? deps.db;
    const readDeps = readDependencies(args.tx);
    const empty = { findingRef: null, taskRef: null };
    const focus = await deps.providers.voc.getPermissionSubject(
      db as Db,
      actor.workspace_id,
      vocId,
    );
    if (!focus || !(await deps.providers.voc.canRead(readDeps, actor, focus))) return empty;
    const roots = await selectVocFollowUpRoots(db, actor.workspace_id, vocId);
    const resolved = new Map<string, LinkEndpointRow | null>([[`voc:${vocId}`, focus]]);
    const readability = new Map<string, boolean>();
    const trails: NonNullable<VocDetailEnvelope['linked_execution']['trails']> = [];
    for (const root of roots) {
      const links: EntityLinkDto[] = [];
      // Directed graph is acyclic by registered types. Expand only disclosed edges,
      // so a readable endpoint beyond a hidden intermediate cannot reveal provenance.
      const pending = [root];
      const seen = new Set<string>();
      while (pending.length > 0) {
        const row = pending.shift();
        if (!row || seen.has(row.id)) continue;
        seen.add(row.id);
        const { reporterSummaries } = await preloadReporterSummaries(
          readDeps,
          actor,
          [row],
          resolved,
        );
        const { decision, summary } = await evaluateRowVisibility(
          readDeps,
          actor,
          row,
          resolved,
          reporterSummaries,
          readability,
        );
        if (decision === 'hidden') continue;
        const summaries =
          decision === 'allowed'
            ? await getEndpointInternalSummaries(deps.providers, db, actor, row)
            : undefined;
        links.push(toDtoForDecision(row, decision, summary, summaries));
        if (
          decision !== 'allowed' ||
          (row.target_type !== 'finding' && row.target_type !== 'task_request')
        )
          continue;
        const children = await selectActiveLinksForEndpoint(db, {
          workspaceId: actor.workspace_id,
          endpointType: row.target_type,
          endpointId: row.target_id,
          side: 'source',
        });
        pending.push(
          ...children.filter(
            (child) =>
              (child.source_type === 'finding' &&
                child.relation_type === 'requested_task' &&
                (child.target_type === 'task_request' || child.target_type === 'task')) ||
              (child.source_type === 'task_request' &&
                child.relation_type === 'converted_to' &&
                child.target_type === 'task'),
          ),
        );
      }
      if (links.length === 0) continue;
      const cluster =
        root.source_type === 'voc_cluster' && links[0]?.visibility_state === 'allowed'
          ? links[0].source_summary
          : undefined;
      trails.push({
        origin: root.source_type === 'voc_cluster' ? 'cluster' : 'direct',
        ...(cluster?.type === 'voc_cluster' ? { cluster } : {}),
        links,
      });
    }
    const representedClusters = new Set(trails.map((trail) => trail.cluster?.id));
    for (const membership of await readVocClusterMemberships(db, actor.workspace_id, vocId)) {
      if (representedClusters.has(membership.id)) continue;
      const provider = deps.providers.voc_cluster;
      const subject = await provider.getPermissionSubject(
        db as Db,
        actor.workspace_id,
        membership.id,
      );
      if (
        !subject ||
        !isFindingInReadScope(
          await actorFindingReadScope(db, actor, { requireElevatedRole: true }),
          requireEndpointManagedSystemId(subject),
        )
      )
        continue;
      const cluster = await provider.getInternalSummary(
        db as Db,
        actor.workspace_id,
        membership.id,
      );
      if (cluster?.type === 'voc_cluster') trails.push({ origin: 'cluster', cluster, links: [] });
    }
    const allowed = trails
      .flatMap((trail) => trail.links)
      .filter((link) => link.visibility_state === 'allowed');
    const finding = allowed.find((link) => link.target_type === 'finding');
    const task = allowed.find((link) => link.target_type === 'task');
    return {
      findingRef: finding ? { type: 'finding', id: finding.target_id } : null,
      taskRef: task ? { type: 'task', id: task.target_id } : null,
      ...(trails.length > 0 ? { trails } : {}),
    };
  }

  async function buildInventoryItems(
    actor: EntityLinksActor,
    storedRows: readonly EntityLinkRow[],
  ): Promise<{ row: EntityLinkRow; decision: LinkVisibilityDecision; dto: EntityLinkDto }[]> {
    const rows = storedRows.filter((row) =>
      isListVisibleTuple({
        sourceType: row.source_type,
        targetType: row.target_type,
        relationType: row.relation_type,
      }),
    );
    const { resolvedByEndpoint, readableByEndpoint } = await preloadInventoryEndpointPermissions(
      deps,
      actor,
      rows,
    );
    const reporterSummaries = await preloadInventoryReporterSummaries(
      deps,
      actor,
      rows,
      readableByEndpoint,
    );
    const decisions = rows.map((row) => ({
      row,
      ...evaluateInventoryRowVisibility(
        actor,
        row,
        resolvedByEndpoint,
        readableByEndpoint,
        reporterSummaries,
      ),
    }));
    const allowedRows = decisions
      .filter((item) => item.decision === 'allowed')
      .map((item) => item.row);
    const summariesByEndpoint = await preloadInventoryInternalSummaries(deps, actor, allowedRows);
    return decisions.map(({ row, decision, summary }) => ({
      row,
      decision,
      dto: toDtoForDecision(
        row,
        decision,
        summary,
        decision === 'allowed' ? inventorySummariesForRow(row, summariesByEndpoint) : undefined,
      ),
    }));
  }

  async function listInventoryLinks(args: {
    actor: EntityLinksActor;
    limit: number;
    cursor?: string;
    statuses?: EntityLinkRow['status'][];
    relationType?: EntityLinkRelationType;
    managedSystemId?: string;
    q?: string;
  }): Promise<{
    items: EntityLinkDto[];
    page: {
      has_more: boolean;
      cursor?: string;
      status_counts?: EntityLinkStatusCounts;
    };
  }> {
    const { actor } = args;
    const decodedCursor =
      args.cursor !== undefined ? decodeEntityLinksInventoryCursor(args.cursor) : undefined;
    if (args.q !== undefined) {
      return listInventoryLinksMatching({ ...args, q: args.q }, decodedCursor);
    }
    const result = await selectLinksByWorkspace(deps.db, {
      workspaceId: actor.workspace_id,
      limit: args.limit,
      ...(decodedCursor !== undefined ? { cursor: decodedCursor } : {}),
      ...(args.statuses !== undefined ? { statuses: args.statuses } : {}),
      ...(args.relationType !== undefined ? { relationType: args.relationType } : {}),
      ...(args.managedSystemId !== undefined ? { managedSystemId: args.managedSystemId } : {}),
    });
    const items = (await buildInventoryItems(actor, result.items)).map((entry) => entry.dto);
    const cursor = result.nextCursor
      ? encodeEntityLinksInventoryCursor(result.nextCursor)
      : undefined;
    return {
      items,
      page: {
        has_more: result.hasMore,
        ...(cursor !== undefined ? { cursor } : {}),
        ...(result.statusCounts !== undefined ? { status_counts: result.statusCounts } : {}),
      },
    };
  }

  /**
   * `q` search (#1374). Endpoint titles live in the endpoint modules' tables and a SQL match would
   * also match endpoints the actor cannot read, so the match runs on the internal summaries of rows
   * that already passed the visibility decision: a hidden, denied or summary-only row never matches,
   * never counts and never moves a cursor. The stored rows are scanned in keyset batches (same
   * filters and `created_at DESC, id DESC` order as the page query) starting after the request's
   * cursor until `limit + 1` matches are found or the rows run out, so a result is complete. The
   * first page without a status also scans on to the end to count matches per status. The cost is
   * linear in the workspace's link count per request. Cursors carry the raw timestamp text.
   */
  async function listInventoryLinksMatching(
    args: {
      actor: EntityLinksActor;
      limit: number;
      statuses?: EntityLinkRow['status'][];
      relationType?: EntityLinkRelationType;
      managedSystemId?: string;
      q: string;
    },
    decodedCursor: { createdAt: string; id: string } | undefined,
  ) {
    const { actor, statuses } = args;
    const needle = args.q.toLocaleLowerCase();
    const wantCounts = decodedCursor === undefined && statuses === undefined;
    const statusCounts: EntityLinkStatusCounts = { active: 0, stale: 0, detached: 0, revoked: 0 };
    const collected: { dto: EntityLinkDto; id: string; createdAtRaw: string }[] = [];
    let cursor = decodedCursor;
    for (;;) {
      const batch = await selectLinkScanBatch(deps.db, {
        workspaceId: actor.workspace_id,
        limit: INVENTORY_SCAN_BATCH,
        ...(cursor !== undefined ? { cursor } : {}),
        ...(statuses !== undefined ? { statuses } : {}),
        ...(args.relationType !== undefined ? { relationType: args.relationType } : {}),
        ...(args.managedSystemId !== undefined ? { managedSystemId: args.managedSystemId } : {}),
      });
      const rawById = new Map(batch.rows.map((entry) => [entry.row.id, entry.createdAtRaw]));
      const items = await buildInventoryItems(
        actor,
        batch.rows.map((entry) => entry.row),
      );
      for (const entry of items) {
        if (
          entry.decision !== 'allowed' ||
          entry.dto.visibility_state !== 'allowed' ||
          ![entry.dto.source_summary, entry.dto.target_summary].some((summary) =>
            endpointSummaryMatches(summary, needle),
          )
        ) {
          continue;
        }
        if (wantCounts) statusCounts[entry.row.status] += 1;
        if (collected.length <= args.limit) {
          collected.push({
            dto: entry.dto,
            id: entry.row.id,
            createdAtRaw: rawById.get(entry.row.id) as string,
          });
        }
      }
      const lastRow = batch.rows.at(-1);
      if (batch.exhausted || lastRow === undefined) break;
      if (!wantCounts && collected.length > args.limit) break;
      cursor = { createdAt: normalizePgTimestampToIso(lastRow.createdAtRaw), id: lastRow.row.id };
    }
    const pageEntries = collected.slice(0, args.limit);
    const last = pageEntries.at(-1);
    const hasMore = collected.length > args.limit;
    return {
      items: pageEntries.map((entry) => entry.dto),
      page: {
        has_more: hasMore,
        ...(hasMore && last
          ? {
              cursor: encodeEntityLinksInventoryCursor({
                createdAtRaw: last.createdAtRaw,
                id: last.id,
              }),
            }
          : {}),
        ...(wantCounts ? { status_counts: statusCounts } : {}),
      },
    };
  }

  async function detachLink(args: {
    actor: EntityLinksActor;
    linkId: string;
    reason: string;
  }): Promise<DetachedEntityLinkResponse> {
    const { actor, linkId, reason } = args;

    const link = await selectEntityLinkById(deps.db, {
      workspaceId: actor.workspace_id,
      linkId,
    });
    if (
      !link ||
      !isCreatableTuple({
        sourceType: link.source_type,
        targetType: link.target_type,
        relationType: link.relation_type,
      })
    ) {
      throw new HttpError('not_found.record', 'entity link not found');
    }
    const sourceProvider = providerFor(deps.providers, link.source_type);
    const targetProvider = providerFor(deps.providers, link.target_type);
    const [sourceRow, targetRow] = await Promise.all([
      sourceProvider.getPermissionSubject(deps.db, actor.workspace_id, link.source_id),
      targetProvider.getPermissionSubject(deps.db, actor.workspace_id, link.target_id),
    ]);
    if (!sourceRow || !targetRow) {
      throw new HttpError('not_found.record', 'entity link endpoint not found');
    }

    const [sourceAllowed, targetAllowed] = await Promise.all([
      sourceProvider.canRead(deps, actor, sourceRow),
      targetProvider.canRead(deps, actor, targetRow),
    ]);
    if (!sourceAllowed || !targetAllowed) {
      throw new HttpError('not_found.record', 'entity link not found');
    }
    if (
      targetProvider.canCreateTarget !== undefined &&
      !(await targetProvider.canCreateTarget(deps, actor, targetRow))
    ) {
      throw new HttpError('not_found.record', 'entity link not found');
    }
    if (link.status !== 'active') {
      throw new HttpError('conflict.stale_write', 'entity link is no longer active');
    }

    const detached = await deps.db.transaction(async (tx) => {
      await lockRecoveryCommand(tx, actor.workspace_id);
      const recovery = await deps.recoveryRecorder?.capture(tx, actor.workspace_id, [
        recoverySubjectOf({ type: link.source_type, id: link.source_id }),
        recoverySubjectOf({ type: link.target_type, id: link.target_id }),
      ]);
      const updated = await detachEntityLink(tx, {
        workspaceId: actor.workspace_id,
        linkId,
        actorId: actor.actor_id,
        reason,
      });
      if (!updated) {
        throw new HttpError('conflict.stale_write', 'entity link is no longer active');
      }

      if (
        updated.source_type === 'finding' &&
        updated.target_type === 'task' &&
        updated.relation_type === 'requested_task'
      ) {
        await deps.reconcileFindingExecution?.(tx, {
          workspaceId: actor.workspace_id,
          findingId: updated.source_id,
        });
      }

      await deps.auditService.record(tx, {
        workspace_id: actor.workspace_id,
        actor_id: actor.actor_id,
        event_type: 'entity_link.detached',
        subject_type: 'entity_link',
        subject_id: updated.id,
        summary: 'Entity link detached',
        detail: {
          link_id: updated.id,
          source: { type: updated.source_type, id: updated.source_id },
          target: { type: updated.target_type, id: updated.target_id },
          relation_type: updated.relation_type,
          reason,
        },
      });

      if (recovery) await deps.recoveryRecorder?.finish(tx, recovery, actor.actor_id, 'detachLink');
      return updated;
    });

    return toDetachedResponse(detached);
  }

  /**
   * ADR-0123: the one write path for the registered no-Managed-System tuples, called by the owning module's command inside
   * its transaction (`tx` is required: a failed link write must roll the caller back). Judged by the owning modules'
   * read permission at BOTH ends (provider `canRead`; a missing provider or an unresolved end denies), never by Managed
   * System. A tuple that is not registered as a no-Managed-System pair, or an end that carries a Managed System, is
   * refused: the Managed-System rule of `createLink` is not available here. An existing active link is returned
   * (`inserted: false`); the audit row is written only for a new link.
   */
  async function createNoManagedSystemLink(args: {
    actor: EntityLinksActor;
    source: EntityLinkRef;
    target: EntityLinkRef;
    relation_type: EntityLinkRelationType;
    tx: Tx;
  }): Promise<{ id: string; inserted: boolean }> {
    const { actor, source, target, tx } = args;
    if (
      !isNoManagedSystemEntityLinkPair({
        source_type: source.type,
        target_type: target.type,
        relation_type: args.relation_type,
      })
    ) {
      throw new HttpError('validation.failed', 'unsupported entity link tuple', {
        fields: [{ path: [], code: 'unsupported_tuple' }],
      });
    }
    const bound = readDependencies(tx);
    const sourceProvider = providerFor(bound.providers, source.type);
    const targetProvider = providerFor(bound.providers, target.type);
    const [sourceRow, targetRow] = await Promise.all([
      sourceProvider.assertExists(bound.db, actor.workspace_id, source.id),
      targetProvider.assertExists(bound.db, actor.workspace_id, target.id),
    ]);
    // Existence is not revealed apart from readability: an unresolved end and an unreadable end answer the same.
    const [sourceAllowed, targetAllowed] = await Promise.all([
      sourceRow ? sourceProvider.canRead(bound, actor, sourceRow) : false,
      targetRow ? targetProvider.canRead(bound, actor, targetRow) : false,
    ]);
    if (!sourceRow || !targetRow || !sourceAllowed || !targetAllowed) {
      throw new HttpError('not_found.record', 'entity link endpoint not found');
    }
    if (sourceRow.managed_system_id !== null || targetRow.managed_system_id !== null) {
      throw new HttpError('validation.failed', 'entity link ends must not carry a managed system', {
        fields: [{ path: ['target', 'id'], code: 'managed_system_mismatch' }],
      });
    }
    const inserted = await insertActiveEntityLink(tx, {
      workspaceId: actor.workspace_id,
      sourceType: source.type,
      sourceId: source.id,
      targetType: target.type,
      targetId: target.id,
      relationType: args.relation_type,
      managedSystemId: null,
      createdBy: actor.actor_id,
      visibility: 'internal_only',
    });
    if (inserted.inserted) {
      await deps.auditService.record(tx, {
        workspace_id: actor.workspace_id,
        actor_id: actor.actor_id,
        event_type: 'entity_link.created',
        subject_type: 'entity_link',
        subject_id: inserted.row.id,
        summary: 'Entity link created',
        detail: {
          link_id: inserted.row.id,
          source,
          target,
          relation_type: args.relation_type,
          visibility: 'internal_only',
        },
      });
    }
    return { id: inserted.row.id, inserted: inserted.inserted };
  }

  return {
    createLink,
    createNoManagedSystemLink,
    canReadEndpoint,
    resolveReadableEndpointSummary,
    listLinks,
    listLinksPage,
    listInventoryLinks,
    readVocFollowUp,
    detachLink,
  };
}

export type EntityLinksService = ReturnType<typeof createEntityLinksService>;
