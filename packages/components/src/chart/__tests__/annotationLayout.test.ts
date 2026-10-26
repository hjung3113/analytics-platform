import { describe, expect, it } from 'vitest';
import { assignNoteLevels, noteLabelWidths } from '../annotationLayout';

describe('annotation label layout (#399 AC-2)', () => {
  it('stacks labels of notes over the same or overlapping range, one row each', () => {
    expect(assignNoteLevels([{ from: 0, to: 10 }, { from: 0, to: 10 }, { from: 5, to: 20 }, { from: 30, to: 40 }])).toEqual([0, 1, 2, 0]);
  });

  it('reuses a free row once the earlier note ended', () => {
    expect(assignNoteLevels([{ from: 0, to: 10 }, { from: 5, to: 8 }, { from: 11, to: 12 }])).toEqual([0, 1, 0]);
  });

  it('truncates to the area width, never beyond the plot and never below a readable minimum', () => {
    expect(noteLabelWidths([{ from: 0, to: 10 }, { from: 0, to: 1000 }, { from: 0, to: 0 }], 10, 400)).toEqual([100, 400, 24]);
  });
});
