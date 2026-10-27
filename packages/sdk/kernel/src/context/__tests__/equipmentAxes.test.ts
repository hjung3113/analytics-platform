import { describe, expect, it } from 'vitest';
import { labelledCondition } from '../equipmentAxes';

const axes = [
  { id: 'second', label: { ko: '둘째', en: 'Second' }, membershipHistory: false },
  { id: 'first', label: { ko: '첫째', en: 'First' }, membershipHistory: true },
];
describe('descriptor-labelled Condition (#552)', () => {
  it('uses descriptor order and language, with unknown axes last by id', () => {
    const condition = { z: ['Z'], first: ['A', 'B'], second: ['T'], a: ['X'] };
    expect(labelledCondition(condition, axes, 'ko')).toBe('둘째: T · 첫째: A, B · a: X · z: Z');
    expect(labelledCondition(condition, axes, 'en')).toBe('Second: T · First: A, B · a: X · z: Z');
  });
});
