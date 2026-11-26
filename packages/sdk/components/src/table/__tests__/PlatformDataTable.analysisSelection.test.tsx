import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { groupId, spaceId } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, useAnalysisSelectionInputs, useAnalysisSelectionOutput } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { House } from 'lucide-react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AnalysisSelectionChipZone } from '../../filters/AnalysisSelectionChipZone';
import { stubCompactTableGeometry } from '../../testing';
import { PlatformDataTable, type PlatformColumn } from '../PlatformDataTable';
import { AnalysisSelectionCell, TableAnalysisOutputs } from '../TableAnalysisSelection';

const output = { panelId: 'source', key: 'equipment' };
const lotOutput = { panelId: 'lot-source', key: 'lots' };
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{
    id: 'home', group: groupId('overview'), primary: true, label: { ko: '표', en: 'Table' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', query: { mode: 'live' }, features: { export: false, savedView: false, annotate: false, compare: false },
    pageKeys: [output.key, lotOutput.key], repeatedPageKeys: [output.key, lotOutput.key], contextResetKeys: [output.key, lotOutput.key],
    panels: [
      ...[output.panelId, 'alternate'].map(id => ({ id, title: { ko: id, en: id }, queryInputs: {}, displayInputs: {}, grain: 'execution' as const, endpoints: [],
        outputs: [{ key: output.key, action: 'select' as const, selection: { shape: 'set' as const, dimension: 'equipmentId', label: { ko: '설비', en: 'Equipment' } } }] })),
      { id: lotOutput.panelId, title: { ko: '로트', en: 'Lots' }, queryInputs: {}, displayInputs: {}, grain: 'execution', endpoints: [],
        outputs: [{ key: lotOutput.key, action: 'select', selection: { shape: 'set', dimension: 'lotId', label: { ko: '로트', en: 'Lot' } } }] },
      { id: 'reader', title: { ko: '분포', en: 'Distribution' }, queryInputs: { page: [{ key: output.key, selection: 'filter' }] },
        displayInputs: {}, grain: 'execution', endpoints: [], outputs: [] },
    ],
  }],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
const rows = [{ id: 'r1', equipment: 'E-1', lot: 'L-1' }, { id: 'r2', equipment: 'E-2', lot: 'L-2' }];
const columns: PlatformColumn<typeof rows[number]>[] = [
  { id: 'equipment', header: 'Equipment', analysisSelectionOutput: output },
  { id: 'lot', header: 'Lot' },
];

let restore: () => void;
beforeEach(() => {
  window.history.replaceState(null, '', '/?v=1');
  restore = stubCompactTableGeometry(480);
});
afterEach(() => { cleanup(); restore(); });

function mount({ rowAction, highlightedRowIds, bulkActions }: { rowAction?: () => void; highlightedRowIds?: string[]; bulkActions?: () => null } = {}) {
  return render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter}>
    <AnalysisSelectionChipZone />
    <PlatformDataTable title="Runs" ariaLabel="Runs table" columns={columns} rows={rows} getRowId={row => row.id}
      preferenceKey="table-analysis-selection" highlightedRowIds={highlightedRowIds} bulkActions={bulkActions}
      onSelectCell={rowAction} onActivateCell={rowAction}
      rowAction={rowAction ? row => <button type="button" onClick={rowAction}>Open {row.id}</button> : undefined} />
  </PlatformProvider></I18nProvider>);
}

const selected = () => new URLSearchParams(window.location.search).getAll(output.key);
const equipment = (value: string) => screen.getByRole('gridcell', { name: value });

it.each([{ metaKey: true }, { shiftKey: true }])('replaces on click and toggles with %o', async modifier => {
  mount();
  await screen.findByText('E-1');
  fireEvent.click(equipment('E-1'));
  expect(selected()).toEqual(['E-1']);
  expect(screen.getByRole('button', { name: '설비 E-1' })).toBeInTheDocument();
  fireEvent.click(equipment('E-2'), modifier);
  expect(selected()).toEqual(['E-1', 'E-2']);
  fireEvent.click(equipment('E-1'), modifier);
  expect(selected()).toEqual(['E-2']);
  fireEvent.click(equipment('E-1'));
  expect(selected()).toEqual(['E-1']);
});

it.each([['{Enter}', '{Shift>}{Enter}{/Shift}'], [' ', '{Meta>} {/Meta}']])('selects from a focused cell with %s and supports a modifier', async (key, modified) => {
  mount();
  await screen.findByText('E-1');
  const user = userEvent.setup();
  expect(equipment('E-1')).toHaveAttribute('tabindex', '0');
  act(() => equipment('E-1').focus());
  await user.keyboard(key);
  expect(selected()).toEqual(['E-1']);
  await user.keyboard('{ArrowDown}');
  expect(equipment('E-2')).toHaveFocus();
  expect(equipment('E-2')).toHaveAttribute('tabindex', '0');
  expect(equipment('E-2')).toHaveAttribute('aria-selected', 'false');
  await user.keyboard(modified);
  expect(selected()).toEqual(['E-1', 'E-2']);
});

it.each(['Shift+F10', 'ContextMenu', 'right click'])('opens the same menu with %s, executes its items and restores focus', async gesture => {
  mount();
  await screen.findByText('E-1');
  const user = userEvent.setup();
  const target = equipment('E-2');
  const open = async () => {
    act(() => target.focus());
    if (gesture === 'right click') fireEvent.contextMenu(target);
    else await user.keyboard(gesture === 'Shift+F10' ? '{Shift>}{F10}{/Shift}' : '{ContextMenu}');
  };
  await open();
  const narrow = await screen.findByRole('button', { name: '이 값으로 좁히기' });
  expect(narrow).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(target).toHaveFocus();
  fireEvent.click(equipment('E-1'));
  await open();
  await user.click(await screen.findByRole('button', { name: '선택에 추가' }));
  expect(selected()).toEqual(['E-1', 'E-2']);
  await open();
  await user.click(await screen.findByRole('button', { name: '선택에서 빼기' }));
  expect(selected()).toEqual(['E-1']);
  await open();
  await user.keyboard('{Enter}');
  expect(selected()).toEqual(['E-2']);
});

it('distinguishes a selected cell from a highlighted row', async () => {
  mount({ highlightedRowIds: ['r2'] });
  await screen.findByText('E-1');
  fireEvent.click(equipment('E-1'));
  expect(equipment('E-1')).toHaveClass('bg-surface-row-selected', 'ring-border-selected');
  const highlighted = equipment('E-2 분석 선택에 포함');
  expect(highlighted).toHaveClass('from-accent-primary');
  expect(highlighted).not.toHaveClass('ring-border-selected', 'bg-surface-row-selected');
});

it('reserves output-cell interactions for selection and preserves the other cells and action control', async () => {
  const action = vi.fn();
  mount({ rowAction: action });
  await screen.findByText('E-1');
  fireEvent.click(equipment('E-1'));
  expect(action).not.toHaveBeenCalled();
  expect(selected()).toEqual(['E-1']);
  fireEvent.click(screen.getByRole('gridcell', { name: 'L-1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open r1' }));
  expect(action).toHaveBeenCalledTimes(2);
});

it('keeps the existing checkbox row selection independent of cell selection', async () => {
  mount({ bulkActions: () => null });
  await screen.findByText('E-1');
  const cell = equipment('E-1');
  fireEvent.click(screen.getByRole('checkbox', { name: '선택 r1' }));
  expect(cell.closest('[role="row"]')).toHaveAttribute('aria-selected', 'true');
  expect(cell).toHaveAttribute('aria-selected', 'false');
  expect(selected()).toEqual([]);
});

it('keeps a selection applied as a complete table narrows, hides and returns', async () => {
  window.history.replaceState(null, '', '/?v=1&equipment=E-2');
  function Applied() {
    const { applied } = useAnalysisSelectionInputs('reader');
    const selection = applied[0]?.selection;
    return <output aria-label="Applied selection">{selection?.shape === 'set' ? selection.values.join(',') : 'unfiltered'}</output>;
  }
  function Fixture() {
    const [narrowed, setNarrowed] = useState(false);
    const [shown, setShown] = useState(true);
    return <>
      <Applied />
      <button onClick={() => setNarrowed(true)}>Narrow</button>
      <button onClick={() => setShown(!shown)}>Toggle table</button>
      {shown && <PlatformDataTable title="Runs" ariaLabel="Runs table" columns={columns}
        rows={narrowed ? rows.slice(0, 1) : rows} getRowId={row => row.id} preferenceKey="selection-availability" />}
    </>;
  }
  render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter}><Fixture /></PlatformProvider></I18nProvider>);
  const applied = () => screen.getByRole('status', { name: 'Applied selection' });
  await screen.findByText('L-2');
  expect(applied()).toHaveTextContent('E-2');
  fireEvent.click(screen.getByRole('button', { name: 'Narrow' }));
  await waitFor(() => expect(screen.queryByText('L-2')).toBeNull());
  expect(applied()).toHaveTextContent('E-2');
  fireEvent.click(screen.getByRole('button', { name: 'Toggle table' }));
  expect(applied()).toHaveTextContent('E-2');
  fireEvent.click(screen.getByRole('button', { name: 'Toggle table' }));
  await screen.findByText('L-1');
  expect(applied()).toHaveTextContent('E-2');
});

it('reconciles mixed-grid focus with controlled selection and keeps checked rows and activation independent', async () => {
  const select = vi.fn();
  const activate = vi.fn();
  const extraColumns = [...columns, { id: 'other', header: 'Other', value: (row: typeof rows[number]) => `Other ${row.id}` },
    { id: 'secondEquipment', header: 'Second equipment', value: (row: typeof rows[number]) => row.equipment + ' alternate', analysisSelectionOutput: output }];
  const fixture = (selectedColumn: string, hideEquipment = false) => <I18nProvider><PlatformProvider registry={registry} adapter={adapter}>
    <PlatformDataTable title="Runs" ariaLabel="Runs table" columns={hideEquipment ? extraColumns.slice(1) : extraColumns}
      rows={rows} getRowId={row => row.id} preferenceKey="mixed-grid" bulkActions={() => null}
      selectedCell={{ row: 'r2', column: selectedColumn }} onSelectCell={select} onActivateCell={activate} />
    <button>Outside</button>
  </PlatformProvider></I18nProvider>;
  const view = render(fixture('lot'));
  await screen.findByText('E-1');
  const grid = screen.getByRole('grid');
  const stops = () => [...grid.querySelectorAll('[role="gridcell"][tabindex="0"]')];
  const outputCell = equipment('E-1');
  const lot = within(grid).getByRole('gridcell', { name: 'L-2' });
  const other = within(grid).getByRole('gridcell', { name: 'Other r2' });
  expect(stops()).toEqual([lot]);
  act(() => outputCell.focus());
  view.rerender(fixture('other'));
  expect(stops()).toEqual([outputCell]);
  act(() => screen.getByRole('button', { name: 'Outside' }).focus());
  expect(stops()).toEqual([other]);
  act(() => outputCell.focus());
  view.rerender(fixture('other', true));
  expect(stops()).toEqual([other]);
  expect(other).toHaveFocus();
  fireEvent.click(screen.getByRole('checkbox', { name: '선택 r2' }));
  expect(other.closest('[role="row"]')).toHaveAttribute('aria-selected', 'true');
  expect(lot).toHaveClass('group-aria-selected:bg-surface-row-selected');
  fireEvent.click(lot);
  expect(select).toHaveBeenLastCalledWith({ row: 'r2', column: 'lot' });
  expect(activate).not.toHaveBeenCalled();
  fireEvent.keyDown(other, { key: 'Enter' });
  expect(activate).toHaveBeenCalledWith({ row: 'r2', column: 'other' });
  expect(selected()).toEqual([]);
});

it('validates another writer even when its key is already bound by the first column', () => {
  const invalid = { ...columns[1], analysisSelectionOutput: { ...output, panelId: 'undeclared' } };
  const bindingColumns = [columns[0], invalid];
  expect(() => render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter}>
    <TableAnalysisOutputs columns={bindingColumns}><div /></TableAnalysisOutputs>
  </PlatformProvider></I18nProvider>))
    .toThrow('Panel "undeclared" does not declare analysis selection output "equipment"');
});

it('keeps first-writer availability when compatible table columns are reordered', async () => {
  window.history.replaceState(null, '', '/?v=1&equipment=E-2');
  const primary = columns[0];
  const secondary = { ...columns[1], analysisSelectionOutput: { ...output, panelId: 'alternate' } };
  function Applied() {
    useAnalysisSelectionOutput(output.panelId, output.key, { available: ['E-2'] });
    const selection = useAnalysisSelectionInputs('reader').applied[0]?.selection;
    return <output aria-label="Applied selection">{selection?.shape === 'set' ? selection.values.join(',') : 'unfiltered'}</output>;
  }
  const fixture = (ordered: PlatformColumn<typeof rows[number]>[]) => <I18nProvider><PlatformProvider registry={registry} adapter={adapter}>
    <Applied />
    <PlatformDataTable title="Runs" ariaLabel="Runs table" columns={ordered} rows={rows.slice(0, 1)}
      getRowId={row => row.id} preferenceKey="compatible-writers" />
  </PlatformProvider></I18nProvider>;
  const applied = () => screen.getByRole('status', { name: 'Applied selection' });
  const view = render(fixture([secondary, primary]));
  await screen.findByText('L-1');
  expect(applied()).toHaveTextContent('E-2');
  view.rerender(fixture([primary, secondary]));
  await waitFor(() => expect(equipment('L-1')).toHaveAttribute('aria-expanded', 'false'));
  expect(applied()).toHaveTextContent('E-2');
  fireEvent.click(equipment('L-1'));
  expect(selected()).toEqual(['L-1']);
  expect(applied()).toHaveTextContent('unfiltered');
});

it('does not render an unchanged writer cell after an unrelated binding render or selection', async () => {
  const renderCell = vi.fn<React.ComponentProps<typeof AnalysisSelectionCell>['render']>((chosen, handlers) =>
    <div role="gridcell" aria-selected={chosen} {...handlers}>E-1</div>);
  const bindingColumns = [columns[0], { ...columns[1], analysisSelectionOutput: lotOutput }];
  const cell = <AnalysisSelectionCell output={output} value="E-1" enabled navigate={undefined} render={renderCell} />;
  function Fixture() {
    const [focused, setFocused] = useState(false);
    const lots = useAnalysisSelectionOutput(lotOutput.panelId, lotOutput.key);
    return <>
      <button onFocus={() => setFocused(true)}>{focused ? 'Focused' : 'Focus outside'}</button>
      <button onClick={() => lots.select({ shape: 'set', values: ['L-1'] })}>Select lot</button>
      <TableAnalysisOutputs columns={bindingColumns}>{cell}</TableAnalysisOutputs>
    </>;
  }
  render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter}><Fixture /></PlatformProvider></I18nProvider>);
  await screen.findByRole('gridcell', { name: 'E-1' });
  renderCell.mockClear();
  act(() => screen.getByRole('button', { name: 'Focus outside' }).focus());
  expect(renderCell).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Select lot' }));
  expect(new URLSearchParams(window.location.search).getAll(lotOutput.key)).toEqual(['L-1']);
  expect(renderCell).not.toHaveBeenCalled();
});
