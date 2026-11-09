import { describe, expect, it } from 'vitest';
import { parseSearchAddress, plainQuery } from './searchModel';

describe('knowledge search address', () => {
  it('restores the explicit relation, kind and opposite section from a shareable address', () => {
    expect(parseSearchAddress({ q: 'STEP_PROCESS', relation: JSON.stringify({ source: 'STEP_PROCESS', predicate: 'after', target: 'PROCESS_START' }), kind: 'expected', opposite: 'true' })).toMatchObject({
      errors: [], params: { q: 'STEP_PROCESS', relation: { source: 'STEP_PROCESS', predicate: 'after', target: 'PROCESS_START' }, kind: 'expected', includeOpposite: true }, active: true,
    });
  });
  it('keeps a bare address idle and refuses malformed address values', () => {
    expect(parseSearchAddress({})).toMatchObject({ active: false, errors: [] });
    expect(parseSearchAddress({ relation: '{broken', kind: 'bad', opposite: 'yes' }).errors).toHaveLength(3);
    expect(parseSearchAddress({ q: 'a'.repeat(201) }).errors).toHaveLength(1);
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
