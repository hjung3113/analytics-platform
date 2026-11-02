import { describe, expect, it } from 'vitest';
import { dateOf, dateTimeOf, defaultExploreFilter, softwareTabPage, splitProcesses } from './modelPresentation';

describe('model presentation rules', () => {
  it('splits process badges at two and keeps the rest reachable', () => {
    expect(splitProcesses(['a'])).toEqual({ shown: ['a'], hidden: [] });
    expect(splitProcesses(['a', 'b', 'c', 'd'])).toEqual({ shown: ['a', 'b'], hidden: ['c', 'd'] });
  });
  it('reads an ISO timestamp as date and as date + minute', () => {
    expect(dateOf('2026-10-02T09:30:00.000Z')).toBe('2026-10-02');
    expect(dateTimeOf('2026-10-02T09:30:00.000Z')).toBe('2026-10-02 09:30');
  });
  it('opens the table with 활성 pinned, and the catalog SW tab narrowed to the model', () => {
    expect(defaultExploreFilter()).toEqual(['active:in:true']);
    expect(softwareTabPage('m1')).toEqual({ tab: 'software', filter: ['active:in:true', 'modelId:in:m1'] });
  });
});
