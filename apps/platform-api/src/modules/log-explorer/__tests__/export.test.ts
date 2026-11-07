// The log explorer export (#1472), DB-free: a fake permission check that applies a token's scopes the way `check-service` does, a fake transaction that
// captures the audit insert (with the REAL audit service and its closed schema), the in-memory usage store and the synthetic Source. Covers the ADR-0119
// list: read-only token cannot export, daily budget, revoked token / reduced permission / revoked grant on the next call and mid-stream, range and size
// limits, CSV escape, one concurrent and the daily count, a body-free audit. The DB-backed route test is export.integration.test.ts.
import { EXPORT_BYTES_MAX, EXPORT_DAILY_MAX, TOKEN_DAILY_BODY_BUDGET_BYTES, type SourceSampleSet } from '@ap/contract-schemas';
import { describe, expect, it } from 'vitest';

import { type AuthContext, currentAuthContext } from '../../../lib/auth-context.js';
import { createAuditService } from '../../core/audit/audit-service.js';
import { createSyntheticSourceReadPort, sampleSetOf, SYNTHETIC_LEAK_MARKER, syntheticFixture, type SyntheticLine } from '../adapters/synthetic/index.js';
import type { LogExplorerExportDeps } from '../deps.js';
import { csvCell, exportHeader, exportLine } from '../domain/export-format.js';
import { createExportService, type ExportOutcome } from '../export-service.js';
import { guardSourceReadPort } from '../ports/guarded.js';
import type { SourceReadPort } from '../ports/source-read.js';
import { createMemoryUsageStore } from '../testing/memory-usage-store.js';

const WS = '00000000-0000-4000-8000-000000000001';
const ACTOR = { actor_id: '00000000-0000-4000-8000-0000000000a1', workspace_id: WS, role_level: 'user' };
const TOKEN = '00000000-0000-4000-8000-0000000000b1';
const TOKEN2 = '00000000-0000-4000-8000-0000000000b2';
const SESSION: AuthContext = { kind: 'session' };
const token = (id: string, scopes: string[]): AuthContext => ({ kind: 'token', tokenId: id, scopes });

interface State {
  caps: Set<string>;
  owners: Set<string> | 'all';
  tokensRevoked: Set<string>;
  now: number;
  hook: ((index: number) => void) | null;
  /** Test seam: runs inside the audit write (revocation while the audit is pending). */
  onAudit: (() => void) | null;
  /** Test seam: the audit write waits for this (a held write spanning the response deadline). */
  holdAudit: Promise<void> | null;
}

function world(over: { port?: SourceReadPort | null; chunk?: number; lines?: SyntheticLine[]; totalMs?: number } = {}) {
  const fixture = syntheticFixture('typical');
  const firstFile = fixture.files[0];
  if (over.lines && firstFile) fixture.files = [{ ...firstFile, lines: over.lines }];
  const synthetic = { port: createSyntheticSourceReadPort(fixture), sampleSet: sampleSetOf(fixture) };
  const state: State = { caps: new Set(['explorer.export', 'explorer.source.read']), owners: 'all', tokensRevoked: new Set(), now: Date.UTC(2026, 10, 8, 12), hook: null, onAudit: null, holdAudit: null };
  const audits: Array<{ eventType: string; detail: Record<string, unknown>; subjectType: string }> = [];
  const tx = { insert: () => ({ values: async (v: (typeof audits)[number]) => {
        await state.holdAudit;
        audits.push(v);
        state.onAudit?.();
      },
    }),
  };
  const usage = createMemoryUsageStore(() => new Date(state.now));
  const deps: LogExplorerExportDeps = {
    db: { transaction: async (fn: (t: unknown) => Promise<void>) => fn(tx) } as never,
    checkService: {
      checkCapability: async (_actor: unknown, capability: string) => {
        const auth = currentAuthContext();
        if (auth.kind === 'token' && !auth.scopes.includes(capability)) return { allow: false, reason: 'no_grant', requestable: null };
        return state.caps.has(capability) ? { allow: true, via: 'direct_grant' } : { allow: false, reason: 'no_grant', requestable: null };
      },
    } as never,
    audit: createAuditService(),
    clock: () => new Date(state.now),
    sourceReadPort: null,
    sourceOwnerAccess: { allows: async (_a, owner) => state.owners === 'all' || state.owners.has(owner) },
    usage,
    tokenActive: async (id) => !state.tokensRevoked.has(id),
    exportChunkBytes: over.chunk ?? 64 * 1024,
    ...(over.totalMs !== undefined ? { exportTotalMs: over.totalMs } : {}),
    beforeExportChunk: (index) => state.hook?.(index),
  };
  const service = createExportService(deps, over.port !== undefined ? over.port : guardSourceReadPort(synthetic.port));
  const sampleSet: SourceSampleSet = synthetic.sampleSet;
  const body = (extra: Record<string, unknown> = {}) => ({ sampleSet, query: {}, range: { rows: 100 }, format: 'csv', ...extra });
  const call = (extra: Record<string, unknown> = {}, auth: AuthContext = SESSION, signal: AbortSignal = new AbortController().signal) =>
    service.run({ actor: ACTOR, auth, body: body(extra), signal });
  return { state, audits, usage, call, body, service, sampleSet, owner: sampleSet.sourceOwner };
}

async function drain(outcome: ExportOutcome): Promise<string> {
  if (outcome.kind !== 'stream') throw new Error(`not a stream: ${outcome.kind}`);
  const parts: Buffer[] = [];
  for await (const chunk of outcome.stream) parts.push(chunk as Buffer);
  return Buffer.concat(parts).toString('utf8');
}
const closed = (outcome: ExportOutcome) =>
  new Promise<void>((resolve) => {
    if (outcome.kind !== 'stream') return resolve();
    const { stream } = outcome;
    if (stream.closed) return setImmediate(resolve);
    (stream as NodeJS.EventEmitter).once('close', () => setImmediate(resolve));
  });
const refused = (outcome: ExportOutcome) => (outcome.kind === 'refused' ? outcome.code : outcome.kind);

describe('CSV and JSONL', () => {
  const row = (text: string) => ({ fileRef: 'a.log', fileOrder: 1, line: 3, text, truncated: false, timestamp: null, timeReversal: false, synthetic: true });

  it.each(['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx', '\rx'])('prefixes a cell that starts like a formula: %j', (cell) => {
    expect(csvCell(cell).replace(/^"/, '')).toMatch(/^'/);
  });
  it('leaves ordinary cells, numbers and booleans alone, and quotes separators, quotes and line breaks', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell(12)).toBe('12');
    expect(csvCell(false)).toBe('false');
    expect(csvCell(null)).toBe('');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell('=1+1,2')).toBe(`"'=1+1,2"`);
  });
  it('a row of the file starts no formula, whatever the Source text is', () => {
    const lines = exportLine('csv', row('=HYPERLINK("http://x","y")')).split('\r\n');
    expect(lines[0]).toContain(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(exportHeader('csv')).toBe('fileRef,fileOrder,line,timestamp,text,truncated,timeReversal,synthetic\r\n');
  });
  it('JSONL is one JSON object per line with the same columns', () => {
    const line = exportLine('jsonl', row('=x'));
    expect(line.endsWith('\n')).toBe(true);
    expect(JSON.parse(line)).toEqual({ fileRef: 'a.log', fileOrder: 1, line: 3, timestamp: null, text: '=x', truncated: false, timeReversal: false, synthetic: true });
    expect(exportHeader('jsonl')).toBe('');
  });
});

describe('a session export', () => {
  it('streams a CSV of the first rows in file order with a header, and audits start with counts only', async () => {
    const w = world();
    const outcome = await w.call({ range: { rows: 35 } });
    expect(outcome).toMatchObject({ kind: 'stream', contentType: 'text/csv', filename: 'log-explorer-export.csv' });
    const text = await drain(outcome);
    const lines = text.trimEnd().split('\r\n');
    expect(lines).toHaveLength(36);
    expect(lines[0]).toBe('fileRef,fileOrder,line,timestamp,text,truncated,timeReversal,synthetic');
    expect(lines[1]).toContain('synthetic/a.log,1,1,');
    expect(lines[31]).toContain('synthetic/b.log,2,1,');
    expect(Buffer.byteLength(text)).toBe((outcome as { byteLength: number }).byteLength);
    expect(w.audits).toHaveLength(1);
    expect(w.audits[0]).toMatchObject({ eventType: 'explorer.export', subjectType: 'log_explorer_source' });
    expect(w.audits[0]?.detail).toEqual({
      sourceOwner: w.owner,
      sampleSetDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
      fileCount: 2,
      filterKeys: [],
      format: 'csv',
      rowCount: 35,
      bytes: Buffer.byteLength(text),
      result: 'ok',
      viaToken: false,
    });
  });

  it('JSONL carries the media type of newline-delimited JSON', async () => {
    const w = await Promise.resolve(world());
    const outcome = await w.call({ format: 'jsonl', range: { rows: 3 } });
    expect(outcome).toMatchObject({ kind: 'stream', contentType: 'application/x-ndjson', filename: 'log-explorer-export.jsonl' });
    expect((await drain(outcome)).trimEnd().split('\n')).toHaveLength(3);
  });

  it('writes nothing it keeps: a second export is a fresh read, and the audit holds no body, filter value or file reference', async () => {
    const w = world();
    await drain(await w.call({ query: { text: 'secret-filter' }, range: { rows: 5 } }));
    const dump = JSON.stringify(w.audits);
    expect(dump).not.toContain('secret-filter');
    expect(dump).not.toContain('synthetic/a.log');
    expect(dump).not.toContain('합성');
    expect(dump).not.toContain(SYNTHETIC_LEAK_MARKER);
    expect((w.audits[0]?.detail as { filterKeys: string[] }).filterKeys).toEqual(['text']);
  });

  it('an investigation id is refused with its own code until the investigation exists', async () => {
    const w = world();
    const { sampleSet: _unused, ...rest } = w.body();
    expect(refused(await w.service.run({ actor: ACTOR, auth: SESSION, body: { ...rest, investigationId: '00000000-0000-4000-8000-000000000009' }, signal: new AbortController().signal }))).toBe('explorer.investigation_unsupported');
    // still an attempt: audited body-free, with no Source owner to name
    expect(w.audits.at(-1)?.detail).toEqual({ sourceOwner: null, sampleSetDigest: null, fileCount: 0, filterKeys: [], format: 'csv', rowCount: 0, bytes: 0, result: 'investigation_unsupported', viaToken: false });
  });

  it('a malformed body is a validation error with field paths, never the offending value', async () => {
    const w = world();
    const outcome = await w.service.run({ actor: ACTOR, auth: SESSION, body: { ...w.body(), format: 'LEAKY-FORMAT' }, signal: new AbortController().signal });
    expect(outcome.kind).toBe('invalid');
    expect(JSON.stringify(outcome)).not.toContain('LEAKY-FORMAT');
    // still an attempt (any caller, any token): audited without a Source owner, digest, format or any value of the body
    expect(w.audits.at(-1)?.detail).toEqual({ sourceOwner: null, sampleSetDigest: null, fileCount: 0, filterKeys: [], format: null, rowCount: 0, bytes: 0, result: 'invalid_request', viaToken: false });
    expect(JSON.stringify(w.audits)).not.toContain('LEAKY-FORMAT');
    await w.service.run({ actor: ACTOR, auth: token(TOKEN, ['explorer.source.read']), body: 'not an object', signal: new AbortController().signal });
    expect(w.audits.at(-1)?.detail).toMatchObject({ result: 'invalid_request', viaToken: true });
  });
  it('a valid non-BMP Source owner of 101 code points (202 UTF-16 units) is audited, refusals included', async () => {
    const w = world();
    const owner = '😀'.repeat(101);
    const sampleSet = { ...w.sampleSet, sourceOwner: owner };
    w.state.owners = new Set();
    expect(refused(await w.service.run({ actor: ACTOR, auth: SESSION, body: w.body({ sampleSet }), signal: new AbortController().signal }))).toBe('explorer.forbidden');
    expect(w.audits.at(-1)?.detail).toMatchObject({ sourceOwner: owner, result: 'forbidden' });
  });
});

describe('who may export', () => {
  it('a read-only token cannot export: the scope list decides, whatever the Actor holds', async () => {
    const w = world();
    const readOnly = token(TOKEN, ['explorer.source.read']);
    expect(refused(await w.call({}, readOnly))).toBe('explorer.forbidden');
    expect(w.audits.at(-1)?.detail).toMatchObject({ result: 'forbidden', rowCount: 0, bytes: 0, viaToken: true });
    expect(await drain(await w.call({ range: { rows: 2 } }, token(TOKEN, ['explorer.export'])))).toContain('synthetic/a.log');
  });
  it('a token with the scope still needs the Actor to hold the right now (the effective right is the intersection)', async () => {
    const w = world();
    w.state.caps.delete('explorer.export');
    expect(refused(await w.call({}, token(TOKEN, ['explorer.export'])))).toBe('explorer.forbidden');
  });
  it('another Source owner than the one granted is refused', async () => {
    const w = world();
    w.state.owners = new Set(['some-other-owner']);
    expect(refused(await w.call({}))).toBe('explorer.forbidden');
  });
  it('no capability is refused before anything else is learned: not even a limit or the Source state', async () => {
    const w = world({ port: null });
    w.state.caps.delete('explorer.export');
    expect(refused(await w.call({ range: { rows: 999_999 } }))).toBe('explorer.forbidden');
  });
  it('a revoked token, a reduced permission and a revoked owner grant are each refused on the very next call', async () => {
    const w = world();
    const auth = token(TOKEN, ['explorer.export']);
    await drain(await w.call({ range: { rows: 2 } }, auth));
    w.state.tokensRevoked.add(TOKEN);
    expect(refused(await w.call({}, auth))).toBe('explorer.forbidden');
    w.state.tokensRevoked.clear();
    w.state.caps.delete('explorer.export');
    expect(refused(await w.call({}, auth))).toBe('explorer.forbidden');
    w.state.caps.add('explorer.export');
    w.state.owners = new Set();
    expect(refused(await w.call({}, auth))).toBe('explorer.forbidden');
    w.state.owners = 'all';
    expect(await drain(await w.call({ range: { rows: 2 } }, auth))).toContain('synthetic/a.log');
  });
  it('production shape: a holder with no Source connected gets source_unavailable', async () => {
    const w = world({ port: null });
    expect(refused(await w.call({}))).toBe('explorer.source_unavailable');
  });
});

describe('limits are refused whole, never cut', () => {
  it('a range over 10,000 rows is range_too_large and the audit says so', async () => {
    const w = world();
    expect(refused(await w.call({ range: { rows: 10_001 } }))).toBe('explorer.range_too_large');
    expect(w.audits.at(-1)?.detail).toMatchObject({ result: 'range_too_large', rowCount: 0, bytes: 0 });
  });
  it('a file over 5 MB is range_too_large before the first byte, with nothing counted against the quotas', async () => {
    const lines: SyntheticLine[] = Array.from({ length: 800 }, (_u, i) => ({ text: `${i}`.padEnd(7000, 'x') }));
    const w = world({ lines });
    expect(refused(await w.call({ range: { rows: 800 } }, token(TOKEN, ['explorer.export'])))).toBe('explorer.range_too_large');
    expect(await w.usage.get(WS, { kind: 'token', id: TOKEN }, 'bytes')).toBe(0);
    expect(await w.usage.get(WS, { kind: 'token', id: TOKEN }, 'exports')).toBe(0);
    expect(EXPORT_BYTES_MAX).toBe(5 * 1024 * 1024);
    // the same rows in a smaller range fit
    expect((await drain(await w.call({ range: { rows: 600 } }))).length).toBeGreaterThan(4_000_000);
  });
  it('a partial Source answer is not a complete file', async () => {
    const fixture = syntheticFixture('partial');
    const w = world({ port: guardSourceReadPort(createSyntheticSourceReadPort(fixture)) });
    expect(refused(await w.service.run({ actor: ACTOR, auth: SESSION, body: { ...w.body(), sampleSet: sampleSetOf(fixture) }, signal: new AbortController().signal }))).toBe('explorer.source_unavailable');
  });
  it('a failing Source is source_unavailable and its text never reaches the wire or the audit', async () => {
    const fixture = syntheticFixture('failing');
    const w = world({ port: guardSourceReadPort(createSyntheticSourceReadPort(fixture)) });
    const outcome = await w.service.run({ actor: ACTOR, auth: SESSION, body: { ...w.body(), sampleSet: sampleSetOf(fixture) }, signal: new AbortController().signal });
    expect(refused(outcome)).toBe('explorer.source_unavailable');
    expect(JSON.stringify([outcome, w.audits])).not.toContain(SYNTHETIC_LEAK_MARKER);
  });
});

describe('quotas', () => {
  it('one export at a time per Actor and per token: the second is export_busy until the first stream has closed', async () => {
    const w = world();
    const first = await w.call({ range: { rows: 3 } });
    expect(refused(await w.call({}))).toBe('explorer.export_busy');
    // a second token of the same Actor is the same Actor
    expect(refused(await w.call({}, token(TOKEN2, ['explorer.export'])))).toBe('explorer.export_busy');
    await drain(first);
    await closed(first);
    expect(await drain(await w.call({ range: { rows: 3 } }))).toContain('synthetic/a.log');
  });
  it('a refused export frees its lease', async () => {
    const w = world();
    expect(refused(await w.call({ range: { rows: 10_001 } }))).toBe('explorer.range_too_large');
    expect(w.usage.leases.size).toBe(0);
  });
  it('a crashed export does not hold the lease forever: it expires', async () => {
    const w = world();
    await w.call({ range: { rows: 3 } }); // never consumed
    expect(refused(await w.call({}))).toBe('explorer.export_busy');
    w.usage.expireLeases();
    expect((await w.call({ range: { rows: 1 } })).kind).toBe('stream');
  });
  it('20 exports a day, then export_daily_limit; the next UTC day starts again', async () => {
    const w = world();
    for (let n = 0; n < EXPORT_DAILY_MAX; n += 1) {
      const outcome = await w.call({ range: { rows: 1 } });
      await drain(outcome);
      await closed(outcome);
    }
    expect(refused(await w.call({}))).toBe('explorer.export_daily_limit');
    expect(w.audits.at(-1)?.detail).toMatchObject({ result: 'export_daily_limit' });
    w.state.now += 86_400_000;
    expect((await w.call({ range: { rows: 1 } })).kind).toBe('stream');
  });
  it('the daily count of a token also counts for its Actor: a fresh token does not reset it', async () => {
    const w = world();
    for (let n = 0; n < EXPORT_DAILY_MAX; n += 1) {
      const outcome = await w.call({ range: { rows: 1 } }, token(TOKEN, ['explorer.export']));
      await drain(outcome);
      await closed(outcome);
    }
    expect(refused(await w.call({}, token(TOKEN2, ['explorer.export'])))).toBe('explorer.export_daily_limit');
  });
  it('sessions count too: 20 session exports use up the Actor, so its token is refused as well', async () => {
    const w = world();
    for (let n = 0; n < EXPORT_DAILY_MAX; n += 1) {
      const outcome = await w.call({ range: { rows: 1 } });
      await drain(outcome);
      await closed(outcome);
    }
    expect(refused(await w.call({}, token(TOKEN, ['explorer.export'])))).toBe('explorer.export_daily_limit');
  });
  it('the daily body budget: a token (or its Actor) that has used 50 MB is refused, not cut, and a session is not limited by it', async () => {
    const w = world();
    const auth = token(TOKEN, ['explorer.export']);
    await w.usage.add(WS, { kind: 'token', id: TOKEN }, 'bytes', TOKEN_DAILY_BODY_BUDGET_BYTES);
    expect(refused(await w.call({}, auth))).toBe('explorer.budget_exceeded');
    expect(w.audits.at(-1)?.detail).toMatchObject({ result: 'budget_exceeded', bytes: 0 });
    // the Actor side: another token of the same Actor
    await w.usage.add(WS, { kind: 'actor', id: ACTOR.actor_id }, 'bytes', TOKEN_DAILY_BODY_BUDGET_BYTES);
    expect(refused(await w.call({}, token(TOKEN2, ['explorer.export'])))).toBe('explorer.budget_exceeded');
    // a session export is still allowed
    expect((await w.call({ range: { rows: 1 } })).kind).toBe('stream');
  });
  it('a file that would pass the budget is refused whole and takes nothing from it', async () => {
    const w = world();
    await w.usage.add(WS, { kind: 'token', id: TOKEN }, 'bytes', TOKEN_DAILY_BODY_BUDGET_BYTES - 10);
    expect(refused(await w.call({ range: { rows: 5 } }, token(TOKEN, ['explorer.export'])))).toBe('explorer.budget_exceeded');
    expect(await w.usage.get(WS, { kind: 'token', id: TOKEN }, 'bytes')).toBe(TOKEN_DAILY_BODY_BUDGET_BYTES - 10);
    expect(await w.usage.get(WS, { kind: 'actor', id: ACTOR.actor_id }, 'bytes')).toBe(0);
  });
  it('a token export is counted under the token and the Actor; a session export under the session Actor', async () => {
    const w = world();
    const t = await w.call({ range: { rows: 2 } }, token(TOKEN, ['explorer.export']));
    const bytes = (t as { byteLength: number }).byteLength;
    await drain(t);
    await closed(t);
    for (const subject of [{ kind: 'token', id: TOKEN } as const, { kind: 'actor', id: ACTOR.actor_id } as const]) {
      expect([await w.usage.get(WS, subject, 'bytes'), await w.usage.get(WS, subject, 'exportBytes'), await w.usage.get(WS, subject, 'exports')]).toEqual([bytes, bytes, 1]);
    }
    const s = await w.call({ range: { rows: 2 } });
    await drain(s);
    await closed(s);
    const session = { kind: 'session', id: ACTOR.actor_id } as const;
    expect([await w.usage.get(WS, session, 'bytes'), await w.usage.get(WS, session, 'exports')]).toEqual([(s as { byteLength: number }).byteLength, 1]);
    // the Actor-wide export count holds both channels
    expect(await w.usage.get(WS, { kind: 'actor', id: ACTOR.actor_id }, 'exports')).toBe(2);
  });
});

describe('cancel and revocation while streaming', () => {
  it('a client that goes away while the Source is being read stops the read; it is audited as aborted and the lease is freed', async () => {
    const abort = new AbortController();
    const fixture = syntheticFixture('slow');
    const w2 = world({ port: guardSourceReadPort(createSyntheticSourceReadPort(fixture)) });
    const pending = w2.service.run({ actor: ACTOR, auth: SESSION, body: { ...w2.body(), sampleSet: sampleSetOf(fixture) }, signal: abort.signal });
    setTimeout(() => abort.abort(), 20);
    expect(refused(await pending)).toBe('aborted');
    expect(w2.audits.at(-1)?.detail).toMatchObject({ result: 'aborted', bytes: 0 });
    expect(w2.usage.leases.size).toBe(0);
  });

  it('a token revoked between two chunks stops the stream at the next chunk boundary; the audit says revoked and the next call is refused', async () => {
    const lines: SyntheticLine[] = Array.from({ length: 200 }, (_u, i) => ({ text: `line ${i} ${'y'.repeat(100)}` }));
    const w = world({ lines, chunk: 4096 });
    const auth = token(TOKEN, ['explorer.export']);
    const outcome = await w.call({ range: { rows: 200 } }, auth);
    expect((outcome as { byteLength: number }).byteLength).toBeGreaterThan(4096 * 3);
    w.state.hook = (index) => {
      if (index === 2) w.state.tokensRevoked.add(TOKEN);
    };
    const received: Buffer[] = [];
    await expect(
      (async () => {
        for await (const chunk of (outcome as Extract<ExportOutcome, { kind: 'stream' }>).stream) received.push(chunk as Buffer);
      })(),
    ).rejects.toThrow('export_stopped');
    expect(received).toHaveLength(2); // chunks 0 and 1 left, chunk 2 did not
    expect(Buffer.concat(received).length).toBe(8192);
    await closed(outcome);
    expect(w.audits.map((a) => a.detail.result)).toEqual(['ok', 'revoked']);
    expect(w.audits[1]?.detail).toMatchObject({ bytes: 8192, viaToken: true });
    expect(w.usage.leases.size).toBe(0);
    expect(refused(await w.call({}, auth))).toBe('explorer.forbidden');
  });

  it.each([
    ['the Actor loses the right', (w: ReturnType<typeof world>) => w.state.caps.delete('explorer.export')],
    ['the Source-owner grant is revoked', (w: ReturnType<typeof world>) => void (w.state.owners = new Set())],
  ])('%s: the stream stops at the next chunk', async (_name, revoke) => {
    const lines: SyntheticLine[] = Array.from({ length: 100 }, (_u, i) => ({ text: `line ${i} ${'z'.repeat(100)}` }));
    const w = world({ lines, chunk: 2048 });
    const outcome = await w.call({ range: { rows: 100 } });
    w.state.hook = (index) => {
      if (index === 1) revoke(w);
    };
    await expect(drain(outcome)).rejects.toThrow('export_stopped');
    await closed(outcome);
    expect(w.audits.at(-1)?.detail).toMatchObject({ result: 'revoked', bytes: 2048 });
  });

  it('a client that leaves mid-stream is audited as aborted and frees the lease', async () => {
    const lines: SyntheticLine[] = Array.from({ length: 200 }, (_u, i) => ({ text: `line ${i} ${'q'.repeat(100)}` }));
    const w = world({ lines, chunk: 2048 });
    const outcome = (await w.call({ range: { rows: 200 } })) as Extract<ExportOutcome, { kind: 'stream' }>;
    const first = await outcome.stream[Symbol.asyncIterator]().next();
    expect(first.done).toBe(false);
    outcome.stream.destroy();
    await closed(outcome);
    expect(w.audits.at(-1)?.detail).toMatchObject({ result: 'aborted' });
    expect(w.usage.leases.size).toBe(0);
  });
});

describe('authorization right before the first chunk (C2)', () => {
  const lines: SyntheticLine[] = Array.from({ length: 5 }, (_u, i) => ({ text: `line ${i} secret` }));
  const consume = async (outcome: ExportOutcome) => {
    if (outcome.kind !== 'stream') throw new Error(`not a stream: ${outcome.kind}`);
    const received: Buffer[] = [];
    let error: unknown = null;
    try {
      for await (const chunk of outcome.stream) received.push(chunk as Buffer);
    } catch (e) {
      error = e;
    }
    await closed(outcome);
    return { bytes: Buffer.concat(received).length, error };
  };

  it.each([
    ['the token is revoked', (w: ReturnType<typeof world>) => void w.state.tokensRevoked.add(TOKEN)],
    ['the Actor loses the right', (w: ReturnType<typeof world>) => void w.state.caps.delete('explorer.export')],
    ['the Source-owner grant is revoked', (w: ReturnType<typeof world>) => void (w.state.owners = new Set())],
  ])('%s while the start audit is being written: zero Source bytes leave, even for a file smaller than one chunk', async (_name, revoke) => {
    const w = world({ lines });
    w.state.onAudit = () => {
      w.state.onAudit = null;
      revoke(w);
    };
    const outcome = await w.call({ range: { rows: 5 } }, token(TOKEN, ['explorer.export']));
    const { bytes, error } = await consume(outcome);
    expect(bytes).toBe(0);
    expect((error as Error).message).toBe('export_stopped');
    expect(w.audits.map((a) => a.detail.result)).toEqual(['ok', 'revoked']);
    expect(w.audits[1]?.detail).toMatchObject({ bytes: 0 });
    expect(w.usage.leases.size).toBe(0);
  });

  it('a right revoked after run() returned but before the first read of the stream: zero bytes', async () => {
    const w = world({ lines });
    const outcome = await w.call({ range: { rows: 5 } }, token(TOKEN, ['explorer.export']));
    w.state.tokensRevoked.add(TOKEN);
    const { bytes, error } = await consume(outcome);
    expect(bytes).toBe(0);
    expect((error as Error).message).toBe('export_stopped');
    expect(w.audits.at(-1)?.detail).toMatchObject({ result: 'revoked', bytes: 0 });
  });

  it('with nothing revoked the same small file arrives whole', async () => {
    const w = world({ lines });
    expect(await drain(await w.call({ range: { rows: 5 } }, token(TOKEN, ['explorer.export'])))).toContain('line 4 secret');
  });
});

describe('the response lifetime and the lease (C1)', () => {
  const lines: SyntheticLine[] = Array.from({ length: 5 }, (_u, i) => ({ text: `line ${i}` }));

  it('a stream held open by a slow reader is cut at the response lifetime, audited aborted, and frees its lease', async () => {
    const w = world({ lines, totalMs: 40 });
    const outcome = await w.call({ range: { rows: 5 } });
    expect(w.usage.leases.size).toBeGreaterThan(0);
    await closed(outcome); // nobody reads: only the lifetime can end it
    expect(w.usage.leases.size).toBe(0);
    expect(w.audits.map((a) => a.detail.result)).toEqual(['ok', 'aborted']);
  });

  it('a start-audit write held past the deadline ends the call without a stream or any consumption, and frees the lease', async () => {
    const w = world({ lines, totalMs: 40 });
    let release: () => void = () => undefined;
    w.state.holdAudit = new Promise<void>((resolve) => {
      release = resolve;
    });
    const outcome = await w.call({ range: { rows: 5 } });
    expect(outcome.kind).toBe('refused');
    expect(w.usage.leases.size).toBe(0);
    release(); // the late write finishes after the call was answered: nothing is handed off
    await new Promise((r) => setTimeout(r, 20));
    expect(w.usage.leases.size).toBe(0);
  });

  it('a late cleanup after the lease expired and was replaced never frees the replacement', async () => {
    const w = world({ lines });
    const first = (await w.call({ range: { rows: 5 } })) as Extract<ExportOutcome, { kind: 'stream' }>;
    w.usage.expireLeases(); // the first lease ran out (TTL) while its stream was still open
    const second = await w.call({ range: { rows: 5 } });
    expect(second.kind).toBe('stream');
    first.stream.destroy(); // the old stream closes late
    await closed(first);
    expect(w.usage.leases.size).toBeGreaterThan(0);
    expect(refused(await w.call({}))).toBe('explorer.export_busy'); // the replacement still holds
    await drain(second);
    await closed(second);
    expect(w.usage.leases.size).toBe(0);
  });
});

describe('one UTC day for a reservation (C6, export)', () => {
  it('midnight passing between the daily-count writes keeps every write of the export on the day it started', async () => {
    const w = world({ lines: [{ text: 'a' }, { text: 'b' }] });
    const add = w.usage.add.bind(w.usage);
    let advanced = false;
    w.usage.add = async (...args) => {
      const ok = await add(...args);
      if (!advanced && args[2] === 'exports') {
        advanced = true;
        w.state.now += 86_400_000; // midnight
      }
      return ok;
    };
    await drain(await w.call({ range: { rows: 2 } }, token(TOKEN, ['explorer.export'])));
    const days = new Set([...w.usage.counters.keys()].map((k) => k.split('|')[4]));
    expect([...days]).toEqual(['2026-11-08']);
  });
});
