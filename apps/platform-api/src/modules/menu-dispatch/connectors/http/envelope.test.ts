import { handleRouted } from '../../routed-handler.js';
import { defined } from '../../../../test-support/defined.js';
import { routedBootProblems } from '../../routing.js';
import type { DeclarationBundle, Routing } from '../../declarations-file.js';
import { createHttpConnector } from './mapped.js';
import { generateKeyPairSync } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createMenuForwarder, type MenuUpstreamFetch, type MenuForwarder } from '../../forwarder.js';
import { createIdentityTokenSigner } from '../../identity-token.js';
import type { EndpointHandlerArgs } from '../../types.js';

const args: EndpointHandlerArgs = { actor: { actor_id: 'syn-actor', workspace_id: 'syn-workspace', role_level: 'user' }, context: { scopeId: 'S1', roomNames: null }, params: {}, scopes: [{ site: 'S1', rooms: ['R1', 'R2'] }, { site: 'S2', rooms: ['R3'] }], correlationId: 'syn-cid', sessionVersion: async () => 'syn-sv' };
const signer = () => createIdentityTokenSigner({ privateKeyPem: generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), keyId: 'syn-key', now: () => 100000 });
it.each(['syn-audience', undefined])('routed envelope token limits scopes to its route and uses audience %s', async (aud) => {
  const fetchImpl = vi.fn<MenuUpstreamFetch>(async () => new Response(JSON.stringify({ outcome: 'ok', data: [1], assessments: [], trust: null, correlationId: 'syn-cid' })));
  const forwarder = createMenuForwarder({ baseUrl: 'https://legacy.test', timeoutMs: 1000, signer: signer(), fetch: fetchImpl });
  await forwarder.forward({ endpointId: 'syn.rows', path: '', args, routed: { baseUrl: 'https://synthetic.test/query', ...(aud ? { aud } : {}), site: 'S1', rooms: ['R1'] } });
  expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://synthetic.test/query');
  const init = fetchImpl.mock.calls[0]?.[1];
  const token = init?.headers['x-internal-identity'] ?? '';
  expect(JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString())).toMatchObject({ scopes: ['{"site":"S1","rooms":["R1"]}'], aud: aud ?? 'analytics', htm: 'POST', htu: '/query' });
  expect(init?.body).toBe('{"endpoint":"syn.rows","context":{"scopeId":"S1","roomNames":null},"params":{}}');
});
it('string-row forwarding retains the exact original token claims and signature', async () => {
  const tokenSigner = signer();
  const fetchImpl = vi.fn<MenuUpstreamFetch>(async () => new Response(JSON.stringify({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'syn-cid' })));
  const forwarder = createMenuForwarder({ baseUrl: 'https://legacy.test', timeoutMs: 1000, signer: tokenSigner, fetch: fetchImpl });
  await forwarder.forward({ endpointId: 'syn.rows', path: '/query', args });
  expect(fetchImpl.mock.calls[0]?.[1]?.headers['x-internal-identity']).toBe(tokenSigner.sign({ sub: 'syn-actor', wid: 'syn-workspace', sv: 'syn-sv', cid: 'syn-cid', scopes: args.scopes.map((scope) => JSON.stringify(scope)), htm: 'POST', htu: '/query' }));
});
it('refuses envelope fan-out across room routes at boot', () => {
  const bundle: DeclarationBundle = { endpoints: [{ id: 'syn.rows', menuId: 'syn', paramKeys: [], permission: 'platform:view', requiresScope: true, context: {}, mergeTimeDomain: false }], actions: [], permissions: [], targets: { t1: { kind: 'http', baseUrl: 'https://synthetic.test/a' }, t2: { kind: 'http', baseUrl: 'https://synthetic.test/b' } }, endpointOwners: { 'syn.rows': { routes: [{ sites: ['S1'], rooms: ['R1'], targets: ['t1'] }, { sites: ['S1'], rooms: ['R2'], targets: ['t2'] }], call: { mode: 'envelope' }, unroutedRooms: 'error' } } };
  expect(routedBootProblems(bundle, { http: createHttpConnector() })).toContain('envelope call cannot select more than one target');
});
it('routes an envelope through its target URL and only its selected rooms', async () => {
  const bundle: DeclarationBundle = { endpoints: [{ id: 'syn.rows', menuId: 'syn', paramKeys: [], permission: 'platform:view', requiresScope: true, context: {}, mergeTimeDomain: false }], actions: [], permissions: [], targets: { t1: { kind: 'http', baseUrl: 'https://synthetic.test/query', aud: 'syn-audience' } }, endpointOwners: {} };
  const routing: Routing = { routes: [{ sites: ['S1'], rooms: ['R1'], targets: ['t1'] }], call: { mode: 'envelope' }, unroutedRooms: 'skip' };
  const forward = vi.fn<MenuForwarder['forward']>(async () => ({ outcome: 'ok', data: [1], assessments: [], trust: null }));
  const result = await handleRouted(defined(bundle.endpoints[0]), routing, bundle, { timeoutMs: 3000, connectorFactories: {}, forwarder: { forward } }, args);
  expect(result).toMatchObject({ outcome: 'ok', data: [1] });
  expect(forward.mock.calls[0]?.[0]).toMatchObject({ args, endpointId: 'syn.rows', routed: { baseUrl: 'https://synthetic.test/query', aud: 'syn-audience', site: 'S1', rooms: ['R1'] } });
});

it('verifies an A token independently and refuses replay at B with a distinct audience', async () => {
  const { jwtVerify } = await import('jose');
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const tokenSigner = createIdentityTokenSigner({ privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), keyId: 'syn-key' });
  const fetchImpl = vi.fn<MenuUpstreamFetch>(async () => new Response(JSON.stringify({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'syn-cid' })));
  const forwarder = createMenuForwarder({ baseUrl: 'https://legacy.test', timeoutMs: 1000, signer: tokenSigner, fetch: fetchImpl });
  for (const [host, aud] of [['a', 'syn-a'], ['b', 'syn-b']]) {
    await forwarder.forward({ endpointId: 'syn.rows', path: '', args, routed: { baseUrl: `https://${host}.test/query`, aud: defined(aud), site: 'S1', rooms: ['R1'] } });
  }
  const a = defined(fetchImpl.mock.calls[0]?.[1]?.headers['x-internal-identity']);
  const b = defined(fetchImpl.mock.calls[1]?.[1]?.headers['x-internal-identity']);
  await expect(jwtVerify(a, publicKey, { algorithms: ['EdDSA'], audience: 'syn-a' })).resolves.toMatchObject({ payload: { htm: 'POST', htu: '/query' } });
  await expect(jwtVerify(b, publicKey, { algorithms: ['EdDSA'], audience: 'syn-b' })).resolves.toMatchObject({ payload: { htm: 'POST', htu: '/query' } });
  await expect(jwtVerify(a, publicKey, { algorithms: ['EdDSA'], audience: 'syn-b' })).rejects.toMatchObject({ code: 'ERR_JWT_CLAIM_VALIDATION_FAILED', claim: 'aud' });
});
