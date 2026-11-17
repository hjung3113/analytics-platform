import { describe, expect, it } from 'vitest';
import { summaryPresentation, type SummaryFacts, type SummaryPresentation } from '../analysisChartFrameParts';

const base: SummaryFacts = {
  chrome: 'full', summary: undefined, fill: true, brushMode: false, selection: false, rangeKeyboard: false, draft: false,
  preview: false, applyPeriod: false, note: false, clipNotice: false, annotationAlert: false, annotations: 0, ownAnnotation: false,
  activeRow: false, selectedPoint: false, pointDetail: false, pointExtremes: false,
};
const hidden: SummaryPresentation = { quiet: false, show: false, rest: false, rangeUi: false, showRangeForm: false, hasControls: false, focusable: false };

describe('summaryPresentation (#2472)', () => {
  it.each<[string, Partial<SummaryFacts>, Partial<SummaryPresentation>]>([
    ['full fill card at rest: nothing', {}, {}],
    ['full non-fill: hint has room', { fill: false }, { show: true, rangeUi: true }],
    ['full non-fill with keyboard range: form shows and owns controls', { fill: false, rangeKeyboard: true, draft: true }, { show: true, rangeUi: true, showRangeForm: true, hasControls: true }],
    ['form needs a draft', { fill: false, rangeKeyboard: true }, { show: true, rangeUi: true }],
    ['full fill while brushing', { brushMode: true }, { show: true, rangeUi: true }],
    ['full with a selection', { selection: true }, { show: true, rangeUi: true, hasControls: true }],
    ['full clip notice alone', { clipNotice: true }, { show: true }],
    ['full preview without apply: no controls', { preview: true }, { show: true }],
    ['full preview with apply period: controls', { preview: true, applyPeriod: true }, { show: true, hasControls: true }],
    ['full note', { note: true }, { show: true }],
    ['full annotations (others)', { annotations: 2 }, { show: true }],
    ['full own annotation', { annotations: 1, ownAnnotation: true }, { show: true, hasControls: true }],
    ['full annotation alert', { annotationAlert: true }, { show: true, hasControls: true }],
    ['full active row', { activeRow: true }, { show: true }],
    ['selected point without detail: nothing', { selectedPoint: true }, {}],
    ['selected point with detail', { selectedPoint: true, pointDetail: true }, { show: true }],
    ['detail without a selected point: nothing', { pointDetail: true }, {}],
    ['selected point with extremes', { selectedPoint: true, pointExtremes: true }, { show: true }],
    ['quiet is ignored on full chrome', { summary: 'quiet' }, {}],
    ['standard at rest: region is a text tab stop', { chrome: 'standard' }, { show: true, focusable: true }],
    ['minimal at rest: nothing, but would be a tab stop', { chrome: 'minimal' }, { focusable: true }],
    ['standard with a selection: controls, no tab stop', { chrome: 'standard', selection: true }, { show: true, rangeUi: true, hasControls: true }],
    ['quiet at rest: sr-only, no tab stop', { chrome: 'standard', summary: 'quiet' }, { quiet: true, show: true, rest: true }],
    ['quiet on minimal at rest', { chrome: 'minimal', summary: 'quiet' }, { quiet: true, show: true, rest: true }],
    ['quiet with a selection: one line, form hidden', { chrome: 'standard', summary: 'quiet', selection: true, rangeKeyboard: true, draft: true }, { quiet: true, show: true, rangeUi: true, hasControls: true }],
    ['quiet while brushing with keyboard range: form and busy', { chrome: 'standard', summary: 'quiet', brushMode: true, rangeKeyboard: true, draft: true }, { quiet: true, show: true, rangeUi: true, showRangeForm: true, hasControls: true }],
    ['quiet while brushing without keyboard range: still rest', { chrome: 'standard', summary: 'quiet', brushMode: true }, { quiet: true, show: true, rest: true, rangeUi: true }],
    ['quiet non-fill without brush: no form', { chrome: 'standard', summary: 'quiet', fill: false, rangeKeyboard: true, draft: true }, { quiet: true, show: true, rest: true, rangeUi: true }],
    ['quiet with preview: busy', { chrome: 'standard', summary: 'quiet', preview: true }, { quiet: true, show: true, focusable: true }],
    ['quiet with note: busy', { chrome: 'standard', summary: 'quiet', note: true }, { quiet: true, show: true, focusable: true }],
    ['quiet with clip notice: busy', { chrome: 'standard', summary: 'quiet', clipNotice: true }, { quiet: true, show: true, focusable: true }],
    ['quiet with annotations: busy', { chrome: 'standard', summary: 'quiet', annotations: 1 }, { quiet: true, show: true, focusable: true }],
    ['quiet with annotation alert: busy with controls', { chrome: 'standard', summary: 'quiet', annotationAlert: true }, { quiet: true, show: true, hasControls: true }],
    ['quiet active row alone stays at rest', { chrome: 'standard', summary: 'quiet', activeRow: true }, { quiet: true, show: true, rest: true }],
    ['explicit standard summary on standard chrome', { chrome: 'standard', summary: 'standard' }, { show: true, focusable: true }],
  ])('%s', (_name, facts, expected) => {
    expect(summaryPresentation({ ...base, ...facts })).toEqual({ ...hidden, ...expected });
  });
});
