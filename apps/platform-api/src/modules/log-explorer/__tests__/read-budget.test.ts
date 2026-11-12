// Token reads under the daily body budget, the `viaToken` audit marker and the admin usage read (#1472), DB-free: the read declarations with a
// fake permission check that applies a token's scopes, the real audit service, the in-memory usage store and a counting synthetic Source.
import { TOKEN_DAILY_BODY_BUDGET_BYTES } from '@ap/contract-schemas';
import { describe, expect, it } from 'vitest';

import { currentAuthContext, runAsToken } from '../../../lib/auth-context.js';
import { createAuditService } from '../../core/audit/audit-service.js';
import type { EndpointResult, MenuEndpointDeclaration } from '../../menu-dispatch/types.js';
import { createSyntheticScenario, createSyntheticSourceReadPort, sampleSetOf, syntheticFixture, type SyntheticLine } from '../adapters/synthetic/index.js';
import type { LogExplorerReadDeps } from '../deps.js';
import type { SourceReadPort } from '../ports/source-read.js';
import { logExplorerReadEndpoints } from '../read-endpoints.js';
import { createMemoryUsageStore } from '../testing/memory-usage-store.js';

const WS = '00000000-0000-4000-8000-000000000001';
const ACTOR = { actor_id: '00000000-0000-4000-8000-0000000000a1', workspace_id: WS, role_level: 'user' };
const ADMIN = { actor_id: '00000000-0000-4000-8000-0000000000ad', workspace_id: WS, role_level: 'admin' };
const TOKEN = '00000000-0000-4000-8000-0000000000b1';
const TOKEN2 = '00000000-0000-4000-8000-0000000000b2';

function customScenario(lines: SyntheticLine[]) {
  const fixture = syntheticFixture('typical');
  const first = fixture.files[0];
  if (first) fixture.files = [{ ...first, lines }];
  return { port: createSyntheticSourceReadPort(fixture), sampleSet: sampleSetOf(fixture) };
}

function world(over: { lines?: SyntheticLine[] } = {}) {
  const synthetic = over.lines ? customScenario(over.lines) : createSyntheticScenario('typical');
  let asked = 0;
  const port: SourceReadPort = {
    ...synthetic.port,
    searchRecords: (request, ctx) => {
      asked += 1;
      return synthetic.port.searchRecords(request, ctx);
    },
  };
  const state = { now: Date.UTC(2026, 10, 8, 12), caps: new Set(['explorer.source.read', 'workspace.admin']) };
  const audits: Array<{ eventType: string; detail: Record<string, unknown> }> = [];
  const tx = { insert: () => ({ values: async (v: (typeof audits)[number]) => void audits.push(v) }) };
  const usage = createMemoryUsageStore(() => new Date(state.now));
  const deps: LogExplorerReadDeps = {
    db: { transaction: async (fn: (t: unknown) => Promise<void>) => fn(tx) } as never,
    checkService: {
      checkCapability: async (_a: unknown, capability: string) => {
        const auth = currentAuthContext();
        if (auth.kind === 'token' && !auth.scopes.includes(capability)) return { allow: false, reason: 'no_grant', requestable: null };
        return state.caps.has(capability) ? { allow: true, via: 'direct_grant' } : { allow: false, reason: 'no_grant', requestable: null };
      },
    } as never,
    audit: createAuditService(),
    clock: () => new Date(state.now),
    sourceReadPort: port,
    sourceOwnerAccess: { allows: async () => true },
    cursorKey: Buffer.alloc(32, 7),
    usage,
  };
  const endpoints = new Map<string, MenuEndpointDeclaration>(logExplorerReadEndpoints(deps).map((d) => [d.spec.id, d]));
  const call = (endpoint: string, params: Record<string, unknown>, actor = ACTOR): Promise<EndpointResult> =>
    must(endpoints.get(`logExplorer.${endpoint}`)).handle({ actor, context: {}, params, correlationId: 'cid', scopes: [], sessionVersion: async () => 'sv' });
  const records = (extra: Record<string, unknown> = {}) => call('records', { sampleSet: synthetic.sampleSet, query: {}, limit: 10, ...extra });
  return { state, audits, usage, endpoints, call, records, asked: () => asked, sampleSet: synthetic.sampleSet };
}

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('missing in test fixture');
  return value;
}
const asToken = <T>(id: string, scopes: string[], fn: () => Promise<T>) => runAsToken(id, scopes, fn);
const data = (r: EndpointResult) => r.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- wire data of a test assertion

describe('token reads and the daily body budget', () => {
  it('a token read is counted under its token and Actor, audited viaToken with the token id, and the page is returned whole', async () => {
    const w = world();
    const answer = await asToken(TOKEN, ['explorer.source.read'], () => w.records());
    expect(data(answer)).toMatchObject({ state: 'ok' });
    expect(data(answer).rows).toHaveLength(10);
    const bytes = w.audits[0]?.detail.bytes as number;
    expect(bytes).toBeGreaterThan(0);
    expect(w.audits[0]?.detail).toMatchObject({ viaToken: true, api_token_id: TOKEN, result: 'ok' });
    for (const subject of [{ kind: 'token', id: TOKEN } as const, { kind: 'actor', id: ACTOR.actor_id } as const]) {
      expect([await w.usage.get(WS, subject, 'bytes'), await w.usage.get(WS, subject, 'reads')]).toEqual([bytes, 1]);
    }
    expect(await w.usage.get(WS, { kind: 'session', id: ACTOR.actor_id }, 'bytes')).toBe(0);
  });

  it('a session read is counted for the usage read but never limited by the token budget', async () => {
    const w = world();
    await w.usage.add(WS, { kind: 'session', id: ACTOR.actor_id }, 'bytes', TOKEN_DAILY_BODY_BUDGET_BYTES * 2);
    const answer = await w.records();
    expect(data(answer).state).toBe('ok');
    expect(w.audits[0]?.detail.viaToken).toBe(false);
    expect(await w.usage.get(WS, { kind: 'session', id: ACTOR.actor_id }, 'reads')).toBe(1);
  });

  it('a token that used its whole day is refused as explorer.budget_exceeded before the Source is asked; nothing is cut or returned', async () => {
    const w = world();
    await w.usage.add(WS, { kind: 'token', id: TOKEN }, 'bytes', TOKEN_DAILY_BODY_BUDGET_BYTES);
    const answer = await asToken(TOKEN, ['explorer.source.read'], () => w.records());
    expect(answer).toMatchObject({ outcome: 'error', data: null, message: 'explorer.budget_exceeded' });
    expect(w.asked()).toBe(0);
    expect(w.audits[0]?.detail).toMatchObject({ result: 'budget_exceeded', rowCount: 0, bytes: 0, viaToken: true });
  });

  it('an answer that would pass the budget is refused whole and takes nothing from it', async () => {
    const w = world();
    await w.usage.add(WS, { kind: 'token', id: TOKEN }, 'bytes', TOKEN_DAILY_BODY_BUDGET_BYTES - 10);
    const answer = await asToken(TOKEN, ['explorer.source.read'], () => w.records());
    expect(answer).toMatchObject({ outcome: 'error', data: null, message: 'explorer.budget_exceeded' });
    expect(w.asked()).toBe(1);
    expect(await w.usage.get(WS, { kind: 'token', id: TOKEN }, 'bytes')).toBe(TOKEN_DAILY_BODY_BUDGET_BYTES - 10);
    expect(await w.usage.get(WS, { kind: 'actor', id: ACTOR.actor_id }, 'bytes')).toBe(0);
  });

  it('the Actor budget holds across tokens: a second token of the same Actor is refused when the Actor used the day', async () => {
    const w = world();
    await w.usage.add(WS, { kind: 'actor', id: ACTOR.actor_id }, 'bytes', TOKEN_DAILY_BODY_BUDGET_BYTES);
    expect(await asToken(TOKEN2, ['explorer.source.read'], () => w.records())).toMatchObject({ message: 'explorer.budget_exceeded' });
  });

  it('the budget is per UTC day', async () => {
    const w = world();
    await w.usage.add(WS, { kind: 'token', id: TOKEN }, 'bytes', TOKEN_DAILY_BODY_BUDGET_BYTES);
    w.state.now += 86_400_000;
    expect(data(await asToken(TOKEN, ['explorer.source.read'], () => w.records())).state).toBe('ok');
  });

  it('a token without the read scope gets the answered state capability_not_held, whatever the Actor holds, with an attempt audit and no Source access', async () => {
    const w = world();
    const answer = await asToken(TOKEN, ['explorer.export'], () => w.records());
    expect(data(answer)).toMatchObject({ state: 'permission_denied', reason: 'capability_not_held', rows: [] });
    expect(w.asked()).toBe(0);
    expect(w.audits).toHaveLength(1);
    expect(w.audits[0]?.detail).toMatchObject({ result: 'permission_denied', rowCount: 0, bytes: 0, viaToken: true });
  });

  it('the body budget charges the serialized wire body: escaped NULs and empty-text rows included', async () => {
    const nul: SyntheticLine[] = Array.from({ length: 3 }, () => ({ text: '\u0000'.repeat(100) }));
    const empty: SyntheticLine[] = Array.from({ length: 3 }, () => ({ text: '' }));
    for (const lines of [nul, empty]) {
      const w = world({ lines });
      const answer = await asToken(TOKEN, ['explorer.source.read'], () => w.records({ limit: 3 }));
      const wire = Buffer.byteLength(JSON.stringify({ outcome: answer.outcome, data: answer.data, assessments: [], trust: null, correlationId: 'cid' }), 'utf8');
      const rawText = lines.reduce((n, l) => n + Buffer.byteLength(l.text), 0);
      expect(wire).toBeGreaterThan(rawText);
      expect(w.audits[0]?.detail.bytes).toBe(wire);
      for (const subject of [{ kind: 'token', id: TOKEN } as const, { kind: 'actor', id: ACTOR.actor_id } as const]) {
        expect(await w.usage.get(WS, subject, 'bytes')).toBe(wire);
      }
    }
  });

  it('the cap is reached by the wire size: a body whose text is under the cap but whose escaped body passes it is refused whole', async () => {
    const nul: SyntheticLine[] = Array.from({ length: 3 }, () => ({ text: '\u0000'.repeat(100) }));
    const w = world({ lines: nul });
    const probe = await asToken(TOKEN2, ['explorer.source.read'], () => w.records({ limit: 3 }));
    const wire = Buffer.byteLength(JSON.stringify({ outcome: probe.outcome, data: probe.data, assessments: [], trust: null, correlationId: 'cid' }), 'utf8');
    const raw = 300; // the raw text length the old rule charged
    await w.usage.add(WS, { kind: 'token', id: TOKEN }, 'bytes', TOKEN_DAILY_BODY_BUDGET_BYTES - raw - 1);
    expect(raw + 1 + raw).toBeLessThanOrEqual(TOKEN_DAILY_BODY_BUDGET_BYTES); // the old charge would have fit
    expect(wire).toBeGreaterThan(raw + 1);
    expect(await asToken(TOKEN, ['explorer.source.read'], () => w.records({ limit: 3 }))).toMatchObject({ message: 'explorer.budget_exceeded' });
  });

  it('midnight between the token add and the Actor add keeps both on the day the reservation started', async () => {
    const w = world();
    const add = w.usage.add.bind(w.usage);
    let advanced = false;
    w.usage.add = async (...args) => {
      const ok = await add(...args);
      if (!advanced && args[2] === 'bytes' && args[3] > 0) {
        advanced = true;
        w.state.now += 86_400_000;
      }
      return ok;
    };
    await asToken(TOKEN, ['explorer.source.read'], () => w.records());
    const bytesKeys = [...w.usage.counters.keys()].filter((k) => k.includes('|bytes|'));
    expect(bytesKeys).toHaveLength(2);
    expect(bytesKeys.every((k) => k.endsWith('|2026-11-08'))).toBe(true);
  });

  it('midnight during the compensation refunds the day the token was charged, not the new day', async () => {
    const w = world();
    // The Actor is 10 bytes short of the cap, so its add is refused and the token's add must be given back.
    await w.usage.add(WS, { kind: 'actor', id: ACTOR.actor_id }, 'bytes', TOKEN_DAILY_BODY_BUDGET_BYTES - 10);
    const add = w.usage.add.bind(w.usage);
    let advanced = false;
    w.usage.add = async (...args) => {
      const ok = await add(...args);
      if (!advanced && args[2] === 'bytes' && args[3] > 0 && args[1].kind === 'token') {
        advanced = true;
        w.state.now += 86_400_000;
      }
      return ok;
    };
    const answer = await asToken(TOKEN, ['explorer.source.read'], () => w.records());
    expect(answer).toMatchObject({ message: 'explorer.budget_exceeded' });
    const tokenKeys = [...w.usage.counters.entries()].filter(([k]) => k.includes(`|token|${TOKEN}|bytes|`));
    expect(tokenKeys).toEqual([[expect.stringMatching(/\|2026-11-08$/), 0]]);
  });

  it('window and parsed reads count too', async () => {
    const w = world();
    const file = w.sampleSet.files[0]?.fileRef;
    await asToken(TOKEN, ['explorer.source.read'], () => w.call('window', { sourceOwner: w.sampleSet.sourceOwner, fileRef: file, line: 5, before: 2, after: 2 }));
    await asToken(TOKEN, ['explorer.source.read'], () => w.call('parsed', { sourceOwner: w.sampleSet.sourceOwner, fileRef: file, line: 5 }));
    expect(await w.usage.get(WS, { kind: 'token', id: TOKEN }, 'reads')).toBe(2);
    expect(await w.usage.get(WS, { kind: 'token', id: TOKEN }, 'bytes')).toBeGreaterThan(0);
  });
});

describe('the entry right of a token read', () => {
  it('lets every authenticated token through (so a refusal is an audited answer), judges the scope inside the read, and a session keeps the platform:view rule', async () => {
    const w = world();
    const records = must(w.endpoints.get('logExplorer.records'));
    for (const scopes of [['explorer.source.read'], ['workspace.read'], ['explorer.export'], ['explorer.investigate'], []]) {
      expect(await asToken(TOKEN, scopes, () => records.authorize(ACTOR))).toBe(true);
    }
    // ...but no scope other than the read scope reads anything: the handler answers permission_denied and never asks the Source
    for (const scopes of [['workspace.read'], ['explorer.export'], ['explorer.investigate'], []]) {
      const answer = await asToken(TOKEN, scopes, () => w.records());
      expect(data(answer)).toMatchObject({ state: 'permission_denied', reason: 'capability_not_held', rows: [] });
    }
    expect(w.asked()).toBe(0);
    expect(w.audits).toHaveLength(4);
    expect(await records.authorize(ACTOR)).toBe(true);
  });
});

describe('logExplorer.usage (admin aggregation)', () => {
  it('is declared on the console right (workspace.admin, session-only), so a non-admin is refused and an admin is not', async () => {
    const w = world();
    const usage = must(w.endpoints.get('logExplorer.usage'));
    expect(usage.spec).toMatchObject({ permission: 'console:access', paramKeys: ['day'] });
    expect(await usage.authorize(ADMIN)).toBe(true);
    w.state.caps.delete('workspace.admin');
    expect(await usage.authorize(ACTOR)).toBe(false);
  });

  it('lists bytes, read/export split, reads and exports per token, Actor and session Actor, biggest first, with the limits', async () => {
    const w = world();
    await asToken(TOKEN, ['explorer.source.read'], () => w.records());
    await w.records();
    await w.usage.add(WS, { kind: 'token', id: TOKEN }, 'exportBytes', 1000);
    await w.usage.add(WS, { kind: 'token', id: TOKEN }, 'bytes', 1000);
    await w.usage.add(WS, { kind: 'token', id: TOKEN }, 'exports', 20);
    const answer = await w.call('usage', {}, ADMIN);
    const out = data(answer);
    expect(out.day).toBe('2026-11-08');
    expect(out.limits).toEqual({ dailyBodyBytes: TOKEN_DAILY_BODY_BUDGET_BYTES, dailyExports: 20 });
    const byKind = Object.fromEntries(out.rows.map((r: { kind: string }) => [r.kind, r]));
    expect(Object.keys(byKind).sort()).toEqual(['actor', 'session', 'token']);
    expect(byKind.token).toMatchObject({ id: TOKEN, reads: 1, exports: 20, exportBytes: 1000, atLimit: true });
    expect(byKind.token.readBytes).toBe(byKind.token.bytes - 1000);
    expect(byKind.actor).toMatchObject({ id: ACTOR.actor_id, reads: 1, atLimit: false });
    expect(byKind.session).toMatchObject({ id: ACTOR.actor_id, reads: 1 });
    expect(out.rows.map((r: { bytes: number }) => r.bytes)).toEqual([...out.rows.map((r: { bytes: number }) => r.bytes)].sort((a, b) => b - a));
  });

  it('flags a token at the body budget, answers a quiet day with no rows, and refuses a day outside the retention', async () => {
    const w = world();
    await w.usage.add(WS, { kind: 'token', id: TOKEN }, 'bytes', TOKEN_DAILY_BODY_BUDGET_BYTES);
    expect(data(await w.call('usage', {}, ADMIN)).rows[0]).toMatchObject({ kind: 'token', atLimit: true });
    expect(data(await w.call('usage', { day: '2026-11-07' }, ADMIN)).rows).toEqual([]);
    expect(await w.call('usage', { day: '2026-10-01' }, ADMIN)).toMatchObject({ outcome: 'error' });
    expect(await w.call('usage', { day: 'LEAKY' }, ADMIN)).toMatchObject({ outcome: 'error' });
    expect(w.endpoints.get('logExplorer.usage')?.validate({ day: 'not-a-day' })).toMatchObject({ ok: false });
    expect(w.endpoints.get('logExplorer.usage')?.validate({})).toEqual({ ok: true });
  });

  it('counters carry no text: the stored keys are ids and metric names only', async () => {
    const w = world();
    await asToken(TOKEN, ['explorer.source.read'], () => w.records({ query: { text: 'secret-filter' } }));
    const dump = JSON.stringify([...w.usage.counters.keys()]);
    expect(dump).not.toContain('secret-filter');
    expect(dump).not.toContain('synthetic/a.log');
  });
});
