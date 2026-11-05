import type { FieldError } from '@ap/contracts';
import { SPEC_FIELD_TYPES, SPEC_SAVE_LIMITS, type SpecDraftSaveInput } from '../endpoints';
import { eventKey, specId, type Revision } from './specStore';
import { toCodeKey } from './store';

export const fieldError = (path: string, code: string): FieldError => ({ path: path.split('.'), code });

/** The server's text authorities (`domain/spec-input.ts`): the mock keeps its own copies, never a server import. */
export const SPEC_TEXT_MAX = 2000;
export const SPEC_NAME_MAX = 200;
const PREDICATE_MAX = 100;
const FIELDS_MAX = 200;
const ALLOWED_VALUES_MAX = 200;
const LINK_MAX = 2000;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

/** Text the wire cannot carry faithfully: NUL and lone UTF-16 surrogates (`platform-port/text-safety.ts`). */
export const specUnsafe = (value: string): boolean => value.includes('\u0000') || LONE_SURROGATE.test(value);
/** Names are normalised at SAVE: NFC, trimmed, inner whitespace collapsed (`normalizeSpecName`). */
export const cleanName = (value: string): string => value.normalize('NFC').trim().replace(/\s+/gu, ' ');
/** An optional free text: blank → null; otherwise trimmed (`optionalText`). */
export const optionalStoredText = (value: unknown, max: number): { text: string | null; error: FieldError | null } => {
  if (value === undefined || value === null) return { text: null, error: null };
  if (typeof value !== 'string') return { text: null, error: fieldError('', 'required') };
  if (specUnsafe(value)) return { text: null, error: fieldError('', 'malformed') };
  if ([...value].length > max) return { text: null, error: fieldError('', 'too_long') };
  return { text: value.trim() === '' ? null : value.trim(), error: null };
};

/** A required name: normalised, non-blank, bounded (`nameText`). `path` is only used for the returned error. */
export const nameError = (value: unknown, max: number, path: string): { name: string; error: FieldError | null } => {
  if (typeof value !== 'string') return { name: '', error: fieldError(path, 'required') };
  if (specUnsafe(value)) return { name: '', error: fieldError(path, 'malformed') };
  if ([...value].length > max) return { name: '', error: fieldError(path, 'too_long') };
  const name = cleanName(value);
  return name === '' ? { name: '', error: fieldError(path, 'required') } : { name, error: null };
};

/** The stored shape of one field: closed keys, `null` units dropped (`specFieldSchema` → `storedField`). */
export function storedFieldOf(raw: unknown, path: string): { field: Record<string, unknown>; errors: FieldError[] } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { field: {}, errors: [fieldError(path, 'required')] };
  const value = raw as Record<string, unknown>;
  const errors: FieldError[] = [];
  for (const key of Object.keys(value)) if (!['name', 'type', 'unit', 'allowedValues', 'description'].includes(key)) errors.push(fieldError(`${path}.${key}`, 'malformed'));
  const name = nameError(value['name'], SPEC_NAME_MAX, `${path}.name`);
  if (name.error) errors.push(name.error);
  const type = value['type'];
  if (type === undefined) errors.push(fieldError(`${path}.type`, 'required'));
  else if (typeof type !== 'string' || !SPEC_FIELD_TYPES.includes(type as (typeof SPEC_FIELD_TYPES)[number])) errors.push(fieldError(`${path}.type`, 'malformed'));
  const unit = optionalStoredText(value['unit'], 100);
  if (unit.error) errors.push({ ...unit.error, path: [...path.split('.'), 'unit'] });
  const allowed = value['allowedValues'];
  let allowedNames: string[] | undefined;
  if (allowed !== undefined && allowed !== null) {
    if (!Array.isArray(allowed)) errors.push(fieldError(`${path}.allowedValues`, 'required'));
    else if (allowed.length > ALLOWED_VALUES_MAX) errors.push(fieldError(`${path}.allowedValues`, 'too_long'));
    else {
      const names: string[] = [];
      allowed.forEach((entry, index) => {
        const name = nameError(entry, SPEC_NAME_MAX, `${path}.allowedValues.${index}`);
        if (name.error) errors.push(name.error);
        else names.push(name.name);
      });
      allowedNames = names;
    }
  }
  const description = value['description'];
  if (typeof description !== 'string') errors.push(fieldError(`${path}.description`, 'required'));
  else if (specUnsafe(description)) errors.push(fieldError(`${path}.description`, 'malformed'));
  else if ([...description].length > SPEC_TEXT_MAX) errors.push(fieldError(`${path}.description`, 'too_long'));
  const field: Record<string, unknown> = { name: name.name, type, description: typeof description === 'string' ? description.trim() : '' };
  if (unit.text) field['unit'] = unit.text;
  if (allowedNames !== undefined) field['allowedValues'] = allowedNames;
  return { field, errors };
}

const rowsOf = <K>(values: unknown, parse: (raw: Record<string, unknown>, index: string) => K, list: string, errors: FieldError[]): K[] => {
  if (values === undefined || values === null) return [];
  if (!Array.isArray(values)) {
    errors.push(fieldError(list, 'required'));
    return [];
  }
  return values.map((raw, index) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push(fieldError(`${list}.${index}`, 'required'));
      return null;
    }
    return parse(raw as Record<string, unknown>, String(index));
  }).filter((row): row is K => row !== null);
};

const moduleRowOf = (row: Record<string, unknown>, index: string, errors: FieldError[]): Revision['modules'][number] | null => {
  for (const key of Object.keys(row)) if (!['name', 'parentModule'].includes(key)) errors.push(fieldError(`modules.${index}.${key}`, 'malformed'));
  const name = nameError(row['name'], SPEC_NAME_MAX, `modules.${index}.name`);
  if (name.error) errors.push(name.error);
  const parent = row['parentModule'];
  let parentKey: string | null = null;
  if (parent !== undefined && parent !== null) {
    const ref = nameError(parent, SPEC_NAME_MAX, `modules.${index}.parentModule`);
    if (ref.error) errors.push(ref.error);
    else parentKey = toCodeKey(ref.name);
  }
  return { id: specId(), moduleKey: toCodeKey(name.name), name: name.name, parentModuleId: parentKey };
};

const eventRowOf = (row: Record<string, unknown>, index: string, errors: FieldError[]): Revision['events'][number] | null => {
  for (const key of Object.keys(row)) if (!['module', 'name', 'fields', 'triggerRule', 'detailDocRef'].includes(key)) errors.push(fieldError(`events.${index}.${key}`, 'malformed'));
  const module = nameError(row['module'], SPEC_NAME_MAX, `events.${index}.module`);
  if (module.error) errors.push(module.error);
  const name = nameError(row['name'], SPEC_NAME_MAX, `events.${index}.name`);
  if (name.error) errors.push(name.error);
  let fields: Record<string, unknown>[] = [];
  const rawFields = row['fields'];
  if (rawFields !== undefined && rawFields !== null) {
    if (!Array.isArray(rawFields)) errors.push(fieldError(`events.${index}.fields`, 'required'));
    else if (rawFields.length > FIELDS_MAX) errors.push(fieldError(`events.${index}.fields`, 'too_long'));
    else fields = rawFields.flatMap((raw, fieldIndex) => {
      const stored = storedFieldOf(raw, `events.${index}.fields.${fieldIndex}`);
      errors.push(...stored.errors);
      return stored.errors.length ? [] : [stored.field];
    });
  }
  const trigger = optionalStoredText(row['triggerRule'], SPEC_TEXT_MAX);
  if (trigger.error) errors.push({ ...trigger.error, path: ['events', index, 'triggerRule'] });
  const doc = optionalStoredText(row['detailDocRef'], SPEC_TEXT_MAX);
  if (doc.error) errors.push({ ...doc.error, path: ['events', index, 'detailDocRef'] });
  return { id: specId(), moduleId: toCodeKey(module.name), eventKey: toCodeKey(name.name), name: name.name, fields, triggerRule: trigger.text, detailDocRef: doc.text };
};

const relationRowOf = (row: Record<string, unknown>, index: string, errors: FieldError[]): Revision['relations'][number] | null => {
  const keys = ['sourceModule', 'sourceEvent', 'predicate', 'targetModule', 'targetEvent', 'ruleRef'];
  for (const key of Object.keys(row)) if (!keys.includes(key)) errors.push(fieldError(`relations.${index}.${key}`, 'malformed'));
  const ref = (key: string) => {
    const name = nameError(row[key], SPEC_NAME_MAX, `relations.${index}.${key}`);
    if (name.error) errors.push(name.error);
    return toCodeKey(name.name);
  };
  const predicate = nameError(row['predicate'], PREDICATE_MAX, `relations.${index}.predicate`);
  if (predicate.error) errors.push(predicate.error);
  const rule = optionalStoredText(row['ruleRef'], SPEC_TEXT_MAX);
  if (rule.error) errors.push({ ...rule.error, path: ['relations', index, 'ruleRef'] });
  return { id: specId(), sourceEventId: eventKey(ref('sourceModule'), ref('sourceEvent')), predicate: predicate.name, targetEventId: eventKey(ref('targetModule'), ref('targetEvent')), ruleRef: rule.text };
};

/** The TSV text parser (`domain/spec-tsv.ts`): the same header, kind, cell and cap errors on the same `text.line N.column C` paths. */
const TSV_ERROR_CAP = 20;
const TSV_COLUMNS = ['kind', 'module', 'parent_module', 'event', 'trigger_rule', 'detail_doc_ref', 'fields_json', 'source_module', 'source_event', 'predicate', 'target_module', 'target_event', 'rule_ref'];
type TsvKind = 'module' | 'event' | 'relation';
/** A Map, not an object: an inherited key (`constructor`, `__proto__`) is just an unknown kind. */
const KIND_COLUMNS = new Map<string, string[]>([['module', ['kind', 'module', 'parent_module']], ['event', ['kind', 'module', 'event', 'trigger_rule', 'detail_doc_ref', 'fields_json']], ['relation', ['kind', 'source_module', 'source_event', 'predicate', 'target_module', 'target_event', 'rule_ref']]]);
/** The row field each column becomes, per kind: where a row error lands on the TSV grid. */
const FIELD_COLUMNS: Record<TsvKind, Record<string, string>> = {
  module: { name: 'module', parentModule: 'parent_module' },
  event: { module: 'module', name: 'event', fields: 'fields_json', triggerRule: 'trigger_rule', detailDocRef: 'detail_doc_ref' },
  relation: { sourceModule: 'source_module', sourceEvent: 'source_event', predicate: 'predicate', targetModule: 'target_module', targetEvent: 'target_event', ruleRef: 'rule_ref' },
};
const LIST_KIND: Record<string, TsvKind> = { modules: 'module', events: 'event', relations: 'relation' };
const at = (line: number, column: string): string[] => ['text', `line ${line}`, `column ${column}`];
const echoHeaderCell = (cell: string): string => {
  const clean = [...cell].map(ch => (ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f ? '' : ch)).join('');
  const chars = [...clean];
  return chars.length > 40 ? `${chars.slice(0, 40).join('')}…` : clean;
};
type LineError = { line: number; error: FieldError };
type TsvParse = { early: FieldError[] | null; modules: unknown[]; events: unknown[]; relations: unknown[]; lines: Record<'modules' | 'events' | 'relations', number[]>; errors: LineError[]; seen: Set<string> };
const cellFail = (parse: Pick<TsvParse, 'errors' | 'seen'>, line: number, column: string, code: string) => {
  const key = `${line}:${column}`;
  if (parse.seen.has(key)) return;
  parse.seen.add(key);
  parse.errors.push({ line, error: { path: at(line, column), code } });
};
function parseText(text: string): TsvParse {
  const parse: TsvParse = { early: null, modules: [], events: [], relations: [], lines: { modules: [], events: [], relations: [] }, errors: [], seen: new Set() };
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
  const headerNo = lines.findIndex(l => l.trim() !== '');
  if (headerNo < 0) { parse.early = [fieldError('text', 'required')]; return parse; }
  const headerLine = headerNo + 1, headerCells = lines[headerNo]!.split('\t'), position = new Map<string, number>();
  headerCells.forEach((raw, i) => {
    const column = raw.trim();
    if (!TSV_COLUMNS.includes(column)) cellFail(parse, headerLine, echoHeaderCell(column), 'unknown_column');
    else if (position.has(column)) cellFail(parse, headerLine, echoHeaderCell(column), 'duplicate_column');
    else position.set(column, i);
  });
  if (!position.has('kind')) cellFail(parse, headerLine, 'kind', 'required');
  if (parse.errors.length) { parse.early = bounded(parse.errors); return parse; }
  // The row cap is judged before any per-row work (a call past SPEC_SAVE_LIMITS.rows is refused unparsed).
  if (lines.filter((l, i) => i > headerNo && l.trim() !== '').length > SPEC_SAVE_LIMITS.rows) { parse.early = [fieldError('input', 'too_large')]; return parse; }
  lines.forEach((rawLine, i) => {
    if (i <= headerNo || rawLine.trim() === '') return;
    const line = i + 1, cells = rawLine.split('\t');
    let width = cells.length;
    while (width > 0 && (cells[width - 1] ?? '').trim() === '') width -= 1;
    if (width > headerCells.length) { parse.errors.push({ line, error: { path: ['text', `line ${line}`], code: 'too_many_cells' } }); return; }
    const cell = (column: string): string => { const j = position.get(column); return j === undefined ? '' : cells[j] ?? ''; };
    const present = (column: string) => cell(column).trim() !== '';
    const kindCell = cell('kind').trim(), columns = KIND_COLUMNS.get(kindCell);
    if (kindCell === '') return cellFail(parse, line, 'kind', 'required');
    if (!columns) return cellFail(parse, line, 'kind', 'unknown_value');
    for (const column of position.keys()) if (!columns.includes(column) && present(column)) cellFail(parse, line, column, 'unexpected_value');
    if (kindCell === 'module') { parse.modules.push({ name: cell('module'), ...(present('parent_module') ? { parentModule: cell('parent_module') } : {}) }); parse.lines.modules.push(line); }
    else if (kindCell === 'event') {
      let fields: unknown;
      if (present('fields_json')) {
        try { fields = JSON.parse(cell('fields_json')); } catch { fields = null; }
        if (!Array.isArray(fields)) return cellFail(parse, line, 'fields_json', 'malformed');
      }
      parse.events.push({ module: cell('module'), name: cell('event'), ...(fields === undefined ? {} : { fields }), ...(present('trigger_rule') ? { triggerRule: cell('trigger_rule') } : {}), ...(present('detail_doc_ref') ? { detailDocRef: cell('detail_doc_ref') } : {}) });
      parse.lines.events.push(line);
    } else {
      parse.relations.push({ sourceModule: cell('source_module'), sourceEvent: cell('source_event'), predicate: cell('predicate'), targetModule: cell('target_module'), targetEvent: cell('target_event'), ...(present('rule_ref') ? { ruleRef: cell('rule_ref') } : {}) });
      parse.lines.relations.push(line);
    }
  });
  return parse;
}
/** One bounded wire summary: the first lines in source order and, past the cap, a `text.more_errors` marker carrying the total. */
function bounded(errors: LineError[]): FieldError[] {
  const ordered = errors.map((e, i) => ({ ...e, i })).sort((a, b) => a.line - b.line || a.i - b.i).map(e => e.error);
  const kept = ordered.slice(0, TSV_ERROR_CAP);
  return ordered.length > kept.length ? [...kept, { path: ['text', 'more_errors'], code: String(ordered.length) }] : kept;
}

/** Parses and normalises one save call (pure input; the draft is not consulted — the handler plans references). */
export function draftRows(input: SpecDraftSaveInput): { modules: Revision['modules']; events: Revision['events']; relations: Revision['relations']; errors: FieldError[] } {
  const errors: FieldError[] = [];
  const hasText = input.text !== undefined;
  const wireRows = (input.modules?.length ?? 0) + (input.events?.length ?? 0) + (input.relations?.length ?? 0);
  // Exactly one of structured rows or text per call, judged on the wire keys; `format` names the text's provenance.
  if (wireRows > 0 === hasText) errors.push(fieldError('input', 'rows_or_text'));
  if (hasText) {
    if (typeof input.text !== 'string') errors.push(fieldError('text', 'required'));
    if (!['paste', 'tsv'].includes(input.format ?? '')) errors.push(fieldError('format', typeof input.format === 'undefined' ? 'required' : 'malformed'));
  } else if (input.format !== undefined) {
    errors.push(fieldError('text', 'required'));
  }
  if (typeof input.text === 'string') {
    // A text call is capped on the text itself: the JSON envelope would inflate every tab (#1196 b2).
    if (new TextEncoder().encode(input.text).length > SPEC_SAVE_LIMITS.bodyBytes) return { modules: [], events: [], relations: [], errors: [fieldError('input', 'too_large')] };
  } else if (new TextEncoder().encode(JSON.stringify(input)).length > SPEC_SAVE_LIMITS.bodyBytes || wireRows > SPEC_SAVE_LIMITS.rows) {
    return { modules: [], events: [], relations: [], errors: [fieldError('input', 'too_large')] };
  }
  let raw = input;
  let parsed: TsvParse | null = null;
  if (typeof input.text === 'string') {
    parsed = parseText(input.text);
    if (parsed.early) return { modules: [], events: [], relations: [], errors: [...errors, ...parsed.early] };
    raw = { ...input, modules: parsed.modules as SpecDraftSaveInput['modules'], events: parsed.events as SpecDraftSaveInput['events'], relations: parsed.relations as SpecDraftSaveInput['relations'] };
  }
  const rowErrors: FieldError[] = [];
  const modules: Revision['modules'] = [], events: Revision['events'] = [], relations: Revision['relations'] = [];
  rowsOf(raw.modules, (row, index) => moduleRowOf(row, index, rowErrors), 'modules', rowErrors).forEach(m => m && modules.push(m));
  rowsOf(raw.events, (row, index) => eventRowOf(row, index, rowErrors), 'events', rowErrors).forEach(e => e && events.push(e));
  rowsOf(raw.relations, (row, index) => relationRowOf(row, index, rowErrors), 'relations', rowErrors).forEach(r => r && relations.push(r));
  if (!parsed) return { modules, events, relations, errors: [...errors, ...rowErrors] };
  // Row errors of a text call land on the source line and column of the cell, one error per cell.
  for (const error of rowErrors) {
    const list = error.path[0] ?? '', kind = LIST_KIND[list], line = kind ? parsed.lines[list as 'modules' | 'events' | 'relations'][Number(error.path[1])] : undefined, column = kind ? FIELD_COLUMNS[kind][error.path[2] ?? ''] : undefined;
    if (line !== undefined && column !== undefined) cellFail(parsed, line, column, error.code);
    else parsed.errors.push({ line: line ?? Infinity, error });
  }
  return { modules, events, relations, errors: [...errors, ...bounded(parsed.errors)] };
}

export function savePlan(input: SpecDraftSaveInput, base: Revision): ReturnType<typeof draftRows> {
  const rows = draftRows(input);
  const modules = [...(input.mode === 'append' ? base.modules : []), ...rows.modules];
  const events = [...(input.mode === 'append' ? base.events : []), ...rows.events];
  const relations = [...(input.mode === 'append' ? base.relations : []), ...rows.relations];
  const ids = new Set(modules.map(m => m.id)), eventIds = new Set(events.map(e => e.id));
  const seen = new Set<string>();
  for (const m of modules) {
    if (seen.has(m.moduleKey)) rows.errors.push(fieldError('modules', 'duplicate')); seen.add(m.moduleKey);
    if (m.parentModuleId && !ids.has(m.parentModuleId)) {
      const parent = modules.find(p => p.moduleKey === toCodeKey(m.parentModuleId!));
      if (!parent) rows.errors.push(fieldError('modules.parentModule', 'not_found')); else m.parentModuleId = parent.id;
    }
  }
  for (const m of modules) { const visited = new Set<string>(); let current: typeof m | undefined = m;
    while (current) { if (visited.has(current.id)) { rows.errors.push(fieldError('modules.parentModule', 'cycle')); break; } visited.add(current.id); current = modules.find(p => p.id === current?.parentModuleId); }
  }
  seen.clear();
  for (const e of events) {
    if (!ids.has(e.moduleId)) { const m = modules.find(m => m.moduleKey === toCodeKey(e.moduleId)); if (!m) rows.errors.push(fieldError('events.module', 'not_found')); else e.moduleId = m.id; }
    const k = `${e.moduleId}/${e.eventKey}`; if (seen.has(k)) rows.errors.push(fieldError('events', 'duplicate')); seen.add(k);
  }
  const eventFor = (k: string) => events.find(e => eventKey(modules.find(m => m.id === e.moduleId)?.moduleKey ?? '', e.eventKey) === k)?.id;
  seen.clear();
  for (const r of relations) {
    if (!eventIds.has(r.sourceEventId)) r.sourceEventId = eventFor(r.sourceEventId) ?? '';
    if (!eventIds.has(r.targetEventId)) r.targetEventId = eventFor(r.targetEventId) ?? '';
    if (!r.sourceEventId || !r.targetEventId) rows.errors.push(fieldError('relations', 'not_found'));
    if (r.sourceEventId === r.targetEventId) rows.errors.push(fieldError('relations', 'self_relation'));
    const k = `${r.sourceEventId}/${r.predicate}/${r.targetEventId}`; if (seen.has(k)) rows.errors.push(fieldError('relations', 'duplicate')); seen.add(k);
  }
  return { modules, events, relations, errors: rows.errors };
}
