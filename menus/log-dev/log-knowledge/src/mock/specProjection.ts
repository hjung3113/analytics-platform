import type { ModelSpecEffective, SpecChangeMark } from '../endpoints';
import { escapeKey, type Change, type Revision } from './specStore';

type Entry = { kind: Change['targetKind']; value: Record<string, unknown>; parent?: string };
const canonical = (v: unknown): string | undefined => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : `{${Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, value]) => `${JSON.stringify(k)}:${canonical(value)}`).join(',')}}`;
const same = (a: unknown, b: unknown): boolean => canonical(a ?? null) === canonical(b ?? null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const decodeKey = (s: string) => s.replace(/%23/g, '#').replace(/%2F/g, '/').replace(/%25/g, '%');
/** Body-only values keyed exactly as the server's stable target grammar. */
export function entries(base: Revision): Map<string, Entry> {
  const result = new Map<string, Entry>();
  const modules = new Map(base.modules.map(m => [m.id, m.moduleKey]));
  const events = new Map(base.events.map(e => [e.id, `${escapeKey(modules.get(e.moduleId)!)}/${escapeKey(e.eventKey)}`]));
  for (const m of base.modules) result.set(escapeKey(m.moduleKey), { kind: 'module', value: { name: m.name, parentModule: m.parentModuleId ? modules.get(m.parentModuleId) : null } });
  for (const e of base.events) {
    const k = events.get(e.id)!;
    result.set(k, { kind: 'event', parent: escapeKey(modules.get(e.moduleId)!), value: { name: e.name, triggerRule: e.triggerRule, detailDocRef: e.detailDocRef } });
    for (const f of (Array.isArray(e.fields) ? e.fields : []) as Record<string, unknown>[]) result.set(`${k}#${escapeKey(String(f.name))}`, { kind: 'field', parent: k, value: f });
  }
  for (const r of base.relations) result.set(`${events.get(r.sourceEventId)}#${escapeKey(r.predicate)}#${events.get(r.targetEventId)}`, { kind: 'relation', value: { ruleRef: r.ruleRef } });
  return result;
}
export function project(base: Revision, changes: Change[]): Omit<ModelSpecEffective, 'revision' | 'effective' | 'softwareId'> {
  const original = entries(base);
  // Copies: the revision snapshot below must never observe an applied change (`before` compares against it).
  const applied = new Map<string, Entry>([...original].map(([k, e]) => [k, { ...e, value: structuredClone(e.value) }]));
  const marks = new Map<string, (SpecChangeMark & { needsRevalidation: boolean })[]>();
  const stale: ModelSpecEffective['stale'] = [], removed: ModelSpecEffective['removed'] = [];
  const mark = (key: string, c: Change) => {
    const list = marks.get(key) ?? [];
    list.push({ changeId: c.id, changeKind: c.changeKind, targetKind: c.targetKind, targetKey: c.targetKey, needsRevalidation: c.needsRevalidation });
    marks.set(key, list);
  };
  // Relationship identities: revision relations keep their row ids and endpoint ids; added relations resolve theirs.
  const moduleKeys = new Map(base.modules.map(m => [m.id, m.moduleKey]));
  const eventKeys = new Map(base.events.map(e => [e.id, `${escapeKey(moduleKeys.get(e.moduleId)!)}/${escapeKey(e.eventKey)}`]));
  const eventIdByKey = new Map<string, string>(base.events.map(e => [eventKeys.get(e.id)!, e.id]));
  const baseRelations = new Map<string, Revision['relations'][number]>(base.relations
    .filter(r => eventKeys.has(r.sourceEventId) && eventKeys.has(r.targetEventId))
    .map(r => [`${eventKeys.get(r.sourceEventId)}#${escapeKey(r.predicate)}#${eventKeys.get(r.targetEventId)}`, r]));

  for (const c of changes) {
    const flagged = { changeId: c.id, changeKind: c.changeKind, targetKind: c.targetKind, targetKey: c.targetKey, needsRevalidation: c.needsRevalidation };
    const fail = (reason: 'exists' | 'gone' | 'before_mismatch' | 'parent_missing' | 'malformed') => stale.push({ ...flagged, reason });
    const k = c.targetKey, cur = applied.get(k), rev = original.get(k);
    const after = (c.change.after ?? null) as Record<string, unknown> | null;
    const before = (c.change.before ?? null) as Record<string, unknown> | null;
    const afterName = str(after?.['name']);

    if (c.targetKind === 'module') {
      if (c.changeKind === 'added') {
        if (rev) { fail('exists'); continue; }
        if (!afterName) { fail('malformed'); continue; }
        const parent = str(after?.['parentModule']);
        if (parent !== null && !applied.has(escapeKey(parent))) { fail('parent_missing'); continue; }
        applied.set(k, { kind: 'module', value: structuredClone(after!) });
        mark(k, c);
        continue;
      }
      if (!rev || !cur) { fail('gone'); continue; }
      if (c.changeKind === 'removed') { applied.delete(k); removed.push(flagged); continue; }
      if (c.changeKind === 'changed') {
        if (!before || !after || !afterName) { fail('malformed'); continue; }
        if (!same({ name: rev.value['name'], parentModule: str(rev.value['parentModule']) }, { name: before['name'], parentModule: str(before['parentModule']) })) { fail('before_mismatch'); continue; }
        applied.set(k, { kind: 'module', value: structuredClone(after) });
      }
      mark(k, c);
      continue;
    }

    if (c.targetKind === 'event') {
      const moduleKey = k.split('/')[0] ?? '';
      if (c.changeKind === 'added') {
        if (rev) { fail('exists'); continue; }
        if (!afterName) { fail('malformed'); continue; }
        if (!applied.has(moduleKey)) { fail('parent_missing'); continue; }
        applied.set(k, { kind: 'event', parent: moduleKey, value: structuredClone(after!) });
        mark(k, c);
        continue;
      }
      if (!rev || !cur) { fail('gone'); continue; }
      if (c.changeKind === 'removed') { applied.delete(k); removed.push(flagged); continue; }
      if (c.changeKind === 'changed') {
        if (!before || !after || !afterName) { fail('malformed'); continue; }
        if (!same(rev.value, { name: before['name'], triggerRule: before['triggerRule'] ?? null, detailDocRef: before['detailDocRef'] ?? null })) { fail('before_mismatch'); continue; }
        applied.set(k, { kind: 'event', parent: moduleKey, value: structuredClone(after) });
      }
      mark(k, c);
      continue;
    }

    if (c.targetKind === 'field') {
      const eventKey = k.split('#')[0] ?? '', field = decodeKey(k.split('#')[1] ?? '');
      // The revision stores each field as its own entry; the owning Event's entry carries no field list.
      const revField = original.get(`${eventKey}#${escapeKey(field)}`)?.value;
      const event = applied.get(eventKey);
      if (!event) { fail(c.changeKind === 'added' ? 'parent_missing' : 'gone'); continue; }
      if (c.changeKind === 'added') {
        if (revField) { fail('exists'); continue; }
        if (!after || after['name'] !== field) { fail('malformed'); continue; }
        applied.set(k, { kind: 'field', parent: eventKey, value: structuredClone(after) });
        mark(k, c);
        continue;
      }
      if (!revField) { fail('gone'); continue; }
      if (c.changeKind === 'removed') {
        applied.delete(k);
        removed.push(flagged);
        mark(k, c); // the owning Event carries the mark, like the server's composition
        continue;
      }
      if (c.changeKind === 'changed') {
        if (!before || !after || after['name'] !== field) { fail('malformed'); continue; }
        if (!same(revField, before)) { fail('before_mismatch'); continue; }
        applied.set(k, { kind: 'field', parent: eventKey, value: structuredClone(after) });
      }
      mark(k, c);
      continue;
    }

    // relation
    if (c.changeKind === 'added') {
      if (rev) { fail('exists'); continue; }
      const [source = '', , target = ''] = k.split('#');
      const sourceEvent = applied.get(source), targetEvent = applied.get(target);
      if (!sourceEvent || !targetEvent || sourceEvent.kind !== 'event' || targetEvent.kind !== 'event') { fail('parent_missing'); continue; }
      if (!after) { fail('malformed'); continue; }
      applied.set(k, { kind: 'relation', value: structuredClone(after) });
      mark(k, c);
      continue;
    }
    if (!rev || !cur) { fail('gone'); continue; }
    if (c.changeKind === 'removed') { applied.delete(k); removed.push(flagged); continue; }
    if (c.changeKind === 'changed') {
      if (!before || !after) { fail('malformed'); continue; }
      if (!same({ ruleRef: rev.value['ruleRef'] ?? null }, { ruleRef: str(before['ruleRef']) })) { fail('before_mismatch'); continue; }
      applied.set(k, { kind: 'relation', value: structuredClone(after) });
    }
    mark(k, c);
  }

  const marked = (k: string) => ({ origin: original.has(k) ? 'revision' as const : 'change' as const, changed: (marks.get(k) ?? []).map(m => ({ changeId: m.changeId, changeKind: m.changeKind, targetKind: m.targetKind, targetKey: m.targetKey })), needsRevalidation: (marks.get(k) ?? []).some(m => m.needsRevalidation) });
  const modules: ModelSpecEffective['modules'] = [], events: ModelSpecEffective['events'] = [], relations: ModelSpecEffective['relations'] = [];
  for (const [k, e] of applied) {
    if (e.kind === 'module') {
      const old = base.modules.find(m => escapeKey(m.moduleKey) === k);
      modules.push({ id: old?.id ?? null, moduleKey: decodeKey(k), name: String(e.value.name), parentModuleId: old?.parentModuleId ?? null, parentModuleKey: e.value.parentModule == null ? null : String(e.value.parentModule), ...marked(k) });
    } else if (e.kind === 'event') {
      const [m, ev] = k.split('/').map(decodeKey);
      const old = base.events.find(v => v.eventKey === ev && base.modules.find(mod => mod.id === v.moduleId)?.moduleKey === m);
      const fields = [...applied].filter(([fk, f]) => f.kind === 'field' && fk.startsWith(`${k}#`)).map(([, f]) => f.value);
      const fieldMarks = [...marks].filter(([fk]) => fk.startsWith(`${k}#`)).flatMap(([, list]) => list);
      const own = marked(k);
      events.push({ id: old?.id ?? null, moduleId: old?.moduleId ?? null, moduleKey: m!, eventKey: ev!, name: String(e.value.name), fields, triggerRule: e.value.triggerRule == null ? null : String(e.value.triggerRule), detailDocRef: e.value.detailDocRef == null ? null : String(e.value.detailDocRef), ...own, changed: [...own.changed, ...fieldMarks.map(mark => ({ changeId: mark.changeId, changeKind: mark.changeKind, targetKind: mark.targetKind, targetKey: mark.targetKey }))], needsRevalidation: own.needsRevalidation || fieldMarks.some(mark => mark.needsRevalidation) });
    } else if (e.kind === 'relation') {
      const [source = '', predicate = '', target = ''] = k.split('#');
      const [sm, se] = source.split('/').map(decodeKey), [tm, te] = target.split('/').map(decodeKey);
      const row = original.has(k) ? baseRelations.get(k) : undefined;
      relations.push({
        id: row?.id ?? null,
        sourceEventId: row ? row.sourceEventId : eventIdByKey.get(source) ?? null,
        targetEventId: row ? row.targetEventId : eventIdByKey.get(target) ?? null,
        sourceModuleKey: sm!, sourceEventKey: se!, predicate: decodeKey(predicate!), targetModuleKey: tm!, targetEventKey: te!,
        ruleRef: e.value.ruleRef == null ? null : String(e.value.ruleRef), ...marked(k),
      });
    }
  }
  return { modules, events, relations, stale, removed };
}
