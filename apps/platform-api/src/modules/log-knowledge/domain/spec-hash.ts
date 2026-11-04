// The canonical content hash of a model spec revision (#1196 b1, design v0.6 §15.5). Pure. Input is the STORED rows of
// one revision (names already normalised at save, keys from `toCodeKey`); the output is the SHA-256 of a versioned
// canonical JSON: object keys sorted, modules sorted by `module_key`, events by `(module_key, event_key)`,
// relations by the qualified tuple. `source_doc_ref` is NOT part of it (the same content under a new `docVersion`
// is `unchanged`); `schema_version` is. Row ids and row order never matter.

import { createHash } from 'node:crypto';

/** Bumped when this canonical form changes; part of the hashed text. */
export const SPEC_HASH_VERSION = 1;

export interface HashModule {
  key: string;
  name: string;
  parentKey: string | null;
}
export interface HashEvent {
  moduleKey: string;
  key: string;
  name: string;
  fields: unknown;
  triggerRule: string | null;
  detailDocRef: string | null;
}
export interface HashRelation {
  sourceModule: string;
  sourceEvent: string;
  predicate: string;
  targetModule: string;
  targetEvent: string;
  ruleRef: string | null;
}

/** JSON with every object's keys sorted (arrays keep their order). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function canonicalSpecText(
  schemaVersion: number,
  rows: { modules: HashModule[]; events: HashEvent[]; relations: HashRelation[] },
): string {
  return canonicalJson({
    hashVersion: SPEC_HASH_VERSION,
    schemaVersion,
    modules: [...rows.modules].sort((a, b) => cmp(a.key, b.key)),
    events: [...rows.events].sort((a, b) => cmp(a.moduleKey, b.moduleKey) || cmp(a.key, b.key)),
    relations: [...rows.relations].sort(
      (a, b) =>
        cmp(a.sourceModule, b.sourceModule) ||
        cmp(a.sourceEvent, b.sourceEvent) ||
        cmp(a.predicate, b.predicate) ||
        cmp(a.targetModule, b.targetModule) ||
        cmp(a.targetEvent, b.targetEvent),
    ),
  });
}

export function specContentHash(
  schemaVersion: number,
  rows: { modules: HashModule[]; events: HashEvent[]; relations: HashRelation[] },
): string {
  return createHash('sha256').update(canonicalSpecText(schemaVersion, rows), 'utf8').digest('hex');
}
