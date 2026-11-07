import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SourceReadPort } from '../../log-explorer/ports/source-read.js';
import { calculateAvailability } from '../domain/availability.js';
import type { SampleSet } from '../domain/sample-manifest.js';
import {
  type DatasetSourceRead,
  type DescribeFileResponse,
  FILE_CHECK_CALL_BUDGET_MS,
  FILE_CHECK_CONCURRENCY,
  FILE_CHECK_TOTAL_BUDGET_MS,
  checkSampleSetFiles,
  checkSampleSetFilesFor,
} from '../source-check.js';

const H = (c: string) => c.repeat(64);
const set: SampleSet = {
  sourceOwner: 'owner-1',
  files: [
    { fileRef: 'a.log', order: 1, sha256: H('a') },
    { fileRef: 'b.log', order: 2, sha256: H('b') },
  ],
};

type WindowAnswer = { status: 'ok'; rows: []; truncated: false } | { status: 'unsupported'; reason: 'capability_missing' } | { status: 'permission_denied' } | { status: 'source_absent' };

/** A v0 port that can only say whether a file exists (`getWindow`), with a per-file answer. */
function v0Port(answers: Record<string, WindowAnswer | 'throw' | 'abort'>): DatasetSourceRead {
  const never = () => Promise.reject(new Error('not used'));
  return {
    describe: never,
    searchRecords: never,
    getParsed: never,
    getPeriods: never,
    getTopViewLink: never,
    async getWindow(request) {
      const answer = answers[request.fileRef];
      if (answer === 'throw') throw new Error('adapter body: secret text');
      if (answer === 'abort') throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      return (answer ?? { status: 'source_absent' }) as never;
    },
  } as SourceReadPort;
}

/** A port that can also tell a file's hash. */
function hashPort(answers: Record<string, DescribeFileResponse | 'throw'>): DatasetSourceRead {
  return {
    ...v0Port({}),
    async describeFile(request) {
      const answer = answers[request.fileRef];
      if (answer === 'throw') throw new Error('boom');
      return answer ?? { status: 'source_absent' };
    },
  };
}

describe('checkSampleSetFiles (revisionCreate file check)', () => {
  it('no port: no check was made, the revision is unverified', async () => {
    const states = await checkSampleSetFiles(undefined, set);
    expect(states).toBeNull();
    expect(calculateAvailability(states)).toBe('unverified');
  });

  it('found with a matching hash: available', async () => {
    const states = await checkSampleSetFiles(hashPort({ 'a.log': { status: 'ok', sha256: H('a') }, 'b.log': { status: 'ok', sha256: H('b') } }), set);
    expect(states).toEqual(['match', 'match']);
    expect(calculateAvailability(states)).toBe('available');
  });

  it('found with another hash: hash_mismatch', async () => {
    const states = await checkSampleSetFiles(hashPort({ 'a.log': { status: 'ok', sha256: H('a') }, 'b.log': { status: 'ok', sha256: H('c') } }), set);
    expect(states).toEqual(['match', 'hash_mismatch']);
    expect(calculateAvailability(states)).toBe('hash_mismatch');
  });

  it('absent or not readable: unavailable', async () => {
    expect(calculateAvailability(await checkSampleSetFiles(hashPort({ 'a.log': { status: 'ok', sha256: H('a') } }), set))).toBe('unavailable');
    expect(
      calculateAvailability(await checkSampleSetFiles(hashPort({ 'a.log': { status: 'ok', sha256: H('a') }, 'b.log': { status: 'permission_denied' } }), set)),
    ).toBe('unavailable');
  });

  it('unsupported: unverified, never confirmed', async () => {
    const states = await checkSampleSetFiles(hashPort({ 'a.log': { status: 'unsupported' }, 'b.log': { status: 'unsupported' } }), set);
    expect(states).toEqual(['unsupported', 'unsupported']);
    expect(calculateAvailability(states)).toBe('unverified');
  });

  it('a call that throws or is aborted is unverified and leaks no adapter text', async () => {
    const states = await checkSampleSetFiles(v0Port({ 'a.log': 'throw', 'b.log': 'abort' }), set);
    expect(states).toEqual(['error', 'error']);
    expect(JSON.stringify(states)).not.toContain('secret');
    expect(calculateAvailability(states)).toBe('unverified');
  });

  it('a v0 port (existence only) can find a file but cannot confirm its hash: unverified', async () => {
    const found: WindowAnswer = { status: 'ok', rows: [], truncated: false };
    const states = await checkSampleSetFiles(v0Port({ 'a.log': found, 'b.log': found }), set);
    expect(states).toEqual(['hash_unknown', 'hash_unknown']);
    expect(calculateAvailability(states)).toBe('unverified');
  });

  it('a v0 port still reports an absent file as unavailable', async () => {
    const found: WindowAnswer = { status: 'ok', rows: [], truncated: false };
    expect(calculateAvailability(await checkSampleSetFiles(v0Port({ 'a.log': found, 'b.log': { status: 'source_absent' } }), set))).toBe('unavailable');
  });

  it('answers in file order whatever the array order, and never calls the port with a signal that is already spent', async () => {
    const reversed: SampleSet = { ...set, files: [...set.files].reverse() };
    const seen: string[] = [];
    const port: DatasetSourceRead = {
      ...v0Port({}),
      async describeFile(request, ctx) {
        expect(ctx.signal.aborted).toBe(false);
        expect(ctx.timeBudgetMs).toBeLessThanOrEqual(10_000);
        seen.push(request.fileRef);
        return { status: 'ok', sha256: H('a') };
      },
    };
    const states = await checkSampleSetFiles(port, reversed);
    expect(states).toEqual(['match', 'hash_mismatch']);
    expect(seen.sort()).toEqual(['a.log', 'b.log']);
  });
});

describe('deadlines hold against an uncooperative adapter (fake timers)', () => {
  afterEach(() => vi.useRealTimers());

  /** A port whose `describeFile` is the given function, whatever it does with the abort signal. */
  const portOf = (describeFile: NonNullable<DatasetSourceRead['describeFile']>): DatasetSourceRead => ({ ...v0Port({}), describeFile });
  const one: SampleSet = { sourceOwner: 'owner-1', files: [{ fileRef: 'a.log', order: 1, sha256: H('a') }] };

  it('a never-settling adapter: the file is `error` at the per-call deadline and the check is unverified', async () => {
    vi.useFakeTimers();
    const result = checkSampleSetFiles(portOf(() => new Promise(() => {})), one);
    await vi.advanceTimersByTimeAsync(FILE_CHECK_CALL_BUDGET_MS);
    const states = await result;
    expect(states).toEqual(['error']);
    expect(calculateAvailability(states)).toBe('unverified');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('an adapter that ignores abort and resolves late: the late match is ignored', async () => {
    vi.useFakeTimers();
    const port = portOf(
      () => new Promise((resolve) => setTimeout(() => resolve({ status: 'ok', sha256: H('a') }), FILE_CHECK_CALL_BUDGET_MS + 500)),
    );
    const result = checkSampleSetFiles(port, one);
    await vi.advanceTimersByTimeAsync(FILE_CHECK_CALL_BUDGET_MS);
    expect(await result).toEqual(['error']);
    await vi.advanceTimersByTimeAsync(1_000); // the late answer arrives after the check settled
    expect(vi.getTimerCount()).toBe(0);
  });

  it('an adapter that answers inside the deadline is not cut off', async () => {
    vi.useFakeTimers();
    const port = portOf(() => new Promise((resolve) => setTimeout(() => resolve({ status: 'ok', sha256: H('a') }), 500)));
    const result = checkSampleSetFiles(port, one);
    await vi.advanceTimersByTimeAsync(500);
    expect(await result).toEqual(['match']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('the total deadline spans batches: files not reached in time are `error` and the port is not called for them', async () => {
    vi.useFakeTimers();
    const files = Array.from({ length: FILE_CHECK_CONCURRENCY * 7 }, (_, i) => ({ fileRef: `f${i}.log`, order: i + 1, sha256: H('a') }));
    const calls: string[] = [];
    // Every call takes 1.9 s (inside the 2 s call budget), so seven batches would need 13.3 s: past the 10 s total.
    const port = portOf(
      (request) =>
        new Promise((resolve) => {
          calls.push(request.fileRef);
          setTimeout(() => resolve({ status: 'ok', sha256: H('a') }), 1_900);
        }),
    );
    const result = checkSampleSetFiles(port, { sourceOwner: 'owner-1', files });
    await vi.advanceTimersByTimeAsync(FILE_CHECK_TOTAL_BUDGET_MS + 100);
    const states = (await result) ?? [];
    expect(states).toHaveLength(files.length);
    const matched = states.filter((s) => s === 'match').length;
    expect(matched).toBe(FILE_CHECK_CONCURRENCY * 5);
    expect(states.slice(matched).every((s) => s === 'error')).toBe(true);
    expect(calls).toHaveLength(FILE_CHECK_CONCURRENCY * 6); // the sixth batch started at 9.5 s and was cut at 10 s; the seventh never started
    expect(calculateAvailability(states)).toBe('unverified');
    // (the cut batch's own adapter timers are still pending here; they are the test adapter's, not the check's)
  });
});

describe('checkSampleSetFilesFor (Source-owner ACL before any probe)', () => {
  const actor = { actor_id: 'a', workspace_id: 'w' };
  const countingPort = () => {
    const calls: string[] = [];
    const port: DatasetSourceRead = {
      ...v0Port({}),
      async describeFile(request) {
        calls.push(request.fileRef);
        return { status: 'ok', sha256: H('a') };
      },
    };
    return { port, calls };
  };

  it('a denied owner: no port call, every file permission_denied, availability unavailable', async () => {
    const { port, calls } = countingPort();
    const asked: string[] = [];
    const states = await checkSampleSetFilesFor(port, {
        allows: async (_actor, owner) => {
          asked.push(owner);
          return false;
        },
      }, actor, set);
    expect(calls).toEqual([]);
    expect(asked).toEqual(['owner-1']);
    expect(states).toEqual(['permission_denied', 'permission_denied']);
    expect(calculateAvailability(states)).toBe('unavailable');
  });

  it('an allowed owner is probed as before; no port is still no check', async () => {
    const { port, calls } = countingPort();
    expect(await checkSampleSetFilesFor(port, { allows: async () => true }, actor, set)).toEqual(['match', 'hash_mismatch']);
    expect(calls.sort()).toEqual(['a.log', 'b.log']);
    expect(await checkSampleSetFilesFor(undefined, { allows: async () => true }, actor, set)).toBeNull();
  });
});
