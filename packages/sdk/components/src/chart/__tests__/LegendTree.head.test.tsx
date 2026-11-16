import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { LegendTree, type LegendTreeNode, type LegendTreeProps } from '../../index';

const nodes: LegendTreeNode[] = [
  { id: 'pm', label: 'PM', children: [{ id: 'pm.pump', label: 'Pump' }, { id: 'pm.vent', label: 'Vent' }] },
  { id: 'tr', label: 'TR', children: [{ id: 'tr.x', label: 'X' }] },
];
const base = { nodes, visible: new Set(['pm.pump', 'pm.vent', 'tr.x']), onVisibleChange: vi.fn(), onDrill: vi.fn(), label: 'Hierarchy', currentId: 'pm' };
const tree = (props: Partial<LegendTreeProps> = {}) => <I18nProvider><LegendTree {...base} {...props} /></I18nProvider>;
const row = (id: string) => screen.getAllByRole('treeitem').find(el => el.getAttribute('data-id') === id)!;
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('LegendTree head hint, current mark and name drill (#2395)', () => {
  it('without the new props renders exactly as before', () => {
    const { container } = render(tree());
    const html = (el: HTMLElement) => el.innerHTML.replace(/_r_\w+_/g, 'ID');
    const before = html(container);
    cleanup();
    const again = render(tree({ hint: undefined, currentLabel: undefined, drillOnName: false }));
    expect(html(again.container)).toBe(before);
    expect(again.container.querySelector('[data-legend-tree-wrap]')).toBeNull();
    expect(again.container.querySelector('[data-legend-current]')).toBeNull();
  });

  it('draws the hint above the tree and lets it describe the tree', () => {
    render(tree({ hint: '이름: 단계 이동 · 체크: 포함/제외' }));
    const hint = screen.getByText('이름: 단계 이동 · 체크: 포함/제외');
    expect(screen.getByRole('tree')).toHaveAttribute('aria-describedby', hint.id);
    expect(hint.compareDocumentPosition(screen.getByRole('tree')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('marks only the current row with the visible label, hidden from assistive tech', () => {
    render(tree({ currentLabel: '현재' }));
    const mark = within(row('pm')).getByText('현재');
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(row('pm')).toHaveAttribute('aria-current', 'true');
    expect(within(row('tr')).queryByText('현재')).toBeNull();
  });

  it('shows no current mark without onDrill', () => {
    render(tree({ currentLabel: '현재', onDrill: undefined }));
    expect(screen.queryByText('현재')).toBeNull();
  });

  it('with drillOnName a name click drills a drillable row, the checkbox still toggles, and the current row does not re-drill', () => {
    const onDrill = vi.fn(); const onVisibleChange = vi.fn();
    render(tree({ onDrill, onVisibleChange, drillOnName: true }));
    fireEvent.click(screen.getByText('TR'));
    expect(onDrill).toHaveBeenCalledWith('tr');
    expect(onVisibleChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('PM'));
    expect(onDrill).toHaveBeenCalledTimes(1);
    fireEvent.click(within(row('tr')).getAllByRole('checkbox')[0]);
    expect(onVisibleChange).toHaveBeenCalledWith(new Set(['pm.pump', 'pm.vent']));
  });

  it('with drillOnName a leaf (not drillable) name click still toggles', () => {
    const onDrill = vi.fn(); const onVisibleChange = vi.fn();
    render(tree({ onDrill, onVisibleChange, drillOnName: true, defaultExpanded: new Set(['pm']) }));
    fireEvent.click(screen.getByText('Pump'));
    expect(onDrill).not.toHaveBeenCalled();
    expect(onVisibleChange).toHaveBeenCalledWith(new Set(['pm.vent', 'tr.x']));
  });
});
