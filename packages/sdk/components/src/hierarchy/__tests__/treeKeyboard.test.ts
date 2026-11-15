import { describe, expect, it, vi } from 'vitest';
import { hierarchyTreeKey } from '../treeKeyboard';

describe('shared hierarchy tree keyboard walk', () => {
  const rows = [{ id: 'a', depth: 0, hasChildren: true }, { id: 'b', depth: 1, hasChildren: false }, { id: 'c', depth: 0, hasChildren: false }];
  it.each([['ArrowDown', 'a', 'b'], ['ArrowUp', 'b', 'a'], ['Home', 'c', 'a'], ['End', 'a', 'c'], ['ArrowLeft', 'b', 'a'], ['ArrowRight', 'a', 'b']])('%s moves %s to %s', (key, id, target) => {
    const focus = vi.fn();
    hierarchyTreeKey({ key, preventDefault: vi.fn() }, { rows, id, expanded: new Set(['a']), focus, toggle: vi.fn(), enter: vi.fn(), space: vi.fn() });
    expect(focus).toHaveBeenCalledWith(target);
  });
  it('keeps navigation activation and check activation as caller policies', () => {
    const options = { rows, id: 'a', expanded: new Set<string>(), focus: vi.fn(), toggle: vi.fn(), enter: vi.fn(), space: vi.fn() };
    hierarchyTreeKey({ key: 'ArrowRight', preventDefault: vi.fn() }, options);
    expect(options.toggle).toHaveBeenCalledWith('a');
    hierarchyTreeKey({ key: 'Enter', preventDefault: vi.fn() }, options);
    hierarchyTreeKey({ key: ' ', preventDefault: vi.fn() }, options);
    expect(options.enter).toHaveBeenCalledWith('a');
    expect(options.space).toHaveBeenCalledWith('a');
  });
});
