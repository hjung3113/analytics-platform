/**
 * Global Context URL contract (docs/06 §6.1–6.4). Field names are Candidate; mechanisms are Decided.
 * Extends the bounded kernel-app-shell codec: time, Lot/PPID/Recipe and the metric pair are applied
 * globals here instead of opaque preserved values.
 */
export class ContractError extends Error {
  /** `field` (the URL key) and `raw` (its value as written) are set only when one key's one value is at fault; `message` stays the English diagnostic. */
  constructor(public code: string, message: string, public field?: string, public raw?: string) { super(message); }
}
const fail = (code: string, message: string, field?: string, raw?: string): never => { throw new ContractError(code, message, field, raw); };

export type ConditionAxis = 'stgroup' | 'team' | 'makerModel';
export type Condition =
  | { axis: 'stgroup'; id: string }
  | { axis: 'team'; id: string }
  | { axis: 'makerModel'; maker: string; model: string };

/** null = key absent (no explicit constraint); [] = explicit empty set; otherwise sorted unique IDs. */
export type IdSet = string[] | null;

export type GlobalContext = {
  scopeId: string | null;
  from: string | null;
  to: string | null;
  roomNames: IdSet;
  condition: Condition | null;
  selection: IdSet;
  lotIds: IdSet;
  ppid: string | null;
  recipeIds: IdSet;
  metricId: string | null;
  metricVersion: string | null;
};

export type Pair = [string, string];
export type ParsedQuery = { global: GlobalContext; page: Pair[]; extras: Pair[] };

export const emptyGlobal: GlobalContext = {
  scopeId: null, from: null, to: null, roomNames: null, condition: null, selection: null,
  lotIds: null, ppid: null, recipeIds: null, metricId: null, metricVersion: null,
};

const SETS = [
  { field: 'roomNames', key: 'roomNames', marker: 'roomSelection' },
  { field: 'selection', key: 'selectedEquipmentIds', marker: 'equipmentSelection', alias: 'equipmentIds' },
  { field: 'lotIds', key: 'lotIds', marker: 'lotSelection' },
  { field: 'recipeIds', key: 'recipeIds', marker: 'recipeSelection' },
] as const;
const SINGLES = ['v', 'scopeId', 'from', 'to', 'equipmentGroup', 'ppid', 'metricId', 'metricVersion', ...SETS.map(s => s.marker)];
export const GLOBAL_KEYS = new Set<string>([...SINGLES, ...SETS.flatMap(s => ('alias' in s ? [s.key, s.alias] : [s.key]))]);

// Python str.isspace() code points (parity with the kernel-app-shell codec).
const SPACE_CODES = [[0x09, 0x0d], [0x1c, 0x20], [0x85, 0x85], [0xa0, 0xa0], [0x1680, 0x1680], [0x2000, 0x200a], [0x2028, 0x2029], [0x202f, 0x202f], [0x205f, 0x205f], [0x3000, 0x3000]];
const isSpace = (c: number) => SPACE_CODES.some(([lo, hi]) => c >= lo && c <= hi);
/** `field` is the diagnostic name; `urlKey` (only parseQuery passes it) is the URL key to blame, with the value as written. */
function identifier(value: string, field: string, urlKey?: string): string {
  if (Array.from(value).every(ch => isSpace(ch.codePointAt(0)!))) fail('invalid_id', `${field}: empty or whitespace-only ID`, urlKey, urlKey === undefined ? undefined : value);
  try { encodeURIComponent(value); } catch { fail('invalid_id', `${field}: invalid Unicode`, urlKey, urlKey === undefined ? undefined : value); }
  return value;
}
function codepointCompare(a: string, b: string): number {
  const aa = Array.from(a, c => c.codePointAt(0)!); const bb = Array.from(b, c => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(aa.length, bb.length); i++) if (aa[i] !== bb[i]) return aa[i] - bb[i];
  return aa.length - bb.length;
}
export function normalizeSet(values: string[], field = 'set', urlKey?: string): string[] {
  return [...new Set(values.map(v => identifier(v, field, urlKey)))].sort(codepointCompare);
}

const DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;
/** Naive wall-clock `YYYY-MM-DDTHH:mm:ss` only (§6.3) — no Z, offset, fraction or date-only. */
export function parseDateTime(value: string, field: string, urlKey?: string): Date {
  const raw = urlKey === undefined ? undefined : value;
  const m = DATETIME.exec(value);
  if (!m) return fail('invalid_time', `${field}: use YYYY-MM-DDTHH:mm:ss (no Z/offset/fraction)`, urlKey, raw);
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) fail('invalid_time', `${field}: not a real calendar time`, urlKey, raw);
  return date;
}
/** Naive wall-clock only (§6.3): prints the stored UTC digits as calendar text. Never a real instant —
 *  those are formatInstant's domain. */
export function formatDateTime(date: Date): string {
  return date.toISOString().slice(0, 19);
}
export function shift(value: string, hours: number): string {
  return formatDateTime(new Date(parseDateTime(value, 'time').getTime() + hours * 3_600_000));
}

function conditionFromJson(raw: string): Condition {
  let obj: unknown;
  try { obj = JSON.parse(raw); } catch { return fail('invalid_condition', 'equipmentGroup must be a JSON object', 'equipmentGroup', raw); }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return fail('invalid_condition', 'equipmentGroup must be a JSON object', 'equipmentGroup', raw);
  const o = obj as Record<string, unknown>;
  const keys = Object.keys(o).sort().join(',');
  const str = (k: string) => (typeof o[k] === 'string' ? identifier(o[k] as string, `equipmentGroup.${k}`) : fail('invalid_condition', `equipmentGroup.${k} must be a string`));
  if (o.axis === 'stgroup' && keys === 'axis,id') return { axis: 'stgroup', id: str('id') };
  if (o.axis === 'team' && keys === 'axis,id') return { axis: 'team', id: str('id') };
  if (o.axis === 'makerModel' && keys === 'axis,maker,model') return { axis: 'makerModel', maker: str('maker'), model: str('model') };
  return fail('invalid_condition', 'Use exactly one axis: stgroup, team or makerModel', 'equipmentGroup', raw);
}
function conditionToJson(c: Condition): string {
  return c.axis === 'makerModel' ? JSON.stringify({ axis: c.axis, maker: c.maker, model: c.model }) : JSON.stringify({ axis: c.axis, id: c.id });
}

/**
 * Parse a query string. `pageKeys` are the registered page-owned keys of the current route;
 * anything else unregistered stays in `extras` (kept on the current URL, never transferred).
 */
export function parseQuery(search: string, pageKeys: readonly string[] = []): ParsedQuery {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const all: Pair[] = [...params.entries()];
  const values = (key: string) => all.filter(([k]) => k === key).map(([, v]) => v);
  const versions = values('v');
  if (versions.length > 1) fail('duplicate_singleton', 'v appears more than once');
  if (versions.length && !/^[1-9]\d*$/.test(versions[0])) fail('invalid_version', 'v must be a positive integer', 'v', versions[0]);
  if (versions.length && versions[0] !== '1') fail('unsupported_version', `v=${versions[0]} is not supported; the bookmark is not rewritten`, 'v', versions[0]);
  for (const key of SINGLES) if (values(key).length > 1) fail('duplicate_singleton', `${key} appears more than once`);
  const single = (key: string) => (values(key).length ? values(key)[0] : null);

  const global: GlobalContext = { ...emptyGlobal };
  const scope = single('scopeId');
  global.scopeId = scope === null ? null : identifier(scope, 'scopeId', 'scopeId');

  const from = single('from'); const to = single('to');
  if ((from === null) !== (to === null)) fail('partial_period', 'from and to must be supplied together');
  if (from !== null && to !== null) {
    if (parseDateTime(from, 'from', 'from') >= parseDateTime(to, 'to', 'to')) fail('invalid_period', 'from must be earlier than to');
    global.from = from; global.to = to;
  }

  for (const set of SETS) {
    const alias = 'alias' in set ? set.alias : null;
    if (alias && values(alias).length && values(set.key).length) fail('alias_conflict', `Use either ${set.key} or ${alias}, not both`);
    const ids = values(set.key).length ? values(set.key) : alias ? values(alias) : [];
    const marker = single(set.marker);
    if (marker !== null) {
      if (marker !== 'none') fail('invalid_set', `${set.marker}=none cannot be combined with IDs`, set.marker, marker);
      if (ids.length) fail('invalid_set', `${set.marker}=none cannot be combined with IDs`);
      global[set.field] = [];
    } else if (ids.length) global[set.field] = normalizeSet(ids, set.key, set.key);
  }

  const group = single('equipmentGroup');
  global.condition = group === null ? null : conditionFromJson(group);
  const ppid = single('ppid');
  global.ppid = ppid === null ? null : identifier(ppid, 'ppid', 'ppid');

  const metricId = single('metricId'); const metricVersion = single('metricVersion');
  if (metricVersion !== null && metricId === null) fail('metric_pair', 'metricVersion requires metricId (the pair travels together)');
  global.metricId = metricId === null ? null : identifier(metricId, 'metricId', 'metricId');
  global.metricVersion = metricVersion === null ? null : identifier(metricVersion, 'metricVersion', 'metricVersion');

  const pageSet = new Set(pageKeys);
  const page = all.filter(([k]) => pageSet.has(k));
  const seenPage = new Set<string>();
  for (const [key] of page) {
    if (seenPage.has(key)) fail('duplicate_page_key', `${key} appears more than once`);
    seenPage.add(key);
  }
  return {
    global,
    page,
    extras: all.filter(([k]) => !GLOBAL_KEYS.has(k) && !pageSet.has(k)),
  };
}

export function serializeGlobal(g: GlobalContext): Pair[] {
  const pairs: Pair[] = [['v', '1']];
  if (g.scopeId !== null) pairs.push(['scopeId', g.scopeId]);
  if (g.from !== null && g.to !== null) pairs.push(['from', g.from], ['to', g.to]);
  for (const set of SETS) {
    const ids = g[set.field];
    if (ids === null) continue;
    if (!ids.length) pairs.push([set.marker, 'none']);
    else for (const id of normalizeSet(ids, set.key)) pairs.push([set.key, id]);
  }
  if (g.condition) pairs.push(['equipmentGroup', conditionToJson(g.condition)]);
  if (g.ppid !== null) pairs.push(['ppid', g.ppid]);
  if (g.metricId !== null) {
    pairs.push(['metricId', g.metricId]);
    if (g.metricVersion !== null) pairs.push(['metricVersion', g.metricVersion]);
  }
  return pairs;
}

export function buildQuery(g: GlobalContext, page: Pair[] = [], extras: Pair[] = []): string {
  const params = new URLSearchParams([...serializeGlobal(g), ...page, ...extras]);
  return '?' + params.toString();
}

export function sameGlobal(a: GlobalContext, b: GlobalContext): boolean {
  return JSON.stringify(serializeGlobal(a)) === JSON.stringify(serializeGlobal(b));
}

export function conditionLabel(c: Condition): string {
  return c.axis === 'makerModel' ? `${c.maker} / ${c.model}` : c.id;
}

/** metricVersion is carried as the bare version token (e.g. '3'); UIs render it as 'v3'. */
export function formatMetricVersion(version: string): string {
  return /^\d+$/.test(version) ? `v${version}` : version;
}

/** Id-only is a contract error except on a menu that declares initialization (§6.1). */
export function incompleteMetricPair(
  menu: { initializesMetric?: boolean } | null,
  metricId: string | null,
  metricVersion: string | null,
): ContractError | null {
  if (metricId === null || metricVersion !== null) return null;
  if (menu?.initializesMetric) return null;
  return new ContractError('metric_pair_incomplete', `metricId=${metricId} requires metricVersion on this route`);
}

/** Syntactic same-origin path. Detail routes still pass. Open redirects do not. */
export function isAppRelativePath(value: string): boolean {
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  if (value.includes('#') || value.includes('\\') || value.includes('//')) return false;
  if (/[\u0000-\u001F\u007F]/.test(value)) return false;
  let decoded: string;
  try { decoded = decodeURIComponent(value); } catch { return false; }
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return false;
  if (decoded.includes('#') || decoded.includes('\\') || decoded.includes('//')) return false;
  if (/[\u0000-\u001F\u007F]/.test(decoded)) return false;
  const path = decoded.split('?')[0];
  if (path.includes(':')) return false;
  return true;
}
