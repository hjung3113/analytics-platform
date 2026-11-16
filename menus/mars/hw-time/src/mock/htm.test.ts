import { describe, expect, it } from 'vitest';
import { htmBounds, judge, rollUp } from './htm';

describe('mock HTM judging', () => {
  it('judges only the demo type and rolls a Module up to its worst Motion', () => {
    expect(htmBounds('PM', 'Chuck')).toBeNull();
    expect(judge('PM', 'Chuck', 3)).toEqual({ value: 3, lower: null, upper: null, status: 'unjudgeable', reason: 'recipe-unsplit' });
    expect(judge('LK', 'Pump', 9).status).toBe('over');
    expect(judge('LK', 'Pump', 1).status).toBe('under');
    expect(judge('LK', 'Pump', 3).status).toBe('normal');
    expect(rollUp(10, [judge('LK', 'Pump', 3), judge('LK', 'Vent', 1)]).status).toBe('under');
    expect(rollUp(10, [judge('LK', 'Pump', 9), judge('LK', 'Vent', 1)]).status).toBe('over');
    expect(rollUp(10, [judge('PM', 'Pump', 9)]).reason).toBe('recipe-unsplit');
  });
});
