import { describe, expect, it } from 'vitest';
import { summaryPresentation, type SummaryFacts, type SummaryPresentation } from '../analysisChartFrameParts';

const base: SummaryFacts = {
  chrome: 'full', summary: undefined, selection: false,
  preview: false, applyPeriod: false, note: false, clipNotice: false, annotationAlert: false, annotations: 0, ownAnnotation: false,
  activeRow: false, selectedPoint: false, pointDetail: false, pointExtremes: false,
};
const hidden: SummaryPresentation = { quiet: false, show: false, rest: false, hasControls: false, focusable: false };

describe('summaryPresentation (#2472)', () => {
  it.each<[string, Partial<SummaryFacts>, Partial<SummaryPresentation>]>([
    ['full fill card at rest: nothing', {}, {}],
    ['full with a selection', { selection: true }, { show: true, hasControls: true }],
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
    ['standard at rest: no range row', { chrome: 'standard' }, {}],
    ['minimal at rest: no range row', { chrome: 'minimal' }, {}],
    ['standard with a selection: controls, no tab stop', { chrome: 'standard', selection: true }, { show: true, hasControls: true }],
    ['quiet standard at rest: no range row', { chrome: 'standard', summary: 'quiet' }, { quiet: true, rest: true }],
    ['quiet minimal at rest: no range row', { chrome: 'minimal', summary: 'quiet' }, { quiet: true, rest: true }],
    ['quiet with a selection: one line, form hidden', { chrome: 'standard', summary: 'quiet', selection: true }, { quiet: true, show: true, hasControls: true }],
    ['quiet with preview: busy', { chrome: 'standard', summary: 'quiet', preview: true }, { quiet: true, show: true, focusable: true }],
    ['quiet with note: busy', { chrome: 'standard', summary: 'quiet', note: true }, { quiet: true, show: true, focusable: true }],
    ['quiet with clip notice: busy', { chrome: 'standard', summary: 'quiet', clipNotice: true }, { quiet: true, show: true, focusable: true }],
    ['quiet with annotations: busy', { chrome: 'standard', summary: 'quiet', annotations: 1 }, { quiet: true, show: true, focusable: true }],
    ['quiet with annotation alert: busy with controls', { chrome: 'standard', summary: 'quiet', annotationAlert: true }, { quiet: true, show: true, hasControls: true }],
    ['quiet active row alone stays at rest', { chrome: 'standard', summary: 'quiet', activeRow: true }, { quiet: true, show: true, rest: true }],
    ['explicit standard with an active row: a text tab stop', { chrome: 'standard', summary: 'standard', activeRow: true }, { show: true, focusable: true }],
  ])('%s', (_name, facts, expected) => {
    expect(summaryPresentation({ ...base, ...facts })).toEqual({ ...hidden, ...expected });
  });
});
