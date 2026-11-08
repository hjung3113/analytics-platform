// The digest pinned on a suite run item for its baseline (#1479): sha256 of the canonical JSON of what the baseline expects. An approved
// baseline never changes (guard trigger), so the digest is the proof, in the run, of which expectations it was judged against.
// Canonical = keys sorted at every depth; the same content always hashes the same whatever order the database returns the keys in.

import { createHash } from 'node:crypto';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)]),
    );
  }
  return value;
}

export function baselineDigest(baseline: { profilePin: unknown; expectedScope: unknown; expectations: unknown }): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical({ profilePin: baseline.profilePin, expectedScope: baseline.expectedScope, expectations: baseline.expectations })), 'utf8')
    .digest('hex');
}
