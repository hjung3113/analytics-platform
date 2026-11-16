import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { LegendTree, type LegendTreeNode, type LegendTreeProps } from '../../index';

// One Motion with a single Module: the branch and the leaf cover the same leaves, so a leaf set cannot tell their toggles apart.
const nodes: LegendTreeNode[] = [{ id: 'pm', label: 'PM', children: [{ id: 'pm/pump', label: 'Pump', children: [{ id: 'pm/pump/pm2', label: 'PM2' }] }] }];
const base = { nodes, visible: new Set(['pm/pump/pm2']), onVisibleChange: vi.fn(), label: 'Hierarchy' };
const tree = (props: Partial<LegendTreeProps> = {}) => <I18nProvider><LegendTree {...base} {...props} /></I18nProvider>;
const box = (id: string) => screen.getAllByRole('treeitem').find(el => el.getAttribute('data-id') === id)!.querySelector('button[role="checkbox"]')!;
const row = (id: string) => screen.getAllByRole('treeitem').find(el => el.getAttribute('data-id') === id)!;
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('LegendTree node checks (#2416)', () => {
  it('without onCheck a check still reports the leaf set', () => {
    const onVisibleChange = vi.fn();
    render(tree({ onVisibleChange }));
    fireEvent.click(box('pm/pump'));
    expect(onVisibleChange).toHaveBeenCalledWith(new Set());
  });

  it('with onCheck a branch and its only leaf report their own ids, and onVisibleChange is not called', () => {
    const onCheck = vi.fn(); const onVisibleChange = vi.fn();
    render(tree({ onCheck, onVisibleChange }));
    fireEvent.click(box('pm/pump'));
    fireEvent.click(box('pm/pump/pm2'));
    expect(onCheck.mock.calls).toEqual([['pm/pump', false], ['pm/pump/pm2', false]]);
    expect(onVisibleChange).not.toHaveBeenCalled();
  });

  it('checkedOf draws the menu\'s own node state; undefined falls back to the leaves', () => {
    const onCheck = vi.fn();
    render(tree({ onCheck, visible: new Set(), checkedOf: id => (id === 'pm/pump' ? true : id === 'pm/pump/pm2' ? false : undefined) }));
    expect(row('pm/pump')).toHaveAttribute('aria-checked', 'true');
    expect(row('pm/pump/pm2')).toHaveAttribute('aria-checked', 'false');
    expect(row('pm')).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(box('pm/pump'));
    expect(onCheck).toHaveBeenCalledWith('pm/pump', false);
  });
});
