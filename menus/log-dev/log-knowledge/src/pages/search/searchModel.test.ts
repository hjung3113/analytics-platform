import { describe, expect, it } from 'vitest';
import { parseSearchAddress, plainQuery, SEARCH_KEY_RULES } from './searchModel';

describe('knowledge search address', () => {
  it('restores the explicit relation, kind and opposite section from a shareable address', () => {
    expect(parseSearchAddress({ q: 'STEP_PROCESS', relation: JSON.stringify({ source: 'STEP_PROCESS', predicate: 'after', target: 'PROCESS_START' }), kind: 'expected', opposite: 'true' })).toMatchObject({
      params: { q: 'STEP_PROCESS', relation: { source: 'STEP_PROCESS', predicate: 'after', target: 'PROCESS_START' }, kind: 'expected', includeOpposite: true }, active: true,
    });
  });
  it('keeps a bare address idle and refuses malformed address values', () => {
    expect(parseSearchAddress({})).toMatchObject({ active: false });
    const bad = (page: Record<string, string>) => SEARCH_KEY_RULES.filter(rule => page[rule.key] !== undefined && !rule.valid(page[rule.key]!)).map(rule => rule.key);
    expect(bad({ relation: '{broken', kind: 'bad', opposite: 'yes' })).toEqual(['relation', 'kind', 'opposite']);
    expect(bad({ relation: JSON.stringify({ source: ' A', predicate: 'before', target: 'B' }) })).toEqual(['relation']);
    expect(bad({ relation: '' }), 'an empty relation is an absent one').toEqual([]);
    for (const predicate of [['after'], { toString: null }, 1, null]) expect(bad({ relation: JSON.stringify({ source: 'A', predicate, target: 'B' }) }), JSON.stringify(predicate)).toEqual(['relation']);
    expect(bad({ q: 'a'.repeat(201) })).toEqual(['q']);
    expect(bad({ q: 'a'.repeat(200), kind: 'observed', opposite: 'false', relation: JSON.stringify({ source: 'A', predicate: 'after', target: 'B' }) })).toEqual([]);
  });
  it('removing interpretation turns an operator query into plain terms', () => {
    expect(plainQuery('STEP_PROCESS before PROCESS_START')).toBe('STEP_PROCESS PROCESS_START');
    expect(plainQuery('B_EVENT 나중 A_EVENT')).toBe('B_EVENT A_EVENT');
    expect(plainQuery('압력 로그')).toBe('압력 로그');
  });
  it.each(['STEP_PROCESS→PROCESS_START', 'STEP_PROCESS →PROCESS_START', 'STEP_PROCESS→ PROCESS_START', 'ＳＴＥＰ_PROCESS→PROCESS_START'])('removes the server-recognized arrow in %s', q => {
    expect(plainQuery(q)).toBe('STEP_PROCESS PROCESS_START');
  });
  it.each(['step before process', 'step → process', 'BEFORE before PROCESS_START', 'STEP_PROCESS after AFTER', 'STEP_PROCESS before PROCESS_START extra', '  압력 before 로그  '])('preserves non-operator text: %s', q => {
    expect(plainQuery(q)).toBe(q);
  });
});
