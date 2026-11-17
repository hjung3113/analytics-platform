// Ported from the confirmed prototype: non-adjacent create, rename, resize, reset, move/pin and owner changes.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace, ToastProbe } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { stubCompactTableGeometry } from '../../testing';
import { PlatformDataTable, type PlatformColumn } from '../PlatformDataTable';
import { columnGroupBasis } from '../columnGroups';

type Row = { id: string };
const registry = createRegistry({ spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const session = testSession(['platform:view'], { user: { id: 'group-user' } });
const adapter = testAdapter({ session: () => session });
const columns: PlatformColumn<Row>[] = [
  { id: 'first', header: '첫째', size: 200 }, { id: 'fixed', header: '고정 열', columnGroup: ['developer'] },
  { id: 'middle', header: '중간', size: 200 }, { id: 'last', header: '마지막', size: 200 },
];
const labels = { developer: '개발자 묶음' };
const rows: Row[] = [{ id: 'row' }];
const key = 'platform:columns:v1:group-user:editable-groups';
function Harness({ enabled = true, preferenceKey = 'editable-groups' }: { enabled?: boolean; preferenceKey?: string }) {
  return <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
    <PlatformDataTable editableColumnGroups={enabled} title="T" ariaLabel="editable" columns={columns} columnGroups={labels} rows={rows} getRowId={r => r.id} preferenceKey={preferenceKey} height={300} rowAction={() => <button>ready</button>} />
    <ToastProbe />
  </PlatformProvider></I18nProvider>;
}
let restore: () => void;
beforeEach(() => { restore = stubCompactTableGeometry(1100); vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('PointerEvent', MouseEvent); });
afterEach(() => { cleanup(); restore(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });
const mount = async (enabled = true) => { const view = render(<Harness enabled={enabled} />); await screen.findByRole('button', { name: 'ready' }); return view; };
const leaves = () => [...screen.getByRole('table').querySelectorAll('[role=rowgroup]')[0].lastElementChild!.querySelectorAll('[data-column]')].map(el => el.getAttribute('data-column'));
const header = (id: string) => screen.getByRole('table').querySelector<HTMLElement>(`[role=columnheader][data-column="${id}"]`)!;
const stored = () => JSON.parse(localStorage.getItem(key)!);
async function start() { await userEvent.click(screen.getByRole('button', { name: '컬럼' })); await userEvent.click(screen.getByRole('button', { name: '묶음 만들기' })); }
async function create() {
  await start();
  expect(screen.getByRole('button', { name: '묶기' })).toBeDisabled();
  await userEvent.click(screen.getByRole('checkbox', { name: '첫째 선택' }));
  await userEvent.click(screen.getByRole('checkbox', { name: '마지막 선택' }));
  await userEvent.type(screen.getByRole('textbox', { name: '묶음 이름' }), '비교');
  await userEvent.click(screen.getByRole('button', { name: '묶기' }));
}
async function menu(name: string, item: string) { await userEvent.click(screen.getByRole('button', { name: `${name} 메뉴` })); await userEvent.click(screen.getByRole('menuitem', { name: item })); }

describe('editable column groups (#2481)', () => {
  it('off keeps declared groups, has no new controls and preserves an existing snapshot through other writes', async () => {
    const groups = { basis: columnGroupBasis(columns, labels), items: [] };
    localStorage.setItem(key, JSON.stringify({ groups }));
    const write = vi.spyOn(localStorage, 'setItem');
    await mount(false);
    expect(header('developer')).toHaveTextContent('개발자 묶음');
    await userEvent.click(screen.getByRole('button', { name: '컬럼' }));
    expect(screen.queryByRole('button', { name: '묶음 만들기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '개발자 묶음 메뉴' })).toBeNull();
    expect(write).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('checkbox', { name: '중간' }));
    expect(stored().groups).toEqual(groups);
  });
  it('off without a snapshot writes the old format', async () => {
    await mount(false); await userEvent.click(screen.getByRole('button', { name: '컬럼' }));
    await userEvent.click(screen.getByRole('checkbox', { name: '중간' }));
    expect(stored()).not.toHaveProperty('groups');
  });
  it('chooses in a separate view, includes hidden and declared members, and Escape returns to visibility', async () => {
    localStorage.setItem(key, JSON.stringify({ visibility: { last: false } }));
    await mount(); await start();
    expect(screen.getByRole('checkbox', { name: '고정 열 선택' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: '고정 열 선택' }).closest('li')).toHaveTextContent('개발자 묶음');
    expect(screen.getByRole('checkbox', { name: '마지막 선택' }).closest('li')).toHaveTextContent('숨김');
    expect(screen.queryByRole('checkbox', { name: '첫째' })).toBeNull();
    expect(screen.queryByRole('button', { name: '첫째 위로' })).toBeNull();
    expect(screen.queryByRole('button', { name: '첫째 왼쪽 고정' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: '묶음 이름' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: '마지막' })).not.toBeChecked();
  });
  it('creates non-adjacent columns, writes gathered order atomically, moves/pins the group and restores defaults', async () => {
    await mount(); await create();
    const group = stored().groups.items.find((item: { label?: string }) => item.label === '비교');
    expect(header(group.id)).toHaveAttribute('aria-colspan', '2');
    expect(leaves()).toEqual(['first', 'last', 'fixed', 'middle', '_action']);
    expect(stored().order).toEqual(['first', 'last', 'fixed', 'middle']);
    expect(stored().groups.items[0]).toEqual({ id: 'developer', members: ['fixed'] });
    expect(screen.getByRole('list', { name: 'toasts' })).toHaveTextContent('‹비교› 묶음을 만들었습니다');
    await userEvent.click(screen.getByRole('button', { name: '비교 아래로' }));
    expect(leaves()).toEqual(['fixed', 'first', 'last', 'middle', '_action']);
    await userEvent.click(screen.getByRole('button', { name: '마지막 위로' }));
    expect(leaves()).toEqual(['fixed', 'last', 'first', 'middle', '_action']);
    await userEvent.click(screen.getByRole('button', { name: '비교 왼쪽 고정' }));
    expect(header(group.id)).toHaveStyle({ position: 'sticky', left: '0px' });
    await userEvent.click(screen.getByRole('button', { name: '기본값으로' }));
    expect(header(group.id)).toBeNull();
    expect(header('developer')).toHaveTextContent('개발자 묶음');
    expect(stored()).not.toHaveProperty('groups');
  });
  it('renames on Enter/blur, cancels with Escape and edits/ungroups a developer group', async () => {
    await mount(); await userEvent.click(screen.getByRole('button', { name: '컬럼' }));
    await menu('개발자 묶음', '이름 바꾸기');
    let input = screen.getByRole('textbox', { name: '묶음 이름' });
    await userEvent.clear(input); await userEvent.type(input, 'Renamed{Enter}');
    expect(header('developer')).toHaveTextContent('Renamed');
    await menu('Renamed', '이름 바꾸기');
    input = screen.getByRole('textbox', { name: '묶음 이름' });
    await userEvent.clear(input); await userEvent.type(input, 'Cancel{Escape}');
    expect(header('developer')).toHaveTextContent('Renamed');
    await menu('Renamed', '이름 바꾸기');
    input = screen.getByRole('textbox', { name: '묶음 이름' });
    fireEvent.change(input, { target: { value: 'Blur' } }); fireEvent.blur(input);
    expect(header('developer')).toHaveTextContent('Blur');
    await menu('Blur', '열 넣고 빼기');
    await userEvent.click(screen.getByRole('checkbox', { name: '첫째 선택' }));
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(header('developer')).toHaveAttribute('aria-colspan', '2');
    await menu('Blur', '묶음 풀기');
    expect(header('developer')).toBeNull();
    expect(stored().groups.items).toEqual([]);
    expect(screen.getByRole('list', { name: 'toasts' })).toHaveTextContent('‹Blur› 묶음을 풀었습니다');
  });
  it('hidden members stay hidden and editing requires at least one member', async () => {
    localStorage.setItem(key, JSON.stringify({ visibility: { last: false } }));
    await mount(); await create();
    const group = stored().groups.items.find((item: { label?: string }) => item.label === '비교');
    expect(header(group.id)).toHaveAttribute('aria-colspan', '1');
    expect(stored().visibility.last).toBe(false);
    await menu('비교', '열 넣고 빼기');
    for (const name of ['첫째 선택', '마지막 선택']) await userEvent.click(screen.getByRole('checkbox', { name }));
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });
  it('does not submit a rename on the Enter immediately following IME compositionend', async () => {
    await mount(); await userEvent.click(screen.getByRole('button', { name: '컬럼' }));
    await menu('개발자 묶음', '이름 바꾸기');
    const input = screen.getByRole('textbox', { name: '묶음 이름' });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '새 이름' } });
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('textbox', { name: '묶음 이름' })).toBe(input);
    expect(header('developer')).toHaveTextContent('개발자 묶음');
  });
  it('a pinned and an unpinned chosen member pin the entire new group (D12)', async () => {
    localStorage.setItem(key, JSON.stringify({ pinning: { left: ['first'] } }));
    await mount(); await create();
    expect(leaves().slice(0, 2)).toEqual(['first', 'last']);
    expect(screen.getByRole('button', { name: '비교 왼쪽 고정' })).toHaveAttribute('aria-pressed', 'true');
    expect(header('last')).toHaveStyle({ position: 'sticky', left: '200px' });
  });
  it('width drag debounces once, supports pan/keyboard/clear, and restores a previously dragged member width', async () => {
    localStorage.setItem(key, JSON.stringify({ sizing: { first: 177 } }));
    await mount(); await create();
    await userEvent.keyboard('{Escape}');
    const group = stored().groups.items.find((item: { label?: string }) => item.label === '비교');
    const resize = () => within(header(group.id)).getByRole('separator');
    expect(header('first')).toHaveStyle({ width: '177px' });
    vi.useFakeTimers();
    const write = vi.spyOn(localStorage, 'setItem');
    const initialWidth = Number(resize().getAttribute('aria-valuenow'));
    fireEvent.pointerDown(resize(), { button: 0, pointerId: 1, clientX: 500 });
    for (const width of [160, 120]) fireEvent.pointerMove(window, { pointerId: 1, clientX: 500 + width - initialWidth });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 500 + 120 - initialWidth });
    expect(write).not.toHaveBeenCalled();
    expect(header(group.id).closest('[data-column-group-clip]')).toHaveStyle({ width: '120px' });
    expect(header('first')).toHaveStyle({ width: '200px' });
    act(() => vi.advanceTimersByTime(299)); expect(write).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1)); expect(write).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(header(group.id), { key: 'ArrowRight' });
    expect(header(group.id)).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(resize(), { key: 'ArrowLeft' });
    expect(header(group.id).closest('[data-column-group-clip]')).toHaveStyle({ width: '100px' });
    fireEvent.keyDown(resize(), { key: 'Home' });
    expect(header(group.id).closest('[data-column-group-clip]')).toBeNull();
    expect(header('first')).toHaveStyle({ width: '177px' });
    fireEvent.keyDown(resize(), { key: 'ArrowRight' });
    fireEvent.doubleClick(resize());
    expect(header(group.id).closest('[data-column-group-clip]')).toBeNull();
  });
  it('drops an open draft when the table owner changes', async () => {
    const view = await mount(); await start();
    await userEvent.type(screen.getByRole('textbox', { name: '묶음 이름' }), 'Draft');
    view.rerender(<Harness preferenceKey="other-table" />);
    expect(screen.queryByRole('textbox', { name: '묶음 이름' })).toBeNull();
  });
  it('preserves existing cell state when a group label changes', async () => {
    const cellColumns = columns.map(c => c.id === 'first' ? { ...c, cell: () => <input aria-label="cell draft" defaultValue="" /> } : c);
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
      <PlatformDataTable editableColumnGroups title="T" ariaLabel="editable" columns={cellColumns} columnGroups={labels} rows={rows} getRowId={r => r.id} preferenceKey="editable-groups" height={300} />
    </PlatformProvider></I18nProvider>);
    const input = await screen.findByRole('textbox', { name: 'cell draft' });
    await userEvent.type(input, 'typed');
    await userEvent.click(screen.getByRole('button', { name: '컬럼' }));
    await menu('개발자 묶음', '이름 바꾸기');
    const name = screen.getByRole('textbox', { name: '묶음 이름' });
    fireEvent.change(name, { target: { value: 'Renamed' } }); fireEvent.keyDown(name, { key: 'Enter' });
    expect(screen.getByRole('textbox', { name: 'cell draft' })).toBe(input);
    expect(input).toHaveValue('typed');
  });
  it('keeps keyboard focus on the group resizer when setting and clearing a width', async () => {
    await mount();
    const resize = () => within(header('developer')).getByRole('separator');
    resize().focus();
    fireEvent.keyDown(resize(), { key: 'ArrowRight' });
    expect(resize()).toHaveFocus();
    fireEvent.keyDown(resize(), { key: 'Home' });
    expect(resize()).toHaveFocus();
  });
  it('stores group widths in unscaled px at the large table size', async () => {
    localStorage.setItem('platform:table-size:group-user', 'large');
    await mount();
    vi.useFakeTimers();
    const resize = within(header('developer')).getByRole('separator');
    const initialWidth = Number(resize.getAttribute('aria-valuenow'));
    fireEvent.pointerDown(resize, { button: 0, pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 500 + 150 - initialWidth });
    fireEvent.pointerUp(window, { pointerId: 1 });
    act(() => vi.advanceTimersByTime(300));
    expect(stored().groups.items[0].width).toBeCloseTo(130);
    expect(stored().groups.items[0]).not.toHaveProperty('label');
  });
});
