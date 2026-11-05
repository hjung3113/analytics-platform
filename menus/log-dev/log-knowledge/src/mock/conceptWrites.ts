/**
 * Mock server half of the concept mapping writes (#1196 e, design v0.6 §15.4): `conceptPropose` (incl. `pairWith`),
 * `conceptConfirm`, `conceptReject`, answered like the real server (`modules/log-knowledge/concept-actions.ts`).
 * Equivalence is human-confirmed only: a propose always stores `proposed` (a similarity score is evidence, recomputed
 * here from the current spec, never trusted from the client); a target must exist in the model's CURRENT published
 * revision (`target_gone` rows can still be rejected, never confirmed); a rejected pair is kept and never proposed again;
 * one confirmed `equivalent` per target. Like the node d writes, `validate` judges the value shape only and every state
 * refusal is `MockActionInvalid` from the handler, so a stale version answers `conflict` first (the server's order).
 */
import { defineMockAction, MockActionInvalid, type AnyMockAction } from '@ap/mock-server';
import type { FieldError } from '@ap/contracts';
import { conceptConfirm, conceptPropose, conceptReject } from '../endpoints';
import { confirmErrors, currentTargets, parseConceptPropose, rejectErrors, scoreTargets, type TargetValue } from './conceptInput';
import { conceptById, hasConfirmedEquivalent, insertMapping, mappingById, pairRow, pickOrCreateConcept, reviewMapping } from './conceptStore';
import { toCodeKey, byId } from './store';

type Input = Record<string, unknown>;
const refuse = (path: readonly string[], code: string): never => { throw new MockActionInvalid([{ path, code } as FieldError]); };

/** The target in the model's current published revision; `not_found` (model), `none_published` or `not_found` (key) otherwise. */
function requireTarget(modelId: string, t: TargetValue, prefix: readonly string[]) {
  if (byId(modelId)?.kind !== 'model') return refuse([...prefix, 'modelId'], 'not_found');
  const current = currentTargets(modelId);
  if (!current) return refuse([...prefix, 'revision'], 'none_published');
  const found = current.targets.get(t.targetKey);
  if (!found || found.kind !== t.targetKind) return refuse([...prefix, 'targetKey'], 'not_found');
  return found;
}
const versionOf = ({ input }: { input: Input }): string | null => { const m = mappingById(input.mappingId); return m ? String(m.rowVersion) : null; };

export const conceptActionsMock: readonly AnyMockAction[] = [
  defineMockAction(conceptPropose, {
    validate: input => { const parsed = parseConceptPropose(input); return parsed.ok ? [] : parsed.errors; },
    handle: ({ input }: { input: Input }) => {
      const parsed = parseConceptPropose(input);
      if (!parsed.ok) throw new MockActionInvalid(parsed.errors);
      const value = parsed.value;
      const mine = requireTarget(value.modelId, value, []);
      const pair = value.pairWith ? requireTarget(value.pairWith.modelId, value.pairWith, ['pairWith']) : null;
      let concept;
      if (value.conceptId) {
        concept = conceptById(value.conceptId);
        if (!concept) return refuse(['conceptId'], 'not_found');
        if (concept.kind !== value.targetKind) return refuse(['conceptId'], 'kind_mismatch');
      } else concept = pickOrCreateConcept(value.targetKind, value.canonicalLabel as string, toCodeKey(value.canonicalLabel as string), value.description);
      // A pair is a suggestion accepted as a proposal: both rows are `proposed`, scored from the current spec. Both are judged before either is written (one transaction).
      const similarity = pair ? scoreTargets(mine, pair) : null;
      const taken = (modelId: string, key: string, prefix: readonly string[]) => {
        const existing = pairRow(concept.id, modelId, key);
        if (existing) refuse([...prefix, 'target'], existing.reviewState === 'rejected' ? 'already_rejected' : 'already_mapped');
      };
      taken(value.modelId, value.targetKey, []);
      if (value.pairWith) taken(value.pairWith.modelId, value.pairWith.targetKey, ['pairWith']);
      const row = insertMapping({ conceptId: concept.id, modelId: value.modelId, targetKind: value.targetKind, targetKey: value.targetKey, relationKind: value.relationKind, similarity });
      const pairRowRec = value.pairWith
        ? insertMapping({ conceptId: concept.id, modelId: value.pairWith.modelId, targetKind: value.pairWith.targetKind, targetKey: value.pairWith.targetKey, relationKind: value.relationKind, similarity })
        : null;
      return { data: { conceptId: concept.id, mappingId: row.id, ...(pairRowRec ? { pairMappingId: pairRowRec.id } : {}) }, version: null };
    },
  }),
  defineMockAction(conceptConfirm, {
    version: versionOf, validate: input => confirmErrors(input),
    handle: ({ input }: { input: Input }) => {
      const row = mappingById(input.mappingId);
      if (!row) return refuse(['mappingId'], 'not_found');
      if (row.reviewState !== 'proposed') return refuse(['mapping'], row.reviewState === 'rejected' ? 'already_rejected' : 'already_confirmed');
      requireTarget(row.modelId, row, []);
      if (row.relationKind === 'equivalent' && hasConfirmedEquivalent(row.modelId, row.targetKey, row.id)) return refuse(['target'], 'already_confirmed');
      return { data: { mappingId: row.id }, version: String(reviewMapping(row, { state: 'confirmed' }).rowVersion) };
    },
  }),
  defineMockAction(conceptReject, {
    version: versionOf, validate: input => rejectErrors(input),
    handle: ({ input }: { input: Input }) => {
      const row = mappingById(input.mappingId);
      if (!row) return refuse(['mappingId'], 'not_found');
      if (row.reviewState === 'rejected') return refuse(['mapping'], 'already_rejected');
      return { data: { mappingId: row.id }, version: String(reviewMapping(row, { state: 'rejected', reason: (input.reason as string).trim() }).rowVersion) };
    },
  }),
] as AnyMockAction[];
