// The baseline state machine (design log-test-datasets §3.3): `draft -> approved -> superseded`, nothing else. A draft is editable;
// an approved or superseded baseline never changes its content. Mirrors the database guard trigger (`expected_baseline_guard`), which
// stays the wall; this is the judgment the actions take first so a refusal is a field error, not a constraint failure. Pure.

import { createHash } from 'node:crypto';

export const BASELINE_STATUSES = ['draft', 'approved', 'superseded'] as const;
export type BaselineStatus = (typeof BASELINE_STATUSES)[number];

const NEXT: Readonly<Record<BaselineStatus, readonly BaselineStatus[]>> = {
  draft: ['approved'],
  approved: ['superseded'],
  superseded: [],
};

export const canTransition = (from: BaselineStatus, to: BaselineStatus): boolean => NEXT[from].includes(to);
export const isEditable = (status: BaselineStatus): boolean => status === 'draft';

/** JSON with object keys sorted, so equal content has one spelling (and one digest). */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export interface BaselineContent {
  profilePin: unknown;
  expectedScope: unknown;
  expectations: unknown;
  parserGoldenRef: unknown;
}

/** SHA-256 hex of the content a baseline holds; the audit/event record carries it instead of the content. */
export const contentDigest = (content: BaselineContent): string =>
  createHash('sha256')
    .update(
      stableStringify({
        profilePin: content.profilePin ?? {},
        expectedScope: content.expectedScope ?? [],
        expectations: content.expectations ?? [],
        parserGoldenRef: content.parserGoldenRef ?? null,
      }),
      'utf8',
    )
    .digest('hex');

const count = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

/** What an event stores of a baseline: names, numbers and a digest, never the expectations themselves. */
export interface BaselineSnapshot {
  status: BaselineStatus;
  seq: number;
  expectationCount: number;
  scopeCount: number;
  digest: string;
}

export function snapshotOf(row: BaselineContent & { status: string; seq: number }): BaselineSnapshot {
  return {
    status: row.status as BaselineStatus,
    seq: row.seq,
    expectationCount: count(row.expectations),
    scopeCount: count(row.expectedScope),
    digest: contentDigest(row),
  };
}
