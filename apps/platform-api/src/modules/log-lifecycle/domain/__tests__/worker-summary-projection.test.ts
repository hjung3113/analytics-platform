import { describe, expect, it } from 'vitest';

import { projectWorkerSummary } from '../worker-summary-projection.js';

describe('worker summary projection v1', () => {
  it('distinguishes an absent stored summary', () => {
    expect(projectWorkerSummary(null)).toEqual({ workerSummaryProjection: 1, workerSummaryState: 'not_submitted', workerSummary: null });
  });

  it.each([{}, { reason: 'synthetic failure' }, [], ['synthetic'], 'synthetic', 0, true].map((stored) => [stored]))('returns no allowed fields for %j', (stored) => {
    expect(projectWorkerSummary(stored)).toEqual({ workerSummaryProjection: 1, workerSummaryState: 'no_allowed_fields', workerSummary: null });
  });

  it.each([
    ['fixture', 'synthetic'],
    ['mode', 'pass'], ['mode', 'fail'], ['mode', 'incomplete'],
    ['durationMs', 0], ['durationMs', 86_400_000],
    ['producer', 'a'], ['producer', '0'], ['producer', 'worker.v1_test-2'], ['producer', `a${'z'.repeat(63)}`],
    ['producerVersion', 'A'], ['producerVersion', '0'], ['producerVersion', '1.0+Build_test-2'], ['producerVersion', `Z${'9'.repeat(63)}`],
  ])('accepts the valid %s value %j independently', (key, value) => {
    expect(projectWorkerSummary({ [key]: value })).toEqual({ workerSummaryProjection: 1, workerSummaryState: 'available', workerSummary: { [key]: value } });
  });

  const invalid: [string, unknown[]][] = [
    ['fixture', ['Synthetic', '', 'pass', 1, null, {}, ['synthetic']]],
    ['mode', ['PASS', '', 'unknown', 1, null, {}, ['pass']]],
    ['durationMs', [-1, 86_400_001, 1.5, NaN, Infinity, -Infinity, '1', null, true, {}, [1]]],
    ['producer', ['', 'A', '_a', '.a', '-a', 'a/b', 'a b', 'a\n', 'a'.repeat(65), '한글', 1, null, {}, ['a']]],
    ['producerVersion', ['', '.1', '+1', '_1', '-1', '1/2', '1 2', '1\n', '1'.repeat(65), '버전', 1, null, {}, ['1']]],
  ];
  it.each(invalid.flatMap(([key, values]) => values.map((value): [string, unknown] => [key, value])))('drops invalid %s value %j without dropping valid siblings', (key, value) => {
    const sibling = key === 'fixture' ? { mode: 'pass' } : { fixture: 'synthetic' };
    expect(projectWorkerSummary({ ...sibling, [key]: value })).toEqual({ workerSummaryProjection: 1, workerSummaryState: 'available', workerSummary: sibling });
    expect(projectWorkerSummary({ [key]: value })).toEqual({ workerSummaryProjection: 1, workerSummaryState: 'no_allowed_fields', workerSummary: null });
  });

  it('copies only allowed scalars, never raw JSON, unknown key names or values', () => {
    const allowed = { fixture: 'synthetic', mode: 'incomplete', durationMs: 12, producer: 'synthetic.worker', producerVersion: '1.0+test' };
    const stored = { ...allowed, syntheticPrivateKey: 'synthetic private text', nested: { mode: 'fail' }, list: ['synthetic private text'] };
    const before = JSON.stringify(stored);
    const projected = projectWorkerSummary(stored);
    expect(projected).toEqual({ workerSummaryProjection: 1, workerSummaryState: 'available', workerSummary: allowed });
    expect(JSON.stringify(projected)).not.toMatch(/syntheticPrivateKey|synthetic private text|nested|list/);
    expect(projected.workerSummary).not.toBe(stored);
    expect(JSON.stringify(stored)).toBe(before);
  });
});
