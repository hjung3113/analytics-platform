import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { stubCompactTableGeometry } from '../../testing';
import { PlatformDataTable, type PlatformColumn, type PlatformDataTableProps } from '../PlatformDataTable';
import * as download from '../download';
import { Profiler } from 'react';

type Row = { id: string; line: string; a: number; b: number; c: number };
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: 'Overview', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: 'Home', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', features: { export: true, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const session = testSession(['platform:view'], { user: { id: 'width-user' } });
const adapter = testAdapter({ session: () => session });
const columns: PlatformColumn<Row>[] = [
  { id: 'line', header: 'Line', size: 100, groupable: true },
  { id: 'a', header: 'First', size: 300, columnGroup: ['A'], cell: () => <button>cell action</button> },
  { id: 'b', header: 'Second', size: 300, columnGroup: ['A'], subtotal: true },
  { id: 'c', header: 'Third', size: 300, columnGroup: ['A'] },
];
const rows: Row[] = [{ id: 'r1', line: 'L', a: 1, b: 2, c: 3 }];
type Extra = Partial<Pick<PlatformDataTableProps<Row>, 'columns' | 'columnGroups' | 'columnDividers' | 'rows' | 'rowAction' | 'exportRows' | 'pageSize'>>;
function Harness(extra: Extra) {
  return <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
    <PlatformDataTable title="Widths" ariaLabel="width table" columns={columns} columnGroups={{ A: { label: 'Group A', width: 320 } }}
      rows={rows} getRowId={row => row.id} preferenceKey="widths" height={300} rowAction={() => <button>mark</button>} {...extra} />
  </PlatformProvider></I18nProvider>;
}
let restore: () => void;
beforeEach(() => { restore = stubCompactTableGeometry(800); vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('PointerEvent', MouseEvent); });
afterEach(() => { cleanup(); restore(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const ready = () => screen.findByRole('button', { name: 'mark' });
const clip = (root: ParentNode = document) => root.querySelector<HTMLElement>('[data-column-group-clip][data-group-id="A"]')!;
const header = () => screen.getByRole('columnheader', { name: 'Group A' });
const body = () => screen.getByRole('button', { name: 'mark' }).closest<HTMLElement>('[role=row]')!;
const save = (sizing: Record<string, number> = {}, left: string[] = []) => localStorage.setItem('platform:columns:v1:width-user:widths', JSON.stringify({ sizing, visibility: {}, pinning: { left, right: [] }, order: [] }));
const offset = () => {
  const transform = (clip().firstElementChild as HTMLElement).style.transform;
  const variable = transform.match(/var\((--[^,]+)/)?.[1];
  return variable ? parseFloat(screen.getByRole('table').style.getPropertyValue(variable)) || 0 : 0;
};
const drag = (target: Element, distance: number, release: Element = target) => {
  fireEvent.pointerDown(target, { button: 0, clientX: 250, clientY: 100 });
  fireEvent.pointerMove(target, { clientX: 250 - distance, clientY: 100 });
  fireEvent.pointerUp(release, { clientX: 250 - distance, clientY: 100 });
};

describe('declared column group width (#2418 N2)', () => {
  it('clips every header and body unit to exactly W without making a scroll container', async () => {
    render(<Harness />); await ready();
    const boxes = document.querySelectorAll('[data-column-group-clip]');
    expect(boxes).toHaveLength(3);
    boxes.forEach(box => {
      expect(box).toHaveStyle({ width: '320px', overflow: 'clip', 'flex-shrink': '0' });
      expect((box as HTMLElement).style.touchAction).toBe('pan-y');
    });
    expect(header()).toHaveAttribute('tabindex', '0');
    expect(header()).toHaveAccessibleDescription('←/→ 키로 묶음 안의 열을 넘겨 봅니다');
    expect(clip(body()).querySelector('[data-column=b]')).toHaveStyle({ width: '300px' });
  });
  it('draws the group edge on every row\'s clip box, which does not pan, and member dividers only on request', async () => {
    const view = render(<Harness />); await ready();
    const boxes = [...document.querySelectorAll<HTMLElement>('[data-column-group-clip][data-group-id="A"]')];
    expect(boxes.length).toBeGreaterThanOrEqual(3);
    boxes.forEach(box => expect(box).toHaveClass('border-l', 'border-l-border-control'));
    expect(document.querySelector('[data-column-group-clip] [role=cell].border-l, [data-column-group-clip] [role=columnheader].border-l')).toBeNull();
    view.rerender(<Harness columnDividers />);
    const members = [...clip(body()).querySelectorAll<HTMLElement>('[role=cell]')];
    expect(members.map(cell => cell.classList.contains('border-l-border-subtle'))).toEqual([false, true, true]);
  });
  it('scales W with the large table size', async () => {
    localStorage.setItem('platform:table-size:width-user', 'large');
    render(<Harness />); await ready();
    expect(parseFloat(clip().style.width)).toBeCloseTo(369.230769, 5);
  });
  it('stretches narrow members proportionally and leaves no pan stop', async () => {
    render(<Harness columns={columns.map(c => c.columnGroup ? { ...c, size: c.id === 'a' ? 60 : 90 } : c)} />); await ready();
    expect(clip(body()).querySelector('[data-column=a]')).toHaveStyle({ width: '80px' });
    expect(clip(body()).querySelector('[data-column=b]')).toHaveStyle({ width: '120px' });
    expect(clip(body()).querySelector('[data-column=c]')).toHaveStyle({ width: '120px' });
    expect(header()).not.toHaveAttribute('tabindex');
    expect(clip()).not.toHaveClass('cursor-grab');
  });
  it('counts W for table width, left offsets, fill and the action pin fit; sticks the box only', async () => {
    restore(); restore = stubCompactTableGeometry(700);
    vi.stubGlobal('localStorage', memoryStorage());
    save({}, ['a', 'line']);
    const stored = JSON.parse(localStorage.getItem('platform:columns:v1:width-user:widths')!);
    localStorage.setItem('platform:columns:v1:width-user:widths', JSON.stringify({ ...stored, order: ['a', 'b', 'c', 'line', 'id'] }));
    render(<Harness columns={[...columns, { id: 'id', header: 'ID', size: 80 }]} />); await ready();
    expect(screen.getByRole('table')).toHaveStyle({ width: '700px' });
    expect(clip()).toHaveStyle({ position: 'sticky', left: '0px', width: '320px' });
    expect(screen.getByRole('columnheader', { name: 'Line' })).toHaveStyle({ position: 'sticky', left: '320px' });
    expect(body().querySelector('[data-column=_action]')).toHaveStyle({ position: 'sticky', right: '0px', width: '128px' });
    expect(clip(body()).querySelector('[data-column=a]')).toHaveStyle({ position: 'relative' });
    expect(body().querySelector('[data-column=id]')).toHaveStyle({ width: '152px' });
  });
  it('ignores stored member sizing without deleting it and removes their resize handles', async () => {
    save({ a: 600 });
    const view = render(<Harness />); await ready();
    expect(clip(body()).querySelector('[data-column=a]')).toHaveStyle({ width: '300px' });
    expect(document.querySelector('[data-column-group-clip] [data-column-resizer]')).toBeNull();
    expect(JSON.parse(localStorage.getItem('platform:columns:v1:width-user:widths')!).sizing.a).toBe(600);
    view.rerender(<Harness columnGroups={{ A: 'Group A' }} />);
    expect(body().querySelector('[data-column=a]')).toHaveStyle({ width: '600px' });
  });
  it('draws the pin fade at the clip edge rather than at each pinned member boundary', async () => {
    save({}, ['a']);
    render(<Harness />); await ready();
    fireEvent.scroll(screen.getByRole('table').parentElement!, { target: { scrollLeft: 100 } });
    expect(clip(body()).querySelector('[data-column=a]')).not.toHaveClass('before:left-full');
    expect(screen.getByRole('columnheader', { name: 'Group A, First' })).not.toHaveClass('before:left-full');
    expect(clip(body())).toHaveAttribute('data-pan-right', 'true');
    expect(clip(body())).toHaveClass('after:right-0');
  });
  it.each<{ labels: NonNullable<PlatformDataTableProps<Row>['columnGroups']>; columns: PlatformColumn<Row>[]; error: string }>([
    { labels: { A: { label: 'Group A', width: 59 } }, columns, error: 'at least 60' },
    { labels: { A: { label: 'Group A', width: Number.POSITIVE_INFINITY } }, columns, error: 'finite' },
    { labels: { A: 'Group A', inner: { label: 'Inner', width: 320 } }, columns: columns.map(c => c.columnGroup ? { ...c, columnGroup: ['A', 'inner'] } : c), error: 'top-level' },
  ])('reports width declaration error: $error', async ({ labels, columns, error }) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Harness columns={columns} columnGroups={labels} />); await ready();
    expect(log.mock.calls.flat().join(' ')).toContain(error);
  });
  it('keeps label-only N1 groups unwrapped and resizable', async () => {
    render(<Harness columnGroups={{ A: 'Group A' }} />); await ready();
    expect(document.querySelector('[data-column-group-clip]')).toBeNull();
    expect(document.querySelector('[data-column=a] [data-column-resizer]')).toBeTruthy();
    expect(header()).not.toHaveAttribute('tabindex');
  });
  it('keeps clicks below threshold and swallows only the click immediately after a pan', async () => {
    const clicked = vi.fn();
    render(<Harness columns={columns.map(c => c.id === 'a' ? { ...c, cell: () => <button onClick={clicked}>cell action</button> } : c)} />); await ready();
    const target = screen.getByRole('button', { name: 'cell action' });
    drag(target, 4); fireEvent.click(target);
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(offset()).toBe(0);
    drag(target, 120); fireEvent.click(target);
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(offset()).toBe(120);
    await new Promise(resolve => setTimeout(resolve, 0));
    fireEvent.click(target);
    expect(clicked).toHaveBeenCalledTimes(2);
  });
  it('ends outside the table, clears the temporary cursor and leaves the next plain click working', async () => {
    const clicked = vi.fn();
    render(<Harness rowAction={() => <button onClick={clicked}>mark</button>} />); await ready();
    drag(clip(body()).querySelector('[data-column=b]')!, 120, document.body);
    expect(offset()).toBe(120);
    expect(screen.getByRole('table')).not.toHaveClass('select-none', 'cursor-grabbing');
    await new Promise(resolve => setTimeout(resolve, 0));
    fireEvent.click(screen.getByRole('button', { name: 'mark' }));
    expect(clicked).toHaveBeenCalledTimes(1);
  });
  it('keeps a small header gesture as a sort click', async () => {
    render(<Harness />); await ready();
    const heading = screen.getByRole('columnheader', { name: 'Group A, Second' });
    const button = heading.querySelector('button')!;
    drag(button, 3); fireEvent.click(button);
    expect(heading).toHaveAttribute('aria-sort', 'descending');
    expect(offset()).toBe(0);
  });
  it('updates intermediate drag frames through the CSS variable without React commits', async () => {
    const committed = vi.fn();
    render(<Profiler id="pan" onRender={committed}><Harness /></Profiler>); await ready();
    const target = clip(body());
    fireEvent.pointerDown(target, { button: 0, clientX: 250, clientY: 100 });
    fireEvent.pointerMove(target, { clientX: 130, clientY: 100 });
    await waitFor(() => expect(offset()).toBe(120));
    committed.mockClear();
    fireEvent.pointerMove(target, { clientX: 120, clientY: 100 });
    await waitFor(() => expect(offset()).toBe(130));
    fireEvent.pointerMove(target, { clientX: 110, clientY: 100 });
    await waitFor(() => expect(offset()).toBe(140));
    expect(committed).not.toHaveBeenCalled();
    fireEvent.pointerUp(target, { clientX: 110, clientY: 100 });
  });
  it('does not arm from editable controls, a resize handle or a secondary button', async () => {
    render(<Harness columns={columns.map(c => c.id === 'a' ? { ...c, cell: () => <><input aria-label="edit" /><span data-column-resizer>resize</span></> } : c)} />); await ready();
    drag(screen.getByRole('textbox', { name: 'edit' }), 120);
    drag(screen.getByText('resize'), 120);
    const target = clip(body());
    fireEvent.pointerDown(target, { button: 2, clientX: 250 });
    fireEvent.pointerMove(target, { clientX: 130 });
    fireEvent.pointerUp(target);
    expect(offset()).toBe(0);
  });
  it('requires horizontal intent and cancels cleanly', async () => {
    render(<Harness />); await ready();
    const target = clip(body());
    fireEvent.pointerDown(target, { button: 0, clientX: 250, clientY: 100 });
    fireEvent.pointerMove(target, { clientX: 240, clientY: 120 });
    fireEvent.pointerCancel(target);
    expect(offset()).toBe(0);
    fireEvent.pointerDown(target, { button: 0, clientX: 250, clientY: 100 });
    fireEvent.pointerMove(target, { clientX: 130, clientY: 100 });
    fireEvent.lostPointerCapture(screen.getByRole('table'));
    expect(offset()).toBe(120);
    expect(screen.getByRole('table')).not.toHaveClass('cursor-grabbing');
  });
  it('pans horizontal/Shift wheel only when it can move and lets edge/vertical wheels propagate', async () => {
    render(<Harness />); await ready();
    const target = clip(body());
    const wheel = (init: WheelEventInit) => {
      const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
      fireEvent(target, event); return event.defaultPrevented;
    };
    expect(wheel({ deltaY: -120, shiftKey: true })).toBe(false);
    expect(wheel({ deltaY: 120 })).toBe(false);
    expect(wheel({ deltaY: 120, shiftKey: true })).toBe(true);
    expect(offset()).toBe(120);
    expect(wheel({ deltaX: 900 })).toBe(true);
    expect(offset()).toBe(580);
    expect(wheel({ deltaX: 20 })).toBe(false);
  });
  it('pans by keyboard boundaries, updates both edge cues, and keeps other groups independent', async () => {
    render(<Harness columns={[...columns, { id: 'id', header: 'ID', size: 600, columnGroup: ['B'] }]} columnGroups={{ A: { label: 'Group A', width: 320 }, B: { label: 'Group B', width: 320 } }} />); await ready();
    expect(clip()).toHaveAttribute('data-pan-right', 'true');
    fireEvent.keyDown(header(), { key: 'ArrowRight' });
    expect(offset()).toBe(300);
    expect(clip()).toHaveAttribute('data-pan-left', 'true');
    const b = document.querySelector<HTMLElement>('[data-column-group-clip][data-group-id=B]')!;
    const bVar = (b.firstElementChild as HTMLElement).style.transform.match(/var\((--[^,]+)/)![1];
    expect(screen.getByRole('table').style.getPropertyValue(bVar)).toBe('0px');
    fireEvent.keyDown(header(), { key: 'End' }); expect(offset()).toBe(580);
    expect(clip()).toHaveAttribute('data-pan-right', 'false');
    fireEvent.keyDown(header(), { key: 'ArrowLeft' }); expect(offset()).toBe(300);
    fireEvent.keyDown(header(), { key: 'Home' }); expect(offset()).toBe(0);
  });
  it('reveals a focused clipped cell without scrolling its clip box', async () => {
    render(<Harness columns={columns.map(c => c.id === 'c' ? { ...c, cell: () => <button>last cell</button> } : c)} />); await ready();
    const box = clip(body());
    vi.spyOn(box, 'getBoundingClientRect').mockReturnValue({ left: 100, right: 420, width: 320 } as DOMRect);
    vi.spyOn(screen.getByRole('button', { name: 'last cell' }).closest('[role=cell]')!, 'getBoundingClientRect').mockReturnValue({ left: 700, right: 1000, width: 300 } as DOMRect);
    fireEvent.focusIn(screen.getByRole('button', { name: 'last cell' }));
    expect(offset()).toBe(580);
    expect(box.scrollLeft).toBe(0);
  });
  it('reveals the focused control, not the cell start, when the cell is wider than the group', async () => {
    const wide: PlatformColumn<Row>[] = [
      { id: 'line', header: 'Line', size: 100 },
      { id: 'a', header: 'Wide', size: 600, align: 'right', columnGroup: ['A'], cell: () => <button>edge action</button> },
    ];
    render(<Harness columns={wide} />); await ready();
    const box = clip(body());
    const button = screen.getByRole('button', { name: 'edge action' });
    const at = (travel: number) => {
      vi.spyOn(button.closest('[role=cell]')!, 'getBoundingClientRect').mockReturnValue({ left: 100 - travel, right: 700 - travel, width: 600 } as DOMRect);
      vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({ left: 620 - travel, right: 680 - travel, width: 60 } as DOMRect);
    };
    vi.spyOn(box, 'getBoundingClientRect').mockReturnValue({ left: 100, right: 420, width: 320 } as DOMRect);
    at(0);
    fireEvent.focusIn(button);
    expect(offset()).toBe(260);
    fireEvent.keyDown(header(), { key: 'End' });
    expect(offset()).toBe(280);
    at(280);
    fireEvent.focusIn(button);
    expect(offset()).toBe(280);
  });
  it('keeps travel across row reloads and clamps it after hiding a member without persisting the offset', async () => {
    const view = render(<Harness />); await ready();
    fireEvent.keyDown(header(), { key: 'End' }); expect(offset()).toBe(580);
    view.rerender(<Harness rows={[{ ...rows[0], b: 20 }]} />); await ready();
    expect(offset()).toBe(580);
    fireEvent.click(screen.getByRole('button', { name: '컬럼' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Third' }));
    await waitFor(() => expect(offset()).toBe(280));
    expect(Object.keys(JSON.parse(localStorage.getItem('platform:columns:v1:width-user:widths')!)).sort()).toEqual(['order', 'pinning', 'sizing', 'visibility']);
  });
  it('keeps the pan offset across a page change', async () => {
    render(<Harness rows={[...rows, { ...rows[0], id: 'r2', line: 'Next' }]} pageSize={1} />); await ready();
    fireEvent.keyDown(header(), { key: 'End' }); expect(offset()).toBe(580);
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(body()).toHaveAttribute('data-row-id', 'r2'));
    expect(offset()).toBe(580);
  });
  it('exports all member columns in grouped order with identical CSV after a nonzero pan', async () => {
    const downloaded = vi.spyOn(download, 'downloadBlob').mockImplementation(() => {});
    render(<Harness exportRows={async () => ({ outcome: 'ok', data: rows, trust: null, assessments: [], correlationId: 'export' })} />); await ready();
    const csv = async () => {
      await userEvent.click(screen.getByRole('button', { name: /^내보내기/ }));
      await userEvent.click(await screen.findByRole('menuitem', { name: '필터 결과 전체 1행을 CSV로 내보내기' }));
      await waitFor(() => expect(downloaded).toHaveBeenCalled());
      const blob = downloaded.mock.calls.at(-1)![0];
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsText(blob);
      });
      downloaded.mockClear(); return text;
    };
    const original = await csv();
    expect(original).toContain('Line,Group A › First,Group A › Second,Group A › Third');
    expect(original).toContain('L,1,2,3');
    fireEvent.keyDown(header(), { key: 'End' }); expect(offset()).toBe(580);
    expect(await csv()).toBe(original);
  });
  it('keeps pinned row-group clips and lead offsets aligned to W', async () => {
    save({}, ['a']);
    render(<Harness />); await ready();
    await userEvent.click(screen.getByRole('button', { name: /^그룹: / }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Line' }));
    await waitFor(() => expect(document.querySelector('[data-group-row]')).toBeTruthy());
    const groupRow = document.querySelector<HTMLElement>('[data-group-row]')!;
    expect(clip(groupRow)).toHaveStyle({ width: '320px', position: 'sticky', left: '0px' });
    expect(groupRow.querySelector('[data-group-lead]')).toHaveStyle({ left: '320px' });
    expect(groupRow.querySelector('[data-column=b]')).toHaveStyle({ width: '300px', position: 'relative' });
  });
  it('keeps row-group cells in one box when the first subtotal is the second member', async () => {
    render(<Harness />); await ready();
    await userEvent.click(screen.getByRole('button', { name: /^그룹: / }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Line' }));
    await waitFor(() => expect(document.querySelector('[data-group-row]')).toBeTruthy());
    const groupRow = document.querySelector<HTMLElement>('[data-group-row]')!;
    expect(groupRow.querySelectorAll('[data-column-group-clip]')).toHaveLength(1);
    expect(clip(groupRow)).toHaveStyle({ width: '320px' });
    expect(clip(groupRow).querySelectorAll('[role=cell]')).toHaveLength(3);
    expect(clip(groupRow).querySelector('[data-group-subtotal]')).toHaveAttribute('data-column', 'b');
    expect(groupRow.querySelector('[data-group-lead]')).toHaveStyle({ left: '0px' });
    const transform = () => (clip(groupRow).firstElementChild as HTMLElement).style.transform;
    expect(transform()).toBe((clip(body()).firstElementChild as HTMLElement).style.transform);
    fireEvent.keyDown(header(), { key: 'ArrowRight' });
    expect(offset()).toBe(300);
    expect(transform()).toBe((clip(body()).firstElementChild as HTMLElement).style.transform);
  });
});
