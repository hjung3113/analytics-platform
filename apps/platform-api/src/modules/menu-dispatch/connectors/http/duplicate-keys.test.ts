import { expect, it, vi } from 'vitest';
import type { DeclarationBundle, Routing } from '../../declarations-file.js';
import { MenuUpstreamError } from '../../forwarder.js';
import { runQuery } from '../../query.js';
import { handleRouted, projectRow } from '../../routed-handler.js';
import { JsonRows } from './json-rows.js';
import { createHttpConnector } from './mapped.js';

it.each([
  ['root before', '{"a":{},"a":{"b":{"rows":[1]}}}'],
  ['root after', '{"a":{"b":{"rows":[1]}},"a":{}}'],
  ['middle before', '{"a":{"b":{},"b":{"rows":[1]}}}'],
  ['middle after', '{"a":{"b":{"rows":[1]},"b":{}}}'],
  ['rows before', '{"a":{"b":{"rows":[],"rows":[1]}}}'],
  ['rows after', '{"a":{"b":{"rows":[1],"rows":[]}}}'],
  ['decoded key', '{"a":{"b":{"rows":[1]}},"\\u0061":{}}'],
  ['ancestor sibling before', '{"x":0,"x":1,"a":{"b":{"rows":[1]}}}'],
  ['ancestor sibling after', '{"a":{"b":{"rows":[1]}},"x":0,"x":1}'],
])('rejects duplicate keys at %s', (_name, body) => {
  const parser = new JsonRows('/a/b/rows');
  expect(() => [...parser.write(body, true)]).toThrow();
});

it('rejects a duplicate ancestor through an array segment after yielding a row', () => {
  const parser = new JsonRows('/a/0/rows');
  expect([...parser.write('{"a":[{"rows":[1]}]')]).toEqual([1]);
  expect(() => [...parser.write(',"a":[]}', true)]).toThrow();
});

it('keeps JSON.parse last-key semantics inside rows and ignores unrelated subtrees', () => {
  const parser = new JsonRows('/a/rows');
  const rows = [...parser.write('{"skip":{"x":0,"x":1},"a":{"rows":[{"value":0,"value":1}]}}', true)];
  expect(rows).toEqual([{ value: 1 }]);
  expect(projectRow(rows[0], { mode: 'mapped', method: 'GET', path: '/rows', response: { fields: { selected: { from: '/value' } } } })).toEqual({ selected: 1 });
});

it.each(['query', 'lookup'] as const)('discards yielded rows on a late duplicate in the mapped %s', async (mode) => {
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('{"a":{"rows":[{"site":"S1","room":"R1","value":"syn-private"}]}'));
    controller.enqueue(new TextEncoder().encode(',"a":{}}'));
    controller.close();
  } })));
  let yielded = 0;
  const http = createHttpConnector({ fetch: fetchImpl });
  const factory: typeof http = (target, secrets) => {
    const connector = http(target, secrets);
    return { async *query(leg, options) {
      for await (const row of connector.query(leg, options)) { yielded++; yield row; }
    } };
  };
  const endpoint = { id: 'syn.rows', menuId: 'syn', permission: 'platform:view', paramKeys: ['key'], requiresScope: mode === 'lookup', context: {}, mergeTimeDomain: false, limits: { maxRows: 5 } };
  const owner: Routing = {
    call: { mode: 'mapped', method: 'GET', path: '/main', response: { rows: '/a/rows' } },
    routes: [{ ...(mode === 'lookup' ? { sites: ['S1'] } : {}), targets: ['t1'] }], unroutedRooms: 'error',
    ...(mode === 'lookup' ? { scopeCheck: { mode: 'resolve-keys', keys: 'params.key', lookup: { mode: 'mapped', method: 'GET', path: '/lookup', query: { key: 'params.key' }, response: { rows: '/a/rows' } }, siteField: '/site', roomField: '/room' } as const } : {}),
  };
  const bundle: DeclarationBundle = { endpoints: [endpoint], actions: [], permissions: [], targets: { t1: { kind: 'http', baseUrl: 'https://synthetic.test' } }, endpointOwners: { 'syn.rows': owner } };
  const result = runQuery({ ok: true, context: mode === 'lookup' ? { scopeId: 'S1' } : {}, params: { key: 'syn-key' }, scopeResolver: { resolve: async () => [{ site: 'S1', rooms: ['R1'] }] }, declaration: {
    spec: endpoint, authorize: async () => true, validate: () => ({ ok: true }),
    handle: (args) => handleRouted(endpoint, owner, bundle, { connectorFactories: { http: factory }, timeoutMs: 10000 }, args),
  } }, { actor_id: 'syn-actor', workspace_id: 'syn-workspace', role_level: 'user' }, 'syn-cid');
  await expect(result).rejects.toMatchObject({ kind: 'unavailable', httpStatus: 502, message: 'menu-query upstream is unavailable' });
  const error: unknown = await result.catch((error: unknown) => error);
  expect(error).toEqual(new MenuUpstreamError('unavailable'));
  expect(error).not.toHaveProperty('data');
  expect(JSON.stringify(error)).not.toContain('syn-private');
  expect(yielded).toBe(1);
  expect(fetchImpl).toHaveBeenCalledOnce();
  expect(fetchImpl.mock.calls[0]?.[0]).toContain(mode === 'lookup' ? '/lookup?' : '/main');
});
