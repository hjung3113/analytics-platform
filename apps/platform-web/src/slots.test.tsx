import { describe, expect, it } from 'vitest';
import type { AnalysisActionsSlot } from '@ap/kernel';
import { appSlots } from './slots';

describe('analysis action slot assembly (#1408)', () => {
  it('passes the app-supplied actions through without a menu exclusion', () => {
    const analysisActions: AnalysisActionsSlot = { Actions: () => null };
    const slots = appSlots({ topBarTools: null }, undefined as never, undefined as never, undefined as never, undefined as never, undefined as never, undefined as never, analysisActions);
    expect(slots.analysisActions?.Actions).toBe(analysisActions.Actions);
    expect(slots.analysisActions?.appliesTo).toBeUndefined();
    expect(slots.analysisActions?.pageTypes).toEqual(['analysis', 'overview']);
    const narrowed = appSlots({ topBarTools: null }, undefined as never, undefined as never, undefined as never, undefined as never, undefined as never, undefined as never, { ...analysisActions, pageTypes: ['analysis'] });
    expect(narrowed.analysisActions?.pageTypes).toEqual(['analysis']);
  });
});
