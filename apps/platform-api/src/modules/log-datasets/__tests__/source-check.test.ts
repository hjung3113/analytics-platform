import { describe, expect, it } from 'vitest';

import type { SourceReadPort } from '../../log-explorer/ports/source-read.js';
import { calculateAvailability } from '../domain/availability.js';
import type { SampleSet } from '../domain/sample-manifest.js';
import { type DatasetSourceRead, type DescribeFileResponse, checkSampleSetFiles } from '../source-check.js';

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
