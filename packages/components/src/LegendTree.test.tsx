import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, useI18n } from '@ap/kernel';
import { LegendTree, type LegendTreeNode, type LegendTreeProps, type LegendTreeSort } from './index';

const nodes: LegendTreeNode[] = [
  { id: 'a', label: 'A', children: [
    { id: 'a.1', label: 'A1', children: [
      { id: 'a.1.x', label: 'AX', children: [{ id: 'a.1.x.i', label: 'AI', color: 'accent-primary' }] },
      { id: 'a.1.y', label: 'AY', children: [] },
    ] },
    { id: 'a.2', label: 'A2' },
  ] },
  { id: 'b', label: 'B' },
];
const leaves = ['a.1.x.i', 'a.1.y', 'a.2', 'b'];
const row = (id: string) => screen.getAllByRole('treeitem').find(el => el.getAttribute('data-id') === id)!;
const base = { nodes, visible: new Set<string>(), onVisibleChange: vi.fn(), label: 'Legend' };
function tree(props: Partial<LegendTreeProps> = {}) {
  return <I18nProvider><LegendTree {...base} {...props} /></I18nProvider>;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('LegendTree', () => {
  it.each([
    [[], 'false'], [leaves, 'true'], [['a.1.x.i'], 'mixed'],
  ] as const)('derives four-level ancestor checks from %s', (ids, checked) => {
    render(tree({ visible: new Set(ids) }));
    expect(row('a')).toHaveAttribute('aria-checked', checked);
    expect(row('a.1.x.i')).toHaveAttribute('aria-level', '4');
    expect(row('a.1.y')).not.toHaveAttribute('aria-expanded');
    expect(row('a.1.y')).toHaveAttribute('aria-setsize', '2');
    expect(row('a.1.y')).toHaveAttribute('aria-posinset', '2');
    expect(within(row('a')).getAllByRole('group').length).toBe(3);
  });

  it.each([[], ['a.1.x.i'], leaves].map(ids => ({ ids })))('toggles a branch while preserving incoming branch/unknown ids: $ids', ({ ids }) => {
    const visible = new Set([...ids, 'a', 'unknown']);
    const before = new Set(visible);
    const onVisibleChange = vi.fn();
    render(tree({ visible, onVisibleChange }));
    fireEvent.click(screen.getByText('A'));
    const next = onVisibleChange.mock.calls[0][0] as Set<string>;
    expect(next).not.toBe(visible);
    expect(visible).toEqual(before);
    expect(next).toEqual(new Set(ids.length === leaves.length ? ['b', 'a', 'unknown'] : [...before, ...leaves.slice(0, 3)]));
  });

  it('toggles empty-children leaves; derives mixed only after consumer updates; preserves removed ids', () => {
    const onVisibleChange = vi.fn();
    const view = render(tree({ onVisibleChange }));
    fireEvent.click(within(row('a.1.y')).getByRole('checkbox'));
    expect(onVisibleChange).toHaveBeenLastCalledWith(new Set(['a.1.y']));
    expect(row('a')).toHaveAttribute('aria-checked', 'false');
    view.rerender(tree({ visible: new Set(['a.1.y']), onVisibleChange }));
    expect(row('a')).toHaveAttribute('aria-checked', 'mixed');
    view.rerender(tree({ nodes: [{ id: 'b', label: 'B' }], visible: new Set(['a.1.y', 'b']), onVisibleChange }));
    fireEvent.click(screen.getByText('B'));
    expect(onVisibleChange).toHaveBeenLastCalledWith(new Set(['a.1.y']));
  });

  it.each(['click', 'Enter', 'Space'])('does not submit an enclosing form on button %s', async action => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(event => event.preventDefault());
    const onExpandedChange = vi.fn(); const onSortChange = vi.fn(); const onVisibleChange = vi.fn();
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    try {
      render(<form onSubmit={onSubmit}>{tree({ onExpandedChange, sortOf: () => null, onSortChange, onVisibleChange })}</form>);
      const line = within(row('a').firstElementChild as HTMLElement);
      for (const button of [...line.getAllByRole('button'), line.getByRole('checkbox')]) {
        if (action === 'click') await user.click(button);
        else {
          act(() => button.focus());
          await user.keyboard(action === 'Enter' ? '{Enter}' : ' ');
        }
        expect(onSubmit).not.toHaveBeenCalled();
      }
      expect(onExpandedChange).toHaveBeenCalledTimes(1);
      expect(onSortChange).toHaveBeenCalledTimes(1);
      if (action !== 'Enter') expect(onVisibleChange).toHaveBeenCalledTimes(1);
    } finally { cleanup(); vi.unstubAllGlobals(); }
  });

  it.each([
    [false, 'none'], [false, 'readonly'], [false, 'interactive'],
    [true, 'none'], [true, 'readonly'], [true, 'interactive'],
  ] as const)('tabs through only active row controls (selection=%s, sort=%s)', async (selection, sorting) => {
    const user = userEvent.setup(); const onSelect = vi.fn(); const onSortChange = vi.fn();
    render(<>{tree({ defaultExpanded: new Set(), onSelect: selection ? onSelect : undefined,
      sortOf: sorting === 'none' ? undefined : () => null,
      onSortChange: sorting === 'interactive' ? onSortChange : undefined })}<button>Outside</button></>);
    await user.tab(); expect(row('a')).toHaveFocus();
    await user.tab();
    const expandButton = within(row('a')).getAllByRole('button')[0];
    expect(expandButton).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(row('a')).toHaveAttribute('aria-expanded', 'true');
    expect(expandButton).toHaveFocus();
    for (const button of within(row('a.1').firstElementChild as HTMLElement).getAllByRole('button')) {
      expect(button).toHaveAttribute('tabindex', '-1');
    }
    await user.keyboard(' ');
    expect(row('a')).toHaveAttribute('aria-expanded', 'false');
    expect(expandButton).toHaveFocus();
    if (sorting === 'interactive') {
      await user.tab();
      expect(within(row('a')).getAllByRole('button')[1]).toHaveFocus();
      await user.tab({ shift: true }); expect(expandButton).toHaveFocus();
      await user.tab();
    }
    await user.tab(); expect(screen.getByText('Outside')).toHaveFocus();
    await user.tab({ shift: true });
    if (sorting === 'interactive') await user.tab({ shift: true });
    expect(expandButton).toHaveFocus();
    await user.tab({ shift: true }); expect(row('a')).toHaveFocus();
    await user.keyboard('{Enter}');
    if (selection) {
      expect(onSelect).toHaveBeenLastCalledWith('a');
      expect(row('a')).toHaveAttribute('aria-expanded', 'false');
    } else expect(row('a')).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{End}'); expect(row('b')).toHaveFocus();
    for (const button of within(row('a').firstElementChild as HTMLElement).getAllByRole('button')) {
      expect(button).toHaveAttribute('tabindex', '-1');
    }
    await user.tab();
    if (sorting === 'interactive') {
      expect(within(row('b')).getByRole('button')).toHaveFocus();
      await user.tab();
    }
    expect(screen.getByText('Outside')).toHaveFocus();
  });

  it.each([false, true])('names row controls from string and rich labels in both languages (rich=%s)', async rich => {
    const user = userEvent.setup();
    function English() {
      const { setLang } = useI18n();
      return <button onClick={() => setLang('en')}>English</button>;
    }
    render(<I18nProvider><English /><LegendTree {...base} nodes={[
      { id: 'parent', label: rich ? <span>Maker <strong>One</strong></span> : 'Maker One',
        children: [{ id: 'child', label: 'Child' }] },
    ]} sortOf={() => 'asc'} onSortChange={vi.fn()} /></I18nProvider>);
    const collapse = screen.getByRole('button', { name: 'Maker One 접기' });
    expect(screen.getByRole('button', { name: 'Maker One 정렬: 오름차순' })).toBeTruthy();
    await user.click(collapse);
    expect(screen.getByRole('button', { name: 'Maker One 펼치기' })).toBeTruthy();
    await user.click(screen.getByText('English'));
    expect(screen.getByRole('button', { name: 'Expand Maker One' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Maker One Sort: ascending' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Expand Maker One' }));
    expect(screen.getByRole('button', { name: 'Collapse Maker One' })).toBeTruthy();
  });

  it.each([
    [null, '정렬: 없음'], ['asc', '정렬: 오름차순'], ['desc', '정렬: 내림차순'],
  ] as const)('announces read-only sort %s in each row description', (sort, description) => {
    const view = render(tree({ sortOf: () => sort }));
    for (const item of screen.getAllByRole('treeitem')) expect(item).toHaveAccessibleDescription(description);
    expect(row('a')).toHaveAccessibleName('A');
    expect(screen.queryByRole('button', { name: /정렬/ })).toBeNull();
    view.rerender(tree({ sortOf: () => sort, onSortChange: vi.fn() }));
    expect(row('a')).not.toHaveAttribute('aria-describedby');
  });

  it('scopes the focus ring to the directly focused row line instead of its descendant group', () => {
    render(tree());
    act(() => row('a').focus());
    expect(row('a')).toHaveFocus();
    for (const item of [row('a'), row('a.1')]) {
      expect(item).not.toHaveClass('focus-visible:ring-2');
      expect(item.firstElementChild).toHaveClass(
        '[[role=treeitem]:focus-visible>&]:ring-2',
        '[[role=treeitem]:focus-visible>&]:ring-focus-ring',
        '[[role=treeitem]:focus-visible>&]:ring-offset-2',
      );
    }
    expect(within(row('a')).getAllByRole('group')[0]).not.toHaveClass('focus-visible:ring-2');
  });

  it('navigates visible rows, expands/collapses, and maintains one row entry target', async () => {
    const user = userEvent.setup();
    render(tree({ defaultExpanded: new Set() }));
    await user.tab();
    expect(row('a')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(row('a')).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{ArrowRight}');
    expect(row('a.1')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(row('a.2')).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowLeft}');
    expect(row('a')).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(row('a')).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{End}');
    expect(row('b')).toHaveFocus();
    await user.keyboard('{Home}{Enter}');
    expect(row('a')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('treeitem').filter(el => el.tabIndex === 0)).toEqual([row('a')]);
  });

  it('keeps active focus independent of single choice and multiple visibility checks', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn(); const onVisibleChange = vi.fn();
    render(tree({ selectedId: 'a.2', onSelect, visible: new Set(leaves), onVisibleChange }));
    await user.tab();
    expect(row('a.2')).toHaveFocus();
    await user.keyboard('{ArrowDown} ');
    expect(row('b')).toHaveFocus();
    expect(onVisibleChange).toHaveBeenLastCalledWith(new Set(leaves.slice(0, 3)));
    expect(row('a.2')).toHaveAttribute('aria-selected', 'true');
    expect(row('b')).toHaveAttribute('aria-selected', 'false');
    expect(row('a.2').firstElementChild).toHaveClass('font-semibold', 'bg-surface-row-selected');
    expect(screen.getByRole('tree')).not.toHaveAttribute('aria-multiselectable');
    await user.keyboard('{Enter}');
    fireEvent.click(screen.getByText('A2'));
    expect(onSelect.mock.calls).toEqual([['b'], ['a.2']]);
    expect(onVisibleChange).toHaveBeenCalledTimes(1);
  });

  it('cycles sort null → asc → desc → null by mouse and the Tab/Enter/Space path, then exits', async () => {
    const user = userEvent.setup(); const onSortChange = vi.fn();
    let sort: LegendTreeSort = null;
    const props = { sortOf: () => sort, onSortChange };
    const view = render(<>{tree(props)}<button>Outside</button></>);
    await user.tab(); await user.tab(); await user.tab();
    const sortButton = within(row('a').firstElementChild as HTMLElement).getByRole('button', { name: 'A 정렬: 없음' });
    expect(sortButton).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onSortChange).toHaveBeenLastCalledWith('a', 'asc');
    sort = 'asc'; view.rerender(<>{tree(props)}<button>Outside</button></>);
    await user.keyboard(' ');
    expect(onSortChange).toHaveBeenLastCalledWith('a', 'desc');
    sort = 'desc'; view.rerender(<>{tree(props)}<button>Outside</button></>);
    await user.click(within(row('a').firstElementChild as HTMLElement).getByRole('button', { name: 'A 정렬: 내림차순' }));
    expect(onSortChange).toHaveBeenLastCalledWith('a', null);
    expect(row('a')).toHaveFocus();
    await user.tab(); await user.tab(); await user.tab({ shift: true });
    expect(within(row('a').firstElementChild as HTMLElement).getByRole('button', { name: 'A 접기' })).toHaveFocus();
    await user.tab({ shift: true }); expect(row('a')).toHaveFocus();
    await user.tab(); await user.tab(); await user.tab(); expect(screen.getByText('Outside')).toHaveFocus();
    expect(screen.getByRole('tree')).not.toHaveAttribute('aria-describedby');
  });

  it('does not intercept modified keys, Escape, s or Enter on a leaf without selection', () => {
    const onVisibleChange = vi.fn(); const onSortChange = vi.fn();
    render(tree({ onVisibleChange, sortOf: () => null, onSortChange }));
    act(() => row('b').focus());
    for (const key of ['ArrowUp', 'Home', ' ', 'Enter']) {
      for (const modifier of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey']) {
        expect(fireEvent.keyDown(row('b'), { key, [modifier]: true })).toBe(true);
      }
    }
    for (const key of ['Escape', 's', 'Enter']) expect(fireEvent.keyDown(row('b'), { key })).toBe(true);
    expect(onVisibleChange).not.toHaveBeenCalled(); expect(onSortChange).not.toHaveBeenCalled();
  });

  it('handles sort callback combinations and selection without callback', () => {
    const view = render(tree({ selectedId: 'b', onSortChange: vi.fn() }));
    expect(screen.queryByRole('button', { name: /정렬/ })).toBeNull();
    expect(row('b')).not.toHaveAttribute('aria-selected');
    view.rerender(tree({ sortOf: () => 'asc' }));
    expect(screen.queryByRole('button', { name: /정렬/ })).toBeNull();
    for (const item of screen.getAllByRole('treeitem')) expect(item).toHaveAccessibleDescription('정렬: 오름차순');
  });

  it('uses controlled expansion, fresh callback Sets, and read-only expansion without a callback', () => {
    const expanded = new Set<string>(); const onExpandedChange = vi.fn();
    const view = render(tree({ expanded, onExpandedChange }));
    fireEvent.keyDown(row('a'), { key: 'Enter' });
    expect(onExpandedChange).toHaveBeenLastCalledWith(new Set(['a']));
    expect(expanded.size).toBe(0); expect(screen.queryByText('A1')).toBeNull();
    view.rerender(tree({ expanded: new Set(['a']) }));
    fireEvent.keyDown(row('a'), { key: 'ArrowLeft' });
    expect(row('a')).toHaveAttribute('aria-expanded', 'true');
  });

  it('reads defaultExpanded once and warns once for unsupported expansion mode changes', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const view = render(tree({ defaultExpanded: new Set() }));
    fireEvent.keyDown(row('a'), { key: 'Enter' });
    view.rerender(tree({ defaultExpanded: new Set(), visible: new Set(leaves), selectedId: 'b' }));
    expect(row('a')).toHaveAttribute('aria-expanded', 'true');
    view.rerender(tree({ expanded: new Set() }));
    view.rerender(tree({ expanded: new Set(['a']) }));
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('repairs focus to an ancestor, then first row, then the empty tree', () => {
    const view = render(tree());
    act(() => row('a.1.x.i').focus());
    fireEvent.click(within(row('a').firstElementChild as HTMLElement).getByRole('button', { name: 'A 접기' }));
    expect(row('a')).toHaveFocus();
    view.rerender(tree({ nodes: [{ id: 'b', label: 'B' }] }));
    expect(row('b')).toHaveFocus();
    view.rerender(tree({ nodes: [] }));
    expect(screen.getByRole('tree')).toHaveFocus();
  });

  it('repairs entry without stealing outside focus and ignores hidden/removed selected ids', async () => {
    const user = userEvent.setup();
    const view = render(<>{tree({ expanded: new Set(['a', 'a.1', 'a.1.x']), selectedId: 'missing', onSelect: vi.fn() })}<button>Outside</button></>);
    await user.tab(); expect(row('a')).toHaveFocus();
    await user.keyboard('{ArrowDown}'); await user.tab();
    expect(screen.getByText('Outside')).toHaveFocus();
    view.rerender(<>{tree({ nodes: [], expanded: new Set(), selectedId: 'a' })}<button>Outside</button></>);
    expect(screen.getByText('Outside')).toHaveFocus();
    view.rerender(<>{tree({ expanded: new Set(), selectedId: 'a.1', onSelect: vi.fn() })}<button>Outside</button></>);
    expect(screen.getByText('Outside')).toHaveFocus();
    expect(row('a').tabIndex).toBe(0);
  });

  it('repairs controlled collapse to the nearest ancestor without resetting active focus on selection updates', () => {
    const onSelect = vi.fn();
    const view = render(tree({ expanded: new Set(['a', 'a.1', 'a.1.x']), onSelect, selectedId: 'a' }));
    act(() => row('a.1.x.i').focus());
    view.rerender(tree({ expanded: new Set(['a', 'a.1', 'a.1.x']), onSelect, selectedId: 'b', visible: new Set(leaves) }));
    expect(row('a.1.x.i')).toHaveFocus();
    view.rerender(tree({ expanded: new Set(['a']), onSelect, selectedId: 'b' }));
    expect(row('a.1')).toHaveFocus();
    expect(screen.getAllByRole('treeitem').filter(el => el.tabIndex === 0)).toEqual([row('a.1')]);
  });

  it('recovers to the surviving ancestor when a focused leaf is replaced at the same position', () => {
    const view = render(tree());
    act(() => row('a.1.x.i').focus());
    const replacement: LegendTreeNode[] = [{ id: 'a', label: 'A', children: [
      { id: 'a.1', label: 'A1', children: [
        { id: 'a.1.x', label: 'AX', children: [{ id: 'new', label: 'New' }] },
      ] },
    ] }];
    view.rerender(tree({ nodes: replacement }));
    expect(row('a.1.x')).toHaveFocus();
  });

  it('reports fresh uncontrolled expansion Sets and keeps them across unrelated prop updates', () => {
    const onExpandedChange = vi.fn();
    const view = render(tree({ onExpandedChange }));
    fireEvent.keyDown(row('a'), { key: 'Enter' });
    const next = onExpandedChange.mock.calls[0][0] as Set<string>;
    expect(next).toEqual(new Set(['a.1', 'a.1.x']));
    view.rerender(tree({ onExpandedChange, visible: new Set(leaves) }));
    expect(screen.queryByText('A1')).toBeNull();
    fireEvent.keyDown(row('a'), { key: 'Enter' });
    expect(onExpandedChange.mock.calls[1][0]).not.toBe(next);
    expect(next).toEqual(new Set(['a.1', 'a.1.x']));
  });

  it('does not diagnose duplicate ids in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(tree({ nodes: [{ id: 'a', label: 'A' }, { id: 'a', label: 'Again' }] }));
      expect(error).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); }
  });

  it('localizes empty text and sort names in English', async () => {
    const user = userEvent.setup();
    function English() {
      const { setLang } = useI18n();
      return <button onClick={() => setLang('en')}>English</button>;
    }
    const view = render(<I18nProvider><English /><LegendTree {...base} sortOf={() => 'asc'} /></I18nProvider>);
    await user.click(screen.getByText('English'));
    for (const item of screen.getAllByRole('treeitem')) expect(item).toHaveAccessibleDescription('Sort: ascending');
    view.rerender(<I18nProvider><LegendTree {...base} nodes={[]} /></I18nProvider>);
    expect(screen.getByText('No items to show.')).toBeTruthy();
  });

  it('renders swatches only for colors, custom/default empty content and duplicate diagnostics once', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const view = render(tree());
    expect(view.container.querySelectorAll('[data-legend-swatch]')).toHaveLength(1);
    const duplicates = [{ id: 'a', label: 'A' }, { id: 'a', label: 'Again' }];
    view.rerender(tree({ nodes: duplicates })); view.rerender(tree({ nodes: duplicates }));
    expect(screen.getAllByRole('treeitem')).toHaveLength(2);
    expect(error).toHaveBeenCalledTimes(1);
    view.rerender(tree({ nodes: [] })); expect(screen.getByText('표시할 항목이 없습니다.')).toBeTruthy();
    view.rerender(tree({ nodes: [], emptyText: 'Empty' })); expect(screen.getByText('Empty')).toBeTruthy();
  });
});
