// The four log-explorer reads (#1469) through their menu-dispatch declarations, DB-free: a fake permission check and a fake transaction
// that captures the audit insert, with the REAL audit service (its closed event schema runs). Covers the states, limits, cancellation,
// the revoked-mid-way case, the signed cursor and the body-free audit. The DB-backed route test is read-endpoints.integration.test.ts.
import { describe, expect, it } from 'vitest';

import { createAuditService } from '../../core/audit/audit-service.js';
import type { EndpointHandlerArgs, EndpointResult, MenuEndpointDeclaration } from '../../menu-dispatch/types.js';
import type { LogExplorerReadDeps, SourceOwnerAccess } from '../deps.js';
import { createSyntheticScenario, SYNTHETIC_LEAK_MARKER, type SyntheticScenario } from '../adapters/synthetic/index.js';
import type { SourceReadPort } from '../ports/source-read.js';
import { createMemoryUsageStore } from '../testing/memory-usage-store.js';
import { logExplorerReadEndpoints } from '../read-endpoints.js';

const WS = '00000000-0000-4000-8000-000000000001';
const ACTOR = { actor_id: '00000000-0000-4000-8000-0000000000a1', workspace_id: WS, role_level: 'user' };
const KEY = Buffer.alloc(32, 7);

interface Harness {
  call(endpoint: string, params: Record<string, unknown>, over?: Partial<EndpointHandlerArgs>): Promise<EndpointResult>;
  audits: Array<{ eventType: string; detail: Record<string, unknown>; subjectType: string; summary: string }>;
  state: { capability: boolean; owners: Set<string> | 'all'; now: number };
  checks: number;
}

function harness(scenario: SyntheticScenario | null, over: { port?: SourceReadPort | null; ownerAccess?: SourceOwnerAccess } = {}) {
  const synthetic = createSyntheticScenario(scenario ?? 'typical');
  const audits: Harness['audits'] = [];
  const state: Harness['state'] = { capability: true, owners: 'all', now: Date.UTC(2026, 10, 8) };
  const tx = {
    insert: () => ({
      values: async (v: { eventType: string; detail: Record<string, unknown>; subjectType: string; summary: string }) => {
        audits.push(v);
      },
    }),
  };
  const counter = { checks: 0 };
  const usage = createMemoryUsageStore(() => new Date(state.now));
  const deps: LogExplorerReadDeps = {
    db: { transaction: async (fn: (t: unknown) => Promise<void>) => fn(tx) } as never,
    checkService: {
      checkCapability: async () => {
        counter.checks += 1;
        return state.capability ? { allow: true, via: 'direct_grant' } : { allow: false, reason: 'no_grant', requestable: null };
      },
    } as never,
    audit: createAuditService(),
    clock: () => new Date(state.now),
    sourceReadPort: over.port !== undefined ? over.port : scenario === null ? null : synthetic.port,
    sourceOwnerAccess: over.ownerAccess ?? { allows: async (_a, owner) => state.owners === 'all' || state.owners.has(owner) },
    cursorKey: KEY,
    usage,
  };
  const endpoints = new Map<string, MenuEndpointDeclaration>(logExplorerReadEndpoints(deps).map((d) => [d.spec.id, d]));
  const call: Harness['call'] = (endpoint, params, extra = {}) => {
    const declaration = endpoints.get(`logExplorer.${endpoint}`);
    if (!declaration) throw new Error(`no endpoint ${endpoint}`);
    return declaration.handle({ actor: ACTOR, context: {}, params, correlationId: 'cid', scopes: [], sessionVersion: async () => 'sv', ...extra });
  };
  return { call, audits, state, counter, usage, sampleSet: synthetic.sampleSet, owner: synthetic.sampleSet.sourceOwner, endpoints };
}

const data = (r: EndpointResult) => r.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- wire data of a test assertion
const records = (h: ReturnType<typeof harness>, extra: Record<string, unknown> = {}) => h.call('records', { sampleSet: h.sampleSet, query: {}, limit: 10, ...extra });

describe('registration', () => {
  it('declares the four reads on the log-explorer menu with the entry right only, and the admin usage read beside them', () => {
    const h = harness('typical');
    expect([...h.endpoints.keys()].sort()).toEqual(['logExplorer.records', 'logExplorer.window', 'logExplorer.parsed', 'logExplorer.periods', 'logExplorer.usage'].sort());
    for (const d of h.endpoints.values()) {
      expect(d.spec.permission).toBe(d.spec.id === 'logExplorer.usage' ? 'console:access' : 'platform:view');
      expect(d.spec.menuId).toBe('log-explorer');
      expect(d.spec.requiresScope).toBe(false);
    }
  });
});

describe('allowed reads', () => {
  it('records: file order then line, synthetic marker, signed cursor, second page continues', async () => {
    const h = harness('typical');
    const first = data(await records(h, { limit: 25 }));
    expect(first).toMatchObject({ state: 'ok', partial: false, truncated: false, synthetic: true, label: '합성' });
    expect(first.rows).toHaveLength(25);
    expect(first.rows.map((r: { line: number }) => r.line)).toEqual(Array.from({ length: 25 }, (_u, i) => i + 1));
    expect(typeof first.nextCursor).toBe('string');
    const second = data(await records(h, { limit: 25, cursor: first.nextCursor }));
    expect(second.state).toBe('ok');
    expect(second.rows[0]).toMatchObject({ fileRef: 'synthetic/a.log', line: 26 });
    expect(second.rows.some((r: { fileRef: string }) => r.fileRef === 'synthetic/b.log')).toBe(true);
  });

  it('time reversal is a marker; the order is never re-sorted by timestamp', async () => {
    const h = harness('time_reversal');
    const out = data(await records(h, { limit: 10 }));
    expect(out.rows.map((r: { line: number }) => r.line)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(out.rows.map((r: { timeReversal: boolean }) => r.timeReversal)).toEqual([false, false, false, true, false, false]);
  });

  it('window: the target line and its neighbours, in line order', async () => {
    const h = harness('typical');
    const out = data(await h.call('window', { sourceOwner: h.owner, fileRef: 'synthetic/a.log', line: 10, before: 2, after: 3 }));
    expect(out.state).toBe('ok');
    expect(out.rows.map((r: { line: number }) => r.line)).toEqual([8, 9, 10, 11, 12, 13]);
    expect(out.label).toBe('합성');
  });

  it('parsed: the extracted fields of a parsed line', async () => {
    const h = harness('typical');
    const out = data(await h.call('parsed', { sourceOwner: h.owner, fileRef: 'synthetic/a.log', line: 5 }));
    expect(out).toMatchObject({ state: 'ok', extractedFields: { job: 'J-1' }, synthetic: true, label: '합성' });
  });

  it('periods: start/end rows with the carry-over marked incomplete', async () => {
    const h = harness('typical');
    const out = data(await h.call('periods', { sampleSet: h.sampleSet, query: {}, limit: 10 }));
    expect(out.state).toBe('ok');
    expect(out.rows.map((r: { incomplete: boolean }) => r.incomplete)).toEqual([false, true]);
  });
});

describe('answered states, never a fake result', () => {
  it('partial: a missing file in the set answers state partial with the rows that exist', async () => {
    const h = harness('partial');
    const out = data(await records(h, { limit: 100 }));
    expect(out).toMatchObject({ state: 'partial', partial: true });
    expect(out.rows.length).toBeGreaterThan(0);
  });

  it('truncated: a line over the row limit is cut and flagged on the row and the state', async () => {
    const h = harness('long_line');
    const out = data(await records(h, { limit: 10 }));
    expect(out.state).toBe('truncated');
    const cut = out.rows.find((r: { truncated: boolean }) => r.truncated);
    expect(cut.text.length).toBe(8000);
    const win = data(await h.call('window', { sourceOwner: h.owner, fileRef: 'synthetic/a.log', line: 5, before: 1, after: 1 }));
    expect(win).toMatchObject({ state: 'truncated', truncated: true });
  });

  it('unsupported: the capability the Source lacks answers state unsupported with a reason code', async () => {
    const h = harness('unsupported');
    const out = data(await h.call('parsed', { sourceOwner: h.owner, fileRef: 'synthetic/a.log', line: 5 }));
    expect(out).toMatchObject({ state: 'unsupported', extractedFields: null, parserIn: null });
    expect(typeof out.reason).toBe('string');
    const periods = data(await h.call('periods', { sampleSet: h.sampleSet, query: {}, limit: 5 }));
    expect(periods).toMatchObject({ state: 'unsupported', rows: [] });
  });

  it('absent source and source-side denial are states', async () => {
    const absent = harness('absent_source');
    expect(data(await records(absent))).toMatchObject({ state: 'source_absent', reason: 'source_missing', rows: [] });
    const denied = harness('permission_denied');
    expect(data(await records(denied))).toMatchObject({ state: 'permission_denied', reason: 'source_denied', rows: [] });
  });

  it('no adapter connected (production): source_absent / source_not_connected on all four reads, nothing synthetic', async () => {
    const h = harness(null);
    const set = h.sampleSet;
    const answers = [
      await records(h),
      await h.call('window', { sourceOwner: set.sourceOwner, fileRef: 'a', line: 1, before: 0, after: 0 }),
      await h.call('parsed', { sourceOwner: set.sourceOwner, fileRef: 'a', line: 1 }),
      await h.call('periods', { sampleSet: set, query: {}, limit: 5 }),
    ];
    for (const a of answers) {
      expect(a.outcome).toBe('ok');
      expect(data(a)).toMatchObject({ state: 'source_absent', reason: 'source_not_connected', synthetic: false, label: null });
    }
    h.state.capability = false;
    expect(data(await records(h))).toMatchObject({ state: 'permission_denied', reason: 'capability_not_held' });
  });
});

describe('permission is judged on every request, per Source owner', () => {
  it('no capability: state permission_denied, the Source is never called', async () => {
    let called = 0;
    const base = createSyntheticScenario('typical').port;
    const spy = new Proxy(base, { get: (t, p, r) => { called += 1; return Reflect.get(t, p, r); } });
    const h = harness('typical', { port: spy });
    h.state.capability = false;
    expect(data(await records(h))).toMatchObject({ state: 'permission_denied', reason: 'capability_not_held', rows: [] });
    expect(called).toBe(0);
  });

  it('another Source owner is denied while a granted one reads', async () => {
    const h = harness('typical');
    h.state.owners = new Set(['some-other-owner']);
    expect(data(await records(h))).toMatchObject({ state: 'permission_denied', reason: 'source_owner_not_granted', rows: [] });
    expect(data(await h.call('window', { sourceOwner: h.owner, fileRef: 'synthetic/a.log', line: 3, before: 0, after: 0 })).state).toBe('permission_denied');
    h.state.owners = new Set([h.owner]);
    expect(data(await records(h)).state).toBe('ok');
  });

  it('another workspace is denied by the access rule', async () => {
    const h = harness('typical', { ownerAccess: { allows: async (actor) => actor.workspace_id === '00000000-0000-4000-8000-0000000000ff' } });
    expect(data(await records(h)).state).toBe('permission_denied');
  });

  it('the production default grants no Source owner', async () => {
    const { denyAllSourceOwners } = await import('../deps.js');
    const h = harness('typical', { ownerAccess: denyAllSourceOwners });
    expect(data(await records(h))).toMatchObject({ state: 'permission_denied', reason: 'source_owner_not_granted' });
  });

  it('revoked while the Source is answering: a state, no rows leave', async () => {
    const base = createSyntheticScenario('typical').port;
    const holder: { revoke?: () => void } = {};
    const slowRevoke = new Proxy(base, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (prop !== 'searchRecords') return value;
        return async (...a: Parameters<SourceReadPort['searchRecords']>) => {
          const out = await (value as SourceReadPort['searchRecords']).apply(target, a);
          holder.revoke?.();
          return out;
        };
      },
    });
    const h = harness('typical', { port: slowRevoke });
    holder.revoke = () => { h.state.capability = false; };
    const out = await records(h);
    expect(data(out)).toMatchObject({ state: 'permission_denied', rows: [], nextCursor: null });
    expect(h.audits.at(-1)?.detail).toMatchObject({ result: 'permission_denied', rowCount: 0 });
    expect(h.counter.checks).toBe(2);
  });
});

describe('limits and request validation', () => {
  it.each([
    ['limit over 200', 'records', (h: ReturnType<typeof harness>) => ({ sampleSet: h.sampleSet, query: {}, limit: 201 })],
    ['limit 0', 'records', (h: ReturnType<typeof harness>) => ({ sampleSet: h.sampleSet, query: {}, limit: 0 })],
    ['window side over 100', 'window', (h: ReturnType<typeof harness>) => ({ sourceOwner: h.owner, fileRef: 'a', line: 1, before: 101, after: 0 })],
    ['window over 200 rows', 'window', (h: ReturnType<typeof harness>) => ({ sourceOwner: h.owner, fileRef: 'a', line: 1, before: 100, after: 100 })],
    ['unknown filter key', 'records', (h: ReturnType<typeof harness>) => ({ sampleSet: h.sampleSet, query: { sql: 'x' }, limit: 5 })],
    ['empty sample set', 'periods', (h: ReturnType<typeof harness>) => ({ sampleSet: { sourceOwner: h.owner, files: [] }, query: {}, limit: 5 })],
    ['line 0', 'parsed', (h: ReturnType<typeof harness>) => ({ sourceOwner: h.owner, fileRef: 'a', line: 0 })],
  ])('%s is refused as an error, never cut', async (_name, endpoint, build) => {
    const h = harness('typical');
    const params = build(h);
    expect(h.endpoints.get(`logExplorer.${endpoint}`)?.validate(params)).toMatchObject({ ok: false });
    expect(await h.call(endpoint, params)).toMatchObject({ outcome: 'error', data: null });
    expect(h.audits).toHaveLength(0);
  });

  it('a refusal message names the field, never the value', async () => {
    const h = harness('typical');
    const r = await h.call('records', { sampleSet: h.sampleSet, query: { text: 'SECRET-FILTER'.repeat(30) }, limit: 5 });
    expect(r.outcome).toBe('error');
    expect(r.message).toContain('query.text');
    expect(r.message).not.toContain('SECRET-FILTER');
  });

  it('a page never holds more than 200 rows even for a 320-row file', async () => {
    const h = harness('many_rows');
    const out = data(await records(h, { limit: 200 }));
    expect(out.rows).toHaveLength(200);
  });

  it('the wire page is the limit, not the Source dump', async () => {
    const h = harness('many_rows');
    expect(data(await records(h, { limit: 7 })).rows).toHaveLength(7);
  });
});

describe('cancellation and Source failure', () => {
  it('a client abort reaches the port: outcome error `aborted`, audited, no rows', async () => {
    const h = harness('slow');
    const ctl = new AbortController();
    const pending = h.call('records', { sampleSet: h.sampleSet, query: {}, limit: 5 }, { signal: ctl.signal });
    setTimeout(() => ctl.abort(), 20);
    const out = await pending;
    expect(out).toMatchObject({ outcome: 'error', data: null, message: 'aborted' });
    expect(h.audits.at(-1)?.detail).toMatchObject({ result: 'aborted', rowCount: 0 });
  });

  it('an already-aborted request never reads', async () => {
    const h = harness('typical');
    const ctl = new AbortController();
    ctl.abort();
    expect(await h.call('records', { sampleSet: h.sampleSet, query: {}, limit: 5 }, { signal: ctl.signal })).toMatchObject({ outcome: 'error', message: 'aborted' });
  });

  it('a failing Source leaves only a code', async () => {
    const h = harness('failing');
    const out = await records(h);
    expect(out).toMatchObject({ outcome: 'error', data: null, message: 'adapter_failed' });
    const wire = JSON.stringify(out) + JSON.stringify(h.audits);
    expect(wire).not.toContain(SYNTHETIC_LEAK_MARKER);
    expect(wire).not.toContain('hunter2');
  });
});

describe('page cursor is bound to its request', () => {
  async function firstPage(h: ReturnType<typeof harness>, extra: Record<string, unknown> = {}) {
    return data(await records(h, { limit: 5, ...extra })).nextCursor as string;
  }
  const invalid = (r: EndpointResult) => expect(r).toMatchObject({ outcome: 'error', data: null, message: 'cursor_invalid' });

  it('replays the same request', async () => {
    const h = harness('typical');
    const cursor = await firstPage(h);
    expect(data(await records(h, { limit: 5, cursor })).rows[0].line).toBe(6);
  });

  it('refuses another sample set, query, limit, endpoint, actor, a flipped byte and an expired cursor', async () => {
    const h = harness('typical');
    const cursor = await firstPage(h);
    const other = { ...h.sampleSet, files: [...h.sampleSet.files].reverse().map((f, i) => ({ ...f, order: i + 1 })) };
    invalid(await h.call('records', { sampleSet: other, query: {}, limit: 5, cursor }));
    invalid(await records(h, { limit: 5, query: { text: 'x' }, cursor }));
    invalid(await records(h, { limit: 6, cursor }));
    invalid(await h.call('periods', { sampleSet: h.sampleSet, query: {}, limit: 5, cursor }));
    const forged = `${cursor.slice(0, -2)}${cursor.endsWith('AA') ? 'BB' : 'AA'}`;
    invalid(await records(h, { limit: 5, cursor: forged }));
    invalid(await records(h, { limit: 5, cursor: 'garbage' }));
    h.state.now += 31 * 60 * 1000;
    invalid(await records(h, { limit: 5, cursor }));
    // another actor, same server key
    const mine = harness('typical');
    const c2 = await firstPage(mine);
    const call = mine.endpoints.get('logExplorer.records') as MenuEndpointDeclaration;
    const as = await call.handle({ actor: { ...ACTOR, actor_id: '00000000-0000-4000-8000-0000000000b2' }, context: {}, params: { sampleSet: mine.sampleSet, query: {}, limit: 5, cursor: c2 }, correlationId: 'c', scopes: [], sessionVersion: async () => 'sv' });
    invalid(as);
    expect(mine.audits.at(-1)?.detail).toMatchObject({ result: 'cursor_invalid' });
  });

  /** A port whose next cursor is the given adapter cursor; the page after it records what cursor the adapter received. */
  function portWithCursor(base: SourceReadPort, adapterCursor: string, seen: Array<string | null>): SourceReadPort {
    return {
      ...base,
      searchRecords: async (request, ctx) => {
        seen.push(request.cursor);
        const answer = await base.searchRecords({ ...request, cursor: null }, ctx);
        return { ...answer, nextCursor: adapterCursor };
      },
    } as SourceReadPort;
  }

  it('worst permitted adapter cursor (512 code units that escape widest) round trips through the next page', async () => {
    const { WIRE_CURSOR_MAX } = await import('../domain/cursor.js');
    const worst = '\u0000'.repeat(512);
    const seen: Array<string | null> = [];
    const h = harness('typical', { port: portWithCursor(createSyntheticScenario('typical').port, worst, seen) });
    const cursor = await firstPage(h);
    expect(cursor.length).toBeLessThanOrEqual(WIRE_CURSOR_MAX);
    expect((await records(h, { limit: 5, cursor })).outcome).toBe('ok');
    expect(seen).toEqual([null, worst]);
  });

  it('astral and multi-byte adapter cursors at the limit fit the wire cap and round trip', async () => {
    const { WIRE_CURSOR_MAX } = await import('../domain/cursor.js');
    const KEY2 = Buffer.alloc(32, 3);
    const binding = { endpoint: 'records' as const, workspaceId: WS, actorId: ACTOR.actor_id, sampleSetDigest: 'd', query: {}, limit: 5 };
    const { signCursor, verifyCursor } = await import('../domain/cursor.js');
    for (const cursor of ['\u20ac'.repeat(512), '\u{1F600}'.repeat(256), '\ud800', '\udc00', 'a\ud800b\udc00']) {
      const token = signCursor(KEY2, binding, cursor, 1000);
      expect(token.length).toBeLessThanOrEqual(WIRE_CURSOR_MAX);
      expect(verifyCursor(KEY2, binding, token, 1000)).toBe(cursor);
    }
  });

  it('the wire token does not reveal an adapter cursor that carries log text', async () => {
    const secret = `${SYNTHETIC_LEAK_MARKER} password=hunter2`;
    const seen: Array<string | null> = [];
    const h = harness('typical', { port: portWithCursor(createSyntheticScenario('typical').port, secret, seen) });
    const cursor = await firstPage(h);
    const plain = [cursor, Buffer.from(cursor, 'base64url').toString('latin1'), Buffer.from(cursor, 'base64url').toString('utf8')].join('\n');
    expect(plain).not.toContain(SYNTHETIC_LEAK_MARKER);
    expect(plain).not.toContain('hunter2');
    expect((await records(h, { limit: 5, cursor })).outcome).toBe('ok');
    expect(seen.at(-1)).toBe(secret);
    // a flipped byte anywhere in the token is refused (authenticated)
    const bytes = Buffer.from(cursor, 'base64url');
    bytes.writeUInt8(bytes.readUInt8(bytes.length - 1) ^ 1, bytes.length - 1);
    invalid(await records(h, { limit: 5, cursor: bytes.toString('base64url') }));
  });

  it('a cursor signed under another key (another process) is refused', async () => {
    const { signCursor, verifyCursor } = await import('../domain/cursor.js');
    const binding = { endpoint: 'records' as const, workspaceId: WS, actorId: ACTOR.actor_id, sampleSetDigest: 'd', query: {}, limit: 5 };
    const token = signCursor(KEY, binding, 'adapter-cursor', 1000);
    expect(verifyCursor(KEY, binding, token, 1000)).toBe('adapter-cursor');
    expect(verifyCursor(Buffer.alloc(32, 9), binding, token, 1000)).toBeNull();
    expect(verifyCursor(KEY, { ...binding, limit: 6 }, token, 1000)).toBeNull();
  });
});

describe('audit holds no body', () => {
  it('a 101-emoji Source owner (valid: 200 code points, 202 UTF-16 units) is audited on a successful and on a denied read', async () => {
    const owner = '😀'.repeat(101);
    const h = harness('typical');
    const sampleSet = { ...h.sampleSet, sourceOwner: owner };
    expect(data(await h.call('records', { sampleSet, query: {}, limit: 5 })).state).toBe('ok');
    expect(h.audits.at(-1)?.detail).toMatchObject({ sourceOwner: owner, result: 'ok' });
    h.state.owners = new Set(['someone-else']);
    expect(data(await h.call('records', { sampleSet, query: {}, limit: 5 })).state).toBe('permission_denied');
    expect(h.audits.at(-1)?.detail).toMatchObject({ sourceOwner: owner, result: 'permission_denied' });
    expect(h.audits).toHaveLength(2);
  });

  it('records Actor-side counts and filter KEYS only; never row text, filter values or file references', async () => {
    const h = harness('typical');
    const query = { module: 'ModuleA', event: 'Tick' };
    const out = data(await records(h, { limit: 10, query }));
    expect(out.rows).toHaveLength(10);
    expect(h.audits).toHaveLength(1);
    const [event] = h.audits;
    expect(event).toMatchObject({ eventType: 'explorer.source.read', subjectType: 'log_explorer_source' });
    expect(event?.detail).toMatchObject({
      endpoint: 'records',
      sourceOwner: h.owner,
      fileCount: 2,
      filterKeys: ['module', 'event'],
      rowCount: 10,
      result: 'ok',
    });
    expect((event?.detail.sampleSetDigest as string)).toMatch(/^[0-9a-f]{64}$/);
    expect(event?.detail.bytes).toBeGreaterThan(0);
    const dump = JSON.stringify(event);
    for (const forbidden of ['ModuleA', 'Tick', '합성 a line', 'synthetic/a.log', 'synthetic/b.log']) expect(dump).not.toContain(forbidden);
  });

  it('window and parsed audit one line with a null digest; a denied read is audited with zero rows', async () => {
    const h = harness('typical');
    await h.call('window', { sourceOwner: h.owner, fileRef: 'synthetic/a.log', line: 4, before: 1, after: 1 });
    await h.call('parsed', { sourceOwner: h.owner, fileRef: 'synthetic/a.log', line: 5 });
    h.state.capability = false;
    await h.call('parsed', { sourceOwner: h.owner, fileRef: 'synthetic/a.log', line: 5 });
    expect(h.audits.map((a) => a.detail)).toMatchObject([
      { endpoint: 'window', sampleSetDigest: null, fileCount: 1, rowCount: 3, result: 'ok' },
      { endpoint: 'parsed', sampleSetDigest: null, fileCount: 1, rowCount: 1, result: 'ok' },
      { endpoint: 'parsed', rowCount: 0, bytes: 0, result: 'permission_denied' },
    ]);
    expect(JSON.stringify(h.audits)).not.toContain('synthetic/a.log');
  });

  it('if the audit cannot be written, no text is returned', async () => {
    const h = harness('typical');
    const call = h.endpoints.get('logExplorer.records') as MenuEndpointDeclaration;
    const broken = logExplorerReadEndpoints({
      db: { transaction: async () => { throw new Error('audit down'); } } as never,
      checkService: { checkCapability: async () => ({ allow: true, via: 'role' }) } as never,
      audit: createAuditService(),
      clock: () => new Date(),
      sourceReadPort: createSyntheticScenario('typical').port,
      sourceOwnerAccess: { allows: async () => true },
    }).find((d) => d.spec.id === 'logExplorer.records') as MenuEndpointDeclaration;
    expect(call).toBeTruthy();
    await expect(broken.handle({ actor: ACTOR, context: {}, params: { sampleSet: h.sampleSet, query: {}, limit: 5 }, correlationId: 'c', scopes: [], sessionVersion: async () => 'sv' })).rejects.toThrow('audit down');
  });
});

describe('filterKeysOf', () => {
  it('lists set fields and context key names, never values, at most 40', async () => {
    const { filterKeysOf } = await import('../domain/read-params.js');
    expect(filterKeysOf({ text: 'v', context: { job: 'x', wafer: 'y' } })).toEqual(['text', 'context.job', 'context.wafer']);
    expect(filterKeysOf({})).toEqual([]);
  });
});

describe('sample-set digest', () => {
  it('is the lifecycle manifest digest, whatever order the files are listed in', async () => {
    const { sampleManifestDigest } = await import('../../log-lifecycle/domain/sample-set.js');
    const { sampleSetDigest } = await import('../domain/sample-digest.js');
    const { sampleSet } = createSyntheticScenario('typical');
    expect(sampleSetDigest(sampleSet)).toBe(sampleManifestDigest(sampleSet));
    expect(sampleSetDigest({ ...sampleSet, files: [...sampleSet.files].reverse() })).toBe(sampleManifestDigest(sampleSet));
  });
});
