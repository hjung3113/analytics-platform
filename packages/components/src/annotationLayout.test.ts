import { describe, expect, it } from 'vitest';
import { layoutNoteLabels } from './annotationLayout';

describe('layoutNoteLabels (#399 AC-2)', () => {
  it('stacks labels of notes over the same or overlapping range, one row each', () => {
    const levels = layoutNoteLabels([{ from: 0, to: 10 }, { from: 0, to: 10 }, { from: 5, to: 20 }, { from: 30, to: 40 }], 10, 800).map(l => l.level);
    expect(levels).toEqual([0, 1, 2, 0]);
  });

  it('reuses a free row once the earlier note ended', () => {
    expect(layoutNoteLabels([{ from: 0, to: 10 }, { from: 5, to: 8 }, { from: 11, to: 12 }], 10, 800).map(l => l.level)).toEqual([0, 1, 0]);
  });

  it('truncates to the area width, never beyond the plot and never below a readable minimum', () => {
    const widths = layoutNoteLabels([{ from: 0, to: 10 }, { from: 0, to: 1000 }, { from: 0, to: 0 }], 10, 400).map(l => l.width);
    expect(widths).toEqual([100, 400, 24]);
  });
});
