import { describe, expect, it } from 'vitest';
import { instantText, defaultExploreFilter, softwareTabPage, splitProcesses } from './modelPresentation';

describe('model presentation rules', () => {
  it('splits process badges at two and keeps the rest reachable', () => {
    expect(splitProcesses(['a'])).toEqual({ shown: ['a'], hidden: [] });
    expect(splitProcesses(['a', 'b', 'c', 'd'])).toEqual({ shown: ['a', 'b'], hidden: ['c', 'd'] });
  });
  it('prints an instant in the viewer zone with the list notation, never the ISO slice', () => {
    const iso = '2026-10-02T20:30:00.000Z';
    const auckland = instantText(iso, 'Pacific/Auckland');
    expect(auckland).toBe('2026-10-03 09:30');
    expect(auckland).toContain('2026-10-03');
    expect(auckland).not.toContain('2026-10-02');
    expect(instantText(iso, 'UTC')).toContain('2026-10-02');
  });
  it('opens the table with 활성 pinned, and the catalog SW tab narrowed to the model', () => {
    expect(defaultExploreFilter()).toEqual(['active:in:true']);
    expect(softwareTabPage('m1')).toEqual({ tab: 'software', filter: ['active:in:true', 'modelId:in:m1'] });
  });
});
