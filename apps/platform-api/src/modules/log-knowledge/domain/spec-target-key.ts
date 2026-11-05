// The stable target key of a spec change row (`knowledge.spec_sw_change.target_key`, design v0.6 §15.2, #1196 c).
// Pure. Each segment (module key, event key, field name, predicate) is escaped (`%` → `%25`, `/` → `%2F`,
// `#` → `%23`) and the segments are joined: event = `module/event`, field = `module/event#field`,
// relation = `sourceModule/sourceEvent#predicate#targetModule/targetEvent`. Keys come from `toCodeKey` (free text up
// to 200 characters), so the escape is what keeps the grammar unambiguous. The internal `qualifiedKey` of
// `spec-input.ts` (`\u0000`/`\u0001` separators) is NOT a stored key and is never used here.

export const SPEC_TARGET_KINDS = ['module', 'event', 'field', 'relation'] as const;
export type SpecTargetKind = (typeof SPEC_TARGET_KINDS)[number];

export type SpecTargetRef =
  | { kind: 'module'; module: string }
  | { kind: 'event'; module: string; event: string }
  | { kind: 'field'; module: string; event: string; field: string }
  | { kind: 'relation'; sourceModule: string; sourceEvent: string; predicate: string; targetModule: string; targetEvent: string };

/** Longest stored key (checked by the table); a relation of two long events would overflow it, so it is capped. */
export const TARGET_KEY_MAX = 1200;

export const escapeSegment = (value: string): string => value.replace(/%/gu, '%25').replace(/\//gu, '%2F').replace(/#/gu, '%23');
export const unescapeSegment = (value: string): string => value.replace(/%23/gu, '#').replace(/%2F/gu, '/').replace(/%25/gu, '%');

const eventKey = (module: string, event: string): string => `${escapeSegment(module)}/${escapeSegment(event)}`;

export function buildTargetKey(ref: SpecTargetRef): string {
  switch (ref.kind) {
    case 'module':
      return escapeSegment(ref.module);
    case 'event':
      return eventKey(ref.module, ref.event);
    case 'field':
      return `${eventKey(ref.module, ref.event)}#${escapeSegment(ref.field)}`;
    case 'relation':
      return `${eventKey(ref.sourceModule, ref.sourceEvent)}#${escapeSegment(ref.predicate)}#${eventKey(ref.targetModule, ref.targetEvent)}`;
  }
}

/** The ref a key spells for `kind`; null when the key is not of that kind's shape (a raw `/` or `#` out of place). */
export function parseTargetKey(kind: SpecTargetKind, key: string): SpecTargetRef | null {
  if (key === '' || key.length > TARGET_KEY_MAX) return null;
  const parts = key.split('#');
  const pair = (text: string | undefined): [string, string] | null => {
    const bits = (text ?? '').split('/');
    const [m, e] = bits;
    if (bits.length !== 2 || !m || !e) return null;
    return [unescapeSegment(m), unescapeSegment(e)];
  };
  switch (kind) {
    case 'module':
      return parts.length === 1 && !key.includes('/') ? { kind, module: unescapeSegment(key) } : null;
    case 'event': {
      const ev = parts.length === 1 ? pair(key) : null;
      return ev ? { kind, module: ev[0], event: ev[1] } : null;
    }
    case 'field': {
      const ev = parts.length === 2 ? pair(parts[0]) : null;
      return ev && parts[1] ? { kind, module: ev[0], event: ev[1], field: unescapeSegment(parts[1]) } : null;
    }
    case 'relation': {
      const s = parts.length === 3 ? pair(parts[0]) : null;
      const t = parts.length === 3 ? pair(parts[2]) : null;
      return s && t && parts[1] ? { kind, sourceModule: s[0], sourceEvent: s[1], predicate: unescapeSegment(parts[1]), targetModule: t[0], targetEvent: t[1] } : null;
    }
  }
}
