import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DeclarationBundleError, loadDeclarationBundle } from '../declarations-file.js';

import { routedBundle } from './bundle-fixtures.js';

let dir: string;
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'routing-bundle-')); });
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });
let serial = 0;
async function load(value: unknown) {
  const file = join(dir, `${serial++}.json`);
  await writeFile(file, JSON.stringify(value));
  return loadDeclarationBundle(file);
}

describe('ADR-0153 declaration bundle', () => {
  it('accepts a bounded SQL route with typed params and row Scope enforcement', async () => {
    expect(await load(routedBundle())).toEqual(routedBundle());
  });
});

const baseOwner = () => routedBundle().endpointOwners['syn.rows'];
const ownerBundle = (over: Record<string, unknown>, endpoint: Record<string, unknown> = {}, root: Record<string, unknown> = {}) => ({
  ...routedBundle(), ...root,
  endpoints: [{ ...routedBundle().endpoints[0], ...endpoint }],
  endpointOwners: { 'syn.rows': { ...baseOwner(), ...over } },
});
const statement = (params: Record<string, unknown>) => ({ statement: `SELECT ${Object.keys(params).map((key) => `:${key}`).join(', ') || '1'}`, params });
const route = (rooms?: string[]) => ({ sites: ['SITE-A'], ...(rooms ? { rooms } : {}), targets: ['tgt-1'] });
const httpTarget = { kind: 'http', baseUrl: 'https://target.test' };
const httpCall = { mode: 'mapped', method: 'POST', path: '/rows', body: { rooms: 'scope.rooms' }, response: { rows: '/data' } };
const paging = { paramKeys: ['page', 'pageSize', 'q'], limits: undefined };
const resolveKeys = { mode: 'resolve-keys', lookup: statement({ keys: 'params.q' }), keys: 'params.q', siteField: '/site', roomField: '/room' };

// Expected problem lines are literals so deleting a check cannot silently weaken its assertion.
it.each([
  ['unknown target', ownerBundle({ routes: [{ ...route(), targets: ['missing'] }] }), 'endpoint syn.rows: route 0: unknown target id missing'],
  ['kind mismatch', ownerBundle({}, {}, { targets: { 'tgt-1': httpTarget } }), 'endpoint syn.rows: route 0: call kind does not match target tgt-1'],
  ['missing sites', ownerBundle({ routes: [{ targets: ['tgt-1'] }] }), 'endpoint syn.rows: route 0: requiresScope route needs sites'],
  ['scope-free sites', ownerBundle({}, { requiresScope: false }), 'endpoint syn.rows: route 0: scope-free route cannot declare sites or rooms'],
  ['scope-free rooms', ownerBundle({ routes: [{ rooms: ['RA1'], targets: ['tgt-1'] }] }, { requiresScope: false }), 'endpoint syn.rows: route 0: scope-free route cannot declare sites or rooms'],
  ['mixed room routing', ownerBundle({ routes: [route(), route(['RA2'])] }), 'endpoint syn.rows: route 1: site mixes routes with and without rooms'],
  ['overlap', ownerBundle({ routes: [route(['RA1']), route(['RA1', 'RA2'])] }), 'endpoint syn.rows: route 1: overlapping rooms for one site'],
  ['unbounded overlap', ownerBundle({ routes: [route(), route()] }), 'endpoint syn.rows: route 1: overlapping rooms for one site'],
  ['envelope fan-out', ownerBundle({ call: { mode: 'envelope' }, routes: [{ ...route(), targets: ['tgt-1', 'tgt-2'] }] }, { limits: undefined }, { targets: { 'tgt-1': httpTarget, 'tgt-2': httpTarget } }), 'endpoint syn.rows: route 0: envelope call cannot select more than one target'],
  ['missing scopeCheck', ownerBundle({ scopeCheck: undefined }), 'endpoint syn.rows: requiresScope core-answered endpoint needs scopeCheck'],
  ['missing rooms binding', ownerBundle({ call: statement({ q: 'params.q' }) }), 'endpoint syn.rows: route 0: verify-rows call must bind scope.rooms'],
  ['multi-site binding', ownerBundle({ routes: [{ ...route(), sites: ['SITE-A', 'SITE-B'] }], scopeCheck: { mode: 'verify-rows', siteField: '/site', roomField: '/room' } }), 'endpoint syn.rows: route 0: multi-site verify-rows call must bind scope.site'],
  ['multi-site row field', ownerBundle({ routes: [{ ...route(), sites: ['SITE-A', 'SITE-B'] }], call: statement({ rooms: 'scope.rooms', site: 'scope.site' }) }), 'endpoint syn.rows: route 0: multi-site scopeCheck needs siteField'],
  ['aggregate guard', ownerBundle({ scopeCheck: { ...resolveKeys, keys: { const: [] } }, call: statement({ q: 'params.q' }) }), 'endpoint syn.rows: route 0: resolve-keys without keys must bind scope.rooms in the main call'],
  ['lookup kind', ownerBundle({ scopeCheck: { ...resolveKeys, lookup: httpCall } }), 'endpoint syn.rows: route 0: scopeCheck.lookup kind does not match target tgt-1'],
  ['paged filter', ownerBundle({ scopeCheck: { mode: 'drop-rows', roomField: '/room' }, merge: { maxWindow: 100 } }, paging), 'endpoint syn.rows: scopeCheck.mode drop-rows is refused on a paged endpoint'],
  ['paged partial', ownerBundle({ merge: { maxWindow: 100, partial: 'coverage' } }, paging), 'endpoint syn.rows: merge.partial is refused on a paged endpoint'],
  ['missing coverage kind', ownerBundle({ merge: { partial: 'coverage' } }, { kinds: [] }), 'endpoint syn.rows: merge.partial coverage requires coverage in kinds'],
  ['sort tie-break', ownerBundle({ merge: { sort: [{ field: 'id', direction: 'asc' }] } }), 'endpoint syn.rows: merge.sort last field must declare unique: true'],
  ['untyped param', ownerBundle({}, { paramTypes: undefined }), 'endpoint syn.rows: binding params.q: param must be declared in paramKeys and paramTypes'],
  ['undeclared param', ownerBundle({}, { paramKeys: [] }), 'endpoint syn.rows: binding params.q: param must be declared in paramKeys and paramTypes'],
  ['unapplied wire context', ownerBundle({ call: statement({ rooms: 'scope.rooms', t: 'context.from' }) }, { context: { time: 'reference' } }), 'endpoint syn.rows: binding context.from: context wire field is not applied'],
  ['capability instead of wire field', ownerBundle({ call: statement({ rooms: 'scope.rooms', t: 'context.time' }) }), 'endpoint syn.rows: binding context.time: context wire field is not applied'],
  ['no row limit', ownerBundle({}, { limits: undefined }), 'endpoint syn.rows: non-paged core-answered endpoint needs limits.maxRows'],
  ['paged maxRows', ownerBundle({ merge: { maxWindow: 100 } }, { paramKeys: ['q', 'page', 'pageSize'] }), 'endpoint syn.rows: limits.maxRows is refused on a paged core-answered endpoint'],
  ['no maxWindow', ownerBundle({}, paging), 'endpoint syn.rows: paged core-answered endpoint needs merge.maxWindow'],
  ['filters', ownerBundle({}, { paramKeys: ['q', 'filters'] }), 'endpoint syn.rows: filters is refused on a core-answered endpoint'],
  ['envelope maxRows', ownerBundle({ call: { mode: 'envelope' } }, {}, { targets: { 'tgt-1': httpTarget } }), 'endpoint syn.rows: limits.maxRows is refused on an envelope destination'],
])('refuses %s with an exact boot problem', async (_name, value, problem) => {
  try { await load(value); throw new Error('bundle accepted'); } catch (error) {
    expect(error).toBeInstanceOf(DeclarationBundleError);
    expect((error as DeclarationBundleError).problems).toContain(problem);
  }
});

it.each([
  ['different rooms', ownerBundle({ routes: [route(['RA1']), route(['RA2'])] })],
  ['different sites, same rooms', ownerBundle({ routes: [route(['RA1']), { ...route(['RA1']), sites: ['SITE-B'] }], call: statement({ rooms: 'scope.rooms', site: 'scope.site' }), scopeCheck: { mode: 'verify-rows', siteField: '/site', roomField: '/room' } })],
  ['scope-free route', ownerBundle({ routes: [{ targets: ['tgt-1'] }], scopeCheck: undefined }, { requiresScope: false })],
  ['one envelope target', ownerBundle({ call: { mode: 'envelope' } }, { limits: undefined }, { targets: { 'tgt-1': httpTarget } })],
  ['mapped HTTP', ownerBundle({ call: httpCall }, {}, { targets: { 'tgt-1': httpTarget } })],
  ['route call override', ownerBundle({ routes: [{ ...route(), call: httpCall }], call: undefined }, {}, { targets: { 'tgt-1': httpTarget } })],
  ['paged with maxWindow', ownerBundle({ merge: { maxWindow: 100 } }, paging)],
  ['nonpaged drop rows', ownerBundle({ scopeCheck: { mode: 'drop-rows', roomField: '/room' }, call: statement({}) })],
  ['keyed guard', ownerBundle({ scopeCheck: resolveKeys, call: statement({ q: 'params.q' }) })],
  ['aggregate guard', ownerBundle({ scopeCheck: { ...resolveKeys, keys: { const: [] } } })],
  ['coverage kind', ownerBundle({ merge: { partial: 'coverage' } })],
  ['unique last sort', ownerBundle({ merge: { sort: [{ field: 'value', direction: 'desc' }, { field: 'id', direction: 'asc', unique: true }] } })],
  ['wire context and constant bindings', ownerBundle({ call: statement({ rooms: 'scope.rooms', from: 'context.from', fixed: { const: { enabled: true } } }) })],
  ['procedure', ownerBundle({ call: { procedure: 'syn.proc_rows', args: { rooms: 'scope.rooms' }, listJoin: { rooms: ',' }, response: { fields: { value: { from: '/v', type: 'number' } } } } })],
  ['unrouted rooms skip', ownerBundle({ unroutedRooms: 'skip' })],
  ['unrouted rooms error', ownerBundle({ unroutedRooms: 'error' })],
])('accepts %s', async (_name, value) => {
  await expect(load(value)).resolves.toBeDefined();
});

it('keeps a string-only bundle deep-equal to the existing loaded shape', async () => {
  const value = { ...routedBundle(), endpoints: [{ id: 'syn.rows', menuId: 'syn', paramKeys: [], permission: 'syn:view', requiresScope: false, context: {}, mergeTimeDomain: false }], endpointOwners: { 'syn.rows': '/rows' } };
  const { targets: _targets, ...legacy } = value;
  expect(await load(legacy)).toEqual(legacy);
  expect(await load({ ...legacy, endpoints: legacy.endpoints.map((row) => ({ ...row, limits: { maxHours: 24 }, context: { time: 'apply' } })) }))
    .toEqual({ ...legacy, endpoints: legacy.endpoints.map((row) => ({ ...row, limits: { maxHours: 24 }, context: { time: 'apply' } })) });
});

it.each([
  ['target map injectivity', ownerBundle({}, {}, { targets: { 'tgt-1': { ...routedBundle().targets['tgt-1'], valueMap: { site: { 'SITE-A': 'one', 'SITE-B': 'one' } } } } }), 'targets.tgt-1.valueMap.site: valueMap must be injective'],
  ['route map injectivity', ownerBundle({ routes: [{ ...route(), valueMap: { room: { RA1: 'one', RA2: 'one' } } }] }), 'endpointOwners.syn.rows.routes.0.valueMap.room: valueMap must be injective'],
  ['SQL placeholder missing binding', ownerBundle({ call: { statement: 'SELECT :q, :missing', params: { q: 'params.q' } } }), 'endpoint syn.rows: route 0: target tgt-1: call SQL placeholders must match params exactly'],
  ['SQL extra binding', ownerBundle({ call: { statement: 'SELECT :q', params: { q: 'params.q', rooms: 'scope.rooms' } } }), 'endpoint syn.rows: route 0: target tgt-1: call SQL placeholders must match params exactly'],
  ['SQL keyword', ownerBundle({ call: { statement: 'DELETE FROM syn.rows', params: {} } }), 'endpoint syn.rows: route 0: target tgt-1: call statement must start with SELECT or WITH after whitespace/comments'],
  ['postgres array placeholder needs its binding', ownerBundle({ call: { statement: 'SELECT ARRAY[:n], :q', params: { q: 'params.q' } } }), 'endpoint syn.rows: route 0: target tgt-1: call SQL placeholders must match params exactly'],
  ['resolve-keys lookup placeholder', ownerBundle({ scopeCheck: { ...resolveKeys, lookup: { statement: 'SELECT :keys, :missing', params: { keys: 'params.q' } } } }), 'endpoint syn.rows: route 0: target tgt-1: scopeCheck.lookup SQL placeholders must match params exactly'],
  ['mssql brackets are not postgres identifiers', ownerBundle({ call: { statement: 'SELECT [a:b] FROM t WHERE r = :rooms AND q = :q', params: { rooms: 'scope.rooms', q: 'params.q' } } }), 'endpoint syn.rows: route 0: target tgt-1: call SQL placeholders must match params exactly'],
  ['mssql target sees no dollar quoting', ownerBundle({ call: { statement: 'SELECT $x$ :hidden $x$ FROM t WHERE r = :rooms AND q = :q', params: { rooms: 'scope.rooms', q: 'params.q' } } }, {}, { targets: { 'tgt-1': { kind: 'sql', dialect: 'mssql', connectionFile: '/secrets/syn-db' } } }), 'endpoint syn.rows: route 0: target tgt-1: call SQL placeholders must match params exactly'],
  ['unused default call on HTTP-only routes', ownerBundle({ routes: [{ ...route(), call: httpCall }] }, {}, { targets: { 'tgt-1': httpTarget } }), 'endpoint syn.rows: call is overridden by every route; remove the unused default'],
  ['missing default call', ownerBundle({ call: undefined }), 'endpoint syn.rows: call is required for routes without their own call'],
  ['procedure identifier', ownerBundle({ call: { procedure: 'syn.proc_rows; SELECT 1', args: {} } }), 'endpointOwners.syn.rows.call.procedure: procedure must have 1 to 3 identifier parts'],
  ['actor binding', ownerBundle({ call: statement({ rooms: 'actor.email' }) }), 'endpointOwners.syn.rows.call.params.rooms: binding must use the closed vocabulary'],
  ['binding expression', ownerBundle({ call: statement({ rooms: 'scope.rooms.map(x => x)' }) }), 'endpointOwners.syn.rows.call.params.rooms: binding must use the closed vocabulary'],
  ['invalid string bound', ownerBundle({}, { paramTypes: { q: { type: 'string', maxLength: 0 } } }), 'endpoints.0.paramTypes.q.maxLength: Number must be greater than 0'],
  ['invalid array bound', ownerBundle({}, { paramTypes: { q: { type: 'string[]', maxItems: 0 } } }), 'endpoints.0.paramTypes.q.maxItems: Number must be greater than 0'],
  ['wrong enum type', ownerBundle({}, { paramTypes: { q: { type: 'number', enum: ['secret-value'] } } }), 'endpoints.0.paramTypes.q.enum: enum values must match the declared param type'],
  ['invalid baseUrl', ownerBundle({}, {}, { targets: { 'tgt-1': { kind: 'http', baseUrl: 'https://user:secret-value@target.test' } } }), 'targets.tgt-1.baseUrl: baseUrl must be an absolute http(s) URL without credentials, query, fragment or whitespace'],
  ['relative mapped path', ownerBundle({ call: { ...httpCall, path: 'https://target.test/rows' } }), 'endpointOwners.syn.rows.call.path: path must be fixed and absolute with whole-segment {name} variables only'],
  ['partial path variable', ownerBundle({ call: { ...httpCall, path: '/rows/prefix-{key}' } }), 'endpointOwners.syn.rows.call.path: path must be fixed and absolute with whole-segment {name} variables only'],
  ['unbound path variable', ownerBundle({ call: { ...httpCall, path: '/rows/{key}' } }), 'endpointOwners.syn.rows.call.pathParams: path variables must match pathParams exactly'],
])('refuses %s without echoing supplied secrets', async (_name, value, problem) => {
  try { await load(value); throw new Error('bundle accepted'); } catch (error) {
    expect(error).toBeInstanceOf(DeclarationBundleError);
    expect((error as DeclarationBundleError).problems).toContain(problem);
    expect((error as Error).message).not.toContain('secret-value');
  }
});

it.each([
  ['injective maps', ownerBundle({ routes: [{ ...route(), valueMap: { room: { RA1: 'one', RA2: 'two' } } }] }, {}, { targets: { 'tgt-1': { ...routedBundle().targets['tgt-1'], valueMap: { site: { 'SITE-A': 'A', 'SITE-B': 'B' } } } } })],
  ['all param types', ownerBundle({}, { paramTypes: { q: { type: 'string', maxLength: 20, enum: ['x'] }, n: { type: 'number', enum: [1] }, yes: { type: 'boolean', enum: [true] }, ids: { type: 'string[]', maxLength: 30, maxItems: 10 } }, paramKeys: ['q', 'n', 'yes', 'ids'] })],
  ['mapped path binding', ownerBundle({ call: { ...httpCall, path: '/rows/{key}', pathParams: { key: 'params.q' }, query: { from: 'context.from' }, arrayStyle: { mode: 'repeat' }, response: { fields: { value: { from: '/v', type: 'string' } } } } }, {}, { targets: { 'tgt-1': httpTarget } })],
  ['SQL response fields', ownerBundle({ call: { ...baseOwner().call, response: { fields: { stamp: { from: '/stamp', type: 'wallclock' } } } } })],
  ['mssql bracketed identifier', ownerBundle({ call: { statement: 'SELECT [a:b] FROM t WHERE r = :rooms AND q = :q', params: { rooms: 'scope.rooms', q: 'params.q' } } }, {}, { targets: { 'tgt-1': { kind: 'sql', dialect: 'mssql', connectionFile: '/secrets/syn-db' } } })],
  ['resolve-keys lookup on mssql', ownerBundle({ scopeCheck: { ...resolveKeys, lookup: { statement: 'SELECT [k:v], :keys', params: { keys: 'params.q' } } } }, {}, { targets: { 'tgt-1': { kind: 'sql', dialect: 'mssql', connectionFile: '/secrets/syn-db' } } })],
])('accepts %s schema', async (_name, value) => {
  await expect(load(value)).resolves.toBeDefined();
});

it.each([
  ['string owner maxRows', { ...routedBundle(), endpointOwners: { 'syn.rows': '/rows' } }, 'endpoint syn.rows: limits.maxRows is refused on a declared endpoint: the engine would map an upstream ok to too_large, a Fastify-made outcome (ADR-0095 prohibition 7)'],
  ['missing sort field', ownerBundle({ merge: { sort: [{ direction: 'asc', unique: true }] } }), 'endpointOwners.syn.rows.merge.sort.0.field: Required'],
  ['unknown kind', ownerBundle({}, { kinds: ['secret-value'] }), 'endpoints.0.kinds.0: value is not in the allowed vocabulary'],
  ['paged envelope partial', ownerBundle({ call: { mode: 'envelope' }, merge: { partial: 'coverage' } }, paging, { targets: { 'tgt-1': httpTarget } }), 'endpoint syn.rows: merge.partial is refused on a paged endpoint'],
])('refuses %s', async (_name, value, problem) => {
  try { await load(value); throw new Error('bundle accepted'); } catch (error) {
    expect(error).toBeInstanceOf(DeclarationBundleError);
    expect((error as DeclarationBundleError).problems).toContain(problem);
    expect((error as Error).message).not.toContain('secret-value');
  }
});

it('accepts optional param bounds and absent kinds without altering the declared rows', async () => {
  const value = ownerBundle({}, { paramTypes: { q: { type: 'string' } }, kinds: undefined });
  const loaded = await load(value);
  expect(loaded.endpoints[0]?.paramTypes).toEqual({ q: { type: 'string' } });
  expect(loaded.endpoints[0]?.kinds ?? []).toEqual([]);
});

it('checks target multi-site use across endpoint declarations, not just within one route', async () => {
  const first = routedBundle();
  const second = { ...first.endpoints[0], id: 'syn.other' };
  const value = { ...first, endpoints: [...first.endpoints, second], endpointOwners: { ...first.endpointOwners, 'syn.other': { ...baseOwner(), routes: [{ ...route(['RA1']), sites: ['SITE-B'] }] } } };
  try { await load(value); throw new Error('bundle accepted'); } catch (error) {
    expect(error).toBeInstanceOf(DeclarationBundleError);
    expect((error as DeclarationBundleError).problems).toContain('endpoint syn.rows: route 0: multi-site verify-rows call must bind scope.site');
    expect((error as DeclarationBundleError).problems).toContain('endpoint syn.other: route 0: multi-site verify-rows call must bind scope.site');
  }
});

it('defaults unroutedRooms to error and core kinds to an empty list', async () => {
  const loaded = await load(ownerBundle({ unroutedRooms: undefined }, { kinds: undefined }));
  const owner = loaded.endpointOwners['syn.rows'];
  if (!owner || typeof owner === 'string') throw new Error('routing owner missing');
  expect(owner.unroutedRooms).toBe('error');
  expect(loaded.endpoints[0]?.kinds).toEqual([]);
});
