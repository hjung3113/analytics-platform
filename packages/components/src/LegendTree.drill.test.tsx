import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { LegendTree, type LegendTreeNode, type LegendTreeProps } from './index';

const nodes: LegendTreeNode[] = [
  { id: 'eq', label: 'Equipment', children: [
    { id: 'eq.m', label: 'Module', children: [{ id: 'eq.m.act', label: 'Action', drillOnly: true }, { id: 'eq.m.leaf', label: 'Leaf' }] },
    { id: 'eq.solo', label: 'Solo' },
  ] },
  { id: 'step', label: 'Step', drillOnly: true },
  { id: 'other', label: 'Other', children: [{ id: 'other.x', label: 'X' }] },
];
const row = (id: string) => screen.getAllByRole('treeitem').find(el => el.getAttribute('data-id') === id)!;
const base = { nodes, visible: new Set<string>(['eq.m.leaf']), onVisibleChange: vi.fn(), onDrill: vi.fn(), label: 'Legend' };
function tree(props: Partial<LegendTreeProps> = {}) {
  return <I18nProvider><LegendTree {...base} {...props} /></I18nProvider>;
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('LegendTree drill', () => {
  it('series name click toggles visibility and does not drill', () => {
    const onDrill = vi.fn(); const onVisibleChange = vi.fn();
    render(tree({ onDrill, onVisibleChange }));
    fireEvent.click(screen.getByText('Solo'));
    expect(onVisibleChange).toHaveBeenCalledWith(new Set(['eq.m.leaf', 'eq.solo']));
    expect(onDrill).not.toHaveBeenCalled();
  });

  it('drillOnly row click drills, has no checkbox or aria-checked, and keeps visibility untouched', () => {
    const onDrill = vi.fn(); const onVisibleChange = vi.fn();
    render(tree({ onDrill, onVisibleChange }));
    fireEvent.click(screen.getByText('Step'));
    expect(onDrill).toHaveBeenCalledWith('step');
    expect(onDrill).toHaveBeenCalledTimes(1);
    expect(onVisibleChange).not.toHaveBeenCalled();
    expect(row('step')).not.toHaveAttribute('aria-checked');
    expect(within(row('step')).queryByRole('checkbox')).toBeNull();
  });

  it('Enter drills on a leaf, a branch and the current row, without expanding or selecting', async () => {
    const user = userEvent.setup();
    const onDrill = vi.fn(); const onSelect = vi.fn();
    render(tree({ onDrill, onSelect, currentId: 'eq.m.leaf' }));
    act(() => row('eq.m.leaf').focus());
    await user.keyboard('{Enter}');
    act(() => row('eq').focus());
    await user.keyboard('{Enter}');
    act(() => row('eq.m').focus());
    await user.keyboard('{Enter}');
    expect(onDrill.mock.calls).toEqual([['eq.m.leaf'], ['eq'], ['eq.m']]);
    expect(row('eq.m.leaf')).toHaveAttribute('aria-current', 'true');
    expect(onSelect).not.toHaveBeenCalled();
    expect(row('eq')).toHaveAttribute('aria-expanded', 'true');
  });

  it('Space toggles a series row but not a drillOnly row', async () => {
    const user = userEvent.setup();
    const onVisibleChange = vi.fn();
    render(tree({ onVisibleChange }));
    act(() => row('eq.solo').focus());
    await user.keyboard(' ');
    expect(onVisibleChange).toHaveBeenCalledTimes(1);
    act(() => row('step').focus());
    await user.keyboard(' ');
    expect(onVisibleChange).toHaveBeenCalledTimes(1);
  });

  it('a drillOnly id is not a visibility leaf', () => {
    render(tree({ visible: new Set(['eq.m.leaf', 'eq.solo']) }));
    expect(row('eq.m')).toHaveAttribute('aria-checked', 'true');
    expect(row('eq')).toHaveAttribute('aria-checked', 'true');
  });

  it('the trailing button drills, is not tabbable, and leaves focus on the treeitem', async () => {
    const user = userEvent.setup();
    const onDrill = vi.fn();
    render(tree({ onDrill }));
    const button = within(row('eq')).getAllByRole('button', { name: 'Equipment 단계로 이동' })[0];
    expect(button).toHaveAttribute('tabindex', '-1');
    await user.click(button);
    expect(onDrill).toHaveBeenCalledWith('eq');
    expect(row('eq')).toHaveFocus();
  });

  it('has no trailing button on the current row, a childless series row or a drillOnly row', () => {
    const view = render(tree({ currentId: 'eq.m' }));
    expect(screen.queryByRole('button', { name: 'Module 단계로 이동' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Equipment 단계로 이동' })).toBeTruthy();
    view.rerender(tree());
    expect(screen.queryByRole('button', { name: 'Solo 단계로 이동' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Step 단계로 이동' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Action 단계로 이동' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Module 단계로 이동' })).toBeTruthy();
  });

  it('marks the current node with aria-current and never uses aria-selected while drilling', () => {
    render(tree({ currentId: 'eq.m', onSelect: vi.fn(), selectedId: 'eq.solo' }));
    expect(row('eq.m')).toHaveAttribute('aria-current', 'true');
    expect(row('eq.solo')).not.toHaveAttribute('aria-current');
    for (const item of screen.getAllByRole('treeitem')) expect(item).not.toHaveAttribute('aria-selected');
  });

  it('describes drillOnly rows with the drill sentence and keeps a read-only sort description', () => {
    render(tree({ sortOf: () => null }));
    const described = row('step').getAttribute('aria-describedby')!.split(' ');
    expect(document.getElementById(described[0])).toHaveTextContent('Enter: 이 단계로 이동');
    expect(described).toHaveLength(2);
    expect(document.getElementById(described[1])).toHaveTextContent('정렬: 없음');
    expect(row('eq.solo')).not.toHaveAttribute('aria-describedby', expect.stringContaining(described[0]));
  });

  it('sets aria-multiselectable only while a checkbox is rendered', () => {
    const view = render(tree());
    expect(screen.getByRole('tree')).toHaveAttribute('aria-multiselectable', 'true');
    view.rerender(tree({ nodes: [{ id: 'a', label: 'A', drillOnly: true }, { id: 'b', label: 'B', drillOnly: true }] }));
    expect(screen.getByRole('tree')).not.toHaveAttribute('aria-multiselectable');
  });

  it('drilling does not change the visible set', async () => {
    const user = userEvent.setup();
    const visible = new Set(['eq.m.leaf']); const onVisibleChange = vi.fn();
    render(tree({ visible, onVisibleChange }));
    act(() => row('eq.solo').focus());
    await user.keyboard('{Enter}');
    fireEvent.click(screen.getByText('Step'));
    expect(onVisibleChange).not.toHaveBeenCalled();
    expect(visible).toEqual(new Set(['eq.m.leaf']));
  });

  it('opens only the ancestors of currentId when no expansion prop is passed', () => {
    render(tree({ currentId: 'eq.m' }));
    expect(row('eq')).toHaveAttribute('aria-expanded', 'true');
    expect(row('eq.m')).toHaveAttribute('aria-expanded', 'false');
    expect(row('other')).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the all-branches default for a null or unknown currentId', () => {
    const view = render(tree({ currentId: null }));
    expect(row('other')).toHaveAttribute('aria-expanded', 'true');
    view.unmount();
    render(tree({ currentId: 'nope' }));
    expect(row('other')).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens newly missing ancestors when currentId changes but never closes a branch the user opened', async () => {
    const user = userEvent.setup();
    const view = render(tree({ currentId: 'eq.m' }));
    await user.click(within(row('other')).getAllByRole('button')[0]);
    expect(row('other')).toHaveAttribute('aria-expanded', 'true');
    view.rerender(tree({ currentId: 'other.x' }));
    expect(row('other')).toHaveAttribute('aria-expanded', 'true');
    expect(row('eq')).toHaveAttribute('aria-expanded', 'true');
    view.rerender(tree({ currentId: 'eq.m.leaf' }));
    expect(row('eq.m')).toHaveAttribute('aria-expanded', 'true');
    expect(row('other')).toHaveAttribute('aria-expanded', 'true');
  });

  it('tree-head 모두 보이기 adds every visibility leaf and keeps unrelated ids, and is a real tab stop before the tree', async () => {
    const user = userEvent.setup();
    const onVisibleChange = vi.fn();
    render(tree({ visible: new Set(['unknown']), onVisibleChange }));
    const button = screen.getByRole('button', { name: '모두 보이기' });
    expect(button).not.toHaveAttribute('tabindex', '-1');
    await user.tab();
    expect(button).toHaveFocus();
    await user.click(button);
    expect(onVisibleChange).toHaveBeenCalledWith(new Set(['unknown', 'eq.m.leaf', 'eq.solo', 'other.x']));
  });

  it('hides tree-head 모두 보이기 while any leaf is visible, and without onDrill', () => {
    const view = render(tree());
    expect(screen.queryByRole('button', { name: '모두 보이기' })).toBeNull();
    view.rerender(tree({ visible: new Set() }));
    expect(screen.getByRole('button', { name: '모두 보이기' })).toBeTruthy();
    view.rerender(tree({ onDrill: undefined, visible: new Set() }));
    expect(screen.queryByRole('button', { name: '모두 보이기' })).toBeNull();
  });

  it.each(['{Enter}', ' '])('moves focus to the active row when keyboard activation of 모두 보이기 removes it (%j)', async key => {
    const user = userEvent.setup();
    function Host() {
      const [visible, setVisible] = useState(new Set<string>());
      return tree({ visible, onVisibleChange: setVisible });
    }
    const Stateful = () => <Host />;
    render(<Stateful />);
    await user.tab();
    expect(screen.getByRole('button', { name: '모두 보이기' })).toHaveFocus();
    await user.keyboard(key);
    expect(screen.queryByRole('button', { name: '모두 보이기' })).toBeNull();
    expect(document.activeElement).toBe(row('eq'));
  });

  it('does not move focus when it had already left 모두 보이기 before the button was removed', async () => {
    const user = userEvent.setup();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    const view = render(tree({ visible: new Set() }));
    await user.tab();
    act(() => outside.focus());
    view.rerender(tree({ visible: new Set(['eq.solo']) }));
    expect(outside).toHaveFocus();
    outside.remove();
  });

  it('treats an empty-string currentId as a real id: initial and later', () => {
    const emptyNodes: LegendTreeNode[] = [
      { id: 'a', label: 'A', children: [{ id: '', label: 'Empty', children: [{ id: 'a.x', label: 'AX' }] }] },
      { id: 'b', label: 'B', children: [{ id: 'b.x', label: 'BX' }] },
    ];
    const view = render(tree({ nodes: emptyNodes, currentId: '' }));
    expect(row('a')).toHaveAttribute('aria-expanded', 'true');
    expect(row('b')).toHaveAttribute('aria-expanded', 'false');
    view.unmount();
    const later = render(tree({ nodes: emptyNodes, currentId: 'b.x' }));
    later.rerender(tree({ nodes: emptyNodes, currentId: '' }));
    expect(row('a')).toHaveAttribute('aria-expanded', 'true');
  });

  it('leaves controlled expansion to the caller when currentId changes', () => {
    const onExpandedChange = vi.fn();
    const view = render(tree({ currentId: null, expanded: new Set(), onExpandedChange }));
    view.rerender(tree({ currentId: 'eq.m.leaf', expanded: new Set(), onExpandedChange }));
    expect(screen.queryAllByRole('treeitem').map(el => el.getAttribute('data-id'))).toEqual(['eq', 'step', 'other']);
    expect(onExpandedChange).not.toHaveBeenCalled();
    view.rerender(tree({ currentId: 'eq.m', expanded: new Set() }));
    expect(row('eq')).toHaveAttribute('aria-expanded', 'false');
  });
});
