import { expect, it } from 'vitest';
import { getAnalysisSelectionFilterBadge, resolveAnalysisSelectionFilter } from '../analysisSelectionFilter';

const selection = { shape: 'set', values: ['A'] } as const;
const ready = { availabilityCurrent: true, query: { status: 'done', showingPrevious: false } } as const;
const countRows = (rows: readonly string[]) => rows.length;

it.each([
  { ...ready, availabilityCurrent: false },
  { ...ready, query: { status: 'loading' } },
  { ...ready, query: { status: 'refreshing', showingPrevious: true } },
] as const)('waits without filtering or showing a badge while the source is pending (%j)', source => {
  const filter = resolveAnalysisSelectionFilter({ requested: true, applied: selection, source });
  expect(filter).toEqual({ kind: 'waiting' });
  expect(getAnalysisSelectionFilterBadge(filter, { response: { outcome: 'ok', data: ['row'] } }, countRows)).toBeUndefined();
});

it('waits on the requested selection even if the last report excluded all its values', () => {
  const source = { ...ready, query: { status: 'loading' } } as const;
  expect(resolveAnalysisSelectionFilter({ requested: true, applied: undefined, source })).toEqual({ kind: 'waiting' });
  expect(resolveAnalysisSelectionFilter({ requested: true, applied: undefined, source: ready })).toEqual({ kind: 'unfiltered' });
  expect(resolveAnalysisSelectionFilter({ requested: false, applied: undefined, source })).toEqual({ kind: 'unfiltered' });
  // Without a request nothing waits, and an applied filter still filters (pre-move hw-time behavior).
  expect(resolveAnalysisSelectionFilter({ requested: false, applied: selection, source })).toEqual({ kind: 'filtered', selection });
});

it.each([
  ['ok', ['first', 'second'], 2],
  ['empty', null, 0],
] as const)('shows the localized filtered population for a current %s response', (outcome, data, count) => {
  const filter = resolveAnalysisSelectionFilter({ requested: true, applied: selection, source: ready });
  expect(filter).toEqual({ kind: 'filtered', selection });
  expect(getAnalysisSelectionFilterBadge(filter, { response: { outcome, data } }, countRows)).toEqual({
    count, description: { ko: `필터됨 · ${count} · 선택 적용`, en: `Filtered · ${count} · Selection applied` },
  });
});

it.each([
  { response: null },
  { response: { outcome: 'error', data: null } },
  { response: { outcome: 'ok', data: ['old'] }, showingPrevious: true },
] as const)('omits the badge without a current answered result (%j)', result => {
  const filter = resolveAnalysisSelectionFilter({ requested: true, applied: selection, source: ready });
  expect(getAnalysisSelectionFilterBadge(filter, result, countRows)).toBeUndefined();
});
