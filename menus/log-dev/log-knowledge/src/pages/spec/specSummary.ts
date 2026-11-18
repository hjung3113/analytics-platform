import { SPEC_FIELD_TYPES, SPEC_SAVE_LIMITS, SPEC_TSV_COLUMNS, type ModelSpecData, type SpecDraftSaveInput, type SpecFieldInput, type SpecFieldType } from '../../endpoints';

type DraftRows = Pick<SpecDraftSaveInput, 'modules' | 'events' | 'relations'>;
type Kind = 'module' | 'event' | 'relation';
type ChangeKind = 'added' | 'changed' | 'removed';
export type SpecChangeCount = Record<ChangeKind, number>;
export type SpecSummaryRow = { kind: Kind; change: ChangeKind; label: string; before?: string; after?: string };
export type SpecSummary =
  | { state: 'unavailable'; reason: 'draft' | 'publication' }
  | { state: 'first_publication' | 'verified_zero' | 'changes'; counts: Record<Kind, SpecChangeCount>; rows: SpecSummaryRow[]; baseRevision: number | null };

type Column = (typeof SPEC_TSV_COLUMNS)[number];
type SnapshotEntry = { label: string; value: unknown };
type Snapshot = Record<Kind, Map<string, SnapshotEntry>>;

const normalizedName = (value: string) => value.normalize('NFC').trim().replace(/\s+/gu, ' ');
const codeKey = (value: string) => normalizedName(value).normalize('NFKC').trim().replace(/\s+/gu, ' ').toUpperCase();
const optionalText = (value: string | null | undefined) => value?.trim() || null;
const qualified = (moduleKey: string, eventKey: string) => `${moduleKey}\u0000${eventKey}`;
const edge = (source: string, predicate: string, target: string) => `${source}\u0001${normalizedName(predicate)}\u0001${target}`;
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
};
const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const emptyCounts = (): Record<Kind, SpecChangeCount> => ({
  module: { added: 0, changed: 0, removed: 0 }, event: { added: 0, changed: 0, removed: 0 }, relation: { added: 0, changed: 0, removed: 0 },
});
const labelFor = (kind: Kind, key: string) => kind === 'relation' ? key.replaceAll('\u0000', ' · ').replaceAll('\u0001', ' → ') : key.replaceAll('\u0000', ' / ');

function normalizeFields(value: unknown): SpecFieldInput[] | null {
  if (!Array.isArray(value)) return null;
  const fields: SpecFieldInput[] = [];
  for (const field of value) {
    if (!field || typeof field !== 'object' || Array.isArray(field)) return null;
    const record = field as Record<string, unknown>, name = typeof record['name'] === 'string' ? normalizedName(record['name']) : '';
    const type = record['type'], description = record['description'], unit = record['unit'], rawAllowedValues = record['allowedValues'];
    if (!name || typeof type !== 'string' || !SPEC_FIELD_TYPES.includes(type as SpecFieldType) || typeof description !== 'string'
      || (unit !== undefined && unit !== null && typeof unit !== 'string')
      || Object.keys(record).some(key => !['name', 'type', 'description', 'unit', 'allowedValues'].includes(key))) return null;
    let allowedValues: string[] | undefined;
    if (rawAllowedValues !== undefined) {
      if (!Array.isArray(rawAllowedValues) || !rawAllowedValues.every(item => typeof item === 'string')) return null;
      allowedValues = rawAllowedValues.map(item => normalizedName(item));
      if (allowedValues.some(item => !item)) return null;
    }
    const normalized: SpecFieldInput = { name, type: type as SpecFieldType, description: description.trim() };
    if (typeof unit === 'string' && unit.trim()) normalized.unit = unit.trim();
    if (allowedValues !== undefined) normalized.allowedValues = allowedValues;
    fields.push(normalized);
  }
  return fields;
}

function snapshotFromRows(rows: DraftRows): Snapshot | null {
  const modules = rows.modules ?? [], events = rows.events ?? [], relations = rows.relations ?? [];
  const snapshot: Snapshot = { module: new Map(), event: new Map(), relation: new Map() };
  for (const module of modules) {
    const key = codeKey(module.name);
    if (!key || snapshot.module.has(key)) return null;
    snapshot.module.set(key, { label: normalizedName(module.name), value: { name: normalizedName(module.name), parentKey: module.parentModule ? codeKey(module.parentModule) : null } });
  }
  for (const entry of snapshot.module.values()) {
    const parent = (entry.value as { parentKey: string | null }).parentKey;
    if (parent && !snapshot.module.has(parent)) return null;
  }
  const parentOf = new Map([...snapshot.module].map(([key, entry]) => [key, (entry.value as { parentKey: string | null }).parentKey]));
  const visiting = new Set<string>(), visited = new Set<string>();
  const hasCycle = (key: string): boolean => {
    if (visiting.has(key)) return true;
    if (visited.has(key)) return false;
    visiting.add(key);
    const parent = parentOf.get(key);
    const cycle = parent !== null && parent !== undefined && hasCycle(parent);
    visiting.delete(key); visited.add(key);
    return cycle;
  };
  if ([...snapshot.module.keys()].some(hasCycle)) return null;

  for (const event of events) {
    const moduleKey = codeKey(event.module), eventKey = codeKey(event.name), key = qualified(moduleKey, eventKey);
    const fields = normalizeFields(event.fields ?? []);
    if (!moduleKey || !eventKey || !snapshot.module.has(moduleKey) || snapshot.event.has(key) || fields === null) return null;
    snapshot.event.set(key, { label: `${moduleKey} / ${eventKey}`, value: { name: normalizedName(event.name), fields, triggerRule: optionalText(event.triggerRule), detailDocRef: optionalText(event.detailDocRef) } });
  }
  for (const relation of relations) {
    const source = qualified(codeKey(relation.sourceModule), codeKey(relation.sourceEvent));
    const target = qualified(codeKey(relation.targetModule), codeKey(relation.targetEvent));
    const key = edge(source, relation.predicate, target);
    if (!snapshot.event.has(source) || !snapshot.event.has(target) || source === target || snapshot.relation.has(key)) return null;
    snapshot.relation.set(key, { label: labelFor('relation', key), value: { ruleRef: optionalText(relation.ruleRef) } });
  }
  return snapshot;
}

function snapshotFromPublication(publication: ModelSpecData): Snapshot | null {
  const snapshot: Snapshot = { module: new Map(), event: new Map(), relation: new Map() };
  const moduleKeys = new Map<string, string>();
  for (const module of publication.modules) {
    const key = module.moduleKey || codeKey(module.name);
    if (!key || snapshot.module.has(key)) return null;
    moduleKeys.set(module.id, key);
  }
  for (const module of publication.modules) {
    const key = moduleKeys.get(module.id)!, parentKey = module.parentModuleId ? moduleKeys.get(module.parentModuleId) : null;
    if (module.parentModuleId && !parentKey) return null;
    snapshot.module.set(key, { label: normalizedName(module.name), value: { name: normalizedName(module.name), parentKey } });
  }
  const eventKeys = new Map<string, string>();
  for (const event of publication.events) {
    const moduleKey = moduleKeys.get(event.moduleId), eventKey = event.eventKey || codeKey(event.name);
    const fields = normalizeFields(event.fields);
    if (!moduleKey || !eventKey || fields === null || typeof event.triggerRule !== 'string' && event.triggerRule !== null || typeof event.detailDocRef !== 'string' && event.detailDocRef !== null) return null;
    const key = qualified(moduleKey, eventKey);
    if (snapshot.event.has(key)) return null;
    eventKeys.set(event.id, key);
    snapshot.event.set(key, { label: `${moduleKey} / ${eventKey}`, value: { name: normalizedName(event.name), fields, triggerRule: optionalText(event.triggerRule), detailDocRef: optionalText(event.detailDocRef) } });
  }
  for (const relation of publication.relations) {
    const source = eventKeys.get(relation.sourceEventId), target = eventKeys.get(relation.targetEventId);
    if (!source || !target || source === target) return null;
    const key = edge(source, relation.predicate, target);
    if (snapshot.relation.has(key)) return null;
    snapshot.relation.set(key, { label: labelFor('relation', key), value: { ruleRef: optionalText(relation.ruleRef) } });
  }
  return snapshot;
}

function parseFields(raw: string): SpecFieldInput[] | null {
  if (!raw.trim()) return [];
  try {
    const value: unknown = JSON.parse(raw);
  return normalizeFields(value);
  } catch { return null; }
}

/** Conservative client preview parser; any malformed, duplicate or unresolved row makes the comparison unavailable. */
export function parseSpecDraftText(text: string): { ok: true; rows: DraftRows } | { ok: false } {
  if (new TextEncoder().encode(text).length > SPEC_SAVE_LIMITS.bodyBytes) return { ok: false };
  const lines = (text.startsWith('\uFEFF') ? text.slice(1) : text).split(/\r\n|\r|\n/u);
  const headerIndex = lines.findIndex(line => line.trim() !== '');
  if (headerIndex < 0) return { ok: false };
  const header = lines[headerIndex]!.split('\t').map(value => value.trim());
  const positions = new Map<Column, number>();
  for (const [index, column] of header.entries()) {
    if (!(SPEC_TSV_COLUMNS as readonly string[]).includes(column) || positions.has(column as Column)) return { ok: false };
    positions.set(column as Column, index);
  }
  if (!positions.has('kind')) return { ok: false };
  const rawRows = lines.slice(headerIndex + 1).filter(line => line.trim() !== '');
  if (rawRows.length > SPEC_SAVE_LIMITS.rows) return { ok: false };
  const rows: { modules: NonNullable<DraftRows['modules']>; events: NonNullable<DraftRows['events']>; relations: NonNullable<DraftRows['relations']> } = { modules: [], events: [], relations: [] };
  const allowed = new Map<string, readonly Column[]>([
    ['module', ['kind', 'module', 'parent_module']], ['event', ['kind', 'module', 'event', 'trigger_rule', 'detail_doc_ref', 'fields_json']],
    ['relation', ['kind', 'source_module', 'source_event', 'predicate', 'target_module', 'target_event', 'rule_ref']],
  ]);
  const cell = (cells: string[], column: Column) => cells[positions.get(column) ?? -1] ?? '';
  for (const line of rawRows) {
    const cells = line.split('\t');
    const width = cells.reduce((last, value, index) => value.trim() ? index + 1 : last, 0);
    if (width > header.length) return { ok: false };
    const kind = cell(cells, 'kind').trim();
    const allowedColumns = allowed.get(kind);
    if (!allowedColumns) return { ok: false };
    for (const column of positions.keys()) if (!allowedColumns.includes(column) && cell(cells, column).trim()) return { ok: false };
    const value = (column: Column) => cell(cells, column).trim();
    if (kind === 'module') {
      const name = value('module'), parent = value('parent_module');
      if (!name) return { ok: false };
      rows.modules.push({ name, parentModule: parent || null });
    } else if (kind === 'event') {
      const module = value('module'), name = value('event'), fields = parseFields(cell(cells, 'fields_json'));
      if (!module || !name || fields === null) return { ok: false };
      rows.events.push({ module, name, fields, triggerRule: value('trigger_rule') || null, detailDocRef: value('detail_doc_ref') || null });
    } else {
      const sourceModule = value('source_module'), sourceEvent = value('source_event'), predicate = value('predicate'), targetModule = value('target_module'), targetEvent = value('target_event');
      if (!sourceModule || !sourceEvent || !predicate || !targetModule || !targetEvent) return { ok: false };
      rows.relations.push({ sourceModule, sourceEvent, predicate, targetModule, targetEvent, ruleRef: value('rule_ref') || null });
    }
  }
  return { ok: true, rows };
}

function compareSnapshots(draft: Snapshot, publication: Snapshot | null, baseRevision: number | null): SpecSummary {
  const counts = emptyCounts(), rows: SpecSummaryRow[] = [];
  for (const kind of ['module', 'event', 'relation'] as const) {
    const draftRows = draft[kind], publishedRows = publication?.[kind] ?? new Map<string, SnapshotEntry>();
    for (const [key, entry] of draftRows) {
      const old = publishedRows.get(key);
      if (!old) {
        counts[kind].added += 1; rows.push({ kind, change: 'added', label: entry.label, after: JSON.stringify(entry.value) });
      } else if (!same(old.value, entry.value)) {
        counts[kind].changed += 1; rows.push({ kind, change: 'changed', label: entry.label, before: JSON.stringify(old.value), after: JSON.stringify(entry.value) });
      }
    }
    for (const [key, entry] of publishedRows) if (!draftRows.has(key)) {
      counts[kind].removed += 1; rows.push({ kind, change: 'removed', label: entry.label, before: JSON.stringify(entry.value) });
    }
  }
  if (!publication) return { state: 'first_publication', counts, rows, baseRevision: null };
  return rows.length === 0 ? { state: 'verified_zero', counts, rows, baseRevision } : { state: 'changes', counts, rows, baseRevision };
}

export function compareSpecDraft(rows: DraftRows, publication: ModelSpecData | null): SpecSummary {
  const draft = snapshotFromRows(rows), published = publication ? snapshotFromPublication(publication) : null;
  if (!draft) return { state: 'unavailable', reason: 'draft' };
  if (publication && !published) return { state: 'unavailable', reason: 'publication' };
  return compareSnapshots(draft, published, publication?.revision.revisionNo ?? null);
}

export function unavailableSpecSummary(reason: 'draft' | 'publication'): SpecSummary {
  return { state: 'unavailable', reason };
}

