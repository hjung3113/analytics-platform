import { describe, expect, it } from 'vitest';

import { decodeSearchCursor, encodeSearchCursor, queryDigest } from '../domain/search-cursor.js';
import { interpretQuery, isEventToken } from '../domain/search-query.js';
import { excerptOf } from '../repositories/search-read.js';
import { parseSearchParams, parseSuggestParams } from '../search-endpoints.js';

const dir = (q: string) => interpretQuery(q, null).direction;

describe('search query interpretation (design §4.1, §8)', () => {
  it('keeps the original text and tokenizes it', () => {
    const i = interpretQuery('  STEP_PROCESS  오류 ', null);
    expect(i.original).toBe('  STEP_PROCESS  오류 ');
    expect(i.tokens).toEqual(expect.arrayContaining(['step_process', 'step', 'process', '오류']));
    expect(i.words).toEqual(['step_process', '오류']);
    expect(i.direction).toBeNull();
  });

  it.each([
    ['STEP_PROCESS before PROCESS_START', 'STEP_PROCESS', 'PROCESS_START', false],
    ['STEP_PROCESS 먼저 PROCESS_START', 'STEP_PROCESS', 'PROCESS_START', false],
    ['STEP_PROCESS 이전 PROCESS_START', 'STEP_PROCESS', 'PROCESS_START', false],
    ['STEP_PROCESS → PROCESS_START', 'STEP_PROCESS', 'PROCESS_START', false],
    ['STEP_PROCESS→PROCESS_START', 'STEP_PROCESS', 'PROCESS_START', false],
    ['PROCESS_START after STEP_PROCESS', 'STEP_PROCESS', 'PROCESS_START', true],
    ['PROCESS_START 나중 STEP_PROCESS', 'STEP_PROCESS', 'PROCESS_START', true],
    ['PROCESS_START 이후 STEP_PROCESS', 'STEP_PROCESS', 'PROCESS_START', true],
    ['CHAMBER/START BEFORE CHAMBER/END', 'CHAMBER/START', 'CHAMBER/END', false],
  ])('%s -> source %s before target %s (swapped %s)', (q, source, target, swapped) => {
    expect(dir(q)).toEqual({ origin: 'operator', source, target, kind: 'all', swapped });
  });

  it('`B after A` and `A before B` normalize to the same direction; `B before A` is the other one', () => {
    const a = dir('B_EVT after A_EVT');
    const b = dir('A_EVT before B_EVT');
    const c = dir('B_EVT before A_EVT');
    expect([a?.source, a?.target]).toEqual([b?.source, b?.target]);
    expect([c?.source, c?.target]).toEqual(['B_EVT', 'A_EVT']);
  });

  it.each([
    ['B 전에 A가 아니다'],
    ['PROCESS_START 전에 STEP_PROCESS가 아니다'],
    ['before PROCESS_START'],
    ['STEP_PROCESS before'],
    ['STEP_PROCESS before PROCESS_START before X_Y'],
    ['STEP_PROCESS and PROCESS_START'],
    ['reset after the chamber is closed'],
    ['이전 버전 오류'],
    ['STEP_PROCESS before before PROCESS_START'],
    ['STEP_PROCESS 앞서 PROCESS_START'],
    ['STEP_PROCESS PROCESS_START'],
    [''],
  ])('unrecognized or one-sided %j stays plain text', (q) => {
    expect(dir(q)).toBeNull();
  });

  it('a query with extra words around the three parts is plain text, not a direction', () => {
    expect(dir('STEP_PROCESS before PROCESS_START 오류')).toBeNull();
  });

  it('an operator word is never an Event token, and plain lower-case words are not either', () => {
    expect(isEventToken('before')).toBe(false);
    expect(isEventToken('START')).toBe(true);
    expect(isEventToken('start')).toBe(false);
    expect(isEventToken('A')).toBe(false);
    expect(isEventToken('a_b')).toBe(true);
    expect(isEventToken('오류')).toBe(false);
  });

  it('the explicit relation wins, `after` is swapped, and q stays text', () => {
    const i = interpretQuery('step before process', { source: 'B_EVT', predicate: 'after', target: 'A_EVT' }, 'observed');
    expect(i.direction).toEqual({ origin: 'explicit', source: 'A_EVT', target: 'B_EVT', kind: 'observed', swapped: true });
    expect(i.words).toEqual(['step', 'before', 'process']);
  });

  it('an operator query consumes the whole text: no residual words', () => {
    const i = interpretQuery('A_EVT before B_EVT', null);
    expect(i.words).toEqual([]);
    expect(i.tokens).toEqual([]);
  });
});

describe('search cursor', () => {
  const after = { stage: 3, scoreMicro: 1_000_000, publishedAtMicro: 1_780_000_000_123_456, itemId: '00000000-0000-4000-8000-000000000001' };
  const digest = queryDigest({ q: 'a' });
  it('round-trips exactly, including microsecond timestamps', () => {
    expect(decodeSearchCursor(encodeSearchCursor(after, digest), digest)).toEqual(after);
  });
  it('refuses a cursor of another query, junk, and a tampered field', () => {
    const cursor = encodeSearchCursor(after, digest);
    expect(decodeSearchCursor(cursor, queryDigest({ q: 'b' }))).toBeNull();
    expect(decodeSearchCursor('not a cursor!', digest)).toBeNull();
    expect(decodeSearchCursor(Buffer.from('{"s":9}').toString('base64url'), digest)).toBeNull();
  });
});

describe('search params', () => {
  it('applies defaults and treats empty owner filter as none', () => {
    const r = parseSearchParams({ q: 'abc', ownerFilter: {} });
    expect(r).toMatchObject({ ok: true, input: { q: 'abc', owner: null, kind: 'all', includeOpposite: false, cursor: null, limit: 20 } });
  });
  it.each([
    [{ limit: 51 }],
    [{ limit: 0 }],
    [{ q: 'x'.repeat(201) }],
    [{ q: 'a\u0000b' }],
    [{ relation: { source: 'A', predicate: 'requires', target: 'B' } }],
    [{ kind: 'maybe' }],
    [{ ownerFilter: { modelId: 'nope' } }],
    [{ unknown: 1 }],
  ])('refuses %j without echoing the value', (params) => {
    const r = parseSearchParams(params);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).not.toContain('nope');
  });
  it('suggest needs non-blank text', () => {
    expect(parseSuggestParams({ q: '  ' }).ok).toBe(false);
    expect(parseSuggestParams({ q: 'ste' })).toMatchObject({ ok: true, q: 'ste' });
  });
});

describe('excerpt', () => {
  it('takes the first non-blank body field, collapses whitespace and cuts on code points', () => {
    expect(excerptOf([null, '  ', 'a\n b   c'])).toBe('a b c');
    expect(excerptOf([null, null])).toBe('');
    const long = excerptOf(['가'.repeat(400)]);
    expect([...long]).toHaveLength(161);
    expect(long.endsWith('…')).toBe(true);
  });
});
