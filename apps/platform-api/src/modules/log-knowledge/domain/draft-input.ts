// Value checks of the knowledge draft write actions (#1198 a). Pure and DB-free. A draft proposal is the existing item
// input (`item-input.ts`): `create` = what `ITEM_INPUT_SCHEMAS.create` accepts, `revise` = `ITEM_INPUT_SCHEMAS.revise`
// without `id` (the target is the draft's `target_item_id`). The field and refinement builders are reused, not copied;
// what differs is strictness: an unknown key in the proposal, in an `evidence[i]` or in a `subjects[i]` is refused
// (`malformed`), and every proposal field error is prefixed `['proposal', …]`. What only the database can judge (owner,
// target, subjects against the spec) is the handler's. Codes are the item input's plus `immutable` (the owner of a
// create draft is fixed from creation).
//
// `normalizeProposal` is the stored form of a proposal and `proposalDigest` its SHA-256 (hex) over `canonicalJson`
// (`spec-hash.ts`): the same normalized proposal always gives the same digest, any content change a different one.
// Node b compares it with the digest a reviewer approved. Stored `subjects` are the normalized subject values
// (`modelId`, `targetKind`, `targetKey`, `subjectRelation`); an omitted `subjects` on a revise stays absent (= carry).

import { createHash } from 'node:crypto';

import { z } from 'zod';

import { bounded, requiredText, uuid } from '../../../lib/input/fields.js';
import type { FieldError } from '../../menu-dispatch/types.js';
import {
  CHANGE_NOTE_MAX,
  type EvidencePointer,
  contentFields,
  evidenceList,
  evidencePointerSchema,
  fieldErrors,
  optionalUuid,
  requireContent,
  requireOneOwner,
  subjectsField,
} from './item-input.js';
import type { ItemSubjectValue } from './item-subject-input.js';
import { canonicalJson } from './spec-hash.js';

export const DRAFT_PROPOSAL_TYPES = ['create', 'revise'] as const;
export type DraftProposalType = (typeof DRAFT_PROPOSAL_TYPES)[number];
export const DRAFT_REASON_MAX = 500;
/** Version of the stored proposal shape (`draft_revision.schema_version`). */
export const DRAFT_SCHEMA_VERSION = 1;

const CONTENT_KEYS = ['typeCode', 'title', 'observation', 'expected', 'analysisOpinion', 'improvement'] as const;
const OWNER_KEYS = ['ownerModelId', 'ownerSoftwareId'] as const;
const SUBJECT_KEYS = ['modelId', 'targetKind', 'target', 'relation'] as const;
const EVIDENCE_KEYS = Object.keys(evidencePointerSchema.shape);

/** The allowed top-level keys of a proposal, per type. */
export const PROPOSAL_KEYS = {
  create: [...OWNER_KEYS, ...CONTENT_KEYS, 'evidence', 'subjects'],
  revise: [...CONTENT_KEYS, 'evidence', 'subjects', 'changeNote'],
} as const;

const createProposalSchema = z
  .object({ ownerModelId: optionalUuid, ownerSoftwareId: optionalUuid, ...contentFields, evidence: evidenceList, subjects: subjectsField })
  .superRefine(requireOneOwner)
  .superRefine(requireContent);
const reviseProposalSchema = z
  .object({ ...contentFields, evidence: evidenceList, subjects: subjectsField, changeNote: requiredText(CHANGE_NOTE_MAX) })
  .superRefine(requireContent);

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** An unknown key at any of the three levels is `malformed` at the key's path (the first one found per object). */
function unknownKeyErrors(raw: Record<string, unknown>, type: DraftProposalType): FieldError[] {
  const errors: FieldError[] = [];
  const check = (obj: Record<string, unknown>, allowed: readonly string[], at: string[]) => {
    for (const key of Object.keys(obj)) if (!allowed.includes(key)) errors.push({ path: [...at, key], code: 'malformed' });
  };
  check(raw, PROPOSAL_KEYS[type], ['proposal']);
  if (Array.isArray(raw.evidence)) raw.evidence.forEach((e, i) => isRecord(e) && check(e, EVIDENCE_KEYS, ['proposal', 'evidence', String(i)]));
  if (Array.isArray(raw.subjects)) raw.subjects.forEach((s, i) => isRecord(s) && check(s, SUBJECT_KEYS, ['proposal', 'subjects', String(i)]));
  return errors;
}

export interface NormalizedProposal {
  ownerModelId?: string;
  ownerSoftwareId?: string;
  typeCode: string;
  title: string;
  observation: string | null;
  expected: string | null;
  analysisOpinion: string | null;
  improvement: string | null;
  evidence: EvidencePointer[];
  /** Absent only on a revise that sends no `subjects` (the previous revision's links are kept). */
  subjects?: ItemSubjectValue[];
  changeNote?: string;
}

export type ProposalParse = { ok: true; value: NormalizedProposal } | { ok: false; errors: FieldError[] };

/** Parses and normalises a proposal of the given type; errors carry the `['proposal', …]` prefix. */
export function parseProposal(type: DraftProposalType, raw: unknown): ProposalParse {
  if (raw === undefined || raw === null) return { ok: false, errors: [{ path: ['proposal'], code: 'required' }] };
  if (!isRecord(raw)) return { ok: false, errors: [{ path: ['proposal'], code: 'malformed' }] };
  const unknown = unknownKeyErrors(raw, type);
  if (unknown.length > 0) return { ok: false, errors: unknown };
  const parsed = (type === 'create' ? createProposalSchema : reviseProposalSchema).safeParse(raw);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error).map((e) => ({ path: ['proposal', ...e.path], code: e.code })) };
  return { ok: true, value: normalizeProposal(parsed.data) };
}

/** The stored form: unset owner fields and an omitted `subjects` are absent, never `null`. */
export function normalizeProposal(parsed: {
  ownerModelId?: string | null | undefined;
  ownerSoftwareId?: string | null | undefined;
  typeCode: string;
  title: string;
  observation: string | null;
  expected: string | null;
  analysisOpinion: string | null;
  improvement: string | null;
  evidence: EvidencePointer[];
  subjects?: ItemSubjectValue[] | undefined;
  changeNote?: string | undefined;
}): NormalizedProposal {
  const out: NormalizedProposal = {
    typeCode: parsed.typeCode,
    title: parsed.title,
    observation: parsed.observation,
    expected: parsed.expected,
    analysisOpinion: parsed.analysisOpinion,
    improvement: parsed.improvement,
    evidence: parsed.evidence,
  };
  if (parsed.ownerModelId) out.ownerModelId = parsed.ownerModelId.toLowerCase();
  if (parsed.ownerSoftwareId) out.ownerSoftwareId = parsed.ownerSoftwareId.toLowerCase();
  if (parsed.subjects !== undefined) out.subjects = parsed.subjects;
  if (parsed.changeNote !== undefined) out.changeNote = parsed.changeNote;
  return out;
}

/** SHA-256 (lower-case hex) of the canonical JSON of the normalized proposal. */
export function proposalDigest(proposal: NormalizedProposal): string {
  return createHash('sha256').update(canonicalJson(proposal)).digest('hex');
}

/** A create draft's owner is fixed at creation: the proposal must repeat it. The path is the field that differs. */
export function ownerImmutableErrors(
  draft: { ownerModelId: string | null; ownerSoftwareId: string | null },
  proposal: NormalizedProposal,
): FieldError[] {
  const errors: FieldError[] = [];
  if ((proposal.ownerModelId ?? null) !== draft.ownerModelId) errors.push({ path: ['proposal', 'ownerModelId'], code: 'immutable' });
  else if ((proposal.ownerSoftwareId ?? null) !== draft.ownerSoftwareId) errors.push({ path: ['proposal', 'ownerSoftwareId'], code: 'immutable' });
  return errors;
}

// ---- action inputs --------------------------------------------------------------------------------------------

export const DRAFT_INPUT_KEYS = {
  draftCreate: ['proposalType', 'targetItemId', 'proposal', 'validatorRef'],
  draftUpdate: ['id', 'proposal'],
  draftSubmit: ['id'],
  draftWithdraw: ['id', 'reason'],
} as const;
export type DraftOp = keyof typeof DRAFT_INPUT_KEYS;

const proposalType = z.enum(DRAFT_PROPOSAL_TYPES, { errorMap: (_i, ctx) => ({ message: ctx.data === undefined ? 'required' : 'malformed' }) });
/** Optional withdraw reason: absent, null or blank → null; otherwise trimmed (bounded: control characters `malformed`, over 500 `too_long`). */
const reason = bounded(DRAFT_REASON_MAX)
  .nullish()
  .transform((v) => (v === undefined || v === null || v.trim() === '' ? null : v.trim()));

/** Validator finding reference (#1198 c): the idempotency key of one finding. Every part trimmed, non-empty, at most 200 code points. */
export const VALIDATOR_REF_PART_MAX = 200;
export const VALIDATOR_REF_KEYS = ['sourceSystem', 'runId', 'findingId'] as const;
// An idempotency key part: no control character at all (review C4; `requiredText` alone lets C0/C1 controls other than NUL through).
// eslint-disable-next-line no-control-regex -- the class matches the control characters this key must refuse
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const refPart = requiredText(VALIDATOR_REF_PART_MAX).refine((v) => !CONTROL.test(v), { message: 'malformed' });
const validatorRefSchema = z
  .object({
    sourceSystem: refPart,
    runId: refPart,
    findingId: refPart,
  })
  .strict();
export type ValidatorRef = z.infer<typeof validatorRefSchema>;

/** Where a draft comes from, derived from the server's view of the caller only (never from input). */
export type DraftOrigin = 'human' | 'ai' | 'validator';
export function deriveOrigin(authKind: 'session' | 'token', actorType: string, hasValidatorRef: boolean): DraftOrigin {
  if (authKind === 'token' && actorType === 'system') return hasValidatorRef ? 'validator' : 'ai';
  return 'human';
}

const HEAD_SCHEMAS = {
  draftCreate: z.object({ proposalType, targetItemId: uuid.nullish(), proposal: z.unknown(), validatorRef: validatorRefSchema.optional() }),
  draftUpdate: z.object({ id: uuid, proposal: z.unknown() }),
  draftSubmit: z.object({ id: uuid }),
  draftWithdraw: z.object({ id: uuid, reason }),
} as const;

export type DraftInput<Op extends DraftOp> = z.infer<(typeof HEAD_SCHEMAS)[Op]>;

export type DraftParse<Op extends DraftOp> = { ok: true; value: DraftInput<Op> } | { ok: false; errors: FieldError[] };

/**
 * The head of an action (ids, type, reason). The proposal itself is judged by `parseProposal` once the type is known:
 * for `draftCreate` the type is in the input, for `draftUpdate` it is the stored draft's, so only the handler knows it;
 * `validateDraftInput` checks the proposal for a create (type given) and only its presence for an update.
 */
export function parseDraftHead<Op extends DraftOp>(op: Op, input: Record<string, unknown>): DraftParse<Op> {
  const parsed = HEAD_SCHEMAS[op].safeParse(input);
  return parsed.success ? { ok: true, value: parsed.data as DraftInput<Op> } : { ok: false, errors: fieldErrors(parsed.error) };
}

export function validateDraftInput(op: DraftOp, input: Record<string, unknown>): FieldError[] {
  const head = parseDraftHead(op, input);
  if (!head.ok) return head.errors;
  const errors: FieldError[] = [];
  if (op === 'draftCreate') {
    const value = head.value as DraftInput<'draftCreate'>;
    if (value.proposalType === 'create' && value.targetItemId !== undefined && value.targetItemId !== null) {
      errors.push({ path: ['targetItemId'], code: 'malformed' });
    }
    if (value.proposalType === 'revise' && (value.targetItemId === undefined || value.targetItemId === null)) {
      errors.push({ path: ['targetItemId'], code: 'required' });
    }
    const proposal = parseProposal(value.proposalType, value.proposal);
    if (!proposal.ok) errors.push(...proposal.errors);
  } else if (op === 'draftUpdate') {
    const value = head.value as DraftInput<'draftUpdate'>;
    if (value.proposal === undefined || value.proposal === null) errors.push({ path: ['proposal'], code: 'required' });
    else if (!isRecord(value.proposal)) errors.push({ path: ['proposal'], code: 'malformed' });
  }
  return errors;
}
