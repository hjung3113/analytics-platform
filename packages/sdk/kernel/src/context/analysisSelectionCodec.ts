import type { AnalysisSelection, AnalysisSelectionShape } from '@ap/contracts';

/** Maximum distinct values in a URL-backed set (ADR-0175). */
export const ANALYSIS_SELECTION_MAX_VALUES = 50;

const setValues = (values: readonly string[]) => [...new Set(values.filter(value => value !== ''))];

/** Decodes declared URL values, returning null for absent, malformed or over-cap selections. */
export function parseAnalysisSelection(shape: AnalysisSelectionShape, values: readonly string[]): AnalysisSelection | null {
  if (shape === 'set') {
    const distinct = setValues(values);
    return distinct.length && distinct.length <= ANALYSIS_SELECTION_MAX_VALUES ? { shape, values: distinct } : null;
  }
  if (values.length !== 1) return null;
  const [from, to, extra] = values[0].split('/');
  return from && to && extra === undefined ? { shape, from, to } : null;
}

/** Serializes an analysis selection as repeated set values or one from/to range value. */
export function analysisSelectionParam(selection: AnalysisSelection): string | string[] {
  return selection.shape === 'set' ? setValues(selection.values) : `${selection.from}/${selection.to}`;
}
