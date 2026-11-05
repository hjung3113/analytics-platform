// The concept mapping actions of the log knowledge hub (#1196 e, design v0.6 §15.4): propose, confirm and reject a
// mapping between a spec target and a common concept. Same right as the spec writes (`knowledge.spec.publish`, no new
// capability; Admin passes through the module bypass). Rules: the workspace is the actor's; equivalence is
// HUMAN-CONFIRMED only — a propose always stores `review_state = 'proposed'`, a similarity score is evidence on the
// row (origin `similarity`, recomputed here, never trusted from the client) and never a verdict; the target is pointed
// to by stable key and must exist in the model's CURRENT published revision at write time (`target.key:not_found`); a
// rejected pair is kept and never proposed again (`already_rejected`); one confirmed `equivalent` per target
// (`already_confirmed`). Each write is one transaction with one body-free audit row (subject type
// `knowledge_model_spec`, subject id = the mapping id). Concurrency: propose and confirm take the model advisory
// lock(s) first (sorted by id); confirm / reject read the row's model unlocked, take the lock, then lock the row.

import { createAuditService } from '../core/audit/audit-service.js';
import type { Tx } from '../../db/tx.js';
import { type ActionHandlerResult, type MenuActionDeclaration, MenuActionInvalidError } from '../menu-dispatch/types.js';
import { type CheckService, applyAdminModuleBypass } from '../permissions/check-service.js';
import type { PlatformActor } from '../platform-port/permissions.js';
import { LOG_KNOWLEDGE_MODELS_MENU_ID } from './catalog-menu.js';
import { toCodeKey } from './domain/code-key.js';
import { type ConceptTarget, parseConceptConfirm, parseConceptPropose, parseConceptReject, validateConcept } from './domain/concept-input.js';
import { type SimilarityBasis, scoreTargets } from './domain/concept-similarity.js';
import {
  conceptById,
  hasConfirmedEquivalent,
  insertMapping,
  lockMapping,
  lockModelConcepts,
  mappingModelId,
  pairRow,
  pickOrCreateConcept,
  reviewMapping,
} from './repositories/concept.js';
import { modelExists } from './repositories/spec-change.js';
import { type SpecTarget, currentTargetsOf } from './repositories/spec-targets.js';
import { SPEC_MENU_PERMISSION, SPEC_PERMISSION } from './spec-actions.js';

export const CONCEPT_INVALIDATES = ['logKnowledge.conceptMappings', 'logKnowledge.conceptSuggestions'] as const;
const INPUT_KEYS = {
  conceptPropose: ['modelId', 'targetKind', 'target', 'conceptId', 'canonicalLabel', 'description', 'relationKind', 'pairWith'],
  conceptConfirm: ['mappingId'],
  conceptReject: ['mappingId', 'reason'],
} as const;

export interface ConceptActionDeps {
  checkService: CheckService;
}

type AuditType = 'concept_proposed' | 'concept_confirmed' | 'concept_rejected';

const refuse = (path: string[], code: string): never => {
  throw new MenuActionInvalidError([{ path, code }]);
};

export function conceptActions(deps: ConceptActionDeps): MenuActionDeclaration[] {
  const audit = createAuditService();

  const authorize = async (actor: PlatformActor, tx: Tx) =>
    applyAdminModuleBypass(
      actor.role_level,
      SPEC_PERMISSION,
      await deps.checkService.checkCapability(actor, SPEC_PERMISSION, { workspace_id: actor.workspace_id }, { tx }),
    ).allow;

  const record = (tx: Tx, actor: PlatformActor, type: AuditType, mappingId: string, detail: Record<string, unknown>) =>
    audit.record(tx, {
      workspace_id: actor.workspace_id,
      actor_id: actor.actor_id,
      event_type: `knowledge.spec.${type}`,
      subject_type: 'knowledge_model_spec',
      subject_id: mappingId,
      summary: `model spec ${type.replace('_', ' ')}`,
      detail,
    });

  const base = (op: keyof typeof INPUT_KEYS, concurrency: 'none' | 'version') => ({
    id: `logKnowledge.${op}`,
    menuId: LOG_KNOWLEDGE_MODELS_MENU_ID,
    inputKeys: INPUT_KEYS[op],
    permission: SPEC_MENU_PERMISSION,
    requiresScope: false,
    concurrency,
    invalidates: CONCEPT_INVALIDATES,
  });

  /** The target in the model's current published revision; `none_published` / `not_found` otherwise. */
  async function requireTarget(tx: Tx, ws: string, modelId: string, t: { targetKind: string; targetKey: string }, prefix: readonly string[]): Promise<SpecTarget> {
    if (!(await modelExists(tx, ws, modelId))) return refuse([...prefix, 'modelId'], 'not_found');
    const current = await currentTargetsOf(tx, ws, modelId);
    if (!current) return refuse([...prefix, 'revision'], 'none_published');
    const found = current.targets.get(t.targetKey);
    if (!found || found.kind !== t.targetKind) return refuse([...prefix, 'targetKey'], 'not_found');
    return found;
  }

  /** One proposed row for the pair; an existing row of the pair is a refusal (open → already_mapped, rejected → already_rejected). */
  async function proposeRow(
    tx: Tx,
    actor: PlatformActor,
    conceptId: string,
    modelId: string,
    t: ConceptTarget,
    relationKind: string,
    similarity: { score: number; basis: SimilarityBasis } | null,
    prefix: readonly string[],
  ): Promise<string> {
    const existing = await pairRow(tx, actor.workspace_id, conceptId, modelId, t.targetKey);
    if (existing) return refuse([...prefix, 'target'], existing.reviewState === 'rejected' ? 'already_rejected' : 'already_mapped');
    return insertMapping(tx, {
      workspaceId: actor.workspace_id,
      actorId: actor.actor_id,
      conceptId,
      modelId,
      targetKind: t.targetKind,
      targetKey: t.targetKey,
      relationKind,
      similarity,
    });
  }

  const conceptPropose: MenuActionDeclaration = {
    spec: base('conceptPropose', 'none'),
    authorize,
    validate: (input) => validateConcept('conceptPropose', input),
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const parsed = parseConceptPropose(input);
      if (!parsed.ok) throw new Error('action conceptPropose: validate passed but parse failed');
      const value = parsed.value;
      await lockModelConcepts(tx, ws, [value.modelId, ...(value.pairWith ? [value.pairWith.modelId] : [])]);

      const mine = await requireTarget(tx, ws, value.modelId, value, []);
      const pair = value.pairWith ? await requireTarget(tx, ws, value.pairWith.modelId, value.pairWith, ['pairWith']) : null;

      let concept;
      if (value.conceptId) {
        concept = await conceptById(tx, ws, value.conceptId);
        if (!concept) return refuse(['conceptId'], 'not_found');
        if (concept.kind !== value.targetKind) return refuse(['conceptId'], 'kind_mismatch');
      } else {
        const label = value.canonicalLabel as string;
        concept = await pickOrCreateConcept(tx, {
          workspaceId: ws,
          actorId: actor.actor_id,
          kind: value.targetKind,
          canonicalLabel: label,
          labelKey: toCodeKey(label),
          description: value.description,
        });
      }

      // A pair is a suggestion accepted as a proposal: both rows are `proposed`, scored server-side from the current spec.
      const similarity = pair ? scoreTargets(mine, pair) : null;
      const mappingId = await proposeRow(tx, actor, concept.id, value.modelId, value, value.relationKind, similarity, []);
      const pairMappingId = value.pairWith
        ? await proposeRow(tx, actor, concept.id, value.pairWith.modelId, value.pairWith, value.relationKind, similarity, ['pairWith'])
        : null;
      const written = [
        { id: mappingId, modelId: value.modelId, targetKind: value.targetKind },
        ...(value.pairWith && pairMappingId ? [{ id: pairMappingId, modelId: value.pairWith.modelId, targetKind: value.pairWith.targetKind }] : []),
      ];
      for (const w of written) {
        await record(tx, actor, 'concept_proposed', w.id, {
          modelId: w.modelId,
          mappingId: w.id,
          conceptId: concept.id,
          targetKind: w.targetKind,
          relationKind: value.relationKind,
          origin: similarity ? 'similarity' : 'human',
        });
      }
      return { data: { conceptId: concept.id, mappingId, ...(pairMappingId ? { pairMappingId } : {}) }, version: null };
    },
  };

  /** Model lock first, then the row; the row is re-read locked, and an unknown row is `null` (not_found). */
  const lockedVersion = async (tx: Tx, actor: PlatformActor, input: Record<string, unknown>) => {
    const ws = actor.workspace_id;
    const mappingId = input.mappingId as string;
    const modelId = await mappingModelId(tx, ws, mappingId);
    if (!modelId) return null;
    await lockModelConcepts(tx, ws, [modelId]);
    const row = await lockMapping(tx, ws, mappingId);
    return row ? String(row.rowVersion) : null;
  };

  const conceptConfirm: MenuActionDeclaration = {
    spec: base('conceptConfirm', 'version'),
    authorize,
    validate: (input) => validateConcept('conceptConfirm', input),
    currentVersion: lockedVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const parsed = parseConceptConfirm(input);
      if (!parsed.ok) throw new Error('action conceptConfirm: validate passed but parse failed');
      const row = await lockMapping(tx, ws, parsed.value.mappingId);
      if (!row) return refuse(['mappingId'], 'not_found');
      if (row.reviewState !== 'proposed') return refuse(['mapping'], row.reviewState === 'rejected' ? 'already_rejected' : 'already_confirmed');
      await requireTarget(tx, ws, row.modelId, { targetKind: row.targetKind, targetKey: row.targetKey }, []);
      if (row.relationKind === 'equivalent' && (await hasConfirmedEquivalent(tx, ws, row.modelId, row.targetKey, row.id))) {
        return refuse(['target'], 'already_confirmed');
      }
      const version = await reviewMapping(tx, ws, row, actor.actor_id, { state: 'confirmed' });
      await record(tx, actor, 'concept_confirmed', row.id, { modelId: row.modelId, mappingId: row.id, conceptId: row.conceptId, relationKind: row.relationKind });
      return { data: { mappingId: row.id }, version: String(version) };
    },
  };

  const conceptReject: MenuActionDeclaration = {
    spec: base('conceptReject', 'version'),
    authorize,
    validate: (input) => validateConcept('conceptReject', input),
    currentVersion: lockedVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const parsed = parseConceptReject(input);
      if (!parsed.ok) throw new Error('action conceptReject: validate passed but parse failed');
      const row = await lockMapping(tx, ws, parsed.value.mappingId);
      if (!row) return refuse(['mappingId'], 'not_found');
      if (row.reviewState === 'rejected') return refuse(['mapping'], 'already_rejected');
      const version = await reviewMapping(tx, ws, row, actor.actor_id, { state: 'rejected', reason: parsed.value.reason });
      await record(tx, actor, 'concept_rejected', row.id, {
        modelId: row.modelId,
        mappingId: row.id,
        conceptId: row.conceptId,
        priorState: row.reviewState,
      });
      return { data: { mappingId: row.id }, version: String(version) };
    },
  };

  return [conceptPropose, conceptConfirm, conceptReject];
}
