// What an import row does at apply time (#1195 b, design v0.6 §6.2 ④–⑤). Pure: the per-row decision from the
// plan state and the resolution, the canonical row hash the seal binds, the apply counts and the job's final
// status. No database here.
//
// Precedence of `decideRow` (the decision table): `error`/`pending` → excluded (even with a skip), then a `skip`
// resolution → skipped, then by plan state: `unchanged` → unchanged, `update` → update, `new` → create (or map),
// `conflict` → map when resolved so, else unresolved.

import { createHash } from 'node:crypto';

import type { ImportEntity } from './import-mapping.js';
import type { PlanState } from './import-plan.js';

export const RESOLUTIONS = ['skip', 'map', 'create'] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

/** Row outcomes. `failed` is retried by the next pass; every other value is final. */
export const APPLY_STATUSES = [
  'applied',
  'unchanged',
  'skipped',
  'excluded',
  'unresolved',
  'conflict',
  'failed',
] as const;
export type ApplyStatus = (typeof APPLY_STATUSES)[number];
export const FINAL_APPLY_STATUSES: readonly ApplyStatus[] = [
  'applied',
  'unchanged',
  'skipped',
  'excluded',
  'unresolved',
  'conflict',
];
export const isFinalApplyStatus = (status: string | null): boolean =>
  status !== null && (FINAL_APPLY_STATUSES as readonly string[]).includes(status);

export interface ResolutionInput {
  resolution: Resolution;
  mapTargetId: string | null;
  expectedTargetVersion: number | null;
}

export interface DecisionInput {
  planState: PlanState;
  targetId: string | null;
  targetVersion: number | null;
  resolution: ResolutionInput | null;
}

export type ApplyAction =
  | { kind: 'final'; status: 'excluded' | 'unresolved' | 'skipped' | 'unchanged' }
  | { kind: 'create' }
  | { kind: 'update'; targetId: string; expectedVersion: number }
  | { kind: 'map'; targetId: string; expectedVersion: number };

export function decideRow(input: DecisionInput): ApplyAction {
  const { planState, resolution } = input;
  if (planState === 'error' || planState === 'pending') return { kind: 'final', status: 'excluded' };
  if (resolution?.resolution === 'skip') return { kind: 'final', status: 'skipped' };
  if (planState === 'unchanged') return { kind: 'final', status: 'unchanged' };
  if (planState === 'update') {
    if (input.targetId === null || input.targetVersion === null) return { kind: 'final', status: 'excluded' };
    return { kind: 'update', targetId: input.targetId, expectedVersion: input.targetVersion };
  }
  const mapped =
    resolution?.resolution === 'map' && resolution.mapTargetId !== null && resolution.expectedTargetVersion !== null
      ? ({ kind: 'map', targetId: resolution.mapTargetId, expectedVersion: resolution.expectedTargetVersion } as const)
      : null;
  if (planState === 'new') return mapped ?? { kind: 'create' };
  // conflict: only a map resolution lets it through; anything else stays unresolved.
  return mapped ?? { kind: 'final', status: 'unresolved' };
}

/** JSON with object keys sorted at every depth, so equal values hash equal. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

export interface HashInput {
  rowNo: number;
  normalized: unknown;
  planState: PlanState;
  targetId: string | null;
  targetVersion: number | null;
  resolution: ResolutionInput | null;
}

/** sha256 of the canonical JSON of everything the apply of one row depends on. */
export const rowPlanHash = (input: HashInput): string =>
  sha256(
    canonicalJson({
      rowNo: input.rowNo,
      normalized: input.normalized ?? null,
      planState: input.planState,
      targetId: input.targetId,
      targetVersion: input.targetVersion,
      resolution: input.resolution?.resolution ?? null,
      mapTargetId: input.resolution?.mapTargetId ?? null,
      expectedTargetVersion: input.resolution?.expectedTargetVersion ?? null,
    }),
  );

/** The job's seal: sha256 of the row hashes, joined in `row_no` order. */
export const sealHash = (rowHashesInRowNoOrder: readonly string[]): string => sha256(rowHashesInRowNoOrder.join('\n'));

export type ApplyCounts = Record<ApplyStatus | 'remaining', number>;
export const emptyApplyCounts = (): ApplyCounts => ({
  applied: 0,
  unchanged: 0,
  skipped: 0,
  excluded: 0,
  unresolved: 0,
  conflict: 0,
  failed: 0,
  remaining: 0,
});

/** `completed` when no row ended `failed` or `conflict`, else `partial_failure`. */
export const finalJobStatus = (counts: Readonly<ApplyCounts>): 'completed' | 'partial_failure' =>
  counts.failed + counts.conflict === 0 ? 'completed' : 'partial_failure';

/**
 * The `external_identity_map.external_key` of a row: a JSON array of its comparison keys, parents first, so two
 * valid rows never share a key and no separator can collide (vendor/process `[code]`, model `[vendor, code]`,
 * software `[vendor, model, version]`).
 */
export function identityKey(entity: ImportEntity, normalized: unknown): string {
  const n = normalized as Record<string, string>;
  if (entity === 'vendor' || entity === 'process') return JSON.stringify([n.codeKey]);
  if (entity === 'model') return JSON.stringify([n.vendorKey, n.codeKey]);
  return JSON.stringify([n.vendorKey, n.modelKey, n.versionKey]);
}
