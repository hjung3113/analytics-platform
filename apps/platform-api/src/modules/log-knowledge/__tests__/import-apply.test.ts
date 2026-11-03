import { describe, expect, it } from 'vitest';

import {
  type DecisionInput,
  type ResolutionInput,
  decideRow,
  emptyApplyCounts,
  finalJobStatus,
  identityKey,
  rowPlanHash,
  sealHash,
} from '../domain/import-apply.js';
import type { PlanState } from '../domain/import-plan.js';

const res = (resolution: ResolutionInput['resolution'], mapTargetId: string | null = null, v: number | null = null): ResolutionInput => ({
  resolution,
  mapTargetId,
  expectedTargetVersion: v,
});
const base = (planState: PlanState, resolution: ResolutionInput | null): DecisionInput => ({
  planState,
  targetId: 't1',
  targetVersion: 4,
  resolution,
});

describe('decideRow: plan state x resolution', () => {
  it.each([
    ['error', null, { kind: 'final', status: 'excluded' }],
    ['error', res('skip'), { kind: 'final', status: 'excluded' }],
    ['pending', null, { kind: 'final', status: 'excluded' }],
    ['new', null, { kind: 'create' }],
    ['new', res('create'), { kind: 'create' }],
    ['new', res('skip'), { kind: 'final', status: 'skipped' }],
    ['new', res('map', 'm1', 2), { kind: 'map', targetId: 'm1', expectedVersion: 2 }],
    ['new', res('map'), { kind: 'create' }],
    ['unchanged', null, { kind: 'final', status: 'unchanged' }],
    ['unchanged', res('skip'), { kind: 'final', status: 'skipped' }],
    ['update', null, { kind: 'update', targetId: 't1', expectedVersion: 4 }],
    ['update', res('skip'), { kind: 'final', status: 'skipped' }],
    ['conflict', null, { kind: 'final', status: 'unresolved' }],
    ['conflict', res('create'), { kind: 'final', status: 'unresolved' }],
    ['conflict', res('skip'), { kind: 'final', status: 'skipped' }],
    ['conflict', res('map', 'm1', 2), { kind: 'map', targetId: 'm1', expectedVersion: 2 }],
    ['conflict', res('map'), { kind: 'final', status: 'unresolved' }],
  ] as const)('%s + %j', (state, resolution, expected) => {
    expect(decideRow(base(state, resolution))).toEqual(expected);
  });
});

describe('row hash and seal', () => {
  const input = { rowNo: 1, normalized: { b: 1, a: { d: 2, c: 3 } }, planState: 'new' as const, targetId: null, targetVersion: null, resolution: null };
  it('is stable under key order and changes with any bound field', () => {
    const h = rowPlanHash(input);
    expect(rowPlanHash({ ...input, normalized: { a: { c: 3, d: 2 }, b: 1 } })).toBe(h);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(rowPlanHash({ ...input, rowNo: 2 })).not.toBe(h);
    expect(rowPlanHash({ ...input, planState: 'update' })).not.toBe(h);
    expect(rowPlanHash({ ...input, resolution: res('skip') })).not.toBe(h);
    expect(rowPlanHash({ ...input, normalized: { a: 1 } })).not.toBe(h);
  });
  it('seal depends on row order', () => {
    expect(sealHash(['a', 'b'])).not.toBe(sealHash(['b', 'a']));
    expect(sealHash(['a', 'b'])).toBe(sealHash(['a', 'b']));
  });
});

describe('final status and identity key', () => {
  it('completed unless a row failed or conflicted', () => {
    expect(finalJobStatus({ ...emptyApplyCounts(), applied: 3, unresolved: 2, excluded: 1 })).toBe('completed');
    expect(finalJobStatus({ ...emptyApplyCounts(), failed: 1 })).toBe('partial_failure');
    expect(finalJobStatus({ ...emptyApplyCounts(), conflict: 1 })).toBe('partial_failure');
  });
  it('keys never collide across parents or separators', () => {
    expect(identityKey('vendor', { codeKey: 'A' })).toBe('["A"]');
    const m1 = identityKey('model', { vendorKey: 'V1', codeKey: 'X' });
    const m2 = identityKey('model', { vendorKey: 'V2', codeKey: 'X' });
    expect(m1).not.toBe(m2);
    expect(identityKey('software', { vendorKey: 'A|B', modelKey: 'C', versionKey: '1' })).not.toBe(
      identityKey('software', { vendorKey: 'A', modelKey: 'B|C', versionKey: '1' }),
    );
  });
});
