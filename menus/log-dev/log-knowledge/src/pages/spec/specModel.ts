import type { ModelSpecData, ModelSpecEffective, ModelSpecUnchanged, SpecChangeRow, SpecDraftData, SpecDraftSaveInput, SpecFieldInput, SpecChangeTarget } from '../../endpoints';
export type Spec = ModelSpecData | ModelSpecEffective | ModelSpecUnchanged;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const encodeKey = (s: string) => s.replace(/%/g, '%25').replace(/\//g, '%2F').replace(/#/g, '%23');
export const decodeKey = (s: string) => s.replace(/%23/g, '#').replace(/%2F/g, '/').replace(/%25/g, '%');
export function modulesOf(spec: Spec) {
  return spec.modules.map(m => ({ ...m, parentKey: 'parentModuleKey' in m ? m.parentModuleKey : spec.modules.find(p => p.id === m.parentModuleId)?.moduleKey ?? null }));
}
export function eventsOf(spec: Spec) {
  return spec.events.map(e => ({ ...e, moduleKey: 'moduleKey' in e ? e.moduleKey : spec.modules.find(m => m.id === e.moduleId)?.moduleKey ?? '', changed: 'changed' in e ? e.changed : [], needsRevalidation: 'needsRevalidation' in e ? e.needsRevalidation : false }));
}
export const eventIdentity = (e: { moduleKey: string; eventKey: string }) => `${encodeKey(e.moduleKey)}/${encodeKey(e.eventKey)}`;
export function modulePath(spec: Spec, selected: string): string[] {
  const modules = modulesOf(spec), path: string[] = [], seen = new Set<string>();
  let current = modules.find(m => m.moduleKey === selected);
  while (current && !seen.has(current.moduleKey)) { seen.add(current.moduleKey); path.unshift(current.name); current = modules.find(m => m.moduleKey === current!.parentKey); }
  return path;
}
/** Real writes accept names or stable keys; escaped target segments stay intact when round-tripped. */
export function targetOf(row: Pick<SpecChangeRow, 'targetKind' | 'targetKey'>): SpecChangeTarget {
  const [first = '', predicate = '', last = ''] = row.targetKey.split('#');
  const [module = '', event = ''] = first.split('/').map(decodeKey);
  if (row.targetKind === 'module') return { module };
  if (row.targetKind === 'event') return { module, event };
  if (row.targetKind === 'field') return { module, event, field: decodeKey(predicate) };
  const [targetModule = '', targetEvent = ''] = last.split('/').map(decodeKey);
  return { sourceModule: module, sourceEvent: event, predicate: decodeKey(predicate), targetModule, targetEvent };
}
/** The text editor is a full snapshot; replace creates a new draft, never edits a sealed revision. */
export function specText(spec: SpecDraftData): string {
  const modules = new Map(spec.modules.map(m => [m.id, m.name]));
  const events = new Map(spec.events.map(e => [e.id, e]));
  const rows = [ ['kind', 'module', 'parent_module', 'event', 'trigger_rule', 'detail_doc_ref', 'fields_json', 'source_module', 'source_event', 'predicate', 'target_module', 'target_event', 'rule_ref'] ];
  for (const m of spec.modules) rows.push(['module', m.name, m.parentModuleId ? modules.get(m.parentModuleId) ?? '' : '']);
  for (const e of spec.events) rows.push(['event', modules.get(e.moduleId) ?? '', '', e.name, e.triggerRule ?? '', e.detailDocRef ?? '', JSON.stringify(e.fields ?? [])]);
  for (const r of spec.relations) { const s = events.get(r.sourceEventId), t = events.get(r.targetEventId); rows.push(['relation', '', '', '', '', '', '', modules.get(s?.moduleId ?? '') ?? '', s?.name ?? '', r.predicate, modules.get(t?.moduleId ?? '') ?? '', t?.name ?? '', r.ruleRef ?? '']); }
  return rows.map(row => row.join('\t')).join('\n');
}

/** The same draft as structured rows: stored tabs/newlines round-trip without the unquoted TSV (fix C1). The TSV
 *  text above stays the human preview; a save uses these rows unless the user edited the text or loaded a file. */
export function specRows(spec: SpecDraftData): Pick<SpecDraftSaveInput, 'modules' | 'events' | 'relations'> {
  const names = new Map(spec.modules.map(m => [m.id, m.name]));
  const eventOf = (id: string) => spec.events.find(e => e.id === id);
  return {
    modules: spec.modules.map(m => ({ name: m.name, parentModule: m.parentModuleId ? names.get(m.parentModuleId) ?? null : null })),
    events: spec.events.map(e => ({ module: names.get(e.moduleId) ?? '', name: e.name, fields: (Array.isArray(e.fields) ? e.fields : []) as SpecFieldInput[], triggerRule: e.triggerRule, detailDocRef: e.detailDocRef })),
    relations: spec.relations.map(r => {
      const source = eventOf(r.sourceEventId), target = eventOf(r.targetEventId);
      return { sourceModule: source ? names.get(source.moduleId) ?? '' : '', sourceEvent: source?.name ?? '', predicate: r.predicate, targetModule: target ? names.get(target.moduleId) ?? '' : '', targetEvent: target?.name ?? '', ruleRef: r.ruleRef };
    }),
  };
}
