/** Bounded port of context_url.py; synthetic fixture only (합성 fixture, 실제 메뉴 아님). */
export class ContractError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
function fail(code: string, message: string): never { throw new ContractError(code, message); }
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value.replace(/[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/g, '')) fail('invalid_id', 'ID must contain a non-whitespace character; correct the URL.');
  return value;
}
export type Condition = { axis: string; values: string[] };
export type Pair = [string, string];
export type ContextState = {
  route: string; scope_id: string | null; room_names: string[] | null;
  condition: Condition | null; selection: string[] | null; destination: string | null;
  extras: Pair[]; unapplied_globals: Pair[];
};
const capabilities = ['context', 'equipment', 'reference'];
const fields: Record<string, string[]> = { stgroup: ['id'], team: ['id'], makerModel: ['maker', 'model'] };
const single = new Set(['v', 'scopeId', 'equipmentGroup', 'roomSelection', 'equipmentSelection']);
export const outsideProfile = new Set(['from', 'to', 'lotIds', 'ppid', 'recipeIds', 'metricId', 'metricVersion', 'savedViewToken', 'anchor', 'entityType']);
const registered = new Set([...single, 'roomNames', 'selectedEquipmentIds', 'equipmentIds', ...outsideProfile]);
// JS default sort compares UTF-16 units; Python compares Unicode code points.
function codepointCompare(a: string, b: string): number {
  const aa = Array.from(a, c => c.codePointAt(0)!); const bb = Array.from(b, c => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(aa.length, bb.length); i++) if (aa[i] !== bb[i]) return aa[i] - bb[i];
  return aa.length - bb.length;
}
function normalized(values: string[]): string[] { return [...new Set(values.map(identifier))].sort(codepointCompare); }
export function decodeCondition(raw: string): Condition {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw);
    // All valid Condition values are strings. Detect duplicate JSON object keys before JSON.parse loses them.
    const tokens = raw.match(/"(?:[^"\\]|\\.)*"|[{}:]/g) ?? [];
    const keys = tokens.filter((token, i) => token.startsWith('"') && tokens[i + 1] === ':').map(token => JSON.parse(token) as string);
    if (new Set(keys).size !== keys.length) fail('invalid_condition', 'Duplicate JSON key; provide one Condition axis.');
  } catch { return fail('invalid_condition', 'Condition must be a JSON object.'); }
  if (!obj || Array.isArray(obj) || typeof obj.axis !== 'string') fail('invalid_condition', 'Condition needs one registered axis.');
  const axis = obj.axis;
  if (!Object.hasOwn(fields, axis) || Object.keys(obj).sort().join('|') !== ['axis', ...fields[axis]].sort().join('|')) fail('invalid_condition', 'Use exactly one of stgroup, team, makerModel.');
  return { axis, values: fields[axis].map(key => identifier(obj[key])) };
}
function strictDecode(raw: string): string {
  try { return decodeURIComponent(raw.replace(/\+/g, ' ')); } catch { return fail('invalid_url', 'Invalid UTF-8 encoding; correct the URL.'); }
}
export function parseUrl(url: string): ContextState {
  if (typeof url !== 'string') fail('invalid_url', 'Use an encoded local relative URL.');
  const queryPart = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
  // URLSearchParams uses replacement decoding for the version-only preflight, like Python unquote.
  const versions: string[] = [];
  for (const field of queryPart.split('&')) {
    const equal = field.indexOf('='); const key = equal < 0 ? field : field.slice(0, equal);
    // unquote(key) deliberately does not replace '+' in the source codec.
    const decodedKey = new URLSearchParams('k=' + key.replace(/\+/g, '%2B')).get('k');
    if (decodedKey === 'v') versions.push(new URLSearchParams('v=' + (equal < 0 ? '' : field.slice(equal + 1))).get('v')!);
  }
  if (versions.some(v => /^[1-9][0-9]*$/.test(v) && v !== '1')) fail('unsupported_version', 'This decoder supports only v=1; do not rewrite the bookmark.');
  if (versions.some(v => !/^[1-9][0-9]*$/.test(v))) fail('invalid_version', 'v must be a positive integer.');
  if (versions.length > 1) fail('duplicate_singleton', 'Only one value is allowed for v');
  if (/[\x00-\x20\x7f]/.test(url) || /%(?![0-9a-fA-F]{2})/.test(url) || url.includes('#') || url.startsWith('//') || /^[a-zA-Z][\w+.-]*:/.test(url)) fail('invalid_url', 'Use an encoded local relative URL without fragments.');
  const path = url.split('?')[0]; let route: string; let destination: string | null = null;
  const pairs: Pair[] = queryPart.split('&').filter(Boolean).map(field => {
    const equal = field.indexOf('=');
    return [strictDecode(equal < 0 ? field : field.slice(0, equal)), strictDecode(equal < 0 ? '' : field.slice(equal + 1))];
  });
  if (path.startsWith('/prototype/equipment/')) {
    const rawId = path.slice('/prototype/equipment/'.length);
    if (rawId.includes('/')) fail('invalid_route', 'Encode the EquipmentID as one path segment.');
    try { destination = identifier(decodeURIComponent(rawId)); } catch (error) {
      if (error instanceof ContractError) throw error;
      fail('invalid_url', 'Invalid UTF-8 encoding; correct the URL.');
    }
    route = 'equipment';
  } else if (['/prototype/context', '/prototype/reference'].includes(path)) route = path.split('/').at(-1)!;
  else return fail('invalid_route', 'Use a registered prototype route.');
  const query = new Map<string, string[]>();
  for (const [key, value] of pairs) query.set(key, [...(query.get(key) ?? []), value]);
  for (const key of single) if ((query.get(key)?.length ?? 0) > 1) fail('duplicate_singleton', 'Only one value is allowed for ' + key);
  if (query.has('equipmentIds') && query.has('selectedEquipmentIds')) fail('alias_conflict', 'Do not supply both EquipmentID selection aliases.');
  function readSet(key: string, marker: string): string[] | null {
    if (query.has(marker)) {
      if (query.get(marker)![0] !== 'none' || query.has(key)) fail('invalid_set', 'Empty-set marker conflicts with IDs or has an invalid value.');
      return [];
    }
    return query.has(key) ? normalized(query.get(key)!) : null;
  }
  const scope = query.has('scopeId') ? identifier(query.get('scopeId')![0]) : null;
  const condition = query.has('equipmentGroup') ? decodeCondition(query.get('equipmentGroup')![0]) : null;
  return { route, scope_id: scope, room_names: readSet('roomNames', 'roomSelection'), condition,
    selection: readSet(query.has('equipmentIds') ? 'equipmentIds' : 'selectedEquipmentIds', 'equipmentSelection'), destination,
    extras: pairs.filter(([key]) => !registered.has(key)), unapplied_globals: pairs.filter(([key]) => outsideProfile.has(key)) };
}
// Python quote_plus keeps '~' and percent-encodes !'()*; URLSearchParams differs.
function quote(value: string): string { return encodeURIComponent(value).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()); }
export function serialize(state: ContextState): string {
  if (!capabilities.includes(state.route) || (state.route === 'equipment') !== (state.destination !== null)) fail('invalid_route', 'Unknown route or invalid destination ID.');
  let path = '/prototype/' + state.route;
  if (state.destination !== null) path += '/' + quote(identifier(state.destination));
  const pairs: Pair[] = [['v', '1']];
  if (state.scope_id !== null) pairs.push(['scopeId', identifier(state.scope_id)]);
  for (const [key, marker, values] of [['roomNames', 'roomSelection', state.room_names], ['selectedEquipmentIds', 'equipmentSelection', state.selection]] as const) {
    if (values !== null) {
      if (!values.length) pairs.push([marker, 'none']);
      else for (const value of normalized(values)) pairs.push([key, value]);
    }
  }
  if (state.condition !== null) {
    const { axis, values } = state.condition;
    if (!Object.hasOwn(fields, axis) || values.length !== fields[axis].length) fail('invalid_condition', 'Invalid Condition shape.');
    const obj: Record<string, string> = { axis };
    fields[axis].forEach((key, i) => { obj[key] = identifier(values[i]); });
    pairs.push(['equipmentGroup', JSON.stringify(obj)]);
  }
  if (state.unapplied_globals.some(([key]) => !outsideProfile.has(key))) fail('invalid_unapplied', 'Only registered out-of-profile fields can be preserved here.');
  pairs.push(...state.unapplied_globals);
  if (state.extras.some(([key]) => registered.has(key))) fail('invalid_extras', 'Registered fields cannot be supplied as extras.');
  pairs.push(...state.extras);
  const url = path + '?' + pairs.map(pair => pair.map(v => quote(v).replace(/%20/g, '+')).join('=')).join('&');
  parseUrl(url);
  return url;
}
export function contextLink(state: ContextState, route: string, destination: string | null = null): string {
  return serialize({ ...state, route, destination, extras: [] });
}
export const restoreContext = parseUrl;
