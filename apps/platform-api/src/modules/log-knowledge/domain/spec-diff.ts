// The target keys one published revision touches relative to the previous one (#1196 c, design v0.6 §15.3). Pure.
// Compared by canonical row content (`canonicalJson`, the hash's own form), per target kind:
//   module   added / removed / name / parent differs
//   event    added / removed / name, triggerRule, detailDocRef or the field list differs
//   field    (`module/event#field`) added / removed / the stored field differs
//   relation added / removed / ruleRef differs
// Containment needs no extra rule: an added or removed module (or event) adds or removes its events, fields and
// relations as rows of its own, so every one of them is in the set.

import { canonicalJson, type HashEvent, type HashModule, type HashRelation } from './spec-hash.js';
import { buildTargetKey } from './spec-target-key.js';

export interface SpecRows {
  modules: HashModule[];
  events: HashEvent[];
  relations: HashRelation[];
}

const fieldsOf = (event: HashEvent): { name: string; canonical: string }[] =>
  (Array.isArray(event.fields) ? (event.fields as unknown[]) : []).map((f) => ({
    name: String((f as { name?: unknown } | null)?.name ?? ''),
    canonical: canonicalJson(f),
  }));

/** name → the canonical contents sharing it (a name should be unique, but a duplicate must still compare). */
function fieldsByName(event: HashEvent | undefined): Map<string, string> {
  const out = new Map<string, string[]>();
  for (const f of event ? fieldsOf(event) : []) out.set(f.name, [...(out.get(f.name) ?? []), f.canonical]);
  return new Map([...out].map(([name, list]) => [name, list.sort().join('\u0000')]));
}

function differing<T>(before: Map<string, T>, after: Map<string, T>, same: (a: T, b: T) => boolean): string[] {
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys].filter((k) => {
    const a = before.get(k);
    const b = after.get(k);
    return a === undefined || b === undefined || !same(a, b);
  });
}

export function touchedTargetKeys(previous: SpecRows, next: SpecRows): Set<string> {
  const out = new Set<string>();

  const modules = (rows: SpecRows) => new Map(rows.modules.map((m) => [buildTargetKey({ kind: 'module', module: m.key }), canonicalJson(m)]));
  for (const k of differing(modules(previous), modules(next), (a, b) => a === b)) out.add(k);

  const eventId = (e: HashEvent) => buildTargetKey({ kind: 'event', module: e.moduleKey, event: e.key });
  const eventsOf = (rows: SpecRows) => new Map(rows.events.map((e) => [eventId(e), e]));
  const before = eventsOf(previous);
  const after = eventsOf(next);
  for (const k of differing(before, after, (a, b) => canonicalJson({ ...a, fields: undefined }) === canonicalJson({ ...b, fields: undefined }) && canonicalJson(a.fields) === canonicalJson(b.fields))) {
    out.add(k);
  }
  for (const [key, event] of new Map([...before, ...after])) {
    const a = fieldsByName(before.get(key));
    const b = fieldsByName(after.get(key));
    for (const name of differing(a, b, (x, y) => x === y)) {
      out.add(buildTargetKey({ kind: 'field', module: event.moduleKey, event: event.key, field: name }));
    }
  }

  const relationId = (r: HashRelation) =>
    buildTargetKey({ kind: 'relation', sourceModule: r.sourceModule, sourceEvent: r.sourceEvent, predicate: r.predicate, targetModule: r.targetModule, targetEvent: r.targetEvent });
  const relationsOf = (rows: SpecRows) => new Map(rows.relations.map((r) => [relationId(r), r.ruleRef]));
  for (const k of differing(relationsOf(previous), relationsOf(next), (a, b) => a === b)) out.add(k);

  return out;
}

/** Every target key one revision holds, by kind (the add action judges `targetKey:not_found|already_exists` with it). */
export function targetKeysOf(rows: SpecRows): Record<'module' | 'event' | 'field' | 'relation', Set<string>> {
  const out = { module: new Set<string>(), event: new Set<string>(), field: new Set<string>(), relation: new Set<string>() };
  for (const m of rows.modules) out.module.add(buildTargetKey({ kind: 'module', module: m.key }));
  for (const e of rows.events) {
    out.event.add(buildTargetKey({ kind: 'event', module: e.moduleKey, event: e.key }));
    for (const f of fieldsOf(e)) out.field.add(buildTargetKey({ kind: 'field', module: e.moduleKey, event: e.key, field: f.name }));
  }
  for (const r of rows.relations) {
    out.relation.add(
      buildTargetKey({ kind: 'relation', sourceModule: r.sourceModule, sourceEvent: r.sourceEvent, predicate: r.predicate, targetModule: r.targetModule, targetEvent: r.targetEvent }),
    );
  }
  return out;
}
