import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, testAdapter, testMenu, testSession, testSpace } from '@ap/kernel/testing';
import { House } from 'lucide-react';
import { groupId, spaceId } from '@ap/contracts';
import { stubCompactTableGeometry } from '../../testing';
import { PlatformDataTable, type PlatformColumn, type PlatformDataTableProps, type TableCell } from '../PlatformDataTable';

const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [testMenu({ primary: true, path: '/' })],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
const rows = [{ id: 'north', value: 10, limit: 15 }, { id: 'south', value: 20, limit: 25 }];
type Row = typeof rows[number];
const columns: PlatformColumn<Row>[] = [
  { id: 'id', header: 'Station', initialPin: 'left', selectableCell: false, sortable: false },
  { id: 'value', header: 'Value', columnGroup: ['measurements'], cellTone: () => 'danger', cellLabel: row => `${row.id} value ${row.value} above spec`, sortable: false },
  { id: 'limit', header: 'Limit', columnGroup: ['measurements'], sortable: false },
];
const groups = { measurements: 'Measurements' };
const rowId = (row: Row) => row.id;
function Harness({ rows: readings = rows, ...props }: Pick<PlatformDataTableProps<Row>, 'pageOwnedToolbar' | 'selectedCell' | 'onSelectCell' | 'onActivateCell' | 'pinnedRowId' | 'rows'>) {
  return <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
    <PlatformDataTable title="Readings" ariaLabel="Readings" rows={readings} columns={columns} columnGroups={groups} getRowId={rowId} preferenceKey="readings" {...props} />
  </PlatformProvider></I18nProvider>;
}

let restoreGeometry: () => void;
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  restoreGeometry = stubCompactTableGeometry();
});
afterEach(() => { cleanup(); restoreGeometry(); vi.unstubAllGlobals(); });

describe('page-owned comparison table options', () => {
  it('suppresses the internal toolbar and result line and follows declared visibility', async () => {
    const { container, rerender } = render(<Harness pageOwnedToolbar={{ columnVisibility: { limit: false } }} />);
    expect(await screen.findByRole('cell', { name: 'north value 10 above spec' })).toBeVisible();
    expect(container.querySelector('[data-table-toolbar], [data-table-status-line]')).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /Limit/ })).toBeNull();
    rerender(<Harness pageOwnedToolbar={{}} />);
    expect(screen.getByRole('columnheader', { name: /Limit/ })).toBeVisible();
  });

  it('applies tone to the data cell and moves controlled selection and activation by keyboard', async () => {
    const activate = vi.fn();
    function Controlled() {
      const [selected, setSelected] = useState<TableCell | null>(null);
      return <Harness selectedCell={selected} onSelectCell={setSelected} onActivateCell={activate} />;
    }
    render(<Controlled />);
    const first = await screen.findByRole('gridcell', { name: 'north value 10 above spec' });
    expect(first).toHaveClass('bg-accent-danger-soft');
    expect(first).toHaveAttribute('tabindex', '0');
    fireEvent.click(first);
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(first).toHaveClass('ring-border-selected');
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    const second = screen.getByRole('gridcell', { name: '15' });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(second, { key: 'ArrowDown' });
    const last = screen.getByRole('gridcell', { name: '25' });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: 'Enter' });
    fireEvent.doubleClick(last);
    expect(activate.mock.calls).toEqual([[{ row: 'south', column: 'limit' }], [{ row: 'south', column: 'limit' }]]);
  });

  it('skips unrelated row renders when controlled cell selection moves', async () => {
    const renderValue = vi.fn((row: Row) => row.value);
    const readings = [...rows, { id: 'west', value: 30, limit: 35 }];
    const measuredColumns = columns.map(column => column.id === 'value' ? { ...column, cell: renderValue } : column);
    function Controlled() {
      const [selected, setSelected] = useState<TableCell | null>({ row: 'north', column: 'value' });
      return <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
        <PlatformDataTable title="Readings" ariaLabel="Readings" preferenceKey="readings" rows={readings}
          columns={measuredColumns} columnGroups={groups} getRowId={rowId}
          selectedCell={selected} onSelectCell={setSelected} />
      </PlatformProvider></I18nProvider>;
    }
    render(<Controlled />);
    const first = await screen.findByRole('gridcell', { name: 'north value 10 above spec' });
    const second = screen.getByRole('gridcell', { name: '15' });
    expect(renderValue).toHaveBeenCalledWith(readings[2]);

    renderValue.mockClear();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(first).toHaveAttribute('aria-selected', 'false');
    expect(first).toHaveAttribute('tabindex', '-1');
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(second).toHaveAttribute('tabindex', '0');
    expect(renderValue).not.toHaveBeenCalledWith(readings[1]);
    expect(renderValue).not.toHaveBeenCalledWith(readings[2]);

    renderValue.mockClear();
    fireEvent.keyDown(second, { key: 'ArrowDown' });
    expect(second).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('gridcell', { name: '25' })).toHaveAttribute('aria-selected', 'true');
    expect(renderValue).not.toHaveBeenCalledWith(readings[2]);
  });

  it('focuses the new tab stop when the focused row is replaced', async () => {
    const selection = { selectedCell: { row: 'north', column: 'value' }, onSelectCell: vi.fn() };
    const { rerender } = render(<Harness {...selection} />);
    const removed = await screen.findByRole('gridcell', { name: 'north value 10 above spec' });
    removed.focus();
    expect(removed).toHaveFocus();

    rerender(<Harness {...selection} rows={[{ id: 'west', value: 30, limit: 35 }]} />);

    const fallback = await screen.findByRole('gridcell', { name: 'west value 30 above spec' });
    expect(fallback).toHaveFocus();
    expect(screen.getAllByRole('gridcell').filter(cell => cell.tabIndex === 0)).toEqual([fallback]);
  });

  it('restores focus to the selected tab stop when the focused column is hidden', async () => {
    const selection = { selectedCell: { row: 'south', column: 'limit' }, onSelectCell: vi.fn() };
    const { rerender } = render(<Harness {...selection} pageOwnedToolbar={{}} />);
    const removed = await screen.findByRole('gridcell', { name: 'north value 10 above spec' });
    removed.focus();
    expect(removed).toHaveFocus();

    rerender(<Harness {...selection} pageOwnedToolbar={{ columnVisibility: { value: false } }} />);

    const selected = screen.getByRole('gridcell', { name: '25' });
    expect(selected).toHaveFocus();
    expect(screen.getAllByRole('gridcell').filter(cell => cell.tabIndex === 0)).toEqual([selected]);
  });

  it('focuses the named scroll area when all selectable columns are hidden', async () => {
    const onSelectCell = vi.fn();
    const { rerender } = render(<Harness onSelectCell={onSelectCell} pageOwnedToolbar={{}} />);
    const removed = await screen.findByRole('gridcell', { name: 'north value 10 above spec' });
    removed.focus();
    expect(removed).toHaveFocus();

    rerender(<Harness onSelectCell={onSelectCell} pageOwnedToolbar={{ columnVisibility: { value: false, limit: false } }} />);

    const scrollArea = screen.getByLabelText('스크롤 가능한 행 영역');
    expect(scrollArea).toHaveFocus();
    expect(scrollArea).toHaveAttribute('tabindex', '0');
    expect(screen.getAllByRole('gridcell').filter(cell => cell.tabIndex === 0)).toEqual([]);
  });

  it('focuses the named scroll area when the new result has no rows', async () => {
    const onSelectCell = vi.fn();
    const { rerender } = render(<Harness onSelectCell={onSelectCell} />);
    const removed = await screen.findByRole('gridcell', { name: 'north value 10 above spec' });
    removed.focus();
    expect(removed).toHaveFocus();

    rerender(<Harness onSelectCell={onSelectCell} rows={[]} />);

    await waitFor(() => expect(screen.queryByRole('grid')).not.toBeInTheDocument());
    expect(screen.getByLabelText('스크롤 가능한 행 영역')).toHaveFocus();
  });

  it('keeps focus outside the grid when a previously focused column is hidden', async () => {
    const onSelectCell = vi.fn();
    const { rerender } = render(<><button>Outside</button><Harness onSelectCell={onSelectCell} pageOwnedToolbar={{}} /></>);
    const removed = await screen.findByRole('gridcell', { name: 'north value 10 above spec' });
    removed.focus();
    expect(removed).toHaveFocus();
    const outside = screen.getByRole('button', { name: 'Outside' });
    outside.focus();

    rerender(<><button>Outside</button><Harness onSelectCell={onSelectCell} pageOwnedToolbar={{ columnVisibility: { value: false } }} /></>);

    expect(outside).toHaveFocus();
    expect(screen.getAllByRole('gridcell').filter(cell => cell.tabIndex === 0)).toEqual([screen.getByRole('gridcell', { name: '15' })]);
  });

  it('keeps the declared column and row pinned and lets an explicit user unpin win on remount', async () => {
    const first = render(<Harness pinnedRowId="south" />);
    const table = await screen.findByRole('table', { name: 'Readings' });
    const pinned = await within(table).findByRole('row', { name: /south/ });
    expect(pinned.parentElement).toHaveClass('sticky');
    expect(within(table).getAllByRole('row').filter(row => row.hasAttribute('data-row-id'))[0]).toBe(pinned);
    expect(within(pinned).getByRole('cell', { name: 'south' })).toHaveStyle({ position: 'sticky', left: '0px' });
    fireEvent.click(screen.getByRole('button', { name: '컬럼' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Station 왼쪽 고정' }));
    first.unmount();
    render(<Harness pinnedRowId="south" />);
    expect(await screen.findByRole('cell', { name: 'south' })).toHaveStyle({ position: 'relative' });
  });
});
