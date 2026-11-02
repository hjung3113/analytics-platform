import { formatInstant } from '@ap/contracts';
import { describe, expect, it } from 'vitest';
import { instantText, defaultExploreFilter, softwareTabPage, splitProcesses } from './modelPresentation';

describe('model presentation rules', () => {
  it('splits process badges at two and keeps the rest reachable', () => {
    expect(splitProcesses(['a'])).toEqual({ shown: ['a'], hidden: [] });
    expect(splitProcesses(['a', 'b', 'c', 'd'])).toEqual({ shown: ['a', 'b'], hidden: ['c', 'd'] });
  });
  it('prints an instant in the viewer zone through formatInstant, never the ISO slice', () => {
    const iso = '2026-10-02T20:30:00.000Z';
    const auckland = instantText(iso, 'Pacific/Auckland');
    expect(auckland).toBe(formatInstant(iso, 'ko', 'Pacific/Auckland'));
    expect(auckland).toContain('10. 3.');
    expect(auckland).not.toContain('10. 2.');
    expect(instantText(iso, 'UTC')).toContain('10. 2.');
  });
  it('opens the table with 활성 pinned, and the catalog SW tab narrowed to the model', () => {
    expect(defaultExploreFilter()).toEqual(['active:in:true']);
    expect(softwareTabPage('m1')).toEqual({ tab: 'software', filter: ['active:in:true', 'modelId:in:m1'] });
  });
});
