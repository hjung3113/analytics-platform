// The key of a spec requirement (log-rules R-c, #1493): `moduleKey` for a module, `moduleKey/eventKey` for an event.
// Pure. The segments are the stored stable keys of the effective spec, used as they are (no case folding, no trimming).
// A stored key may contain `/` (NFKC turns a fullwidth solidus into `/`, and nothing else forbids it), which would make
// `a/b/c` ambiguous; the read port refuses such a spec instead of guessing (`ambiguous_key`).

export const REQUIREMENT_KEY_SEPARATOR = '/';

export interface ParsedRequirementKey {
  kind: 'module' | 'event';
  moduleKey: string;
  eventKey?: string;
}

/** True when a module or event key can be told apart inside a requirement key. */
export const isUnambiguousSegment = (segment: string): boolean => segment.length > 0 && !segment.includes(REQUIREMENT_KEY_SEPARATOR);

/** Throws on a segment that is empty or contains `/`: callers check `isUnambiguousSegment` at the port boundary first. */
export function requirementKey(moduleKey: string, eventKey?: string): string {
  if (!isUnambiguousSegment(moduleKey) || (eventKey !== undefined && !isUnambiguousSegment(eventKey))) {
    throw new Error('requirement key segment is empty or contains "/"');
  }
  return eventKey === undefined ? moduleKey : `${moduleKey}${REQUIREMENT_KEY_SEPARATOR}${eventKey}`;
}

/** The inverse of `requirementKey`; null for an empty key, an empty segment or more than one `/`. */
export function parseRequirementKey(key: string): ParsedRequirementKey | null {
  const parts = key.split(REQUIREMENT_KEY_SEPARATOR);
  if (parts.length === 1) return parts[0] ? { kind: 'module', moduleKey: parts[0] } : null;
  if (parts.length === 2 && parts[0] && parts[1]) return { kind: 'event', moduleKey: parts[0], eventKey: parts[1] };
  return null;
}
