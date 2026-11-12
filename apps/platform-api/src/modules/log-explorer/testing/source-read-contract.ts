// Reusable contract suite for any SourceReadPort adapter (#1467, ADR-0119 consequences). A real adapter's tests import
// `runSourceReadContract` and supply a target that builds the scenarios below from its own fixtures. The suite runs against the RAW
// adapter (not the guard), so an adapter that relies on the guard to stay inside the limits fails here. It takes the test API as an
// argument so this file carries no vitest import into the build.
//
// Scenario requirements for a target's `setup(scenario)`:
//   typical            `probe` has parsed data and a Top View link wherever getParsed / getTopViewLink are offered. Which of
//                      getParsed, getPeriods, getTopViewLink an adapter offers is declared by `target.capabilities` or, when absent,
//                      read from `describe`; an offered one must answer `ok`, a missing one an allowed `unsupported` reason
//   many_rows          >= 450 searchable lines over >= 2 files; `probe` has >= 150 lines before and after it
//   long_line          `probe` is a line longer than 8,000 chars; other lines are short
//   partial            a search over the sample set answers `ok` with `partial: true`
//   time_reversal      >= 3 consecutive lines where the 2nd has an earlier timestamp than the 1st
//   slow               every call takes > 1 s unless it is cancelled or runs out of budget; it must honour both
//   unsupported        a fixture lacking at least one of getParsed, getPeriods, getTopViewLink (read from `describe`); only the
//                      capabilities it lacks are checked. An adapter with no such fixture returns `null` and the case is skipped
//   absent_source      every call answers `source_absent`
//   permission_denied  every call answers `permission_denied`
//   failing            every call fails inside the adapter with an error whose text contains `failureMarker`
//
// The window harness additionally runs one optional case: `target.beyondEof` supplies a fixture whose probe line is past the
// file's end (with verified neighbours below it) and the answer must stay `source_absent`, never an `ok` without the target line.

import {
  SOURCE_READ_ROWS_MAX,
  SOURCE_READ_ROW_CHARS_MAX,
  SOURCE_READ_TIME_BUDGET_MS,
  SOURCE_READ_WINDOW_MAX,
  sourceDescribeResponseSchema,
  sourceParsedResponseSchema,
  sourcePeriodsResponseSchema,
  sourceSearchResponseSchema,
  sourceTopViewResponseSchema,
  sourceWindowResponseSchema,
  sourceSampleSetSchema,
  SOURCE_UNSUPPORTED_REASONS,
  type SourceReadCapability,
  type SourceSampleSet,
  type SourceUnsupportedReason,
} from '@ap/contract-schemas';

import { SourceReadError } from '../errors.js';
import { isInSourceOrder } from '../domain/time-reversal.js';
import type { SourceReadContext, SourceReadPort } from '../ports/source-read.js';

export const CONTRACT_SCENARIOS = [
  'typical',
  'many_rows',
  'long_line',
  'partial',
  'time_reversal',
  'slow',
  'unsupported',
  'absent_source',
  'permission_denied',
  'failing',
] as const;
export type ContractScenario = (typeof CONTRACT_SCENARIOS)[number];

export interface ContractFixture {
  port: SourceReadPort;
  sampleSet: SourceSampleSet;
  /** A line the scenario is about: the parsed/Top View line of `typical`, the middle of `many_rows`, the long line of `long_line`. */
  probe: { fileRef: string; line: number };
}

export interface SourceReadContractTarget {
  name: string;
  /** True for the fixture adapter: describe and every row must then say `synthetic`. A real adapter sets false. */
  synthetic: boolean;
  /** The text the `failing` scenario puts into its internal error. The suite proves it does not reach the thrown error. */
  failureMarker: string;
  /**
   * Capabilities the adapter offers, when the target knows them. Absent: read from `describe` of the `typical` fixture. Only
   * getParsed, getPeriods and getTopViewLink may be missing; an adapter never has to manufacture an integration it lacks.
   */
  capabilities?: readonly SourceReadCapability[];
  /** `null` only for `unsupported`: the adapter has no fixture lacking a capability, so the scenario is skipped. */
  setup(scenario: ContractScenario): ContractFixture | null | Promise<ContractFixture | null>;
  /**
   * Optional (window harness only): a fixture whose `probe` names a line past the end of the file, with at least two verified
   * lines below it. Absent or `null`: the beyond-EOF case is skipped.
   */
  beyondEof?(): ContractFixture | null | Promise<ContractFixture | null>;
}

/** The slice of vitest this suite needs; pass `{ describe, it, expect }` from 'vitest'. */
export interface ContractTestApi {
  describe(name: string, body: () => void): void;
  it(name: string, body: () => Promise<void> | void): void;
  expect(value: unknown): {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toBeLessThanOrEqual(n: number): void;
    toBeGreaterThan(n: number): void;
    toBeGreaterThanOrEqual(n: number): void;
    toContain(item: unknown): void;
    not: { toContain(item: unknown): void; toBe(expected: unknown): void };
    toHaveLength(n: number): void;
    rejects: { toMatchObject(shape: object): Promise<void> };
  };
}

const ctx = (timeBudgetMs: number = SOURCE_READ_TIME_BUDGET_MS, signal: AbortSignal = new AbortController().signal): SourceReadContext => ({ signal, timeBudgetMs });

/** How a call ended: the value it resolved with, or the error it rejected with. Nothing is discarded. */
export type Settled = { kind: 'value'; value: unknown } | { kind: 'error'; error: unknown };

async function settle(call: Promise<unknown>): Promise<Settled> {
  try {
    return { kind: 'value', value: await call };
  } catch (error) {
    return { kind: 'error', error };
  }
}

/**
 * The time-budget rule: a call that outlasts its budget rejects with the code-only `time_budget_exceeded`, or resolves a schema-valid
 * `ok` search with `partial: true`. Anything else, above all a complete answer after the budget, is a violation. Returns the reason, or null.
 * Exported so a negative control can prove it fails for an adapter that ignores the budget.
 */
export function timeBudgetViolation(outcome: Settled, elapsedMs: number, limitMs = 5000): string | null {
  if (elapsedMs > limitMs) return 'call outlasted the budget by far';
  if (outcome.kind === 'error') {
    const code = (outcome.error as { code?: unknown } | null)?.code;
    return outcome.error instanceof SourceReadError && code === 'time_budget_exceeded' ? null : 'rejected with something other than time_budget_exceeded';
  }
  const parsed = sourceSearchResponseSchema.safeParse(outcome.value);
  if (!parsed.success) return 'resolved a malformed answer';
  if (parsed.data.status !== 'ok') return 'resolved a non-ok state instead of stopping';
  return parsed.data.partial ? null : 'resolved a complete answer after the budget';
}

const UNSUPPORTED_REASONS: Record<'getParsed' | 'getPeriods' | 'getTopViewLink', readonly SourceUnsupportedReason[]> = {
  getParsed: ['parser_not_connected', 'capability_missing'],
  getPeriods: ['periods_not_supported', 'capability_missing'],
  getTopViewLink: ['top_view_not_connected', 'capability_missing'],
};

/** An absent capability answers `{ status: 'unsupported', reason }` with a reason allowed for it, and nothing else. Returns the problem, or null. */
export function unsupportedViolation(capability: keyof typeof UNSUPPORTED_REASONS, answer: unknown): string | null {
  const a = answer as { status?: unknown; reason?: unknown } | null;
  if (a === null || typeof a !== 'object' || a.status !== 'unsupported' || Object.keys(a).length !== 2) return `${capability}: not an unsupported state`;
  const reasons = UNSUPPORTED_REASONS[capability] as readonly unknown[];
  return reasons.includes(a.reason) && (SOURCE_UNSUPPORTED_REASONS as readonly unknown[]).includes(a.reason) ? null : `${capability}: reason not allowed`;
}

export function runSourceReadContract(api: ContractTestApi, target: SourceReadContractTarget): void {
  const { describe, it, expect } = api;
  const fixtureOf = async (scenario: ContractScenario): Promise<ContractFixture> => {
    const f = await target.setup(scenario);
    if (f === null) throw new Error(`${scenario}_fixture_required`);
    return f;
  };
  const search = (f: ContractFixture, limit: number, cursor: string | null = null) => f.port.searchRecords({ sampleSet: f.sampleSet, query: {}, cursor, limit }, ctx());

  describe(`SourceReadPort contract: ${target.name}`, () => {
    it('describe: answers within the platform limits and says whether it is synthetic', async () => {
      const f = await fixtureOf('typical');
      const res = await f.port.describe({ sourceOwner: f.sampleSet.sourceOwner }, ctx());
      expect(sourceDescribeResponseSchema.safeParse(res).success).toBe(true);
      expect(sourceSampleSetSchema.safeParse(f.sampleSet).success).toBe(true);
      if (res.status !== 'ok') throw new Error('describe_not_ok');
      expect(res.limits.maxRows).toBeLessThanOrEqual(SOURCE_READ_ROWS_MAX);
      expect(res.limits.maxRowChars).toBeLessThanOrEqual(SOURCE_READ_ROW_CHARS_MAX);
      expect(res.limits.maxWindow).toBeLessThanOrEqual(SOURCE_READ_WINDOW_MAX);
      expect(res.limits.timeBudgetMs).toBeLessThanOrEqual(SOURCE_READ_TIME_BUDGET_MS);
      expect(res.synthetic).toBe(target.synthetic);
    });

    it('search: never returns more than the asked limit or 200 rows, pages by cursor without gaps or repeats', async () => {
      const f = await fixtureOf('many_rows');
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const res = await search(f, 200, cursor);
        expect(sourceSearchResponseSchema.safeParse(res).success).toBe(true);
        if (res.status !== 'ok') throw new Error('search_not_ok');
        expect(res.rows.length).toBeLessThanOrEqual(200);
        expect(isInSourceOrder(res.rows)).toBe(true);
        for (const row of res.rows) {
          expect(row.synthetic).toBe(target.synthetic);
          seen.push(`${row.fileOrder}:${row.line}`);
        }
        cursor = res.nextCursor;
        pages += 1;
      } while (cursor !== null && pages < 20);
      expect(pages).toBeGreaterThan(1);
      expect(new Set(seen).size).toBe(seen.length);
      expect(seen.length).toBeGreaterThanOrEqual(450);
      const small = await search(f, 7);
      if (small.status !== 'ok') throw new Error('search_not_ok');
      expect(small.rows.length).toBeLessThanOrEqual(7);
    });

    it('order: file order then line, never re-sorted by timestamp; a time reversal is marked, not moved', async () => {
      const f = await fixtureOf('time_reversal');
      const res = await search(f, 50);
      if (res.status !== 'ok') throw new Error('search_not_ok');
      expect(isInSourceOrder(res.rows)).toBe(true);
      const reversed = res.rows.filter((row) => row.timeReversal);
      expect(reversed.length).toBeGreaterThan(0);
      res.rows.forEach((row, i) => {
        const before = res.rows[i - 1];
        if (row.timeReversal && before !== undefined) expect((row.timestamp ?? '') < (before.timestamp ?? '')).toBe(true);
      });
    });

    it('row text: over 8,000 chars is cut and flagged `truncated`; short rows are not flagged', async () => {
      const f = await fixtureOf('long_line');
      const res = await search(f, 50);
      if (res.status !== 'ok') throw new Error('search_not_ok');
      expect(res.rows.some((row) => row.truncated)).toBe(true);
      for (const row of res.rows) {
        expect(row.text.length).toBeLessThanOrEqual(SOURCE_READ_ROW_CHARS_MAX);
      }
      expect(res.rows.some((row) => !row.truncated)).toBe(true);
    });

    it('partial: an unreadable part of the sample set is reported as `partial`, with the readable rows kept', async () => {
      const f = await fixtureOf('partial');
      const res = await search(f, 50);
      expect(sourceSearchResponseSchema.safeParse(res).success).toBe(true);
      if (res.status !== 'ok') throw new Error('search_not_ok');
      expect(res.partial).toBe(true);
      expect(res.rows.length).toBeGreaterThan(0);
    });

    it('window: within the advertised limits, in order, around the probe line; the global 100 per side and 200 rows are ceilings', async () => {
      const f = await fixtureOf('many_rows');
      const described = await f.port.describe({ sourceOwner: f.sampleSet.sourceOwner }, ctx());
      if (described.status !== 'ok') throw new Error('describe_not_ok');
      // The ask is built from what the adapter advertises: `many_rows` has >= 150 lines each side of the probe, so a full window is owed.
      const side = Math.min(described.limits.maxWindow, SOURCE_READ_WINDOW_MAX);
      const cap = Math.min(described.limits.maxRows, SOURCE_READ_ROWS_MAX);
      const before = Math.min(side, cap - 1);
      const after = Math.min(side, cap - 1 - before);
      const res = await f.port.getWindow({ sourceOwner: f.sampleSet.sourceOwner, fileRef: f.probe.fileRef, line: f.probe.line, before, after }, ctx());
      expect(sourceWindowResponseSchema.safeParse(res).success).toBe(true);
      if (res.status !== 'ok') throw new Error('window_not_ok');
      expect(res.rows.length).toBeLessThanOrEqual(cap);
      expect(res.rows.length).toBeLessThanOrEqual(SOURCE_READ_ROWS_MAX);
      expect(res.rows.length).toBe(before + after + 1);
      expect(isInSourceOrder(res.rows)).toBe(true);
      expect(res.rows.some((row) => row.line === f.probe.line)).toBe(true);
    });

    it('window: an ask above 200 rows (before + after + 1) is refused with `invalid_request`, never silently cut', async () => {
      const f = await fixtureOf('many_rows');
      const ask = { sourceOwner: f.sampleSet.sourceOwner, fileRef: f.probe.fileRef, line: f.probe.line, before: 100, after: 100 };
      await expect(f.port.getWindow(ask, ctx())).rejects.toMatchObject({ code: 'invalid_request' });
    });

    it('window: a cut row is flagged `truncated` and the window says so', async () => {
      const f = await fixtureOf('long_line');
      const res = await f.port.getWindow({ sourceOwner: f.sampleSet.sourceOwner, fileRef: f.probe.fileRef, line: f.probe.line, before: 2, after: 2 }, ctx());
      if (res.status !== 'ok') throw new Error('window_not_ok');
      expect(res.truncated).toBe(true);
      for (const row of res.rows) expect(row.text.length).toBeLessThanOrEqual(SOURCE_READ_ROW_CHARS_MAX);
    });

    const offered = async (): Promise<ReadonlySet<SourceReadCapability>> => {
      if (target.capabilities !== undefined) return new Set(target.capabilities);
      const f = await fixtureOf('typical');
      const described = await f.port.describe({ sourceOwner: f.sampleSet.sourceOwner }, ctx());
      if (described.status !== 'ok') throw new Error('describe_not_ok');
      return new Set(described.capabilities);
    };

    it('typical: parsed, periods and Top View link answer ok when offered, an allowed unsupported state when not', async () => {
      const f = await fixtureOf('typical');
      const has = await offered();
      const owner = f.sampleSet.sourceOwner;
      const at = { sourceOwner: owner, fileRef: f.probe.fileRef, line: f.probe.line };
      const parsed = await f.port.getParsed(at, ctx());
      const periods = await f.port.getPeriods({ sampleSet: f.sampleSet, query: {}, cursor: null, limit: 10 }, ctx());
      const top = await f.port.getTopViewLink(at, ctx());
      if (has.has('getParsed')) {
        expect(sourceParsedResponseSchema.safeParse(parsed).success).toBe(true);
        expect(parsed.status).toBe('ok');
      } else expect(unsupportedViolation('getParsed', parsed)).toBeNull();
      if (has.has('getPeriods')) {
        expect(sourcePeriodsResponseSchema.safeParse(periods).success).toBe(true);
        expect(periods.status).toBe('ok');
      } else expect(unsupportedViolation('getPeriods', periods)).toBeNull();
      if (has.has('getTopViewLink')) {
        expect(sourceTopViewResponseSchema.safeParse(top).success).toBe(true);
        expect(top.status).toBe('ok');
      } else expect(unsupportedViolation('getTopViewLink', top)).toBeNull();
    });

    it('unsupported: a capability the source lacks is a stated state with an allowed reason code, not an error and not a fake result', async () => {
      const f = await target.setup('unsupported');
      if (f === null) return; // the adapter has no fixture without its capabilities: nothing to check
      const owner = f.sampleSet.sourceOwner;
      const at = { sourceOwner: owner, fileRef: f.probe.fileRef, line: f.probe.line };
      const described = await f.port.describe({ sourceOwner: owner }, ctx());
      if (described.status !== 'ok') throw new Error('describe_not_ok');
      // Only what this fixture lacks is checked; a capability it offers is covered by `typical`.
      for (const capability of ['getParsed', 'getPeriods', 'getTopViewLink'] as const) {
        if (described.capabilities.includes(capability)) continue;
        const answer =
          capability === 'getParsed'
            ? await f.port.getParsed(at, ctx())
            : capability === 'getPeriods'
              ? await f.port.getPeriods({ sampleSet: f.sampleSet, query: {}, cursor: null, limit: 10 }, ctx())
              : await f.port.getTopViewLink(at, ctx());
        expect(unsupportedViolation(capability, answer)).toBeNull();
      }
    });

    for (const scenario of ['absent_source', 'permission_denied'] as const) {
      it(`${scenario}: every call answers the state and carries no rows`, async () => {
      const f = await fixtureOf(scenario);
      const owner = f.sampleSet.sourceOwner;
      const answers = [
        await search(f, 10),
        await f.port.getWindow({ sourceOwner: owner, fileRef: f.probe.fileRef, line: f.probe.line, before: 1, after: 1 }, ctx()),
        await f.port.getParsed({ sourceOwner: owner, fileRef: f.probe.fileRef, line: f.probe.line }, ctx()),
        await f.port.getPeriods({ sampleSet: f.sampleSet, query: {}, cursor: null, limit: 10 }, ctx()),
        await f.port.getTopViewLink({ sourceOwner: owner, fileRef: f.probe.fileRef, line: f.probe.line }, ctx()),
      ];
      const status = scenario === 'absent_source' ? 'source_absent' : 'permission_denied';
      for (const answer of answers) expect(answer).toEqual({ status });
      });
    }

    it('cancel: an already-aborted signal rejects `aborted` without a result', async () => {
      const f = await fixtureOf('typical');
      const controller = new AbortController();
      controller.abort();
      await expect(search2(f, ctx(SOURCE_READ_TIME_BUDGET_MS, controller.signal))).rejects.toMatchObject({ code: 'aborted' });
    });

    it('cancel: aborting a running call stops it with `aborted`, promptly', async () => {
      const f = await fixtureOf('slow');
      const controller = new AbortController();
      const started = Date.now();
      const call = search2(f, ctx(SOURCE_READ_TIME_BUDGET_MS, controller.signal));
      setTimeout(() => controller.abort(), 20);
      await expect(call).rejects.toMatchObject({ code: 'aborted' });
      expect(Date.now() - started).toBeLessThanOrEqual(5000);
    });

    it('time budget: a call that outlasts its budget stops with `time_budget_exceeded` or reports a partial search, never a complete answer', async () => {
      const f = await fixtureOf('slow');
      const started = Date.now();
      const outcome = await settle(search2(f, ctx(50)));
      expect(timeBudgetViolation(outcome, Date.now() - started)).toBeNull();
    });

    it('errors carry a code and no source text: the failure marker never reaches the thrown error', async () => {
      const f = await fixtureOf('failing');
      const outcome = await settle(search2(f, ctx()));
      expect(outcome.kind).toBe('error');
      const error = outcome.kind === 'error' ? outcome.error : undefined;
      expect(error instanceof SourceReadError).toBe(true);
      const e = error as SourceReadError;
      expect(e.code).toBe('adapter_failed');
      expect(e.message).not.toContain(target.failureMarker);
      expect(String(e.stack ?? '')).not.toContain(target.failureMarker);
      expect(JSON.stringify(e)).not.toContain(target.failureMarker);
      expect((e as { cause?: unknown }).cause).toBeUndefined();
    });
  });

  function search2(f: ContractFixture, c: SourceReadContext) {
    return f.port.searchRecords({ sampleSet: f.sampleSet, query: {}, cursor: null, limit: 10 }, c);
  }
}

/** Window-only providers use the same schema, limit and error rules without pretending to support search or parsing.
 * The trusted manifest is server-owned context, never part of the public window request.
 * `slow` and `failing` exercise provider I/O; `absent_source` must return no body.
 */
export function runSourceWindowContract(api: ContractTestApi, target: SourceReadContractTarget): void {
  const { describe, it, expect } = api;
  const fixtureOf = async (scenario: ContractScenario) => {
    const fixture = await target.setup(scenario);
    if (!fixture) throw new Error(`${scenario}_fixture_required`);
    return fixture;
  };
  const read = (f: ContractFixture, c = ctx(), before = 1, after = 1) => f.port.getWindow(
    { sourceOwner: f.sampleSet.sourceOwner, ...f.probe, before, after }, { ...c, trustedSampleSet: f.sampleSet },
  );
  describe(`SourceReadPort window contract: ${target.name}`, () => {
    it('advertises only window within platform limits and returns valid ordered rows', async () => {
      const f = await fixtureOf('many_rows');
      const d = await f.port.describe({ sourceOwner: f.sampleSet.sourceOwner }, ctx());
      expect(sourceDescribeResponseSchema.safeParse(d).success).toBe(true);
      if (d.status !== 'ok') throw new Error('describe_not_ok');
      expect(d.capabilities).toEqual(['getWindow']);
      expect(d.synthetic).toBe(target.synthetic);
      expect(d.limits.maxRows).toBeLessThanOrEqual(SOURCE_READ_ROWS_MAX);
      expect(d.limits.maxWindow).toBeLessThanOrEqual(SOURCE_READ_WINDOW_MAX);
      expect(d.limits.maxRowChars).toBeLessThanOrEqual(SOURCE_READ_ROW_CHARS_MAX);
      expect(d.limits.timeBudgetMs).toBeLessThanOrEqual(SOURCE_READ_TIME_BUDGET_MS);
      const before = Math.min(d.limits.maxWindow, d.limits.maxRows - 1);
      const after = Math.min(d.limits.maxWindow, d.limits.maxRows - before - 1);
      const res = await read(f, ctx(), before, after);
      expect(sourceWindowResponseSchema.safeParse(res).success).toBe(true);
      if (res.status !== 'ok') throw new Error('window_not_ok');
      expect(res.rows).toHaveLength(before + after + 1);
      expect(isInSourceOrder(res.rows)).toBe(true);
      expect(res.rows.some(row => row.line === f.probe.line)).toBe(true);
      for (const row of res.rows) expect(row.synthetic).toBe(target.synthetic);
    });
    it('refuses requests exceeding the 200-row window', async () => {
      const f = await fixtureOf('many_rows');
      await expect(read(f, ctx(), 100, 100)).rejects.toMatchObject({ code: 'invalid_request' });
    });
    it('cuts long rows at 8000 chars and flags row and window', async () => {
      const res = await read(await fixtureOf('long_line'));
      if (res.status !== 'ok') throw new Error('window_not_ok');
      expect(res.truncated).toBe(true);
      expect(res.rows.some(row => row.truncated)).toBe(true);
      expect(res.rows.some(row => !row.truncated)).toBe(true);
      for (const row of res.rows) expect(row.text.length).toBeLessThanOrEqual(SOURCE_READ_ROW_CHARS_MAX);
    });
    it('returns explicit unsupported states for every unadvertised operation', async () => {
      const f = await fixtureOf('typical');
      const at = { sourceOwner: f.sampleSet.sourceOwner, ...f.probe };
      expect(await f.port.searchRecords({ sampleSet: f.sampleSet, query: {}, cursor: null, limit: 1 }, ctx())).toEqual({ status: 'unsupported', reason: 'capability_missing' });
      expect(unsupportedViolation('getParsed', await f.port.getParsed(at, ctx()))).toBeNull();
      expect(unsupportedViolation('getPeriods', await f.port.getPeriods({ sampleSet: f.sampleSet, query: {}, cursor: null, limit: 1 }, ctx()))).toBeNull();
      expect(unsupportedViolation('getTopViewLink', await f.port.getTopViewLink(at, ctx()))).toBeNull();
    });
    it('missing source discloses no rows', async () => {
      expect(await read(await fixtureOf('absent_source'))).toEqual({ status: 'source_absent' });
    });
    it('answers source_absent, discarding neighbours, when the target line is past EOF', async () => {
      const f = (await target.beyondEof?.()) ?? null;
      if (!f) return;
      expect(await read(f, ctx(), 1, 1)).toEqual({ status: 'source_absent' });
      // The verified neighbours below the missing line do not make the window `ok` without the target line.
      expect(await read(f, ctx(), 2, 0)).toEqual({ status: 'source_absent' });
    });
    it('rejects an already aborted read', async () => {
      const f = await fixtureOf('typical');
      const controller = new AbortController(); controller.abort();
      await expect(read(f, ctx(10000, controller.signal))).rejects.toMatchObject({ code: 'aborted' });
    });
    it('aborts active provider I/O promptly', async () => {
      const f = await fixtureOf('slow');
      const controller = new AbortController();
      const started = Date.now();
      const call = read(f, ctx(10000, controller.signal));
      const timer = setTimeout(() => controller.abort(), 20);
      try { await expect(call).rejects.toMatchObject({ code: 'aborted' }); }
      finally { clearTimeout(timer); }
      expect(Date.now() - started).toBeLessThanOrEqual(5000);
    });
    it('times out provider I/O with a code-only error', async () => {
      const f = await fixtureOf('slow');
      const started = Date.now();
      await expect(read(f, ctx(50))).rejects.toMatchObject({ code: 'time_budget_exceeded' });
      expect(Date.now() - started).toBeLessThanOrEqual(5000);
    });
    it('sanitizes provider failures without source text or cause', async () => {
      const outcome = await settle(read(await fixtureOf('failing')));
      expect(outcome.kind).toBe('error');
      const error = outcome.kind === 'error' ? outcome.error : undefined;
      expect(error instanceof SourceReadError).toBe(true);
      const e = error as SourceReadError;
      expect(e.code).toBe('adapter_failed');
      expect(e.message).not.toContain(target.failureMarker);
      expect(String(e.stack)).not.toContain(target.failureMarker);
      expect(JSON.stringify(e)).not.toContain(target.failureMarker);
      expect((e as { cause?: unknown }).cause).toBeUndefined();
    });
  });
}
