import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function fixtureHarness(respond) {
  const source = readFileSync(new URL('./preview-fixtures.mjs', import.meta.url), 'utf8')
    .replace(/^#!.*\n/, '')
    .replace("import { randomUUID } from 'node:crypto';", '')
    .replace('await main();', '');
  const calls = [];
  const context = vm.createContext({ URL, randomUUID: () => 'fixture-key', console, fetch: async (url, options) => {
    calls.push({ path: url.pathname, query: url.searchParams, ...options, body: options.body ? JSON.parse(options.body) : undefined });
    const result = respond(calls.at(-1));
    return new Response(JSON.stringify(result.body), { status: result.status ?? 200 });
  } });
  vm.runInContext(`${source}\nsessions['mock-admin-1'] = { cookie: 'admin1' }; sessions['mock-admin-2'] = { cookie: 'admin2' };
    globalThis.fixture = { stepToken, stepEvidence, stepIntegration, created, reused, failed };`, context);
  return { fixture: context.fixture, calls };
}

test('creates both token kinds under separate actors without retaining minted secrets', async () => {
  const { fixture, calls } = fixtureHarness(call => {
    if (call.path === '/actors') return { body: { actors: [{ id: 'system-id', actor_type: 'system' }] } };
    if (call.method === 'GET') return { body: { items: [], nextCursor: null } };
    return { status: 201, body: { token: 'DO-NOT-RETAIN', item: { id: call.path, name: call.body.name } } };
  });
  await fixture.stepToken('personal');
  await fixture.stepToken('service');
  const writes = calls.filter(call => call.method === 'POST');
  assert.equal(writes.length, 2);
  assert.equal(writes[0].headers.cookie, 'admin1');
  assert.equal(writes[1].headers.cookie, 'admin2');
  assert.equal(writes[1].body.actorId, 'system-id');
  assert.ok(writes.every(call => call.body.name.startsWith('[preview]')));
  assert.equal(JSON.stringify(fixture.created).includes('DO-NOT-RETAIN'), false);
  assert.equal(fixture.failed.length, 0);
});

test('reuses a token from a later metadata page without minting another', async () => {
  const { fixture, calls } = fixtureHarness(call => ({ body: call.query.has('cursor')
    ? { items: [{ id: 'existing', name: '[preview] Personal API token' }], nextCursor: null }
    : { items: [], nextCursor: 'next-page' } }));
  await fixture.stepToken('personal');
  assert.equal(fixture.reused[0].id, 'existing');
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.method === 'GET'));
});

test('does not mint tokens after a failed read', async () => {
  const { fixture, calls } = fixtureHarness(() => ({ status: 403, body: { code: 'permission.denied' } }));
  await fixture.stepToken('personal');
  assert.equal(calls.length, 1);
  assert.equal(fixture.failed[0].code, 'permission.denied');
});

test('adds and reuses marked Finding evidence through its API', async () => {
  let row;
  const { fixture, calls } = fixtureHarness(call => {
    if (call.method === 'GET') return { body: { items: row ? [row] : [] } };
    row = { id: 'evidence-id', ...call.body };
    return { status: 201, body: row };
  });
  await fixture.stepEvidence({ id: 'finding-id' });
  await fixture.stepEvidence({ id: 'finding-id' });
  assert.equal(calls.filter(call => call.method === 'POST').length, 1);
  assert.equal(fixture.reused[0].id, 'evidence-id');
  assert.equal(fixture.failed.length, 0);
});

test('checks a recovery detail supplied by the pending permission request projection', async () => {
  const { fixture, calls } = fixtureHarness(call => ({ body: call.path.endsWith('/recovery-items')
    ? { items: [{ recovery_item_id: 'r1_preview', source: { id: 'request-id' } }], page: { has_more: false } }
    : { recovery_item_id: 'r1_preview' } }));
  await fixture.stepIntegration({ id: 'request-id' });
  assert.equal(calls.length, 2);
  assert.equal(fixture.reused[0].kind, 'integration_detail');
  assert.equal(fixture.reused[0].id, 'r1_preview');
  assert.equal(calls[0].query.get('category'), 'permission-requests-pending');
  assert.equal(fixture.failed.length, 0);
});
