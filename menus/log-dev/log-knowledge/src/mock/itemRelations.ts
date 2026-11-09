import type { FieldError } from '@ap/contracts';
import { ITEM_RELATION_LIMITS, type ItemRelation } from '../endpoints';
import type { ItemRec, RevisionRec } from './items';
import { itemModelId } from './subjectLinks';
import { readModelSpec } from './specReads';
import { escapeKey } from './specStore';
import { toCodeKey } from './store';

const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
type Stored = Pick<ItemRelation, 'kind' | 'source' | 'target' | 'predicate'>;
export function parseRelations(raw: unknown): { rows: Stored[] | undefined; errors: FieldError[] } {
  if (raw == null) return { rows: undefined, errors: [] };
  if (!Array.isArray(raw)) return { rows: undefined, errors: [{ path: ['relations'], code: 'malformed' }] };
  const errors: FieldError[] = [], rows: Stored[] = [], seen = new Set<string>();
  if (raw.length > ITEM_RELATION_LIMITS.relations) errors.push({ path: ['relations'], code: 'too_long' });
  raw.forEach((entry: unknown, i) => {
    const at = ['relations', String(i)];
    if (!object(entry) || Object.keys(entry).some(k => !['kind', 'source', 'predicate', 'target'].includes(k))) { errors.push({ path: at, code: 'malformed' }); return; }
    const key = (v: unknown): string | null => {
      if (!object(v) || Object.keys(v).some(k => k !== 'module' && k !== 'event')) return null;
      if (![v['module'], v['event']].every(s => typeof s === 'string' && s.trim() && !/[\u0000-\u001f]/u.test(s))) return null;
      const joined = `${escapeKey(toCodeKey(String(v['module'])))}/${escapeKey(toCodeKey(String(v['event'])))}`;
      return joined.length <= 1200 ? joined : null;
    };
    let source = key(entry['source']), target = key(entry['target']);
    if (!source) errors.push({ path: [...at, 'source'], code: entry['source'] == null ? 'required' : 'malformed' });
    if (!target) errors.push({ path: [...at, 'target'], code: entry['target'] == null ? 'required' : 'malformed' });
    if (!['observed', 'expected'].includes(String(entry['kind']))) errors.push({ path: [...at, 'kind'], code: entry['kind'] === undefined ? 'required' : 'malformed' });
    if (entry['predicate'] !== undefined && !['before', 'after'].includes(String(entry['predicate']))) errors.push({ path: [...at, 'predicate'], code: 'malformed' });
    if (!source || !target) return;
    if (entry['predicate'] === 'after') [source, target] = [target, source];
    if (source === target) { errors.push({ path: [...at, 'target'], code: 'self_relation' }); return; }
    const signature = JSON.stringify([entry['kind'], source, target]);
    if (seen.has(signature)) errors.push({ path: at, code: 'duplicate' });
    seen.add(signature);
    rows.push({ kind: entry['kind'] as Stored['kind'], source, target, predicate: 'before' });
  });
  return { rows, errors };
}

function eventLabels(owner: Pick<ItemRec, 'ownerModelId' | 'ownerSoftwareId'>): Map<string, string> {
  const spec = readModelSpec({ modelId: itemModelId(owner), ...(owner.ownerSoftwareId ? { softwareId: owner.ownerSoftwareId } : {}) });
  if (!spec) return new Map();
  return new Map(spec.events.map(e => {
    const moduleKey = 'moduleKey' in e ? e.moduleKey : spec.modules.find(m => m.id === e.moduleId)?.moduleKey ?? '';
    return [`${escapeKey(moduleKey)}/${escapeKey(e.eventKey)}`, e.name];
  }));
}
export function relationsForWrite(owner: Pick<ItemRec, 'ownerModelId' | 'ownerSoftwareId'>, raw: unknown): ItemRelation[] | undefined {
  const { rows } = parseRelations(raw);
  const labels = eventLabels(owner);
  return rows?.map((row, index) => ({ ...row, ordinal: index + 1, resolved: labels.has(row.source) && labels.has(row.target), sourceLabel: labels.get(row.source) ?? null, targetLabel: labels.get(row.target) ?? null }));
}
export function relationsForRead(owner: ItemRec, revision: RevisionRec): ItemRelation[] {
  const labels = eventLabels(owner);
  return (revision.relations ?? []).map(row => ({ ...row, sourceLabel: labels.get(row.source) ?? null, targetLabel: labels.get(row.target) ?? null }));
}
