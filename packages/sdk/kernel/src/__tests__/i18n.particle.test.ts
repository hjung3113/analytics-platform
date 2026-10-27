import { describe, expect, it } from 'vitest';
import { objectParticle, queryMissingSentence } from '../i18n';

describe('objectParticle', () => {
  it.each([['공정', '을'], ['기간', '을'], ['지표', '를'], ['Scope', '를'], ['PPID', '를'], ['', '를']] as const)('%s → %s', (name, particle) => {
    expect(objectParticle(name)).toBe(particle);
  });
});

describe('queryMissingSentence', () => {
  it('fills the label and particle in ko and leaves en unchanged', () => {
    expect(queryMissingSentence('ko', { ko: '공정', en: 'Process' })).toBe('공정을 선택하세요');
    expect(queryMissingSentence('ko', { ko: '지표', en: 'Metric' })).toBe('지표를 선택하세요');
    expect(queryMissingSentence('en', { ko: '공정', en: 'Process' })).toBe('Select Process');
  });
});
