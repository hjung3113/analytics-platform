// Value checks and normalisation of the log dataset write actions (#1477 D-a, design log-test-datasets §6). Pure and DB-free: one zod
// schema per action, shared by the engine's `validate` and the handler's typed parse. What needs the database (the dataset row, its
// visibility, locks, the file check) is the handler's. Codes as the other modules: `required` (missing or wrong type), `too_long`,
// `malformed`, `too_many`, `duplicate`. A candidate holds data references only: no field of any action takes code or a shell command.

import { z } from 'zod';

import { bounded, clearableText, requiredText, uuid } from '../../../lib/input/fields.js';
import type { FieldError } from '../../menu-dispatch/types.js';
// The defining module, not the barrel: the barrel pulls the Source port wire schemas (runtime) into every importer, and EvidenceRef is pure.
import { type EvidenceRef, normalizeEvidenceRefs } from '../../log-explorer/domain/evidence-ref.js';
import { type SampleSet, parseSampleSet } from './sample-manifest.js';
import { SCENARIO_TAGS, SHARE_SCOPES } from './scenario-tags.js';

export const NAME_MAX = 200;
export const PURPOSE_MAX = 2000;
export const NOTE_MAX = 2000;
export const REASON_MAX = 2000;
export const MODEL_IDS_MAX = 50;
export const META_VALUE_MAX = 50;

const NON_TEXT = { required_error: 'required', invalid_type_error: 'malformed' } as const;
const enumOf = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values, { errorMap: (_i, ctx) => ({ message: ctx.data === undefined ? 'required' : 'malformed' }) });

const modelIds = z
  .array(uuid, NON_TEXT)
  .max(MODEL_IDS_MAX, { message: 'too_many' })
  .refine((ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length, { message: 'duplicate' })
  .transform((ids) => ids.map((id) => id.toLowerCase()));
const scenarioTags = z
  .array(enumOf(SCENARIO_TAGS), NON_TEXT)
  .refine((tags) => new Set(tags).size === tags.length, { message: 'duplicate' });
const shareScope = enumOf(SHARE_SCOPES);
const purpose = bounded(PURPOSE_MAX).transform((v) => v.trim());
/** Confirmed encoding / format only (design §3.2); an unknown key is refused so a guess cannot be stored. */
const inputMeta = z
  .object({ encoding: requiredText(META_VALUE_MAX).optional(), format: requiredText(META_VALUE_MAX).optional() })
  .strict({ message: 'malformed' });

export const DATASET_INPUT_SCHEMAS = {
  datasetCreate: z.object({
    name: requiredText(NAME_MAX),
    purpose: purpose.optional(),
    shareScope: shareScope.optional(),
    modelIds: modelIds.optional(),
    scenarioTags: scenarioTags.optional(),
    synthetic: z.boolean(NON_TEXT).optional(),
  }),
  datasetUpdate: z.object({
    id: uuid,
    name: requiredText(NAME_MAX).optional(),
    purpose: purpose.optional(),
    shareScope: shareScope.optional(),
    modelIds: modelIds.optional(),
    scenarioTags: scenarioTags.optional(),
  }),
  datasetArchive: z.object({ id: uuid }),
  revisionCreate: z.object({
    datasetId: uuid,
    sampleSet: z.unknown(),
    inputMeta: inputMeta.optional(),
    note: clearableText(NOTE_MAX),
  }),
  candidateCreate: z.object({
    origin: enumOf(['manual', 'round_evidence'] as const),
    roundId: uuid.optional(),
    evidenceRefs: z.unknown(),
    name: requiredText(NAME_MAX),
    purpose: purpose.optional(),
    modelIds: modelIds.optional(),
    scenarioTags: scenarioTags.optional(),
    sampleSet: z.unknown(),
    inputMeta: inputMeta.optional(),
    note: clearableText(NOTE_MAX),
  }),
  candidateDecide: z.object({
    id: uuid,
    decision: enumOf(['approve', 'reject'] as const),
    reason: clearableText(REASON_MAX),
  }),
} as const;

export type DatasetOp = keyof typeof DATASET_INPUT_SCHEMAS;
export type DatasetInput<Op extends DatasetOp> = z.infer<(typeof DATASET_INPUT_SCHEMAS)[Op]>;

export const DATASET_INPUT_KEYS = {
  datasetCreate: ['name', 'purpose', 'shareScope', 'modelIds', 'scenarioTags', 'synthetic'],
  datasetUpdate: ['id', 'name', 'purpose', 'shareScope', 'modelIds', 'scenarioTags'],
  datasetArchive: ['id'],
  revisionCreate: ['datasetId', 'sampleSet', 'inputMeta', 'note'],
  candidateCreate: ['origin', 'roundId', 'evidenceRefs', 'name', 'purpose', 'modelIds', 'scenarioTags', 'sampleSet', 'inputMeta', 'note'],
  candidateDecide: ['id', 'decision', 'reason'],
} as const satisfies Record<DatasetOp, readonly string[]>;

const KNOWN = ['required', 'too_long', 'malformed', 'too_many', 'duplicate'];
function fieldErrors(error: z.ZodError): FieldError[] {
  const seen = new Set<string>();
  const out: FieldError[] = [];
  for (const issue of error.issues) {
    const path = issue.path.map(String);
    const key = path.join('.');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ path, code: KNOWN.includes(issue.message) ? issue.message : 'required' });
  }
  return out;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: FieldError[] };

type WithSampleSet<Op extends DatasetOp> = Omit<DatasetInput<Op>, 'sampleSet'> & { sampleSet: SampleSet };
export type RevisionCreateInput = WithSampleSet<'revisionCreate'>;
export type CandidateCreateInput = Omit<WithSampleSet<'candidateCreate'>, 'evidenceRefs'> & { evidenceRefs: EvidenceRef[] };

const EVIDENCE_CODE = { not_object: 'malformed', too_many: 'too_many', duplicate: 'duplicate' } as const;

/** Parses one action's input: the zod fields, plus the sample set / evidence list parsers (their own paths and codes). */
export function parseDatasetInput(op: 'revisionCreate', input: Record<string, unknown>): ParseResult<RevisionCreateInput>;
export function parseDatasetInput(op: 'candidateCreate', input: Record<string, unknown>): ParseResult<CandidateCreateInput>;
export function parseDatasetInput<Op extends Exclude<DatasetOp, 'revisionCreate' | 'candidateCreate'>>(op: Op, input: Record<string, unknown>): ParseResult<DatasetInput<Op>>;
export function parseDatasetInput(op: DatasetOp, input: Record<string, unknown>): ParseResult<unknown> {
  const parsed = DATASET_INPUT_SCHEMAS[op].safeParse(input);
  if (op !== 'revisionCreate' && op !== 'candidateCreate') {
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, errors: fieldErrors(parsed.error) };
  }
  const errors = parsed.success ? [] : fieldErrors(parsed.error).filter((e) => e.path[0] !== 'sampleSet' && e.path[0] !== 'evidenceRefs');
  const set = parseSampleSet(input.sampleSet);
  if (!set.ok) errors.push(...set.errors);
  let evidence: EvidenceRef[] = [];
  if (op === 'candidateCreate') {
    const origin = input.origin;
    if (input.evidenceRefs !== undefined) {
      const refs = normalizeEvidenceRefs(input.evidenceRefs);
      if (!refs.ok) {
        const path = refs.index >= 0 ? ['evidenceRefs', String(refs.index)] : ['evidenceRefs'];
        errors.push({ path, code: refs.error in EVIDENCE_CODE ? EVIDENCE_CODE[refs.error as keyof typeof EVIDENCE_CODE] : 'malformed' });
      } else evidence = refs.value;
    }
    // A round-evidence candidate names its round and at least one evidence location; a manual one names neither.
    if (origin === 'round_evidence') {
      if (input.roundId === undefined) errors.push({ path: ['roundId'], code: 'required' });
      if (input.evidenceRefs === undefined || evidence.length === 0) errors.push({ path: ['evidenceRefs'], code: 'required' });
    } else if (origin === 'manual') {
      if (input.roundId !== undefined) errors.push({ path: ['roundId'], code: 'malformed' });
      if (evidence.length > 0) errors.push({ path: ['evidenceRefs'], code: 'malformed' });
    }
  }
  if (errors.length > 0 || !parsed.success || !set.ok) return { ok: false, errors };
  return { ok: true, value: { ...parsed.data, sampleSet: set.value, ...(op === 'candidateCreate' ? { evidenceRefs: evidence } : {}) } };
}

export function validateDatasetInput(op: DatasetOp, input: Record<string, unknown>): FieldError[] {
  const parsed = (parseDatasetInput as (op: DatasetOp, input: Record<string, unknown>) => ParseResult<unknown>)(op, input);
  if (parsed.ok && op === 'candidateDecide') {
    const v = parsed.value as DatasetInput<'candidateDecide'>;
    if (v.decision === 'reject' && (v.reason === undefined || v.reason === null)) return [{ path: ['reason'], code: 'required' }];
  }
  return parsed.ok ? [] : parsed.errors;
}
