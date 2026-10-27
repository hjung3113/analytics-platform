import { describe, expect, it } from 'vitest';
import type { Trust } from '@ap/contracts';
import { trustProblem } from '../helpers';

const base: Trust = { updatedAt: '2026-09-26T09:02:00', dataThrough: '2026-09-26T08:00:00', coverage: 0.9, provisional: false, source: 'mart.x' };
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
