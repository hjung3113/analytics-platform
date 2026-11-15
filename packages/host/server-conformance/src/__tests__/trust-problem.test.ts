import { describe, expect, it } from 'vitest';
import type { Trust } from '@ap/contracts';
import { assessmentProblem, trustProblem } from '../helpers';

const base: Trust = { updatedAt: '2026-09-26T09:02:00+09:00', dataThrough: '2026-09-26T08:00:00+09:00', coverage: 0.9, provisional: false, source: 'mart.x' };
const withVersions = (sourceLogicVersions: unknown) => ({ ...base, sourceLogicVersions } as Trust);

describe('trustProblem · sourceLogicVersions (06 §18)', () => {
  it.each([
    ['absent', base],
    ['one version', withVersions(['v1.2'])],
    ['mixed versions', withVersions(['v1.3', 'v1.2'])],
  ])('accepts %s', (_name, trust) => {
    expect(trustProblem(trust)).toBeNull();
  });

  it.each([
    ['an empty array', [], 'empty'],
    ['a non-array', 'v1.2', 'array'],
    ['a non-string entry', ['v1.2', 3], 'non-empty string'],
    ['an empty-string entry', [''], 'non-empty string'],
    ['duplicate entries', ['v1.2', 'v1.2'], 'duplicate'],
  ])('rejects %s', (_name, value, fragment) => {
    const problem = trustProblem(withVersions(value));
    expect(problem).toContain('trust.sourceLogicVersions');
    expect(problem).toContain(fragment);
  });
});

describe('trustProblem · Trust times are real instants (#2044, contract-schemas `instant`)', () => {
  it.each([
    ['a Z updatedAt', { ...base, updatedAt: '2026-09-26T00:02:00Z' }],
    ['a null dataThrough', { ...base, dataThrough: null }],
  ])('accepts %s', (_name, trust) => {
    expect(trustProblem(trust)).toBeNull();
  });
  it.each([
    ['an offset-less updatedAt', { ...base, updatedAt: '2026-09-26T09:02:00' }, 'trust.updatedAt'],
    ['an offset-less dataThrough', { ...base, dataThrough: '2026-09-26T08:00:00' }, 'trust.dataThrough'],
  ])('rejects %s', (_name, trust, field) => {
    expect(trustProblem(trust)).toContain(`${field} is not an ISO-8601 instant with an offset`);
  });
  it('rejects an offset-less assessment observedAt and accepts one with an offset', () => {
    const clear = (observedAt: string) => [{ kind: 'coverage', state: 'clear', statusSource: 's', observedAt }] as const;
    expect(assessmentProblem(clear('2026-09-26T08:58:00'), 'ok')).toContain('observedAt is not an ISO-8601 instant');
    expect(assessmentProblem(clear('2026-09-26T08:58:00+09:00'), 'ok')).toBeNull();
  });
});
