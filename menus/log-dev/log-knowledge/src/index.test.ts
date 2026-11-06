import { describe, expect, it } from 'vitest';
import { manifests } from './index';

describe('deep-link page keys (#1196 e/f)', () => {
  const keys = (id: string) => manifests.find(m => m.id === id)!.pageKeys;
  it('the spec detail takes the concept tab (`tab=concept`) and the Event filter (`event=<targetKey>`) beside its existing keys', () => {
    expect(keys('log-knowledge-spec')).toEqual(['software', 'tab', 'drawer', 'change', 'module', 'event', 'review', 'revision', 'returnTo']);
  });
  it('the item list filters by subject through its existing hidden `filter` key; the detail keeps its keys', () => {
    expect(keys('log-knowledge-items')).toContain('filter');
    expect(keys('log-knowledge-item')).toEqual(['rev', 'returnTo', 'drawer']);
  });
});
