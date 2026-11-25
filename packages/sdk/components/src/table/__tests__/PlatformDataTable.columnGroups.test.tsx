import userEvent from '@testing-library/user-event';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId, type ColumnFilter, type TableQuery } from '@ap/contracts';
import { stubCompactTableGeometry } from '../../testing';
import { PlatformDataTable, type PlatformColumn, type PlatformDataTableProps } from '../PlatformDataTable';

// #1672: the `rows` input — the table filters, groups, sorts and pages rows the page already holds.
type Row = { id: string; score: number; line: string; qty: number };
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const exportRegistry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'export-menu' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'export-menu', group: groupId('overview'), primary: true, label: { ko: '내보내기', en: 'Export' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: { export: true, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const axes = [{ id: 'maker', label: { ko: 'Maker', en: 'Maker' }, membershipHistory: false }];
const session = testSession(['platform:view'], { user: { id: 'user-a' } });
const adapter = testAdapter({ session: () => session });
let restore: (() => void) | undefined;
beforeEach(() => { restore = stubCompactTableGeometry(800); vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('PointerEvent', MouseEvent); });
afterEach(() => { cleanup(); restore?.(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });


const rows: Row[] = [{ id: 'r1', score: 3, line: 'A', qty: 4 }];
const columns: PlatformColumn<Row>[] = [
  { id: 'line', header: 'Line', groupable: true },
  { id: 'score', header: 'Value', columnGroup: ['A'], filter: { kind: 'number' } },
  { id: 'qty', header: 'Qty', columnGroup: ['A'], subtotal: true },
];
function Harness(extra: Partial<Pick<PlatformDataTableProps<Row>, 'columns' | 'columnGroups' | 'columnDividers' | 'rowAction' | 'bulkActions'>>) {
  return <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
    <PlatformDataTable title="T" ariaLabel="table" rows={rows} columns={columns} columnGroups={{ A: 'Equipment A' }}
      getRowId={r => r.id} preferenceKey="column-groups" height={300} rowAction={r => <button>{r.id}</button>} {...extra} />
  </PlatformProvider></I18nProvider>;
}
const headerRows = () => within(screen.getByRole('table')).getAllByRole('rowgroup')[0].querySelectorAll('[role=row]');
const headerIds = () => [...headerRows()[headerRows().length - 1].querySelectorAll('[data-column]')].map(c => c.getAttribute('data-column'));
const save = (left: string[], order: string[] = []) => localStorage.setItem('platform:columns:v1:user-a:column-groups', JSON.stringify({ sizing: {}, visibility: {}, pinning: { left, right: [] }, order }));

describe('column groups (#2418)', () => {
  it.each<{ columns: PlatformColumn<Row>[]; labels: Readonly<Record<string, string>>; error: string }>([
    { columns: [{ id: 'score', header: 'Value', columnGroup: ['A'] }, { id: 'line', header: 'Line' }, { id: 'qty', header: 'Qty', columnGroup: ['A'] }], labels: { A: 'A' }, error: 'non-contiguous' },
    { columns: [{ id: 'score', header: 'Value', columnGroup: ['missing'] }], labels: {}, error: 'missing label' },
    { columns: [{ id: 'score', header: 'Value', columnGroup: ['score'] }], labels: { score: 'S' }, error: 'collides' },
    { columns: [{ id: 'score', header: 'Value', columnGroup: ['_select'] }], labels: { _select: 'S' }, error: 'collides' },
    { columns: [{ id: 'score', header: 'Value', columnGroup: ['_action'] }], labels: { _action: 'S' }, error: 'collides' },
    { columns: [{ id: 'score', header: 'Value', columnGroup: ['A', 'inner'] }, { id: 'qty', header: 'Qty', columnGroup: ['B', 'inner'] }], labels: { A: 'A', B: 'B', inner: 'Inner' }, error: 'parent paths' },
  ])('reports the invalid declaration in development: $error', async ({ columns, labels, error }) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Harness columns={columns} columnGroups={labels} />);
    await screen.findByRole('button', { name: 'r1' });
    expect(consoleError.mock.calls.flat().join(' ')).toContain(error);
  });
  it('keeps declaration diagnostics silent in production', async () => {
    vi.stubEnv('NODE_ENV', 'production'); // the value a production build replaces statically (#2951)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Harness columnGroups={{}} />);
    await screen.findByRole('button', { name: 'r1' });
    expect(consoleError).not.toHaveBeenCalled();
  });
  it('adds label-only header rows, unnamed placeholders and accessible leaf paths', async () => {
    render(<Harness />);
    await screen.findByRole('button', { name: 'r1' });
    expect(headerRows()).toHaveLength(2);
    expect(screen.getByRole('table')).toHaveAttribute('aria-rowcount', '3');
    expect(screen.getByRole('columnheader', { name: 'Equipment A' })).toHaveAttribute('aria-colspan', '2');
    expect(within(screen.getByRole('columnheader', { name: 'Equipment A' })).queryByRole('button')).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Equipment A' }).querySelector('[data-column-resizer]')).toBeNull();
    expect(screen.getByRole('columnheader', { name: /Equipment A, Value/ }).querySelector('[data-column-resizer]')).toBeTruthy();
    expect(screen.getAllByRole('columnheader', { name: '' })).toHaveLength(2);
    expect(screen.getByRole('columnheader', { name: /Equipment A, Value/ }).querySelector('.sr-only')).toHaveTextContent('Equipment A,');
    expect(screen.getByRole('button', { name: 'r1' }).closest('[role=row]')).toHaveAttribute('aria-rowindex', '3');
    expect(headerIds()).toEqual(['line', 'score', 'qty', '_action']);
    const placeholder = screen.getAllByRole('columnheader', { name: '' }).at(-1)!;
    expect(placeholder).toHaveStyle({ position: 'sticky', right: '0px' });
    expect(placeholder).toHaveClass('border-l-border-control');
  });
  it('keeps the selection utility in an unnamed upper placeholder and its control at the leaf row', async () => {
    render(<Harness bulkActions={() => null} />);
    await screen.findByRole('button', { name: 'r1' });
    expect(screen.getAllByRole('columnheader', { name: '' })).toHaveLength(3);
    expect(within(headerRows()[0] as HTMLElement).queryByRole('checkbox')).toBeNull();
    expect(within(headerRows()[1] as HTMLElement).getByRole('checkbox')).toBeTruthy();
    expect(headerIds()).toEqual(['_select', 'line', 'score', 'qty', '_action']);
  });
  it('sums each rendered leaf once across unequal nesting depths', async () => {
    localStorage.setItem('platform:columns:v1:user-a:column-groups', JSON.stringify({ sizing: { line: 100, score: 100, qty: 100, id: 100 }, visibility: {}, pinning: { left: [], right: [] }, order: [] }));
    render(<Harness columnGroups={{ A: 'Equipment A', inner: 'Inner' }} columns={[
      { id: 'line', header: 'Line' },
      { id: 'score', header: 'Value', columnGroup: ['A'] },
      { id: 'qty', header: 'Qty', columnGroup: ['A', 'inner'] },
      { id: 'id', header: 'ID', columnGroup: ['A', 'inner'] },
    ]} />);
    await screen.findByRole('button', { name: 'r1' });
    expect(headerRows()).toHaveLength(3);
    expect(screen.getByRole('columnheader', { name: 'Equipment A' })).toHaveStyle({ width: '300px' });
    expect(screen.getByRole('columnheader', { name: 'Inner' })).toHaveStyle({ width: '200px' });
    expect(screen.getByRole('columnheader', { name: /Equipment A, Inner, Qty/ })).toBeTruthy();
  });
  it('moves a group by its drag handle and keeps the pinned section separate', async () => {
    render(<Harness />);
    await screen.findByRole('button', { name: 'r1' });
    fireEvent.click(screen.getByRole('button', { name: '컬럼' }));
    const block = screen.getByRole('button', { name: 'Equipment A 위로' }).closest('[data-column-pref-block]')!;
    const siblings = [...block.parentElement!.children] as HTMLElement[];
    siblings.forEach((row, i) => { row.getBoundingClientRect = () => ({ top: i * 30, bottom: i * 30 + 30, left: 0, right: 100, width: 100, height: 30, x: 0, y: i * 30, toJSON: () => ({}) }); });
    const handle = block.querySelector<HTMLElement>('span[aria-hidden]')!;
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 40 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 10 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 10 });
    expect(headerIds()).toEqual(['score', 'qty', 'line', '_action']);
    fireEvent.click(screen.getByRole('button', { name: 'Equipment A 왼쪽 고정' }));
    expect(screen.getByRole('button', { name: 'Equipment A 아래로' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Line 위로' })).toBeDisabled();
  });
  it('normalizes legacy pins even without saved order', async () => {
    save(['score', 'line', 'qty']);
    render(<Harness />);
    await screen.findByRole('button', { name: 'r1' });
    expect(headerIds()).toEqual(['line', 'score', 'qty', '_action']);
    expect(screen.getByRole('columnheader', { name: 'Equipment A' })).toHaveStyle({ position: 'sticky', left: '150px' });
  });
  it('leaves a table without declarations with one header and unchanged stored shape', async () => {
    render(<Harness columns={columns.map(({ columnGroup: _group, ...c }) => c)} columnGroups={undefined} />);
    await screen.findByRole('button', { name: 'r1' });
    expect(headerRows()).toHaveLength(1);
    expect(screen.getByRole('table')).toHaveAttribute('aria-rowcount', '2');
    expect(screen.getByRole('button', { name: 'r1' }).closest('[role=row]')).toHaveAttribute('aria-rowindex', '2');
    expect(localStorage.getItem('platform:columns:v1:user-a:column-groups')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '컬럼' }));
    await userEvent.click(screen.getByRole('button', { name: 'Line 왼쪽 고정' }));
    expect(JSON.parse(localStorage.getItem('platform:columns:v1:user-a:column-groups')!)).toEqual({ sizing: {}, visibility: {}, pinning: { left: ['line'], right: [] }, order: [] });
  });
  it.each([{ left: ['score'] }, { left: ['score', 'line', 'qty'] }])('expands stored pins %j and writes full members on the next pin change', async ({ left }) => {
    save(left, ['qty', 'line', 'score']);
    render(<Harness />);
    await screen.findByRole('button', { name: 'r1' });
    expect(headerIds().slice(0, 2)).toEqual(['qty', 'score']);
    expect(screen.getByRole('columnheader', { name: /Equipment A, Value/ })).toHaveStyle({ position: 'sticky' });
    expect(JSON.parse(localStorage.getItem('platform:columns:v1:user-a:column-groups')!).pinning.left).toEqual(left);
    await userEvent.click(screen.getByRole('button', { name: '컬럼' }));
    expect(screen.queryByRole('button', { name: 'Value 왼쪽 고정' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Line 왼쪽 고정' }));
    const stored = JSON.parse(localStorage.getItem('platform:columns:v1:user-a:column-groups')!);
    expect(stored.pinning.left).toEqual(expect.arrayContaining(['qty', 'score']));
    expect(Object.keys(stored).sort()).toEqual(['order', 'pinning', 'sizing', 'visibility']);
  });
  it('moves the group block by its subheading, announces its label and keeps member moves inside', async () => {
    render(<Harness />);
    await screen.findByRole('button', { name: 'r1' });
    await userEvent.click(screen.getByRole('button', { name: '컬럼' }));
    await userEvent.click(screen.getByRole('button', { name: 'Equipment A 위로' }));
    expect(headerIds()).toEqual(['score', 'qty', 'line', '_action']);
    expect(screen.getByText(/Equipment A.*1/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Value 위로' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Qty 위로' }));
    expect(headerIds()).toEqual(['qty', 'score', 'line', '_action']);
  });
  it.each([
    { name: 'an ungrouped table', groups: undefined, move: 'Qty 위로' },
    { name: 'a grouped member move', groups: { A: 'Equipment A' }, move: 'Qty 위로' },
    { name: 'a grouped block move', groups: { A: 'Equipment A' }, move: 'Equipment A 위로' },
  ])('keeps a stateful cell mounted across a column move: $name', async ({ groups, move }) => {
    const draftColumns: PlatformColumn<Row>[] = [
      { id: 'line', header: 'Line', cell: () => <input aria-label="draft" defaultValue="" /> },
      { id: 'score', header: 'Value', ...(groups && { columnGroup: ['A'] }) },
      { id: 'qty', header: 'Qty', ...(groups && { columnGroup: ['A'] }) },
    ];
    render(<Harness columns={draftColumns} columnGroups={groups} />);
    const input = await screen.findByRole('textbox', { name: 'draft' });
    await userEvent.type(input, 'unsaved');
    await userEvent.click(screen.getByRole('button', { name: '컬럼' }));
    await userEvent.click(screen.getByRole('button', { name: move }));
    expect(headerIds()).not.toEqual(['line', 'score', 'qty', '_action']);
    expect(screen.getByRole('textbox', { name: 'draft' })).toBe(input);
    expect(input).toHaveProperty('value', 'unsaved');
  });
  it.each([
    { name: 'a block move', act: async () => userEvent.click(screen.getByRole('button', { name: 'Equipment A 위로' })) },
    { name: 'hiding the column before the group', act: async () => userEvent.click(screen.getByRole('checkbox', { name: 'Line' })) },
  ])('keeps a stateful cell inside a label-only group mounted across $name', async ({ act }) => {
    const draftColumns: PlatformColumn<Row>[] = [
      { id: 'line', header: 'Line' },
      { id: 'score', header: 'Value', columnGroup: ['A'] },
      { id: 'qty', header: 'Qty', columnGroup: ['A'], cell: () => <input aria-label="draft" defaultValue="" /> },
    ];
    render(<Harness columns={draftColumns} columnGroups={{ A: 'Equipment A' }} />);
    const input = await screen.findByRole('textbox', { name: 'draft' });
    await userEvent.type(input, 'unsaved');
    await userEvent.click(screen.getByRole('button', { name: '컬럼' }));
    await act();
    expect(headerIds()).not.toEqual(['line', 'score', 'qty', '_action']);
    expect(screen.getByRole('textbox', { name: 'draft' })).toBe(input);
    expect(input).toHaveProperty('value', 'unsaved');
  });
  it('draws a strong group edge from the header to the body, and nothing on a table without groups', async () => {
    const view = render(<Harness />);
    await screen.findByRole('button', { name: 'r1' });
    const strong = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)].filter(el => el.classList.contains('border-l-border-control') && el.getAttribute('data-column') !== '_action').map(el => el.getAttribute('data-column'));
    expect(strong('[role=cell]')).toEqual(['score']);
    expect(strong('[role=columnheader]')).toEqual(['A', 'score']);
    expect(document.querySelector('[role=cell][data-column=_action]')).toHaveClass('border-l-border-control');
    expect(document.querySelector('.border-l-border-subtle')).toBeNull();
    view.rerender(<Harness columns={columns.map(({ columnGroup: _, ...c }) => c)} columnGroups={undefined} />);
    await waitFor(() => expect(headerRows()).toHaveLength(1));
    expect(strong('[role=cell]')).toEqual([]);
    expect(strong('[role=columnheader]')).toEqual([]);
    expect(document.querySelector('.border-l-border-subtle')).toBeNull();
  });
  it('keeps the group edge in row-group header rows', async () => {
    save([], ['qty', 'score', 'line']);
    const view = render(<Harness />);
    await screen.findByRole('button', { name: 'r1' });
    await userEvent.click(screen.getByRole('button', { name: /^그룹: / }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Line' }));
    await waitFor(() => expect(view.container.querySelector('[data-group-row]')).toBeTruthy());
    expect(view.container.querySelector('[data-group-row] [data-column=line]')).toHaveClass('border-l-border-control');
  });
  it('adds quiet column dividers only when asked, with the group edge still strong', async () => {
    render(<Harness columnDividers />);
    await screen.findByRole('button', { name: 'r1' });
    const line = (id: string) => [...document.querySelector(`[role=cell][data-column=${id}]`)!.classList].filter(c => c.startsWith('border-l-'));
    expect(line('line')).toEqual([]);
    expect(line('score')).toEqual(['border-l-border-control']);
    expect(line('qty')).toEqual(['border-l-border-subtle']);
    expect(document.querySelector('[role=columnheader][data-column=qty]')).toHaveClass('border-l-border-subtle');
    expect(document.querySelector('[role=columnheader][data-column=A]')).not.toHaveClass('border-l-border-subtle');
  });
  it('hides all group members without leaving a group header', async () => {
    render(<Harness />);
    await screen.findByRole('button', { name: 'r1' });
    await userEvent.click(screen.getByRole('button', { name: '컬럼' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Value' }));
    expect(screen.getByRole('columnheader', { name: 'Equipment A' })).toHaveAttribute('aria-colspan', '1');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Qty' }));
    expect(screen.queryByRole('columnheader', { name: 'Equipment A' })).toBeNull();
  });
  it('keeps a row-group subtotal under its column after column grouping and reordering', async () => {
    save([], ['qty', 'score', 'line']);
    const view = render(<Harness />);
    await screen.findByRole('button', { name: 'r1' });
    await userEvent.click(screen.getByRole('button', { name: /^그룹: / }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Line' }));
    await waitFor(() => expect(view.container.querySelector('[data-group-row]')).toBeTruthy());
    expect(view.container.querySelector('[data-group-subtotal]')).toHaveAttribute('data-column', 'qty');
    expect(view.container.querySelector('[data-group-row]')).toHaveAttribute('aria-rowindex', '3');
  });
});
