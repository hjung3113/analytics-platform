// Value checks of the optional `relations[]` of the item writes (#1505 S-b, ADR-0125, design log-knowledge-search §3.1).
// An Item «Event 관계 기록» (EventRelationRecord) is a structured pair of events with a closed predicate, never parsed
// out of a sentence. Pure and DB-free. Events are pointed to by stable key (`module_key/event_key`, `toCodeKey` spelling,
// same grammar as the SW change targets and the Item subjects). `after` is NOT stored: `A after B` is the row
// `B before A` (ADR-0125 decision 2), so one stored direction answers both spellings.
// What only the database can judge (is the key in the owner's effective spec) is the repository's; an unknown key is
// stored as `resolved = false`, never refused.
// Codes: `required`, `malformed`, `too_long` (more than `ITEM_RELATIONS_MAX`), `duplicate` (the same kind, source,
// predicate and target twice, after the swap), `self_relation` (source and target are the same event).

import type { FieldError } from '../../menu-dispatch/types.js';
import { MODULE_EVENT_TARGET_SCHEMAS, isRecord, under } from './input-kit.js';
import { fieldErrors } from './spec-input.js';
import { TARGET_KEY_MAX, buildTargetKey } from './spec-target-key.js';

export const ITEM_RELATIONS_MAX = 20;
export const RELATION_KINDS = ['observed', 'expected'] as const;
export type RelationKind = (typeof RELATION_KINDS)[number];
/** Spellings of the input. */
export const RELATION_INPUT_PREDICATES = ['before', 'after'] as const;
/** Stored predicates (closed list; a new predicate is a new ADR). */
export const RELATION_PREDICATES = ['before'] as const;
export type RelationPredicate = (typeof RELATION_PREDICATES)[number];

export interface ItemRelationValue {
  kind: RelationKind;
  sourceKey: string;
  predicate: RelationPredicate;
  targetKey: string;
}

function eventKey(raw: unknown, at: string[], errors: FieldError[]): string | null {
  if (raw === undefined || raw === null) {
    errors.push({ path: at, code: 'required' });
    return null;
  }
  const parsed = isRecord(raw) ? MODULE_EVENT_TARGET_SCHEMAS.event.safeParse(raw) : null;
  if (!parsed?.success) {
    errors.push(...(parsed ? under(at, fieldErrors(parsed.error)) : [{ path: at, code: 'malformed' }]));
    return null;
  }
  const key = buildTargetKey({ kind: 'event', ...parsed.data });
  if (key.length > TARGET_KEY_MAX) {
    errors.push({ path: at, code: 'too_long' });
    return null;
  }
  return key;
}

/** `undefined` / `null` = the field was not sent (a revise then carries the previous revision's records). */
export function parseRelations(raw: unknown): { ok: true; value: ItemRelationValue[] | undefined } | { ok: false; errors: FieldError[] } {
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  if (!Array.isArray(raw)) return { ok: false, errors: [{ path: ['relations'], code: 'malformed' }] };
  if (raw.length > ITEM_RELATIONS_MAX) return { ok: false, errors: [{ path: ['relations'], code: 'too_long' }] };
  const errors: FieldError[] = [];
  const out: ItemRelationValue[] = [];
  const seen = new Set<string>();
  raw.forEach((entry, i) => {
    const at = ['relations', String(i)];
    if (!isRecord(entry)) {
      errors.push({ path: at, code: 'malformed' });
      return;
    }
    const before = errors.length;
    let kind: RelationKind | null = null;
    if (entry.kind === undefined || entry.kind === null) errors.push({ path: [...at, 'kind'], code: 'required' });
    else if (typeof entry.kind === 'string' && (RELATION_KINDS as readonly string[]).includes(entry.kind)) kind = entry.kind as RelationKind;
    else errors.push({ path: [...at, 'kind'], code: 'malformed' });
    let spelled: 'before' | 'after' = 'before';
    if (entry.predicate !== undefined && entry.predicate !== null) {
      if (typeof entry.predicate === 'string' && (RELATION_INPUT_PREDICATES as readonly string[]).includes(entry.predicate)) spelled = entry.predicate as 'before' | 'after';
      else errors.push({ path: [...at, 'predicate'], code: 'malformed' });
    }
    const source = eventKey(entry.source, [...at, 'source'], errors);
    const target = eventKey(entry.target, [...at, 'target'], errors);
    if (errors.length > before || kind === null || source === null || target === null) return;
    if (source === target) {
      errors.push({ path: [...at, 'target'], code: 'self_relation' });
      return;
    }
    // `after` is the same fact as `before` with the two events swapped: only `before` is stored.
    const value: ItemRelationValue = spelled === 'after' ? { kind, sourceKey: target, predicate: 'before', targetKey: source } : { kind, sourceKey: source, predicate: 'before', targetKey: target };
    const identity = [value.kind, value.sourceKey, value.predicate, value.targetKey].join('\u0000');
    if (seen.has(identity)) {
      errors.push({ path: at, code: 'duplicate' });
      return;
    }
    seen.add(identity);
    out.push(value);
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: out };
}
