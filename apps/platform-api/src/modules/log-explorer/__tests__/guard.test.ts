import { describe, expect, it, vi } from 'vitest';
import type { SourceReadPort } from '../ports/source-read.js';
import { SourceReadError } from '../errors.js';
import { guardSourceReadPort } from '../ports/guarded.js';
import { createSyntheticScenario, SYNTHETIC_LEAK_MARKER } from '../adapters/synthetic/index.js';

const never = (): Promise<never> => new Promise(() => undefined);
const ctx = (ms = 10_000, signal = new AbortController().signal) => ({ signal, timeBudgetMs: ms });
const A = 'synthetic/a.log';
const bad = (over: Partial<SourceReadPort>): SourceReadPort => ({ ...createSyntheticScenario('typical').port, ...over });

describe('guardSourceReadPort', () => {
  const { sampleSet } = createSyntheticScenario('typical');
  const req = { sampleSet, query: {}, cursor: null, limit: 10 };

  it('passes a conforming adapter through', async () => {
    const res = await guardSourceReadPort(createSyntheticScenario('typical').port).searchRecords(req, ctx());
    expect(res.status).toBe('ok');
  });
  it('refuses an invalid request before the adapter is called', async () => {
    const spy = vi.fn();
    const port = guardSourceReadPort(bad({ searchRecords: spy }));
    await expect(port.searchRecords({ ...req, limit: 201 }, ctx())).rejects.toMatchObject({ code: 'invalid_request' });
    expect(spy).not.toHaveBeenCalled();
  });
  it('enforces the time budget on an adapter that ignores it', async () => {
    const port = guardSourceReadPort(bad({ searchRecords: never }));
    await expect(port.searchRecords(req, ctx(30))).rejects.toMatchObject({ code: 'time_budget_exceeded' });
  });
  it('enforces cancellation on an adapter that ignores the signal', async () => {
    const c = new AbortController();
    const port = guardSourceReadPort(bad({ searchRecords: never }));
    const call = port.searchRecords(req, ctx(10_000, c.signal));
    c.abort();
    await expect(call).rejects.toMatchObject({ code: 'aborted' });
  });
  it('passes the adapter a signal that fires on cancel', async () => {
    const c = new AbortController();
    let fired = false;
    const port = guardSourceReadPort(bad({ searchRecords: (_r, inner) => new Promise((_ok, no) => inner.signal.addEventListener('abort', () => { fired = true; no(new Error('x')); }) ) }));
    const call = port.searchRecords(req, ctx(10_000, c.signal));
    c.abort();
    await expect(call).rejects.toMatchObject({ code: 'aborted' });
    expect(fired).toBe(true);
  });
  it('cuts an over-long row and recomputes the time-reversal marker, keeping order', async () => {
    const port = guardSourceReadPort(
      bad({
        searchRecords: async () => ({
          status: 'ok',
          partial: false,
          nextCursor: null,
          rows: [
            { fileRef: A, fileOrder: 1, line: 1, text: 'x'.repeat(9000), truncated: false, timestamp: '2026-01-01T00:00:09', timeReversal: true, synthetic: false },
            { fileRef: A, fileOrder: 1, line: 2, text: 'y', truncated: false, timestamp: '2026-01-01T00:00:01', timeReversal: false, synthetic: false },
          ],
        }),
      }),
    );
    const res = await port.searchRecords(req, ctx());
    if (res.status !== 'ok') throw new Error('not ok');
    expect(res.rows[0]).toMatchObject({ truncated: true, timeReversal: false });
    expect(res.rows[0]?.text).toHaveLength(8000);
    expect(res.rows[1]).toMatchObject({ line: 2, timeReversal: true });
  });
  it('fails closed on more rows than the request asked for', async () => {
    const row = { fileRef: A, fileOrder: 1, line: 1, text: 't', truncated: false, timestamp: null, timeReversal: false, synthetic: false };
    const port = guardSourceReadPort(bad({ searchRecords: async () => ({ status: 'ok', partial: false, nextCursor: null, rows: [row, { ...row, line: 2 }] }) }));
    await expect(port.searchRecords({ ...req, limit: 1 }, ctx())).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('fails closed on a response outside the wire contract (a forged key)', async () => {
    const port = guardSourceReadPort(bad({ getTopViewLink: async () => ({ status: 'ok', url: 'javascript:alert(1)', synthetic: false }) }));
    await expect(port.getTopViewLink({ sourceOwner: 'o', fileRef: 'f', line: 1 }, ctx())).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('turns any adapter failure into a code-only error without the source text, and logs nothing', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const port = guardSourceReadPort(createSyntheticScenario('failing').port);
    const error = await port.searchRecords(req, ctx()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SourceReadError);
    const text = JSON.stringify(error) + String((error as Error).message) + String((error as Error).stack);
    expect(text).not.toContain(SYNTHETIC_LEAK_MARKER);
    expect(text).not.toContain('hunter2');
    expect((error as Error).cause).toBeUndefined();
    const thrown = await guardSourceReadPort(bad({ getParsed: async () => { throw new Error(`body ${SYNTHETIC_LEAK_MARKER}`); } })).getParsed({ sourceOwner: 'o', fileRef: 'f', line: 1 }, ctx()).catch((e: unknown) => e);
    expect(JSON.stringify(thrown) + String((thrown as Error).message)).not.toContain(SYNTHETIC_LEAK_MARKER);
    for (const spy of spies) { expect(spy).not.toHaveBeenCalled(); spy.mockRestore(); }
  });

  const okRow = { fileRef: A, fileOrder: 1, line: 1, text: 't', truncated: false, timestamp: null, timeReversal: false, synthetic: false };
  const searchOk = (rows: unknown[]) => async () => ({ status: 'ok', partial: false, nextCursor: null, rows }) as never;
  const win = { sourceOwner: 'o', fileRef: A, line: 5, before: 2, after: 2 };

  it.each([
    ['null', null],
    ['ok with null rows', { status: 'ok', partial: false, nextCursor: null, rows: null }],
    ['a null row', { status: 'ok', partial: false, nextCursor: null, rows: [null] }],
    ['a row with a non-string text', { status: 'ok', partial: false, nextCursor: null, rows: [{ ...okRow, text: 5 }] }],
  ])('turns a malformed search answer (%s) into invalid_response, not a TypeError', async (_name, answer) => {
    const port = guardSourceReadPort(bad({ searchRecords: async () => answer as never }));
    const error = await port.searchRecords(req, ctx()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SourceReadError);
    expect(error).toMatchObject({ code: 'invalid_response' });
  });
  it('turns malformed window, parsed and periods answers into invalid_response', async () => {
    const at = { sourceOwner: 'o', fileRef: A, line: 1 };
    const periods = { sampleSet, query: {}, cursor: null, limit: 5 };
    await expect(guardSourceReadPort(bad({ getWindow: async () => ({ status: 'ok', rows: null, truncated: false }) as never })).getWindow(win, ctx())).rejects.toMatchObject({ code: 'invalid_response' });
    await expect(guardSourceReadPort(bad({ getParsed: async () => ({ status: 'ok', extractedFields: { a: null }, parserIn: 'i', parserOut: 'o', truncated: false, synthetic: false }) as never })).getParsed(at, ctx())).rejects.toMatchObject({ code: 'invalid_response' });
    await expect(guardSourceReadPort(bad({ getParsed: async () => null as never })).getParsed(at, ctx())).rejects.toMatchObject({ code: 'invalid_response' });
    await expect(guardSourceReadPort(bad({ getPeriods: async () => ({ status: 'ok', rows: [null], nextCursor: null }) as never })).getPeriods(periods, ctx())).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('rebuilds a throwing getter on the answer as a code-only error', async () => {
    const hostile = { status: 'ok', partial: false, nextCursor: null, get rows(): unknown[] { throw new Error(`body ${SYNTHETIC_LEAK_MARKER}`); } };
    const error = await guardSourceReadPort(bad({ searchRecords: async () => hostile as never })).searchRecords(req, ctx()).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'invalid_response' });
    expect(JSON.stringify(error) + String((error as Error).message) + String((error as Error).stack)).not.toContain(SYNTHETIC_LEAK_MARKER);
  });

  describe('deadline and cancellation are enforced on an answer that arrives', () => {
    const lateSync = () => {
      const start = performance.now();
      while (performance.now() - start < 40) { /* busy: no timer can run meanwhile */ }
      return Promise.resolve({ status: 'ok', partial: false, nextCursor: null, rows: [okRow] } as never);
    };
    it('refuses a late answer produced synchronously after the budget (control: the raw adapter would be accepted)', async () => {
      const raw = bad({ searchRecords: lateSync });
      await expect(raw.searchRecords(req, ctx(5))).resolves.toMatchObject({ status: 'ok' });
      await expect(guardSourceReadPort(raw).searchRecords(req, ctx(5))).rejects.toMatchObject({ code: 'time_budget_exceeded' });
    });
    it('refuses an answer fulfilled in the turn that aborts the caller (control: the raw adapter would be accepted)', async () => {
      const make = (c: AbortController) => bad({ searchRecords: () => { c.abort(); return Promise.resolve({ status: 'ok', partial: false, nextCursor: null, rows: [okRow] } as never); } });
      const raw = new AbortController();
      await expect(make(raw).searchRecords(req, ctx(10_000, raw.signal))).resolves.toMatchObject({ status: 'ok' });
      const guarded = new AbortController();
      await expect(guardSourceReadPort(make(guarded)).searchRecords(req, ctx(10_000, guarded.signal))).rejects.toMatchObject({ code: 'aborted' });
    });
  });

  describe('source locations', () => {
    it.each([
      ['descending lines', [{ ...okRow, line: 2 }, { ...okRow, line: 1 }]],
      ['a repeated position', [okRow, okRow]],
      ['a file of a later order first', [{ ...okRow, fileRef: 'synthetic/b.log', fileOrder: 2 }, okRow]],
      ['a file outside the sample set', [{ ...okRow, fileRef: 'other.log' }]],
      ['a file order that disagrees with the sample set', [{ ...okRow, fileOrder: 2 }]],
    ])('fails closed on a search answer with %s', async (_name, rows) => {
      const port = guardSourceReadPort(bad({ searchRecords: searchOk(rows) }));
      await expect(port.searchRecords(req, ctx())).rejects.toMatchObject({ code: 'invalid_response' });
    });
    it('keeps a search answer ordered by file then line even when timestamps run backwards', async () => {
      const rows = [{ ...okRow, timestamp: '2026-01-01T00:00:09' }, { ...okRow, line: 2, timestamp: '2026-01-01T00:00:01' }];
      const res = await guardSourceReadPort(bad({ searchRecords: searchOk(rows) })).searchRecords(req, ctx());
      if (res.status !== 'ok') throw new Error('not ok');
      expect(res.rows.map((r) => r.line)).toEqual([1, 2]);
    });
    const windowOk = (rows: unknown[]) => async () => ({ status: 'ok', rows, truncated: false }) as never;
    it.each([
      ['another file', [{ ...okRow, fileRef: 'synthetic/b.log', fileOrder: 2, line: 5 }]],
      ['a line outside before/after', [{ ...okRow, line: 9 }]],
      ['reversed lines', [{ ...okRow, line: 6 }, { ...okRow, line: 4 }]],
      ['mixed file orders', [{ ...okRow, line: 4 }, { ...okRow, line: 5, fileOrder: 2 }]],
    ])('fails closed on a window answer with %s', async (_name, rows) => {
      await expect(guardSourceReadPort(bad({ getWindow: windowOk(rows) })).getWindow(win, ctx())).rejects.toMatchObject({ code: 'invalid_response' });
    });
    it('accepts a window answer inside the ask', async () => {
      const rows = [3, 4, 5, 6, 7].map((line) => ({ ...okRow, line }));
      await expect(guardSourceReadPort(bad({ getWindow: windowOk(rows) })).getWindow(win, ctx())).resolves.toMatchObject({ status: 'ok' });
    });
    it.each([
      ['an unrelated file', [{ fileRef: 'other.log', startLine: 1, endLine: 2, state: 's', incomplete: false, synthetic: false }]],
      ['an end before the start', [{ fileRef: A, startLine: 5, endLine: 2, state: 's', incomplete: false, synthetic: false }]],
      ['periods out of file order', [
        { fileRef: 'synthetic/b.log', startLine: 1, endLine: 2, state: 's', incomplete: false, synthetic: false },
        { fileRef: A, startLine: 1, endLine: 2, state: 's', incomplete: false, synthetic: false },
      ]],
      ['periods out of line order', [
        { fileRef: A, startLine: 9, endLine: 10, state: 's', incomplete: false, synthetic: false },
        { fileRef: A, startLine: 3, endLine: 4, state: 's', incomplete: false, synthetic: false },
      ]],
    ])('fails closed on a periods answer with %s', async (_name, rows) => {
      const port = guardSourceReadPort(bad({ getPeriods: async () => ({ status: 'ok', rows, nextCursor: null }) as never }));
      await expect(port.getPeriods({ sampleSet, query: {}, cursor: null, limit: 5 }, ctx())).rejects.toMatchObject({ code: 'invalid_response' });
    });
  });

  it('refuses a window ask above 200 rows before the adapter is called', async () => {
    const spy = vi.fn();
    const port = guardSourceReadPort(bad({ getWindow: spy }));
    await expect(port.getWindow({ ...win, before: 100, after: 100 }, ctx())).rejects.toMatchObject({ code: 'invalid_request' });
    expect(spy).not.toHaveBeenCalled();
  });
  it('sets the window-level truncated flag when the guard cuts a row, and keeps an adapter true', async () => {
    const long = { ...okRow, line: 5, text: 'x'.repeat(9000) };
    const cut = await guardSourceReadPort(bad({ getWindow: async () => ({ status: 'ok', rows: [long], truncated: false }) as never })).getWindow(win, ctx());
    expect(cut).toMatchObject({ truncated: true });
    const kept = await guardSourceReadPort(bad({ getWindow: async () => ({ status: 'ok', rows: [{ ...okRow, line: 5 }], truncated: true }) as never })).getWindow(win, ctx());
    expect(kept).toMatchObject({ truncated: true });
    const clean = await guardSourceReadPort(bad({ getWindow: async () => ({ status: 'ok', rows: [{ ...okRow, line: 5 }], truncated: false }) as never })).getWindow(win, ctx());
    expect(clean).toMatchObject({ truncated: false });
  });
  it('rebuilds a SourceReadError that carries a body in its message, cause or extra fields', async () => {
    const dressed = new SourceReadError('adapter_failed') as SourceReadError & Record<string, unknown>;
    dressed.message = `body ${SYNTHETIC_LEAK_MARKER}`;
    dressed.cause = new Error(SYNTHETIC_LEAK_MARKER);
    dressed.extra = SYNTHETIC_LEAK_MARKER;
    const error = await guardSourceReadPort(bad({ searchRecords: async () => { throw dressed; } })).searchRecords(req, ctx()).catch((e: unknown) => e);
    expect(error).not.toBe(dressed);
    expect(error).toMatchObject({ code: 'adapter_failed' });
    expect(JSON.stringify(error) + String((error as Error).message) + String((error as Error).stack)).not.toContain(SYNTHETIC_LEAK_MARKER);
    expect((error as Error).cause).toBeUndefined();
  });
});
