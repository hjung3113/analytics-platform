// The effective spec of a model for one software version (#1196 c, design v0.6 §15.3). Pure: the published
// revision's content plus the changes that apply to the version, already selected and ordered by the caller
// (`(release_order, created_at, id)`), become one content with every touched entry marked.
//
// Rules per `change_kind` (`change_json` v1: added {after}, removed {before}, changed {before, after}, behavior {}):
//   added     the key must NOT exist in the revision (else stale `exists`); the entry is created (`origin: 'change'`).
//   removed   the key must exist (else stale `gone`); the entry disappears (listed in `removed`); children are not cascaded.
//   changed   the key must exist (else `gone`) and `before` must equal the revision's values (else `before_mismatch`);
//             the entry takes `after`. A field change replaces that field inside its event's `fields`.
//   behavior  the key must exist (else `gone`); a note only, the entry's content is unchanged but it is marked.
// A stale change is NOT applied; it is reported in `stale`. Comparison is against the REVISION, not against earlier
// changes of the same call. An added event needs its module, an added field its event, an added relation both events
// (else stale `parent_missing`).

import { canonicalJson } from './spec-hash.js';
import { buildTargetKey, parseTargetKey, type SpecTargetKind } from './spec-target-key.js';

export type SpecChangeKind = 'added' | 'removed' | 'changed' | 'behavior';

export interface EffectiveChange {
  id: string;
  targetKind: SpecTargetKind;
  targetKey: string;
  changeKind: SpecChangeKind;
  /** `change_json`: `{after?, before?}`. */
  change: Record<string, unknown>;
  needsRevalidation: boolean;
}

export interface SpecBaseContent {
  modules: { id: string; moduleKey: string; name: string; parentModuleId: string | null }[];
  events: { id: string; moduleId: string; eventKey: string; name: string; fields: unknown; triggerRule: string | null; detailDocRef: string | null }[];
  relations: { id: string; sourceEventId: string; predicate: string; targetEventId: string; ruleRef: string | null }[];
}

export interface ChangeMark {
  changeId: string;
  changeKind: SpecChangeKind;
  targetKind: SpecTargetKind;
  targetKey: string;
}
interface Marked {
  origin: 'revision' | 'change';
  changed: ChangeMark[];
  needsRevalidation: boolean;
}
export interface EffectiveModule extends Marked {
  id: string | null;
  moduleKey: string;
  name: string;
  parentModuleId: string | null;
  parentModuleKey: string | null;
}
export interface EffectiveEvent extends Marked {
  id: string | null;
  moduleId: string | null;
  moduleKey: string;
  eventKey: string;
  name: string;
  fields: unknown;
  triggerRule: string | null;
  detailDocRef: string | null;
}
export interface EffectiveRelation extends Marked {
  id: string | null;
  sourceEventId: string | null;
  targetEventId: string | null;
  sourceModuleKey: string;
  sourceEventKey: string;
  predicate: string;
  targetModuleKey: string;
  targetEventKey: string;
  ruleRef: string | null;
}

export type StaleReason = 'exists' | 'gone' | 'before_mismatch' | 'parent_missing' | 'malformed';
export interface StaleChange extends ChangeMark {
  reason: StaleReason;
  needsRevalidation: boolean;
}
export interface RemovedTarget extends ChangeMark {
  needsRevalidation: boolean;
}

export interface EffectiveSpec {
  modules: EffectiveModule[];
  events: EffectiveEvent[];
  relations: EffectiveRelation[];
  stale: StaleChange[];
  removed: RemovedTarget[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const same = (a: unknown, b: unknown): boolean => canonicalJson(a ?? null) === canonicalJson(b ?? null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

export function applySpecChanges(base: SpecBaseContent, changes: readonly EffectiveChange[]): EffectiveSpec {
  const moduleKeyById = new Map(base.modules.map((m) => [m.id, m.moduleKey]));
  const eventRefById = new Map(base.events.map((e) => [e.id, { moduleKey: moduleKeyById.get(e.moduleId) ?? '', eventKey: e.eventKey }]));

  const modules = new Map<string, EffectiveModule>();
  for (const m of base.modules) {
    modules.set(buildTargetKey({ kind: 'module', module: m.moduleKey }), {
      id: m.id, moduleKey: m.moduleKey, name: m.name, parentModuleId: m.parentModuleId,
      parentModuleKey: m.parentModuleId === null ? null : (moduleKeyById.get(m.parentModuleId) ?? null),
      origin: 'revision', changed: [], needsRevalidation: false,
    });
  }
  const events = new Map<string, EffectiveEvent>();
  for (const e of base.events) {
    const moduleKey = moduleKeyById.get(e.moduleId) ?? '';
    events.set(buildTargetKey({ kind: 'event', module: moduleKey, event: e.eventKey }), {
      id: e.id, moduleId: e.moduleId, moduleKey, eventKey: e.eventKey, name: e.name, fields: e.fields,
      triggerRule: e.triggerRule, detailDocRef: e.detailDocRef, origin: 'revision', changed: [], needsRevalidation: false,
    });
  }
  const relations = new Map<string, EffectiveRelation>();
  for (const r of base.relations) {
    const s = eventRefById.get(r.sourceEventId);
    const t = eventRefById.get(r.targetEventId);
    if (!s || !t) continue;
    relations.set(
      buildTargetKey({ kind: 'relation', sourceModule: s.moduleKey, sourceEvent: s.eventKey, predicate: r.predicate, targetModule: t.moduleKey, targetEvent: t.eventKey }),
      {
        id: r.id, sourceEventId: r.sourceEventId, targetEventId: r.targetEventId, sourceModuleKey: s.moduleKey, sourceEventKey: s.eventKey,
        predicate: r.predicate, targetModuleKey: t.moduleKey, targetEventKey: t.eventKey, ruleRef: r.ruleRef, origin: 'revision', changed: [], needsRevalidation: false,
      },
    );
  }
  // The revision as it was published: comparisons for `before` and existence look here, never at earlier changes.
  const revision = {
    modules: new Map([...modules].map(([k, v]) => [k, { ...v }])),
    events: new Map([...events].map(([k, v]) => [k, { ...v }])),
    relations: new Map([...relations].map(([k, v]) => [k, { ...v }])),
  };

  const stale: StaleChange[] = [];
  const removed: RemovedTarget[] = [];

  const mark = (entry: Marked, c: EffectiveChange) => {
    entry.changed.push({ changeId: c.id, changeKind: c.changeKind, targetKind: c.targetKind, targetKey: c.targetKey });
    entry.needsRevalidation ||= c.needsRevalidation;
  };
  const markOf = (c: EffectiveChange): ChangeMark => ({ changeId: c.id, changeKind: c.changeKind, targetKind: c.targetKind, targetKey: c.targetKey });

  for (const c of changes) {
    const after = isRecord(c.change.after) ? c.change.after : null;
    const before = isRecord(c.change.before) ? c.change.before : null;
    const fail = (reason: StaleReason) => stale.push({ ...markOf(c), reason, needsRevalidation: c.needsRevalidation });
    const ref = parseTargetKey(c.targetKind, c.targetKey);
    if (!ref) {
      fail('malformed');
      continue;
    }

    if (ref.kind === 'module') {
      const cur = modules.get(c.targetKey);
      const rev = revision.modules.get(c.targetKey);
      if (c.changeKind === 'added') {
        if (rev) fail('exists');
        else if (!after || str(after.name) === null) fail('malformed');
        else {
          const parent = str(after.parentModule);
          if (parent !== null && !modules.has(buildTargetKey({ kind: 'module', module: parent }))) fail('parent_missing');
          else {
            const entry: EffectiveModule = {
              id: null, moduleKey: ref.module, name: str(after.name) ?? '', parentModuleId: null, parentModuleKey: parent,
              origin: 'change', changed: [], needsRevalidation: false,
            };
            mark(entry, c);
            modules.set(c.targetKey, entry);
          }
        }
        continue;
      }
      if (!rev || !cur) { fail('gone'); continue; }
      if (c.changeKind === 'removed') { modules.delete(c.targetKey); removed.push({ ...markOf(c), needsRevalidation: c.needsRevalidation }); continue; }
      if (c.changeKind === 'changed') {
        if (!before || !after || str(after.name) === null) { fail('malformed'); continue; }
        if (!same({ name: rev.name, parentModule: rev.parentModuleKey }, { name: before.name, parentModule: before.parentModule ?? null })) { fail('before_mismatch'); continue; }
        cur.name = str(after.name) ?? cur.name;
        const parent = str(after.parentModule);
        cur.parentModuleKey = parent;
        cur.parentModuleId = parent === null ? null : (revision.modules.get(buildTargetKey({ kind: 'module', module: parent }))?.id ?? null);
      }
      mark(cur, c);
      continue;
    }

    if (ref.kind === 'event') {
      const cur = events.get(c.targetKey);
      const rev = revision.events.get(c.targetKey);
      if (c.changeKind === 'added') {
        if (rev) fail('exists');
        else if (!after || str(after.name) === null) fail('malformed');
        else if (!modules.has(buildTargetKey({ kind: 'module', module: ref.module }))) fail('parent_missing');
        else {
          const entry: EffectiveEvent = {
            id: null, moduleId: null, moduleKey: ref.module, eventKey: ref.event, name: str(after.name) ?? '', fields: [],
            triggerRule: str(after.triggerRule), detailDocRef: str(after.detailDocRef), origin: 'change', changed: [], needsRevalidation: false,
          };
          mark(entry, c);
          events.set(c.targetKey, entry);
        }
        continue;
      }
      if (!rev || !cur) { fail('gone'); continue; }
      if (c.changeKind === 'removed') { events.delete(c.targetKey); removed.push({ ...markOf(c), needsRevalidation: c.needsRevalidation }); continue; }
      if (c.changeKind === 'changed') {
        if (!before || !after || str(after.name) === null) { fail('malformed'); continue; }
        const current = { name: rev.name, triggerRule: rev.triggerRule, detailDocRef: rev.detailDocRef };
        if (!same(current, { name: before.name, triggerRule: before.triggerRule ?? null, detailDocRef: before.detailDocRef ?? null })) { fail('before_mismatch'); continue; }
        cur.name = str(after.name) ?? cur.name;
        cur.triggerRule = str(after.triggerRule);
        cur.detailDocRef = str(after.detailDocRef);
      }
      mark(cur, c);
      continue;
    }

    if (ref.kind === 'field') {
      const eventKey = buildTargetKey({ kind: 'event', module: ref.module, event: ref.event });
      const cur = events.get(eventKey);
      const rev = revision.events.get(eventKey);
      const fieldsOf = (e: { fields: unknown } | undefined): Record<string, unknown>[] =>
        Array.isArray(e?.fields) ? (e.fields as unknown[]).filter(isRecord) : [];
      const revField = fieldsOf(rev).find((f) => f.name === ref.field);
      if (!cur) { fail(c.changeKind === 'added' ? 'parent_missing' : 'gone'); continue; }
      if (c.changeKind === 'added') {
        if (revField) fail('exists');
        else if (!after || after.name !== ref.field) fail('malformed');
        else { cur.fields = [...fieldsOf(cur), after]; mark(cur, c); }
        continue;
      }
      if (!revField || !rev) { fail('gone'); continue; }
      if (c.changeKind === 'removed') {
        cur.fields = fieldsOf(cur).filter((f) => f.name !== ref.field);
        removed.push({ ...markOf(c), needsRevalidation: c.needsRevalidation });
        mark(cur, c);
        continue;
      }
      if (c.changeKind === 'changed') {
        if (!before || !after || after.name !== ref.field) { fail('malformed'); continue; }
        if (!same(revField, before)) { fail('before_mismatch'); continue; }
        cur.fields = fieldsOf(cur).map((f) => (f.name === ref.field ? after : f));
      }
      mark(cur, c);
      continue;
    }

    // relation
    const cur = relations.get(c.targetKey);
    const rev = revision.relations.get(c.targetKey);
    if (c.changeKind === 'added') {
      if (rev) { fail('exists'); continue; }
      const s = events.get(buildTargetKey({ kind: 'event', module: ref.sourceModule, event: ref.sourceEvent }));
      const t = events.get(buildTargetKey({ kind: 'event', module: ref.targetModule, event: ref.targetEvent }));
      if (!s || !t) { fail('parent_missing'); continue; }
      if (!after) { fail('malformed'); continue; }
      const entry: EffectiveRelation = {
        id: null, sourceEventId: s.id, targetEventId: t.id, sourceModuleKey: ref.sourceModule, sourceEventKey: ref.sourceEvent,
        predicate: ref.predicate, targetModuleKey: ref.targetModule, targetEventKey: ref.targetEvent, ruleRef: str(after.ruleRef),
        origin: 'change', changed: [], needsRevalidation: false,
      };
      mark(entry, c);
      relations.set(c.targetKey, entry);
      continue;
    }
    if (!rev || !cur) { fail('gone'); continue; }
    if (c.changeKind === 'removed') { relations.delete(c.targetKey); removed.push({ ...markOf(c), needsRevalidation: c.needsRevalidation }); continue; }
    if (c.changeKind === 'changed') {
      if (!before || !after) { fail('malformed'); continue; }
      if (!same({ ruleRef: rev.ruleRef }, { ruleRef: before.ruleRef ?? null })) { fail('before_mismatch'); continue; }
      cur.ruleRef = str(after.ruleRef);
    }
    mark(cur, c);
  }

  return { modules: [...modules.values()], events: [...events.values()], relations: [...relations.values()], stale, removed };
}
