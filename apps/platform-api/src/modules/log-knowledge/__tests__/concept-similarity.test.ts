import { describe, expect, it } from 'vitest';

import { type ScanTarget, SUGGESTION_CAP, scanSuggestions } from '../domain/concept-suggest.js';
import { SIMILARITY_MIN_SCORE, fieldOverlap, nameSimilarity, normalizeName, scoreTargets } from '../domain/concept-similarity.js';

describe('concept similarity scoring (proposal evidence only)', () => {
  it.each([
    ['Spindle Start', 'spindlestart'],
    ['spindle-START', 'spindlestart'],
    ['  ＳＰＩＮＤＬＥ  ', 'spindle'],
    ['스핀들 시작', '스핀들시작'],
    ['---', ''],
  ])('normalises %j to %j', (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });

  it('scores identical normalised names 1 and unrelated names low', () => {
    expect(nameSimilarity('Spindle Start', 'spindle-start')).toBe(1);
    expect(nameSimilarity('Spindle Start', 'Door Open')).toBeLessThan(0.2);
    expect(nameSimilarity('', 'x')).toBe(0);
  });

  it('overlaps field names, and is null when either side has none', () => {
    expect(fieldOverlap(['speed', 'Load'], ['SPEED', 'temp'])).toBeCloseTo(1 / 3);
    expect(fieldOverlap([], ['speed'])).toBeNull();
    expect(fieldOverlap(['speed'], [])).toBeNull();
  });

  it('weights the name and, when both sides have fields, the field overlap', () => {
    expect(scoreTargets({ name: 'Start', fields: [] }, { name: 'Start', fields: ['a'] })).toEqual({ score: 1, basis: { name_trgm: 1 } });
    expect(scoreTargets({ name: 'Start', fields: ['a', 'b'] }, { name: 'Start', fields: ['a', 'c'] })).toEqual({
      score: 0.733,
      basis: { name_trgm: 1, field_overlap: 0.333 },
    });
  });
});

const target = (modelId: string, targetKey: string, name: string, fields: string[] = [], kind: 'module' | 'event' = 'event'): ScanTarget => ({ modelId, targetKey, kind, name, fields });
const never = () => false;

describe('suggestion scan', () => {
  it('flags every row a proposal, scores identical names 1 and still only proposes them', () => {
    const out = scanSuggestions([target('A', 'M/START', 'Start')], [target('B', 'M/START', 'Start')], never);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ proposal: true, score: 1, source: { modelId: 'A' }, candidate: { modelId: 'B' } });
  });

  it('matches by shared field names even when the names differ, but not below the minimum score', () => {
    const fields = ['speed', 'load', 'temp'];
    const out = scanSuggestions([target('A', 'M/GO', 'Go', fields)], [target('B', 'M/RUN', 'Run', fields), target('B', 'M/OTHER', 'Other', ['x'])], never);
    expect(out.map((s) => s.candidate.targetKey)).toEqual([]);
    const close = scanSuggestions([target('A', 'M/SPIN_START', 'Spin Start', fields)], [target('B', 'M/SPINDLE_START', 'Spindle Start', fields)], never);
    expect(close[0]?.score).toBeGreaterThanOrEqual(SIMILARITY_MIN_SCORE);
  });

  it('never pairs a model with itself or a module with an event', () => {
    expect(scanSuggestions([target('A', 'M/START', 'Start')], [target('A', 'M/START2', 'Start')], never)).toEqual([]);
    expect(scanSuggestions([target('A', 'START', 'Start', [], 'module')], [target('B', 'M/START', 'Start')], never)).toEqual([]);
  });

  it('skips a pair a human already decided to be the same concept', () => {
    const out = scanSuggestions([target('A', 'M/START', 'Start')], [target('B', 'M/START', 'Start')], () => true);
    expect(out).toEqual([]);
  });

  it('orders by score then keys and caps the list', () => {
    const sources = [target('A', 'M/ZZZ', 'Alpha Beta')];
    const candidates = [target('B', 'M/B', 'Alpha Beta'), target('B', 'M/A', 'Alpha Beta'), target('C', 'M/C', 'Alpha Betas')];
    expect(scanSuggestions(sources, candidates, never).map((s) => s.candidate.targetKey)).toEqual(['M/A', 'M/B', 'M/C']);
    const many = Array.from({ length: SUGGESTION_CAP + 20 }, (_v, i) => target('B', `M/E${i}`, 'Alpha Beta'));
    expect(scanSuggestions(sources, many, never)).toHaveLength(SUGGESTION_CAP);
  });
});
