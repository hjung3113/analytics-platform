/**
 * Mock server half of the knowledge item writes (ADR-0109, #1197 s3a): `itemCreate`, `itemRevise`, `itemAssess`,
 * `itemDerive`, `itemSetArchived` over the item store (`items.ts`), answered like the real server
 * (`modules/log-knowledge/item-actions.ts`, value checks `domain/item-input.ts`): the same field errors (`required`,
 * `required_one`, `too_long`, `malformed`, `invalid_state`, `not_found`, `inactive`, `archived`, `unchanged`), one error
 * per path, the same outcomes (`{ id, itemNo }`, `revisionNo` on revise), a version bump on every change, create and
 * derive at version "1", set-archived to the value it has changes nothing.
 *
 * Differences from the server, by engine design (the catalog writes have the same one): a mock action's `validate`
 * runs before the version check, and the state-dependent refusals (`archived`, `unchanged`, an unknown or inactive
 * owner, an unknown source) are judged in `validate` because the engine has no database step, so a stale version on an
 * archived item answers `invalid` where the server answers `conflict`. The mock writes no audit rows, and a mock write
 * is judged for the one fixed mock actor.
 */
import { defineMockAction, type AnyMockAction } from '@ap/mock-server';
import type { FieldError } from '@ap/contracts';
import {
  ASSESSMENT_DIMENSIONS, EVIDENCE_SOURCE_KINDS, ITEM_LIMITS, ITEM_TYPE_CODES, PROCESSING_STATES, VERIFICATION_STATES,
  itemAssess, itemCreate, itemDerive, itemRevise, itemSetArchived,
} from '../endpoints';
import { appendAssessment, appendRevision, insertDerivedLink, insertItem, itemById, latestRevision, setPublicationState, type EvidenceRec, type ItemRec, type RevisionContent } from './items';
import { byId } from './store';
import { parseSubjects } from './conceptInput';
import { itemModelId, judgeSubjects } from './subjectLinks';

type Input = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REVISION_NO_MAX = 1_000_000;
/** Mirrors the server's `unsafeText`: NUL and lone UTF-16 surrogates. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const unsafeText = (value: string): boolean => value.includes('\u0000') || LONE_SURROGATE.test(value);
const length = (value: string): number => [...value].length;
const err = (path: readonly string[], code: string): FieldError => ({ path, code });

// ---- value checks (the server's `domain/item-input.ts`; pure) ----------------------------------------------------

/** `required` (not a string), `malformed` (control character), `too_long` (code points); blank passes — callers add `nonBlank`. */
function boundedError(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return 'required';
  if (unsafeText(value)) return 'malformed';
  return length(value) > max ? 'too_long' : null;
}
const requiredTextError = (value: unknown, max: number): string | null => boundedError(value, max) ?? ((value as string).trim() === '' ? 'required' : null);
const optionalTextError = (value: unknown, max: number): string | null => (value === undefined || value === null ? null : boundedError(value, max));
const uuidError = (value: unknown): string | null => (typeof value !== 'string' ? 'required' : UUID.test(value) ? null : 'malformed');
const optionalUuidError = (value: unknown): string | null => (value === undefined || value === null ? null : uuidError(value));
const enumError = (value: unknown, values: readonly string[]): string | null => (value === undefined ? 'required' : typeof value === 'string' && values.includes(value) ? null : 'malformed');
const hasText = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '';

/** The first error per path, in the order the checks run (the server reports one error per path). */
function collect(checks: [path: string[], code: string | null][]): FieldError[] {
  const seen = new Set<string>();
  const out: FieldError[] = [];
  for (const [path, code] of checks) {
    if (code === null || seen.has(path.join('.'))) continue;
    seen.add(path.join('.'));
    out.push(err(path, code));
  }
  return out;
}

function evidenceChecks(value: unknown): [string[], string | null][] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return [[['evidence'], 'required']];
  const checks: [string[], string | null][] = [];
  value.forEach((entry: unknown, i) => {
    const at = (field: string) => ['evidence', String(i), field];
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) { checks.push([['evidence', String(i)], 'required']); return; }
    const e = entry as Input;
    checks.push(
      [at('sourceKind'), enumError(e.sourceKind, EVIDENCE_SOURCE_KINDS)],
      [at('sourceOwner'), requiredTextError(e.sourceOwner, ITEM_LIMITS.evidenceField)],
      [at('sourceRef'), requiredTextError(e.sourceRef, ITEM_LIMITS.evidenceField)],
      [at('sourceVersion'), optionalTextError(e.sourceVersion, ITEM_LIMITS.evidenceField)],
      [at('contentHash'), optionalTextError(e.contentHash, ITEM_LIMITS.evidenceField)],
      [at('locator'), optionalTextError(e.locator, ITEM_LIMITS.evidenceField)],
      [at('note'), optionalTextError(e.note, ITEM_LIMITS.evidenceNote)],
    );
  });
  // The list cap comes after the per-entry checks, like the schema's `.max`.
  if (value.length > ITEM_LIMITS.evidence) checks.push([['evidence'], 'too_long']);
  return checks;
}

const contentChecks = (i: Input): [string[], string | null][] => [
  [['typeCode'], enumError(i.typeCode, ITEM_TYPE_CODES)],
  [['title'], requiredTextError(i.title, ITEM_LIMITS.title)],
  [['observation'], optionalTextError(i.observation, ITEM_LIMITS.body)],
  [['expected'], optionalTextError(i.expected, ITEM_LIMITS.body)],
  [['analysisOpinion'], optionalTextError(i.analysisOpinion, ITEM_LIMITS.body)],
  [['improvement'], optionalTextError(i.improvement, ITEM_LIMITS.body)],
];
/** Neither `observation` nor `expected` has text (only when both are themselves valid). */
const contentRule = (i: Input): [string[], string | null][] =>
  optionalTextError(i.observation, ITEM_LIMITS.body) === null && optionalTextError(i.expected, ITEM_LIMITS.body) === null && !hasText(i.observation) && !hasText(i.expected)
    ? [[['observation'], 'required_one']] : [];
const ownerChecks = (i: Input): [string[], string | null][] => {
  const checks: [string[], string | null][] = [[['ownerModelId'], optionalUuidError(i.ownerModelId)], [['ownerSoftwareId'], optionalUuidError(i.ownerSoftwareId)]];
  const set = [i.ownerModelId, i.ownerSoftwareId].filter(v => v !== undefined && v !== null);
  if (set.length !== 1) checks.push([['owner'], 'required_one']);
  return checks;
};

/** #1196 f: the optional `subjects[]` value checks (cap 20, closed entries, no duplicate); what only the spec can judge is the handler's. */
const subjectShape = (i: Input): FieldError[] => { const parsed = parseSubjects(i.subjects); return parsed.ok ? [] : parsed.errors; };
/** The judged subjects of a write; `undefined` = none sent (a revise then carries the previous revision's links). */
const subjectsOf = (ownerModelId: string, i: Input) => { const parsed = parseSubjects(i.subjects); return parsed.ok && parsed.value ? judgeSubjects(ownerModelId, parsed.value) : undefined; };

const SHAPE: Record<'create' | 'revise' | 'assess' | 'derive' | 'setArchived', (i: Input) => FieldError[]> = {
  create: i => [...collect([...ownerChecks(i), ...contentChecks(i), ...evidenceChecks(i.evidence), ...contentRule(i)]), ...subjectShape(i)],
  revise: i => [...collect([[['id'], uuidError(i.id)], ...contentChecks(i), ...evidenceChecks(i.evidence), [['changeNote'], requiredTextError(i.changeNote, ITEM_LIMITS.changeNote)], ...contentRule(i)]), ...subjectShape(i)],
  assess: i => {
    const dimensionError = enumError(i.dimension, ASSESSMENT_DIMENSIONS);
    const allowed: readonly string[] = i.dimension === 'verification' ? VERIFICATION_STATES : PROCESSING_STATES;
    return collect([
      [['id'], uuidError(i.id)], [['dimension'], dimensionError],
      [['newState'], typeof i.newState !== 'string' ? 'required' : dimensionError === null && !allowed.includes(i.newState) ? 'invalid_state' : null],
      [['rationale'], requiredTextError(i.rationale, ITEM_LIMITS.rationale)],
    ]);
  },
  derive: i => collect([
    [['sourceItemId'], uuidError(i.sourceItemId)],
    [['sourceRevisionNo'], typeof i.sourceRevisionNo !== 'number' ? 'required' : Number.isInteger(i.sourceRevisionNo) && i.sourceRevisionNo >= 1 && i.sourceRevisionNo <= REVISION_NO_MAX ? null : 'malformed'],
    ...ownerChecks(i), ...contentChecks(i), ...contentRule(i),
  ]),
  setArchived: i => collect([[['id'], uuidError(i.id)], [['archived'], typeof i.archived === 'boolean' ? null : 'required']]),
};

// ---- state checks (the server's handler-time refusals) ---------------------------------------------------------

/** The owner the caller set: unknown or of another kind → `not_found`; an inactive model, SW version or SW's model → `inactive`. */
function ownerStateErrors(i: Input): FieldError[] {
  if (i.ownerModelId !== undefined && i.ownerModelId !== null) {
    const row = byId(i.ownerModelId);
    if (!row || row.kind !== 'model') return [err(['ownerModelId'], 'not_found')];
    return row.active ? [] : [err(['ownerModelId'], 'inactive')];
  }
  const row = byId(i.ownerSoftwareId);
  if (!row || row.kind !== 'software') return [err(['ownerSoftwareId'], 'not_found')];
  return row.active && byId(row.parentId)?.active ? [] : [err(['ownerSoftwareId'], 'inactive')];
}

/** Value shape first, then (only when the shape is right) what only the data can judge. A missing target is the version handler's `not_found`. */
const validate = (op: keyof typeof SHAPE, state?: (input: Input) => FieldError[]) => (input: Input): readonly FieldError[] => {
  const shape = SHAPE[op](input);
  return shape.length > 0 || !state ? shape : state(input);
};
const archivedState = (input: Input): FieldError[] => (itemById(input.id)?.publicationState === 'archived' ? [err(['id'], 'archived')] : []);

const currentVersion = ({ input }: { input: Input }): string | null => {
  const rec = itemById(input.id);
  return rec ? String(rec.rowVersion) : null;
};

// ---- normalisation (the server's zod transforms) -----------------------------------------------------------------

/** A body text: absent, null or blank → null; otherwise as written. */
const body = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);
const shortText = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
const contentOf = (i: Input): RevisionContent => ({
  title: (i.title as string).trim(), typeCode: i.typeCode as string, observation: body(i.observation), expected: body(i.expected),
  analysisOpinion: body(i.analysisOpinion), improvement: body(i.improvement),
});
const evidenceOf = (value: unknown): Omit<EvidenceRec, 'ordinal'>[] =>
  (Array.isArray(value) ? (value as Input[]) : []).map(e => ({
    sourceKind: e.sourceKind as string, sourceOwner: (e.sourceOwner as string).trim(), sourceRef: (e.sourceRef as string).trim(),
    sourceVersion: shortText(e.sourceVersion), contentHash: shortText(e.contentHash), locator: shortText(e.locator), note: shortText(e.note),
  }));
const ownerOfInput = (i: Input) => ({
  modelId: i.ownerModelId === undefined || i.ownerModelId === null ? null : byId(i.ownerModelId)!.id,
  softwareId: i.ownerSoftwareId === undefined || i.ownerSoftwareId === null ? null : byId(i.ownerSoftwareId)!.id,
});
const done = (rec: ItemRec, extra: Input = {}) => ({ data: { id: rec.id, itemNo: rec.itemNo, ...extra }, version: String(rec.rowVersion) });

export const itemActionsMock: readonly AnyMockAction[] = [
  defineMockAction(itemCreate, {
    validate: validate('create', ownerStateErrors),
    handle: ({ input }: { input: Input }) => {
      const owner = ownerOfInput(input);
      return done(insertItem(owner, contentOf(input), evidenceOf(input.evidence), subjectsOf(itemModelId({ ownerModelId: owner.modelId, ownerSoftwareId: owner.softwareId }), input) ?? []));
    },
  }),
  defineMockAction(itemRevise, {
    version: currentVersion, validate: validate('revise', archivedState),
    handle: ({ input }: { input: Input }) => {
      const before = itemById(input.id)!;
      const rec = appendRevision(before, contentOf(input), (input.changeNote as string).trim(), evidenceOf(input.evidence), subjectsOf(itemModelId(before), input));
      return done(rec, { revisionNo: latestRevision(rec).revisionNo });
    },
  }),
  defineMockAction(itemAssess, {
    version: currentVersion,
    validate: validate('assess', input => {
      const rec = itemById(input.id);
      if (!rec) return [];
      if (rec.publicationState === 'archived') return [err(['id'], 'archived')];
      const prior = input.dimension === 'verification' ? rec.verificationState : rec.processingState;
      return prior === input.newState ? [err(['newState'], 'unchanged')] : [];
    }),
    handle: ({ input }: { input: Input }) => done(appendAssessment(itemById(input.id)!, input.dimension as 'verification' | 'processing', input.newState as string, (input.rationale as string).trim())),
  }),
  defineMockAction(itemDerive, {
    validate: validate('derive', input => {
      const source = itemById(input.sourceItemId);
      const sourceErrors = !source ? [err(['sourceItemId'], 'not_found')]
        : source.revisions.some(r => r.revisionNo === input.sourceRevisionNo) ? [] : [err(['sourceRevisionNo'], 'not_found')];
      return [...sourceErrors, ...ownerStateErrors(input)];
    }),
    handle: ({ input }: { input: Input }) => {
      const source = itemById(input.sourceItemId)!;
      const rec = insertItem(ownerOfInput(input), contentOf(input), []);
      insertDerivedLink(rec.id, source.id, input.sourceRevisionNo as number);
      return done(rec);
    },
  }),
  defineMockAction(itemSetArchived, {
    version: currentVersion, validate: validate('setArchived'),
    // To the value the item already has: nothing changes and the current version is answered.
    handle: ({ input }: { input: Input }) => {
      const rec = itemById(input.id)!;
      const target = input.archived ? 'archived' : 'published';
      return done(rec.publicationState === target ? rec : setPublicationState(rec, target));
    },
  }),
] as AnyMockAction[];
