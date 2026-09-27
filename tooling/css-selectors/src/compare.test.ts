import { describe, expect, it } from 'vitest';
import { diffSelectors } from './compare.ts';

describe('diffSelectors', () => {
  it('reports added and removed selectors, sorted', () => {
    const diff = diffSelectors(['.b', '.a', '.keep'], ['.keep', '.d', '.c']);
    expect(diff.added).toEqual(['.c', '.d']);
    expect(diff.removed).toEqual(['.a', '.b']);
  });

  it('returns empty lists for identical sets', () => {
    expect(diffSelectors(['.a', '.b'], ['.b', '.a'])).toEqual({ added: [], removed: [] });
  });

  it('deduplicates inputs before diffing', () => {
    expect(diffSelectors(['.a'], ['.a', '.a', '.b', '.b'])).toEqual({ added: ['.b'], removed: [] });
  });
});
