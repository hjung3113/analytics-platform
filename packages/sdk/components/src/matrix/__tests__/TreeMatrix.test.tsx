import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import type { MatrixColumn, MatrixNode } from '@ap/contracts';
import { TreeMatrix, type TreeMatrixProps } from '../TreeMatrix';
import { PageBoundContext } from '../../pageFlow';

type Node = MatrixNode & { values: Record<string, string | number | null> };
const leaf = (id: string, values: Node['values'] = { x: 1, y: 2, z: null }): Node => ({ id, label: id.toUpperCase(), level: 1, kind: 'leaf', hasChildren: false, expanded: false, values });
const columns: MatrixColumn[] = [
  { id: 'name', label: 'Name', width: 'identity', pin: 'left' },
  { id: 'x', label: 'X' }, { id: 'y', label: 'Y', headerNote: 'tag' },
  { id: 'z', label: 'Z', pin: 'right' },
];
const valueOf = (node: Node, column: MatrixColumn) => node.values[column.id] ?? null;
const base: TreeMatrixProps<Node> = {
  label: 'Matrix', nodes: [leaf('a'), leaf('b')], columns, identityColumn: 'name', offset: 0, totalVisible: 2, windowSize: 4,
  renderCell: (node, column) => column.id === 'name' ? node.label : String(valueOf(node, column) ?? '—'),
  valueOf,
  onToggle: vi.fn(), onWindowChange: vi.fn(), selectedCell: null, onSelectCell: vi.fn(),
};
function mount(props: Omit<Partial<TreeMatrixProps<Node>>, 'valueOf'> = {}) {
  return render(<I18nProvider><TreeMatrix {...base} {...props} /></I18nProvider>);
}
function cell(row: string, column: string) {
  return document.querySelector<HTMLElement>(`[data-matrix-row="${row}"] [data-matrix-column="${column}"]`)!;
}
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('TreeMatrix controlled window', () => {
  it.each(['End', 'PageDown'])('requests preceding viewport rows for remote %s near the result end', key => {
    const onWindowChange = vi.fn(); const onSelectCell = vi.fn();
    const totalVisible = 1000; const windowSize = 80;
    const { rerender } = mount({ nodes: [leaf('start')], offset: 997, totalVisible, windowSize, onWindowChange, onSelectCell });
    const viewport = screen.getByRole('treegrid');
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 160 });
    act(() => cell('start', 'z').focus());
    fireEvent.keyDown(cell('start', 'z'), { key, ctrlKey: key === 'End' });
    expect(onWindowChange).toHaveBeenLastCalledWith(920);
    const nodes = Array.from({ length: windowSize }, (_, index) => leaf(`row-${920 + index}`));
    rerender(<I18nProvider><TreeMatrix {...base} nodes={nodes} offset={920} totalVisible={totalVisible} windowSize={windowSize} onWindowChange={onWindowChange} onSelectCell={onSelectCell} /></I18nProvider>);
    expect(cell('row-999', 'z')).toHaveFocus();
    expect(onSelectCell).toHaveBeenLastCalledWith({ row: 'row-999', column: 'z' });
    for (const index of [996, 997, 998, 999]) expect(cell(`row-${index}`, 'z')).toBeInTheDocument();
  });
  it('clamps scroll window requests to a full final window', () => {
    const onWindowChange = vi.fn();
    mount({ totalVisible: 1000, windowSize: 80, onWindowChange });
    fireEvent.scroll(screen.getByRole('treegrid'), { target: { scrollTop: 999 * 32 } });
    expect(onWindowChange).toHaveBeenLastCalledWith(920);
  });
  it.each(['toolbar', 'outside', 'other cell', 'same cell'])('cancels delayed remote focus after selecting %s', destination => {
    const onSelectCell = vi.fn();
    // The consumer's toolbar sits outside the matrix (#2523).
    const view = (props: Omit<Partial<TreeMatrixProps<Node>>, 'valueOf'>) => <I18nProvider><input aria-label="Toolbar search" /><TreeMatrix {...base} {...props} /></I18nProvider>;
    const { rerender } = render(view({ totalVisible: 100, windowSize: 8, onSelectCell }));
    Object.defineProperty(screen.getByRole('treegrid'), 'clientHeight', { configurable: true, value: 160 });
    const outside = document.createElement('input');
    document.body.append(outside);
    try {
      act(() => cell('a', 'x').focus());
      fireEvent.keyDown(cell('a', 'x'), { key: 'PageDown' });
      let target: HTMLElement;
      if (destination === 'toolbar') target = screen.getByRole('textbox', { name: 'Toolbar search' });
      else if (destination === 'outside') target = outside;
      else if (destination === 'other cell') target = cell('b', 'y');
      else target = cell('a', 'x');
      if (destination === 'same cell') fireEvent.click(target);
      else act(() => target.focus());
      const selectionBeforeArrival = [...onSelectCell.mock.calls];
      const outsideGrid = destination === 'toolbar' || destination === 'outside';
      const nodes = outsideGrid ? [leaf('remote')] : [...base.nodes, leaf('c'), leaf('d'), leaf('remote')];
      rerender(view({ nodes, offset: outsideGrid ? 4 : 0, totalVisible: 100, windowSize: 8, onSelectCell }));
      expect(target).toHaveFocus();
      expect(onSelectCell.mock.calls).toEqual(selectionBeforeArrival);
      expect(cell('remote', 'x')).not.toHaveFocus();
    } finally { outside.remove(); }
  });
  it('renders only supplied nodes with spacers, server counts and absolute accessible indices', () => {
    mount({ offset: 10, totalVisible: 100 });
    expect(screen.getByRole('treegrid')).toHaveAttribute('aria-rowcount', '101');
    expect(screen.getByRole('treegrid')).toHaveAttribute('aria-colcount', '4');
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(cell('a', 'x').parentElement).toHaveAttribute('aria-rowindex', '12');
    expect(cell('a', 'x').parentElement).toHaveAttribute('aria-level', '2');
    expect(document.querySelector('[data-matrix-spacer="before"]')).toHaveStyle({ '--matrix-spacer': '320px' });
    expect(document.querySelector('[data-matrix-spacer="after"]')).toHaveStyle({ '--matrix-spacer': '2816px' });
    expect(screen.getByRole('columnheader', { name: 'Y tag' })).toBeInTheDocument();
  });
  it('requests another window on scroll without manufacturing rows or duplicate requests', () => {
    const onWindowChange = vi.fn();
    mount({ totalVisible: 100, onWindowChange });
    const viewport = document.querySelector('[data-matrix-viewport]')!;
    fireEvent.scroll(viewport, { target: { scrollTop: 640 } });
    expect(onWindowChange).toHaveBeenCalledTimes(1);
    expect(onWindowChange.mock.calls[0][0]).toBeGreaterThan(0);
    fireEvent.scroll(viewport, { target: { scrollTop: 640 } });
    expect(onWindowChange).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });
  it('toggles by button and directional keys without activating', () => {
    const onToggle = vi.fn(); const onActivate = vi.fn();
    const group: Node = { ...leaf('g'), kind: 'group', level: 0, hasChildren: true, count: 900, expanded: false };
    const { rerender } = mount({ nodes: [group], onToggle, onActivate });
    fireEvent.click(screen.getByRole('button', { name: 'G 펼치기' }));
    fireEvent.keyDown(cell('g', 'name'), { key: 'ArrowRight' });
    expect(onToggle).toHaveBeenNthCalledWith(1, 'g');
    expect(onToggle).toHaveBeenNthCalledWith(2, 'g');
    rerender(<I18nProvider><TreeMatrix {...base} nodes={[{ ...group, expanded: true }]} onToggle={onToggle} /></I18nProvider>);
    fireEvent.keyDown(cell('g', 'name'), { key: 'ArrowLeft' });
    expect(onToggle).toHaveBeenLastCalledWith('g');
    expect(cell('g', 'x').parentElement).toHaveAttribute('aria-expanded', 'true');
    expect(onActivate).not.toHaveBeenCalled();
  });
  it('moves focus and selection in two dimensions, including row ends and global ends', () => {
    const onSelectCell = vi.fn();
    function Controlled() {
      const [selectedCell, setSelection] = useState(base.selectedCell);
      return <I18nProvider><TreeMatrix {...base} selectedCell={selectedCell} onSelectCell={next => { setSelection(next); onSelectCell(next); }} /></I18nProvider>;
    }
    render(<Controlled />);
    act(() => cell('a', 'x').focus());
    fireEvent.keyDown(cell('a', 'x'), { key: 'ArrowRight' });
    expect(cell('a', 'y')).toHaveFocus();
    fireEvent.keyDown(cell('a', 'y'), { key: 'ArrowDown' });
    expect(cell('b', 'y')).toHaveFocus();
    fireEvent.keyDown(cell('b', 'y'), { key: 'Home' });
    expect(cell('b', 'name')).toHaveFocus();
    fireEvent.keyDown(cell('b', 'name'), { key: 'End' });
    expect(cell('b', 'z')).toHaveFocus();
    fireEvent.keyDown(cell('b', 'z'), { key: 'Home', ctrlKey: true });
    expect(cell('a', 'name')).toHaveFocus();
    fireEvent.keyDown(cell('a', 'name'), { key: 'End', ctrlKey: true });
    expect(cell('b', 'z')).toHaveFocus();
    expect(onSelectCell).toHaveBeenLastCalledWith({ row: 'b', column: 'z' });
    expect(cell('b', 'z')).toHaveClass('bg-surface-row-selected', 'ring-2', 'ring-inset', 'ring-border-selected');
    expect(document.querySelectorAll('[role="gridcell"][tabindex="0"]')).toHaveLength(1);
  });
  it.each([['PageDown', 4], ['PageUp', 0], ['End', 99]])('requests remote %s focus and restores it only after the window arrives', (key, target) => {
    const onWindowChange = vi.fn(); const onSelectCell = vi.fn();
    const startOffset = key === 'PageUp' ? 4 : 0;
    const { rerender } = mount({ nodes: [leaf('a')], offset: startOffset, totalVisible: 100, onWindowChange, onSelectCell });
    const viewport = document.querySelector('[data-matrix-viewport]')!;
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 160 });
    fireEvent.keyDown(cell('a', 'x'), { key, ctrlKey: key === 'End' });
    expect(onWindowChange).toHaveBeenCalledWith(key === 'End' ? 96 : target);
    rerender(<I18nProvider><TreeMatrix {...base} nodes={[leaf('remote')]} offset={target} totalVisible={100} onWindowChange={onWindowChange} onSelectCell={onSelectCell} /></I18nProvider>);
    const targetColumn = key === 'End' ? 'z' : 'x';
    expect(cell('remote', targetColumn)).toHaveFocus();
    expect(onSelectCell).toHaveBeenLastCalledWith({ row: 'remote', column: targetColumn });
  });
  it.each(['enter', 'click', 'doubleClick'] as const)('declares %s activation and always offers Enter', activateOn => {
    const onActivate = vi.fn();
    mount({ activateOn, onActivate });
    fireEvent.click(cell('a', 'x'));
    expect(onActivate).toHaveBeenCalledTimes(activateOn === 'click' ? 1 : 0);
    onActivate.mockClear();
    fireEvent.doubleClick(cell('a', 'x'));
    expect(onActivate).toHaveBeenCalledTimes(activateOn === 'doubleClick' ? 1 : 0);
    onActivate.mockClear();
    fireEvent.keyDown(cell('a', 'x'), { key: 'Enter' });
    expect(onActivate).toHaveBeenCalledWith(base.nodes[0], columns[1]);
  });
  it.each([true, false])('keepSelectionInView=%s: a viewport resize brings the selected row back inside the matrix only', keep => {
    let resized: (() => void) | undefined;
    vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resized = callback; } observe() {} disconnect() {} unobserve() {} });
    mount({ keepSelectionInView: keep, selectedCell: { row: 'b', column: 'x' } });
    const viewport = document.querySelector<HTMLElement>('[data-matrix-viewport]')!;
    const row = document.querySelector<HTMLElement>('[data-matrix-row="b"]')!;
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 800, 120));
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 400, 800, 32));
    vi.spyOn(viewport, 'clientHeight', 'get').mockReturnValue(110);
    viewport.scrollTop = 0;
    act(() => { resized?.(); });
    expect(viewport.scrollTop).toBe(keep ? 222 : 0);
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
  it('reveals a remote row/cell after its window arrives', () => {
    const { rerender } = mount({ reveal: { row: 'remote', column: 'y' } });
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
    rerender(<I18nProvider><TreeMatrix {...base} nodes={[leaf('remote')]} offset={30} totalVisible={100} reveal={{ row: 'remote', column: 'y' }} /></I18nProvider>);
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  });
  it('hides declared columns and pins both sides with opaque group/header surfaces', () => {
    mount({ hiddenColumns: ['y'] });
    expect(screen.queryByRole('columnheader', { name: 'Y tag' })).toBeNull();
    expect(cell('a', 'name')).toHaveClass('sticky');
    expect(cell('a', 'name')).toHaveStyle({ '--matrix-left': '0px' });
    expect(cell('a', 'z')).toHaveClass('sticky');
    expect(cell('a', 'z')).toHaveStyle({ '--matrix-right': '0px' });
    expect(screen.getByRole('columnheader', { name: 'Name' }).parentElement).toHaveClass('sticky', 'top-0');
  });
  it('registers and unregisters its page bound only in fill mode', () => {
    const unregister = vi.fn(); const register = vi.fn(() => unregister);
    const { rerender, unmount } = render(<I18nProvider><PageBoundContext.Provider value={register}><TreeMatrix {...base} fill /></PageBoundContext.Provider></I18nProvider>);
    expect(register).toHaveBeenCalledTimes(1);
    rerender(<I18nProvider><PageBoundContext.Provider value={register}><TreeMatrix {...base} /></PageBoundContext.Provider></I18nProvider>);
    expect(unregister).toHaveBeenCalledTimes(1);
    unmount();
  });
  it('uses the shared size for row and spacer geometry', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'large' });
    mount({ offset: 2, totalVisible: 10 });
    expect(document.querySelector('[data-matrix-spacer="before"]')).toHaveStyle({ '--matrix-spacer': '80px' });
  });
  it('defaults the identity width and accumulates pinned offsets on both sides', () => {
    mount({ columns: [{ id: 'name', label: 'Name' }, { id: 'left', label: 'Left', pin: 'left' }, ...columns.slice(1)],
      emphasis: [{ row: 'a', match: { kind: 'values', values: [1] } }] });
    expect(cell('a', 'name')).toHaveStyle({ '--matrix-width': '320px' });
    expect(cell('a', 'left')).toHaveStyle({ '--matrix-left': '320px' });
    expect(cell('a', 'z')).toHaveStyle({ '--matrix-right': '96px' });
  });
  it('advances repeated page navigation while a remote window is pending', () => {
    const onWindowChange = vi.fn();
    mount({ totalVisible: 100, onWindowChange });
    Object.defineProperty(document.querySelector('[data-matrix-viewport]')!, 'clientHeight', { configurable: true, value: 160 });
    fireEvent.keyDown(cell('a', 'x'), { key: 'PageDown' });
    fireEvent.keyDown(cell('a', 'x'), { key: 'PageDown' });
    expect(onWindowChange.mock.calls).toEqual([[4], [8]]);
  });
  it('keeps the visible value in the accessible cell name', () => {
    mount();
    expect(within(cell('a', 'x').parentElement!).getByRole('gridcell', { name: '1' })).toBe(cell('a', 'x'));
  });
  it('selects an already focused cell when controlled selection changed elsewhere', () => {
    const onSelectCell = vi.fn();
    const { rerender } = mount({ onSelectCell });
    act(() => cell('a', 'x').focus());
    rerender(<I18nProvider><TreeMatrix {...base} selectedCell={{ row: 'b', column: 'y' }} onSelectCell={onSelectCell} /></I18nProvider>);
    onSelectCell.mockClear();
    fireEvent.click(cell('a', 'x'));
    expect(onSelectCell).toHaveBeenCalledWith({ row: 'a', column: 'x' });
  });
  it('does not replace a pending keyboard window with its own scroll event', () => {
    const onWindowChange = vi.fn();
    mount({ totalVisible: 100, onWindowChange });
    fireEvent.keyDown(cell('a', 'x'), { key: 'End', ctrlKey: true });
    fireEvent.scroll(document.querySelector('[data-matrix-viewport]')!, { target: { scrollTop: 3000 } });
    expect(onWindowChange.mock.calls).toEqual([[96]]);
  });
  it('cancels pending focus across a generation change, even if a former generation id is reused', () => {
    const onSelectCell = vi.fn();
    const { rerender } = mount({ totalVisible: 100, generation: 'a', onSelectCell });
    fireEvent.keyDown(cell('a', 'x'), { key: 'End', ctrlKey: true });
    rerender(<I18nProvider><TreeMatrix {...base} generation="b" onSelectCell={onSelectCell} /></I18nProvider>);
    rerender(<I18nProvider><TreeMatrix {...base} generation="a" nodes={[leaf('remote')]} offset={99} totalVisible={100} onSelectCell={onSelectCell} /></I18nProvider>);
    expect(cell('remote', 'z')).not.toHaveFocus();
    expect(onSelectCell).not.toHaveBeenCalled();
  });
  it('uses Enter by default and leaves nested controls to their own keyboard path', () => {
    const onActivate = vi.fn();
    mount({ onActivate, onEmphasisChange: vi.fn() });
    fireEvent.click(cell('a', 'x'));
    expect(onActivate).not.toHaveBeenCalled();
    fireEvent.keyDown(cell('a', 'x'), { key: 'Enter' });
    expect(onActivate).toHaveBeenCalledOnce();
    fireEvent.keyDown(within(cell('a', 'name')).getByRole('button', { name: 'A 메뉴' }), { key: 'Enter' });
    expect(onActivate).toHaveBeenCalledOnce();
  });
});

describe('TreeMatrix emphasis', () => {
  it('retains each surviving same-row rule after off-window removal and prunes removed matches', () => {
    const emphasis = [{ row: 'a', match: { kind: 'values' as const, values: [1] } }, { row: 'a', match: { kind: 'range' as const, min: 2, max: 2 } }];
    const { rerender } = mount({ emphasis, onlyMatchingColumns: true });
    rerender(<I18nProvider><TreeMatrix {...base} nodes={[leaf('b')]} emphasis={emphasis} onlyMatchingColumns /></I18nProvider>);
    rerender(<I18nProvider><TreeMatrix {...base} nodes={[leaf('b')]} emphasis={[emphasis[0]]} onlyMatchingColumns /></I18nProvider>);
    expect(screen.getByRole('columnheader', { name: 'X' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Y tag' })).toBeNull();
    rerender(<I18nProvider><TreeMatrix {...base} nodes={[leaf('b')]} emphasis={emphasis} onlyMatchingColumns /></I18nProvider>);
    expect(screen.getByRole('columnheader', { name: 'X' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Y tag' })).toBeNull();
  });
  it.each(['numeric', 'values', 'empty'])('hands keyboard focus to the %s editor and returns it on close', async kind => {
    const user = userEvent.setup();
    const values = { numeric: { x: 1, y: 2 }, values: { x: 'ready', y: 'ready' }, empty: { x: null, y: null } }[kind]!;
    mount({ nodes: [leaf('a', values)], onEmphasisChange: vi.fn() });
    const trigger = within(cell('a', 'name')).getByRole('button', { name: 'A 메뉴' });
    act(() => trigger.focus());
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('menuitem', { name: '이 행에서 강조…' })).toHaveFocus();
    await user.keyboard('{Enter}');
    if (kind === 'numeric') expect(screen.getByLabelText('최솟값')).toHaveFocus();
    else if (kind === 'values') expect(screen.getByRole('checkbox', { name: 'ready (2)' })).toHaveFocus();
    else expect(screen.getByRole('button', { name: '지우기' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('unions multiple rules on the same row and retains that union outside its window', () => {
    const emphasis = [{ row: 'a', match: { kind: 'values' as const, values: [1] } }, { row: 'a', match: { kind: 'range' as const, min: 2, max: 2 } }];
    const { rerender } = mount({ emphasis, onlyMatchingColumns: true });
    expect(cell('a', 'x')).toHaveClass('outline-dashed');
    expect(cell('a', 'y')).toHaveClass('outline-dashed');
    expect(screen.getByText('2개 해당')).toBeInTheDocument();
    rerender(<I18nProvider><TreeMatrix {...base} nodes={[leaf('b')]} emphasis={emphasis} onlyMatchingColumns /></I18nProvider>);
    expect(screen.getByRole('columnheader', { name: 'X' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Y tag' })).toBeInTheDocument();
  });
  it('preserves tone fill, adds a dashed inset and shows per-row matching counts only while rules exist', () => {
    const rule = { row: 'a', match: { kind: 'range' as const, min: 1, max: 2 } };
    const { rerender } = mount({ emphasis: [rule], cellTone: () => 'danger' });
    expect(cell('a', 'x')).toHaveClass('outline-dashed', 'bg-accent-danger-soft');
    expect(cell('b', 'x')).not.toHaveClass('outline-dashed');
    expect(screen.getByRole('columnheader', { name: '강조' })).toBeInTheDocument();
    expect(screen.getByText('2개 해당')).toBeInTheDocument();
    rerender(<I18nProvider><TreeMatrix {...base} valueOf={valueOf} emphasis={[]} /></I18nProvider>);
    expect(screen.queryByRole('columnheader', { name: '강조' })).toBeNull();
  });
  it('narrows to the matching union, combines hidden columns and retains pinned/always-visible columns', () => {
    mount({ columns: [...columns, { id: 'extra', label: 'Extra', alwaysVisible: true }], nodes: [leaf('a', { x: 1, y: 4 }), leaf('b', { x: 2, y: 1 })],
      emphasis: [{ row: 'a', match: { kind: 'values', values: [1] } }, { row: 'b', match: { kind: 'values', values: [1] } }], onlyMatchingColumns: true, hiddenColumns: ['y'] });
    expect(screen.getByRole('columnheader', { name: 'X' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Y tag' })).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Z' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Extra' })).toBeInTheDocument();
  });
  it('edits numeric ranges through the row menu and clears a rule', async () => {
    const onEmphasisChange = vi.fn();
    mount({ emphasis: [], onEmphasisChange });
    fireEvent.click(within(cell('a', 'name')).getByRole('button', { name: 'A 메뉴' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '이 행에서 강조…' }));
    fireEvent.change(screen.getByLabelText('최솟값'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('최댓값'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    expect(onEmphasisChange).toHaveBeenLastCalledWith([{ row: 'a', match: { kind: 'range', min: 1, max: 2 } }]);
  });
  it('offers distinct nonblank values with counts for a nonnumeric row', async () => {
    const onEmphasisChange = vi.fn();
    mount({ nodes: [leaf('a', { x: 'ready', y: 'ready', z: null })], emphasis: [], onEmphasisChange });
    fireEvent.click(within(cell('a', 'name')).getByRole('button', { name: 'A 메뉴' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '이 행에서 강조…' }));
    expect(screen.getByText('ready (2)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'ready (2)' }));
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    expect(onEmphasisChange).toHaveBeenLastCalledWith([{ row: 'a', match: { kind: 'values', values: ['ready'] } }]);
  });
  it('retains matching column ids across windows and discards them for a new generation', () => {
    const emphasis = [{ row: 'a', match: { kind: 'values' as const, values: [1] } }];
    const { rerender } = mount({ emphasis, onlyMatchingColumns: true, generation: 'a' });
    expect(screen.getByRole('columnheader', { name: 'X' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Y tag' })).toBeNull();
    rerender(<I18nProvider><TreeMatrix {...base} nodes={[leaf('b')]} emphasis={emphasis} onlyMatchingColumns generation="a" /></I18nProvider>);
    expect(screen.getByRole('columnheader', { name: 'X' })).toBeInTheDocument();
    rerender(<I18nProvider><TreeMatrix {...base} nodes={[leaf('b')]} emphasis={emphasis} onlyMatchingColumns generation="b" /></I18nProvider>);
    expect(screen.queryByRole('columnheader', { name: 'X' })).toBeNull();
  });
  it('rejects a reversed numeric range and clears the row rule', async () => {
    const onEmphasisChange = vi.fn();
    const emphasis = [{ row: 'a', match: { kind: 'range' as const, min: 1, max: 2 } }];
    mount({ emphasis, onEmphasisChange });
    fireEvent.click(within(cell('a', 'name')).getByRole('button', { name: 'A 메뉴' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '이 행에서 강조…' }));
    fireEvent.change(screen.getByLabelText('최솟값'), { target: { value: '3' } });
    expect(screen.getByRole('button', { name: '적용' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('최솟값');
    fireEvent.click(screen.getByRole('button', { name: '지우기' }));
    expect(onEmphasisChange).toHaveBeenLastCalledWith([]);
  });
  it('discards an open row-editor draft when the consumer generation changes', async () => {
    const onEmphasisChange = vi.fn();
    const { rerender } = mount({ generation: 'a', onEmphasisChange });
    fireEvent.click(within(cell('a', 'name')).getByRole('button', { name: 'A 메뉴' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '이 행에서 강조…' }));
    fireEvent.change(screen.getByLabelText('최솟값'), { target: { value: '9' } });
    rerender(<I18nProvider><TreeMatrix {...base} generation="b" onEmphasisChange={onEmphasisChange} /></I18nProvider>);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onEmphasisChange).not.toHaveBeenCalled();
  });
});
