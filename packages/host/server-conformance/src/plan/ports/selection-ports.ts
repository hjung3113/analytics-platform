import { isPortError, menuPermission, type EquipmentSummary, type PortErrorCode } from '@ap/contracts';
import type { ConformanceCheck, ServerConformanceHarness } from '../../types';

/** All vocabulary and authorization evidence belong to the integrating app/server. */
export type OptionPortSamples = {
  axisId: string; knownValues: readonly [string, string, ...string[]]; query: string; queryValue: string;
  equipment: readonly EquipmentSummary[];
  deniedRoomId: string; deniedRoom: string; foreignSiteId: string; absentId: string;
  deniedOption?: { axisId: string; value: string };
  parent?: { axisId: string; value: string; childValue: string };
  /** More than 200 independently known authorized values/rows, or that clamp check is skipped. */
  globalOptions?: readonly { axisId: 'lineNames' | 'prcGroups'; values: readonly string[]; parents: Record<string, string[]>; parentValues: readonly string[] }[];
  upperOptions?: readonly string[];
  upperEquipment?: readonly string[];
};
const names = ['global lineNames options', 'global prcGroups options', 'options paging', 'search paging', 'options query', 'search query', 'dependent options', 'denied-room options', 'options lower clamp', 'search lower clamp', 'options upper clamp', 'search upper clamp', 'options authorization', 'search authorization', 'resolution authorization', 'explicit denied-room filter', 'resolve authorized', 'resolve forbidden no detail', 'resolve cross-site absent', 'resolve order and duplicates', 'options invalid input', 'search invalid input', 'resolution invalid input', 'options cursor identity', 'search cursor identity', 'global metadata needs no equipment permission'] as const;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)]));
  return value;
}
const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
async function rejects(run: () => Promise<unknown>, code: PortErrorCode): Promise<string | null> {
  try { await run(); return `Expected rejection ${code}, received successful data`; }
  catch (e) { return isPortError(e) && e.code === code ? null : `Expected PortError ${code}, got ${String(e)}`; }
}
async function pages<T>(send: (cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null }>, id: (item: T) => string): Promise<{ items: T[]; failure: string | null }> {
  const cursors = new Set<string>(); const ids = new Set<string>(); const items: T[] = [];
  let cursor: string | null = null;
  for (let n = 0; n < 1000; n++) {
    const page = await send(cursor);
    if (!Array.isArray(page.items) || (page.nextCursor !== null && typeof page.nextCursor !== 'string')) return { items, failure: 'Malformed page' };
    if (page.items.length > 1) return { items, failure: 'limit=1 was not respected' };
    for (const item of page.items) {
      if (ids.has(id(item))) return { items, failure: 'Repeated item across pages' };
      ids.add(id(item)); items.push(item);
    }
    if (page.nextCursor === null) return { items, failure: null };
    if (!page.items.length || cursors.has(page.nextCursor)) return { items, failure: 'Cursor made no progress' };
    cursors.add(page.nextCursor); cursor = page.nextCursor;
  }
  return { items, failure: 'Paging did not terminate within 1000 pages' };
}

export function planSelectionPortChecks(h: ServerConformanceHarness): ConformanceCheck[] {
  const sample = h.ports.options;
  const a = h.adapter;
  const options = { scopeId: h.context.scopeId, axisId: sample?.axisId ?? '', limit: 1 };
  const search = { scopeId: h.context.scopeId, roomNames: null, lineNames: null, prcGroups: null, condition: null, membershipBasis: null, limit: 1 } as const;
  const resolve = { scopeId: h.context.scopeId, ids: sample ? [sample.equipment[0]?.equipmentId ?? ''] : [] };
  const globalOptions = async (axisId: 'lineNames' | 'prcGroups') => {
    const evidence = sample!.globalOptions!.find(option => option.axisId === axisId)!;
    const base = { scopeId: h.context.scopeId, axisId, limit: 1 };
    for (const parents of [undefined, evidence.parents]) {
      const result = await pages(cursor => a.listAxisOptions({ ...base, parents, cursor }), item => item.id);
      if (result.failure) return result.failure;
      const expected = parents ? evidence.parentValues : evidence.values;
      if (!same(result.items.map(item => item.id).sort(), [...expected].sort()) || result.items.some(item => typeof item.label !== 'string')) return 'Global options differ from authorized evidence';
    }
    return null;
  };
  const runs: Record<typeof names[number], () => Promise<string | null>> = {
    'global lineNames options': () => globalOptions('lineNames'),
    'global prcGroups options': () => globalOptions('prcGroups'),
    'options paging': async () => {
      if (!sample || new Set(sample.knownValues).size < 2 || !sample.knownValues.includes(sample.queryValue) || !sample.query) return 'Invalid option samples';
      const result = await pages(cursor => a.listAxisOptions({ ...options, cursor }), v => v.id);
      if (result.failure) return result.failure;
      const authorized = new Set(sample.equipment.flatMap(e => e.axes[sample.axisId] ?? []));
      if (result.items.some(i => !authorized.has(i.id) || typeof i.label !== 'string')) return 'Unauthorized option or invalid label';
      return sample.knownValues.every(id => result.items.some(i => i.id === id)) ? null : 'Known authorized options missing';
    },
    'search paging': async () => {
      if (!sample || sample.equipment.length < 2 || new Set(sample.equipment.map(e => e.equipmentId)).size !== sample.equipment.length) return 'Need at least two distinct authorized equipment summaries';
      const result = await pages(cursor => a.searchEquipment({ ...search, cursor }), v => v.equipmentId);
      if (result.failure) return result.failure;
      const expected = new Map(sample.equipment.map(e => [e.equipmentId, e]));
      if (result.items.length !== expected.size || result.items.some(e => !same(e, expected.get(e.equipmentId)))) return 'Search rows differ from authorized evidence (foreign/denied/missing rows)';
      const first = await a.searchEquipment(search);
      return first.total !== undefined && first.total !== expected.size ? 'Total includes unauthorized rows or is incorrect' : null;
    },
    'options query': async () => {
      const all = await pages(cursor => a.listAxisOptions({ ...options, cursor }), v => v.id);
      const result = await pages(cursor => a.listAxisOptions({ ...options, query: sample!.query.toUpperCase(), cursor }), v => v.id);
      return all.failure ?? result.failure ?? (result.items.length > 0 && result.items.some(i => i.id === sample!.queryValue) && result.items.every(i => `${i.id} ${i.label}`.toLowerCase().includes(sample!.query.toLowerCase())) && result.items.length < all.items.length ? null : 'Query did not narrow to known option');
    },
    'search query': async () => {
      const id = sample!.equipment[0].equipmentId;
      const page = await a.searchEquipment({ ...search, query: id.toLowerCase(), limit: 200 });
      return page.items.length === 1 && page.items[0].equipmentId === id ? null : 'ID query did not narrow equipment';
    },
    'dependent options': async () => {
      const parent = sample!.parent!;
      const result = await a.listAxisOptions({ ...options, parents: { [parent.axisId]: [parent.value] }, limit: 200 });
      if (!result.items.some(i => i.id === parent.childValue)) return 'Known dependent child missing';
      const expected = new Set(sample!.equipment.filter(e => e.axes[parent.axisId]?.includes(parent.value)).flatMap(e => e.axes[sample!.axisId] ?? []));
      if (result.items.some(i => !expected.has(i.id))) return 'Parent filter leaked unrelated child';
      return (await a.listAxisOptions({ ...options, parents: { [parent.axisId]: [] }, limit: 200 })).items.length ? 'Empty parent must yield empty options' : null;
    },
    'denied-room options': async () => (await a.listAxisOptions({ ...options, axisId: sample!.deniedOption!.axisId, query: sample!.deniedOption!.value, limit: 200 })).items.some(i => i.id === sample!.deniedOption!.value) ? 'Denied-only option leaked' : null,
    'options lower clamp': async () => (await a.listAxisOptions({ ...options, limit: 0 })).items.length === 1 ? null : 'Lower clamp must yield one known option',
    'search lower clamp': async () => (await a.searchEquipment({ ...search, limit: -5 })).items.length === 1 ? null : 'Lower clamp must yield one known candidate',
    'options upper clamp': async () => {
      const known = sample!.upperOptions!;
      if (new Set(known).size <= 200) return 'Invalid upper-clamp evidence';
      const evidence = await pages(cursor => a.listAxisOptions({ ...options, cursor }), v => v.id);
      if (evidence.failure || !known.every(id => evidence.items.some(i => i.id === id))) return evidence.failure ?? 'Upper options sample is not present';
      const result = await a.listAxisOptions({ ...options, limit: 999 });
      return result.items.length === 200 && result.nextCursor !== null && result.items.every(i => known.includes(i.id)) ? null : 'Upper options clamp violated';
    },
    'search upper clamp': async () => {
      const known = sample!.upperEquipment!;
      if (new Set(known).size <= 200) return 'Invalid upper-clamp evidence';
      const evidence = await pages(cursor => a.searchEquipment({ ...search, cursor }), v => v.equipmentId);
      if (evidence.failure || !known.every(id => evidence.items.some(i => i.equipmentId === id))) return evidence.failure ?? 'Upper equipment sample is not present';
      const result = await a.searchEquipment({ ...search, limit: 999 });
      return result.items.length === 200 && result.nextCursor !== null && result.items.every(i => known.includes(i.equipmentId)) ? null : 'Upper search clamp violated';
    },
    'options authorization': async () => await rejects(() => a.listAxisOptions({ ...options, scopeId: h.foreignScopeId }), 'scope_forbidden') ?? await rejects(() => a.listAxisOptions({ ...options, scopeId: '__conformance_unknown_scope__' }), 'unknown_scope'),
    'search authorization': async () => await rejects(() => a.searchEquipment({ ...search, scopeId: h.foreignScopeId }), 'scope_forbidden') ?? await rejects(() => a.searchEquipment({ ...search, scopeId: '__conformance_unknown_scope__' }), 'unknown_scope'),
    'resolution authorization': async () => await rejects(() => a.resolveSelection({ ...resolve, scopeId: h.foreignScopeId }), 'scope_forbidden') ?? await rejects(() => a.resolveSelection({ ...resolve, scopeId: '__conformance_unknown_scope__' }), 'unknown_scope'),
    'explicit denied-room filter': () => rejects(() => a.searchEquipment({ ...search, roomNames: [sample!.deniedRoom] }), 'room_forbidden'),
    'resolve authorized': async () => {
      const result = await a.resolveSelection(resolve);
      return same(result.items, [{ id: resolve.ids[0], status: 'ok', summary: sample!.equipment[0] }]) ? null : 'Authorized resolution differs from known summary';
    },
    'resolve forbidden no detail': async () => {
      const result = await a.resolveSelection({ ...resolve, ids: [sample!.deniedRoomId] });
      return same(result.items, [{ id: sample!.deniedRoomId, status: 'forbidden' }]) ? null : 'Forbidden resolution must contain submitted ID and status only';
    },
    'resolve cross-site absent': async () => {
      const ids = [sample!.foreignSiteId, sample!.absentId];
      return same((await a.resolveSelection({ ...resolve, ids })).items, ids.map(id => ({ id, status: 'not_found' }))) ? null : 'Foreign-site existence leaked or absent ID incorrect';
    },
    'resolve order and duplicates': async () => {
      const ids = [sample!.absentId, sample!.deniedRoomId, resolve.ids[0], sample!.absentId];
      const result = await a.resolveSelection({ ...resolve, ids });
      return same(result.items.map(i => i.id), ids.slice(0, 3)) ? null : 'Resolution order/deduplication violated';
    },
    'options invalid input': async () => await rejects(() => a.listAxisOptions({ ...options, limit: 1.5 }), 'invalid_input') ?? await rejects(() => a.listAxisOptions({ ...options, axisId: '__unknown_axis__' }), 'unknown_axis'),
    'search invalid input': async () => await rejects(() => a.searchEquipment({ ...search, condition: { [sample!.axisId]: [] } }), 'invalid_input') ?? await rejects(() => a.searchEquipment({ ...search, condition: { __unknown_axis__: ['x'] } }), 'unknown_axis'),
    'resolution invalid input': () => rejects(() => a.resolveSelection({ ...resolve, ids: [null] } as never), 'invalid_input'),
    'options cursor identity': async () => {
      const first = await a.listAxisOptions(options);
      if (!first.nextCursor) return 'Paging evidence did not yield a cursor';
      return await rejects(() => a.listAxisOptions({ ...options, cursor: first.nextCursor, query: '__changed__' }), 'invalid_cursor') ?? await rejects(() => a.listAxisOptions({ ...options, cursor: '__malformed__' }), 'invalid_cursor');
    },
    'search cursor identity': async () => {
      const first = await a.searchEquipment(search);
      if (!first.nextCursor) return 'Paging evidence did not yield a cursor';
      return await rejects(() => a.searchEquipment({ ...search, cursor: first.nextCursor, query: '__changed__' }), 'invalid_cursor') ?? await rejects(() => a.searchEquipment({ ...search, cursor: '__malformed__' }), 'invalid_cursor');
    },
    'global metadata needs no equipment permission': () => h.withoutPermission(menuPermission('equipment:view'), async () => {
      const option = await a.listAxisOptions(options); const candidates = await a.searchEquipment(search); const resolved = await a.resolveSelection(resolve);
      return option.items.length && candidates.items.length && resolved.items[0]?.status === 'ok' ? null : 'Global metadata incorrectly requires equipment:view';
    }),
  };
  return names.map(name => ({
    id: `selection ports · ${name}`,
    mode: !sample || (name === 'global lineNames options' && !sample.globalOptions?.some(option => option.axisId === 'lineNames')) || (name === 'global prcGroups options' && !sample.globalOptions?.some(option => option.axisId === 'prcGroups')) || (name === 'dependent options' && !sample.parent) || (name === 'denied-room options' && !sample.deniedOption) || (name === 'options upper clamp' && !sample.upperOptions) || (name === 'search upper clamp' && !sample.upperEquipment) ? 'skipped' : name === 'global metadata needs no equipment permission' ? 'sequential' : 'granted',
    nonEnvelope: true,
    uses: SELECTION_USES[name],
    needsSites: true,
    run: runs[name],
  }));
}

/** The selection port methods each named check calls (#674 `harness.implemented`), declared per check: a new name must add its row. */
const SELECTION_USES: Record<typeof names[number], NonNullable<ConformanceCheck['uses']>> = {
  'global lineNames options': ['listAxisOptions'],
  'global prcGroups options': ['listAxisOptions'],
  'options paging': ['listAxisOptions'],
  'search paging': ['searchEquipment'],
  'options query': ['listAxisOptions'],
  'search query': ['searchEquipment'],
  'dependent options': ['listAxisOptions'],
  'denied-room options': ['listAxisOptions'],
  'options lower clamp': ['listAxisOptions'],
  'search lower clamp': ['searchEquipment'],
  'options upper clamp': ['listAxisOptions'],
  'search upper clamp': ['searchEquipment'],
  'options authorization': ['listAxisOptions'],
  'search authorization': ['searchEquipment'],
  'resolution authorization': ['resolveSelection'],
  'explicit denied-room filter': ['searchEquipment'],
  'resolve authorized': ['resolveSelection'],
  'resolve forbidden no detail': ['resolveSelection'],
  'resolve cross-site absent': ['resolveSelection'],
  'resolve order and duplicates': ['resolveSelection'],
  'options invalid input': ['listAxisOptions'],
  'search invalid input': ['searchEquipment'],
  'resolution invalid input': ['resolveSelection'],
  'options cursor identity': ['listAxisOptions'],
  'search cursor identity': ['searchEquipment'],
  'global metadata needs no equipment permission': ['listAxisOptions', 'searchEquipment', 'resolveSelection'],
};
