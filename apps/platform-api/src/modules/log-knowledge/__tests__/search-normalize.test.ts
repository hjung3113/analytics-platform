import { describe, expect, it } from 'vitest';

import { MAX_ATTEMPTS, backoffSeconds, buildDocumentText, chunk, keyTokens, tokenize, wordTokens } from '../domain/search-normalize.js';

describe('wordTokens', () => {
  it.each([
    ['STEP_PROCESS', ['step_process', 'step', 'process']],
    ['step-process', ['step-process', 'step', 'process']],
    ['proc.start', ['proc.start', 'proc', 'start']],
    ['processStart', ['processstart', 'process', 'start']],
    ['HTTPServer', ['httpserver', 'http', 'server']],
    ['plain', ['plain']],
    ['_edge_', ['edge']],
    ['ＳＴＥＰ_ＰＲＯＣＥＳＳ', ['step_process', 'step', 'process']],
  ])('%s keeps the original and its pieces', (word, expected) => {
    expect(wordTokens(word)).toEqual(expected);
  });
});

describe('tokenize', () => {
  it('keeps Korean words whole and splits a mixed sentence on whitespace and punctuation', () => {
    expect(tokenize('STEP_PROCESS 다음에 공정시작이 늦다, PROCESS_START!')).toEqual([
      'step_process', 'step', 'process', '다음에', '공정시작이', '늦다', 'process_start', 'start',
    ]);
  });
  it('returns nothing for blank text', () => {
    expect(tokenize('  \n ')).toEqual([]);
  });
});

describe('keyTokens', () => {
  it('keeps the whole key and the tokens of both segments', () => {
    expect(keyTokens('Mod_A/STEP_PROCESS')).toEqual(['mod_a/step_process', 'mod_a', 'mod', 'a', 'step_process', 'step', 'process']);
  });
});

describe('buildDocumentText', () => {
  const base = { title: 'Late STEP_PROCESS', typeCode: 'anomaly', observation: 'seen', expected: null, analysisOpinion: null, improvement: null, changeNote: null, eventKeys: [], extraWords: [] };
  it('puts content tokens in both texts and Event keys / extra words only in the term text', () => {
    const out = buildDocumentText({ ...base, eventKeys: ['m/PROCESS_START'], extraWords: ['Vendor-X'] });
    expect(out.searchText).toBe('late step_process step process anomaly seen');
    expect(out.termText.split(' ')).toEqual(expect.arrayContaining(['late', 'step_process', 'm/process_start', 'process_start', 'vendor-x', 'vendor', 'x']));
    expect(out.searchText).not.toContain('m/process_start');
  });
});

describe('chunk / backoff', () => {
  it('splits into batches of the size and rejects a bad size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
    expect(() => chunk([1], 0)).toThrow(RangeError);
  });
  it('doubles from 30 s, is capped at one hour, and the attempt cap is 8', () => {
    expect([1, 2, 3, 4, 8, 20].map(backoffSeconds)).toEqual([30, 60, 120, 240, 3600, 3600]);
    expect(MAX_ATTEMPTS).toBe(8);
  });
});
