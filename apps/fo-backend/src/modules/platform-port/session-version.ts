import { createHash } from 'node:crypto';

/** JSON with object keys sorted at every depth, so equal values serialize equally. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Hex SHA-256 of the canonical `session`: changes iff user, permissions or scopes change. */
export function sessionVersionOf(session: unknown): string {
  return createHash('sha256').update(canonicalJson(session)).digest('hex');
}
