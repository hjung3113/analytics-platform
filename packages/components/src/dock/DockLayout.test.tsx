import { useMemo, useState } from 'react';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger } from '@ap/ui';
import { DockLayout } from './DockLayout';
import { activeTabs, column, group, groupsOnScreen, installResizeObserver, mountDock, mounts, resetMounts, row } from './__tests__/harness';

const observer = installResizeObserver();
beforeAll(() => { observer.resize(900, 600); });
afterAll(() => { observer.restore(); });
beforeEach(() => { resetMounts(); });
afterEach(() => { cleanup(); });

// The engine positions its content overlays a frame after mounting; until then the visible panels are still `visibility: hidden`.
const ready = async () => {
  await screen.findAllByRole('tab');
  await waitFor(() => {
    const visible = Array.from(document.querySelectorAll<HTMLElement>('[data-dock-visible="true"]'));
    expect(visible.length).toBeGreaterThan(0);
    visible.forEach(element => { expect(element.closest<HTMLElement>('.dv-render-overlay')?.style.visibility).not.toBe('hidden'); });
  });
};
const root = (id: string) => document.querySelector<HTMLElement>(`[data-dock-panel="${id}"]`)!;

describe('DockLayout reconcile (D9: remount 0)', () => {
  it('renders the layout it is given: groups, tab order and active tabs', async () => {
    mountDock({ layout: row([60, 40], group(['a', 'b'], 'b'), group(['c'])) });
    await ready();
    expect(groupsOnScreen()).toEqual([['a', 'b'], ['c']]);
    expect(activeTabs().sort()).toEqual(['b', 'c']);
    expect(screen.getByRole('region', { name: '테스트 배치' })).toBeInTheDocument();
  });

  it.each<[string, ReturnType<typeof row>, ReturnType<typeof row>, string[][]]>([
    ['a layout change moves a panel to another group', row([50, 50], group(['a', 'b']), group(['c'])), row([50, 50], group(['a']), group(['b', 'c'])), [['a'], ['b', 'c']]],
    ['a layout change tabs two panels together', row([34, 33, 33], group(['a']), group(['b']), group(['c'])), row([50, 50], group(['a', 'b']), group(['c'])), [['a', 'b'], ['c']]],
    ['a layout change splits a group in the other axis', row([50, 50], group(['a', 'b']), group(['c'])), column([50, 50], group(['a']), row([50, 50], group(['b']), group(['c']))), [['a'], ['b'], ['c']]],
  ])('%s without remounting any panel', async (_name, from, to, expected) => {
    const { controls } = mountDock({ layout: from });
    await ready();
    controls.setLayout(to);
    await waitFor(() => { expect(groupsOnScreen()).toEqual(expected); });
    expect(mounts).toEqual({ a: 1, b: 1, c: 1 });
  });

  it('switching the active tab does not remount and shows the new tab', async () => {
    const { controls } = mountDock({ layout: row([50, 50], group(['a', 'b'], 'a'), group(['c'])) });
    await ready();
    controls.setLayout(row([50, 50], group(['a', 'b'], 'b'), group(['c'])));
    await waitFor(() => { expect(activeTabs()).toContain('b'); });
    expect(activeTabs()).not.toContain('a');
    expect(mounts).toEqual({ a: 1, b: 1, c: 1 });
  });

  it('maximize then restore does not remount, and the engine hides the other groups meanwhile', async () => {
    const { controls } = mountDock({ layout: row([50, 50], group(['a', 'b']), group(['c'])) });
    await ready();
    controls.setMaximized('c');
    await waitFor(() => { expect(root('a')).toHaveAttribute('data-dock-visible', 'false'); });
    expect(document.querySelectorAll('.dv-view:not(.visible) .dv-groupview').length).toBeGreaterThan(0);
    controls.setMaximized(null);
    await waitFor(() => { expect(root('a')).toHaveAttribute('data-dock-visible', 'true'); });
    expect(document.querySelectorAll('.dv-view:not(.visible) .dv-groupview')).toHaveLength(0);
    expect(mounts).toEqual({ a: 1, b: 1, c: 1 });
  });

  it('a layout change while maximized keeps the maximize and still remounts nothing', async () => {
    const { controls } = mountDock({ layout: row([50, 50], group(['a', 'b']), group(['c'])), maximized: 'c' });
    await ready();
    controls.setLayout(row([50, 50], group(['a']), group(['b', 'c'])));
    await waitFor(() => { expect(groupsOnScreen()).toEqual([['a'], ['b', 'c']]); });
    expect(root('a')).toHaveAttribute('data-dock-visible', 'false');
    expect(mounts).toEqual({ a: 1, b: 1, c: 1 });
  });

  it('a parent that ignores a change gets the engine back on its layout', async () => {
    const { calls } = mountDock({ layout: row([50, 50], group(['a', 'b'], 'a'), group(['c'])), controlled: false });
    await ready();
    await userEvent.click(screen.getByRole('tab', { name: '패널 b' }));
    await waitFor(() => { expect(calls.layout.length).toBeGreaterThan(0); });
    await waitFor(() => { expect(activeTabs()).toContain('a'); });
    expect(mounts).toEqual({ a: 1, b: 1, c: 1 });
  });
});

describe('DockLayout close is blocked (D7)', () => {
  it.each(['{Delete}', '{Backspace}'])('%s on a focused tab does nothing', async key => {
    const { calls } = mountDock({ layout: row([50, 50], group(['a', 'b']), group(['c'])) });
    await ready();
    const tab = screen.getByRole('tab', { name: '패널 b' });
    tab.focus();
    await userEvent.keyboard(key);
    expect(groupsOnScreen()).toEqual([['a', 'b'], ['c']]);
    expect(screen.getByTestId('content-b')).toBeInTheDocument();
    expect(calls.layout).toHaveLength(0);
  });

  it.each(['{Delete}', '{Backspace}'])('%s reports the tab to onPanelDelete and still closes nothing', async key => {
    const deleted: string[] = [];
    const { calls } = mountDock({ layout: row([50, 50], group(['a', 'b']), group(['c'])), props: { onPanelDelete: id => { deleted.push(id); } } });
    await ready();
    screen.getByRole('tab', { name: '패널 b' }).focus();
    await userEvent.keyboard(key);
    expect(deleted).toEqual(['b']);
    expect(groupsOnScreen()).toEqual([['a', 'b'], ['c']]);
    expect(screen.getByTestId('content-b')).toBeInTheDocument();
    expect(calls.layout).toHaveLength(0);
  });

  it('renders no close button in any tab', async () => {
    mountDock({ layout: row([50, 50], group(['a', 'b']), group(['c'])) });
    await ready();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(3);
    tabs.forEach(tab => { expect(within(tab).queryByRole('button')).toBeNull(); });
    expect(document.querySelector('.dv-default-tab-action')).toBeNull();
  });
});

describe('DockLayout activation belongs to the user (D6)', () => {
  it('clicking a background tab calls onActivate once and reports the new active tab', async () => {
    const { calls } = mountDock({ layout: row([50, 50], group(['a', 'b'], 'a'), group(['c'])) });
    await ready();
    await userEvent.click(screen.getByRole('tab', { name: '패널 b' }));
    expect(calls.activate).toEqual(['b']);
    await waitFor(() => { expect(activeTabs()).toContain('b'); });
    expect(JSON.stringify(calls.layout.at(-1))).toContain('"active":"b"');
  });

  it.each<[string, string, string[]]>([
    ['Enter', '{Enter}', ['a']], ['Space', ' ', ['a']], ['ArrowRight', '{ArrowRight}', ['b']],
  ])('%s on a tab activates it', async (_name, keys, expected) => {
    const { calls } = mountDock({ layout: row([50, 50], group(['a', 'b'], 'a'), group(['c'])) });
    await ready();
    screen.getByRole('tab', { name: '패널 a' }).focus();
    await userEvent.keyboard(keys);
    expect(calls.activate).toEqual(expected);
  });

  it('focus moving into a panel activates it', async () => {
    const { calls } = mountDock({ layout: row([50, 50], group(['a']), group(['c'])), inner: id => <button type="button">inner {id}</button> });
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'inner c' }));
    expect(calls.activate).toEqual(['c']);
  });

  it('a layout prop change that changes the active tab, or moves panels, never calls onActivate', async () => {
    const { controls, calls } = mountDock({ layout: row([50, 50], group(['a', 'b'], 'a'), group(['c'])) });
    await ready();
    controls.setLayout(row([50, 50], group(['a', 'b'], 'b'), group(['c'])));
    await waitFor(() => { expect(activeTabs()).toContain('b'); });
    controls.setLayout(row([50, 50], group(['a']), group(['b', 'c'], 'c')));
    await waitFor(() => { expect(groupsOnScreen()).toEqual([['a'], ['b', 'c']]); });
    controls.setMaximized('a');
    controls.setMaximized(null);
    expect(calls.activate).toEqual([]);
  });
});

describe('DockLayout visibility, inert and overlays (D13)', () => {
  const popover = (id: string) => <Popover><PopoverTrigger asChild><button type="button">open {id}</button></PopoverTrigger><PopoverContent>popover {id}</PopoverContent></Popover>;

  it('background panels are inert and visible ones are not', async () => {
    mountDock({ layout: row([50, 50], group(['a', 'b'], 'a'), group(['c'])) });
    await ready();
    expect(root('a')).not.toHaveAttribute('inert');
    expect(root('a')).toHaveAttribute('data-dock-visible', 'true');
    expect(root('b')).toHaveAttribute('inert');
    expect(root('b')).toHaveAttribute('data-dock-visible', 'false');
    expect(root('c')).not.toHaveAttribute('inert');
  });

  it('an open Popover in a panel that becomes a background tab is closed', async () => {
    const { controls } = mountDock({ layout: row([50, 50], group(['a', 'b'], 'b'), group(['c'])), inner: id => (id === 'b' ? popover(id) : null) });
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'open b' }));
    expect(await screen.findByText('popover b')).toBeInTheDocument();
    controls.setLayout(row([50, 50], group(['a', 'b'], 'a'), group(['c'])));
    await waitFor(() => { expect(screen.queryByText('popover b')).toBeNull(); });
    expect(root('b')).toHaveAttribute('inert');
    expect(mounts.b).toBe(1);
  });

  it('a panel hidden by another panel\'s maximize is inert and its Popover closes', async () => {
    const { controls } = mountDock({ layout: row([50, 50], group(['a']), group(['c'])), inner: id => (id === 'a' ? popover(id) : null) });
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'open a' }));
    expect(await screen.findByText('popover a')).toBeInTheDocument();
    controls.setMaximized('c');
    await waitFor(() => { expect(screen.queryByText('popover a')).toBeNull(); });
    expect(root('a')).toHaveAttribute('inert');
    expect(root('c')).not.toHaveAttribute('inert');
  });
});

describe('DockLayout platform separators (D2)', () => {
  it('renders one labelled, focusable separator per boundary with the ARIA value contract', async () => {
    mountDock({ layout: row([50, 50], group(['a', 'b']), group(['c'])) });
    await ready();
    const separators = screen.getAllByRole('separator');
    expect(separators).toHaveLength(1);
    const separator = separators[0]!;
    expect(separator).toHaveAccessibleName('row:a,b|c');
    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    expect(separator).toHaveAttribute('aria-valuenow', '50');
    expect(separator).toHaveAttribute('aria-valuemin', '10');
    expect(separator).toHaveAttribute('aria-valuemax', '90');
    expect(separator).toHaveAttribute('tabindex', '0');
    expect(separator.getAttribute('aria-controls')?.split(' ')).toEqual([root('a').id, root('c').id]);
  });

  it('has one separator per boundary of nested branches, horizontal for a column split', async () => {
    mountDock({ layout: row([50, 50], group(['a']), column([30, 70], group(['b']), group(['c']))) });
    await ready();
    const separators = screen.getAllByRole('separator');
    expect(separators.map(item => item.getAttribute('aria-orientation'))).toEqual(['vertical', 'horizontal']);
    expect(separators[1]).toHaveAttribute('aria-valuenow', '30');
    expect(separators[1]).toHaveAccessibleName('column:b|c');
  });

  it('ArrowRight moves the boundary 5% and emits the layout', async () => {
    const { calls } = mountDock({ layout: row([50, 50], group(['a']), group(['c'])), controlled: false });
    await ready();
    screen.getByRole('separator').focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(calls.layout.at(-1)).toMatchObject({ type: 'branch', dir: 'row', sizes: [55, 45] });
  });

  it('a controlled parent that takes the new sizes updates the separator and remounts nothing', async () => {
    const { calls } = mountDock({ layout: row([50, 50], group(['a']), group(['c'])) });
    await ready();
    screen.getByRole('separator').focus();
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => { expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '55'); });
    expect(screen.getByRole('separator')).toHaveFocus();
    expect(calls.layout).toHaveLength(1);
    expect(mounts).toEqual({ a: 1, c: 1 });
  });

  it('ArrowLeft, and ArrowDown/ArrowUp on a column split, move the other way', async () => {
    const left = mountDock({ layout: row([50, 50], group(['a']), group(['c'])), controlled: false });
    await ready();
    screen.getByRole('separator').focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(left.calls.layout.at(-1)).toMatchObject({ sizes: [45, 55] });
    cleanup();
    const down = mountDock({ layout: column([50, 50], group(['a']), group(['c'])), controlled: false });
    await ready();
    screen.getByRole('separator').focus();
    await userEvent.keyboard('{ArrowDown}{ArrowUp}');
    expect(down.calls.layout.map(item => (item as { sizes: number[] }).sizes)).toEqual([[55, 45], [45, 55]]);
  });

  it('Home and End go to the clamped extremes', async () => {
    const { calls } = mountDock({ layout: row([50, 50], group(['a']), group(['c'])), controlled: false });
    await ready();
    screen.getByRole('separator').focus();
    await userEvent.keyboard('{Home}{End}');
    expect(calls.layout.map(item => (item as { sizes: number[] }).sizes)).toEqual([[10, 90], [90, 10]]);
  });

  it('ignores other keys', async () => {
    const { calls } = mountDock({ layout: row([50, 50], group(['a']), group(['c'])), controlled: false });
    await ready();
    screen.getByRole('separator').focus();
    await userEvent.keyboard('{ArrowUp}x');
    expect(calls.layout).toHaveLength(0);
  });

  it('has no separator in a single-group layout or while a panel is maximized', async () => {
    const single = mountDock({ layout: group(['a', 'b', 'c']) });
    await ready();
    expect(screen.queryAllByRole('separator')).toHaveLength(0);
    single.unmount();
    const { controls } = mountDock({ layout: row([50, 50], group(['a']), group(['c'])) });
    await ready();
    expect(screen.getAllByRole('separator')).toHaveLength(1);
    controls.setMaximized('a');
    await waitFor(() => { expect(screen.queryAllByRole('separator')).toHaveLength(0); });
    controls.setMaximized(null);
    await waitFor(() => { expect(screen.getAllByRole('separator')).toHaveLength(1); });
  });
});

function Nested({ log }: { log: (string | null)[] }) {
  const [maximized, setMaximized] = useState<string | null>('x');
  const panels = useMemo(() => ['x', 'y'].map(id => ({ id, title: `안쪽 ${id}`, render: () => <button type="button">inner {id}</button> })), []);
  const layout = useMemo(() => row([50, 50], group(['x']), group(['y'])), []);
  return <DockLayout panels={panels} layout={layout} onLayoutChange={() => {}} maximizedPanelId={maximized} onMaximizedChange={id => { log.push(id); setMaximized(id); }}
    separatorLabel={() => '안쪽 경계'} label="안쪽 배치" minPanelSize={{ width: 20, height: 20 }} />;
}

describe('DockLayout Escape ends the innermost maximize', () => {
  it('Escape calls onMaximizedChange(null)', async () => {
    const { calls } = mountDock({ layout: row([50, 50], group(['a']), group(['c'])), maximized: 'a', inner: id => <button type="button">inner {id}</button> });
    await ready();
    screen.getByRole('button', { name: 'inner a' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(calls.maximized).toEqual([null]);
  });

  it('does nothing when nothing is maximized', async () => {
    const { calls } = mountDock({ layout: row([50, 50], group(['a']), group(['c'])), inner: id => <button type="button">inner {id}</button> });
    await ready();
    screen.getByRole('button', { name: 'inner a' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(calls.maximized).toEqual([]);
  });

  it('an open Popover takes the first Escape; the second ends the maximize', async () => {
    const { calls } = mountDock({
      layout: row([50, 50], group(['a']), group(['c'])), maximized: 'a',
      inner: id => (id === 'a' ? <Popover><PopoverTrigger asChild><button type="button">open</button></PopoverTrigger><PopoverContent>popover body</PopoverContent></Popover> : null),
    });
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(await screen.findByText('popover body')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => { expect(screen.queryByText('popover body')).toBeNull(); });
    expect(calls.maximized).toEqual([]);
    await userEvent.keyboard('{Escape}');
    expect(calls.maximized).toEqual([null]);
  });

  it('restoring focuses the restored panel\'s tab', async () => {
    mountDock({ layout: row([50, 50], group(['a']), group(['c'])), maximized: 'a', inner: id => <button type="button">inner {id}</button> });
    await ready();
    screen.getByRole('button', { name: 'inner a' }).focus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => { expect(screen.getByRole('tab', { name: '패널 a' })).toHaveFocus(); });
  });

  it('with nested layouts both maximized, one Escape ends only the inner one', async () => {
    const inner: (string | null)[] = [];
    const { calls } = mountDock({ layout: row([50, 50], group(['a']), group(['c'])), maximized: 'a', inner: id => (id === 'a' ? <Nested log={inner} /> : null) });
    const button = await screen.findByRole('button', { name: 'inner x' });
    button.focus();
    await userEvent.keyboard('{Escape}');
    expect(inner).toEqual([null]);
    expect(calls.maximized).toEqual([]);
    await waitFor(() => { expect(screen.getByRole('tab', { name: '안쪽 x' })).toHaveFocus(); });
    await userEvent.keyboard('{Escape}');
    expect(inner).toEqual([null]);
    expect(calls.maximized).toEqual([null]);
  });
});

describe('DockLayout group menu from the keyboard (D19)', () => {
  const actions = () => (
    <DropdownMenu><DropdownMenuTrigger asChild><button type="button" data-dock-group-menu>그룹 동작</button></DropdownMenuTrigger>
      <DropdownMenuContent><DropdownMenuItem>그룹 항목</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
  );

  it('Shift+F10 on a focused tab opens the group menu', async () => {
    mountDock({ layout: row([50, 50], group(['a', 'b']), group(['c'])), props: { renderGroupActions: actions } });
    await ready();
    screen.getByRole('tab', { name: '패널 b' }).focus();
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    expect(await screen.findByRole('menuitem', { name: '그룹 항목' })).toBeInTheDocument();
  });

  it('the ContextMenu key does the same', async () => {
    mountDock({ layout: row([50, 50], group(['a', 'b']), group(['c'])), props: { renderGroupActions: actions } });
    await ready();
    screen.getByRole('tab', { name: '패널 c' }).focus();
    await userEvent.keyboard('{ContextMenu}');
    expect(await screen.findByRole('menuitem', { name: '그룹 항목' })).toBeInTheDocument();
  });

  it('opens a click-toggled trigger too', async () => {
    mountDock({
      layout: row([50, 50], group(['a']), group(['c'])),
      props: { renderGroupActions: () => <Popover><PopoverTrigger asChild><button type="button" data-dock-group-menu>열기</button></PopoverTrigger><PopoverContent>팝오버 본문</PopoverContent></Popover> },
    });
    await ready();
    screen.getByRole('tab', { name: '패널 a' }).focus();
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    expect(await screen.findByText('팝오버 본문')).toBeInTheDocument();
  });
});

describe('DockLayout narrow display (decision 17)', () => {
  it('below stackBelow every panel is one tab group, nothing is reported and there are no separators', async () => {
    observer.resize(500, 600);
    const { calls, controls } = mountDock({ layout: row([50, 50], group(['a', 'b'], 'b'), group(['c'])), props: { stackBelow: 692 } });
    await ready();
    await waitFor(() => { expect(screen.getAllByRole('tablist')).toHaveLength(1); });
    expect(groupsOnScreen()).toEqual([['a', 'b', 'c']]);
    expect(activeTabs()).toEqual(['b']);
    expect(screen.queryAllByRole('separator')).toHaveLength(0);
    expect(root('c')).toHaveAttribute('inert');
    expect(calls.layout).toHaveLength(0);
    expect(controls.current().layout).toEqual(row([50, 50], group(['a', 'b'], 'b'), group(['c'])));
    // The user's tab choice there is display-only.
    await userEvent.click(screen.getByRole('tab', { name: '패널 c' }));
    await waitFor(() => { expect(activeTabs()).toEqual(['c']); });
    expect(calls.activate).toEqual(['c']);
    expect(calls.layout).toHaveLength(0);
    expect(mounts).toEqual({ a: 1, b: 1, c: 1 });
    // Back to a wide container: the stored layout is shown again.
    observer.resize(900, 600);
    await waitFor(() => { expect(groupsOnScreen()).toEqual([['a', 'b'], ['c']]); });
    expect(screen.getAllByRole('separator')).toHaveLength(1);
    expect(mounts).toEqual({ a: 1, b: 1, c: 1 });
  });

  it('measures its own container, not the viewport', async () => {
    observer.resize(900, 600);
    mountDock({ layout: row([50, 50], group(['a']), group(['c'])), props: { stackBelow: 692 } });
    await ready();
    expect(groupsOnScreen()).toEqual([['a'], ['c']]);
    expect(screen.getByRole('region', { name: '테스트 배치' })).toHaveAttribute('data-dock-narrow', 'false');
  });
});

describe('DockLayout tab content', () => {
  it('renderTab fills the tab with the active and group-focus state', async () => {
    mountDock({
      layout: row([50, 50], group(['a', 'b'], 'a'), group(['c'])),
      props: { renderTab: (id, state) => <span>{id}:{state.active ? 'active' : 'idle'}:{state.groupFocused ? 'focus' : 'blur'}</span> },
    });
    await ready();
    expect(screen.getByText('a:active:blur')).toBeInTheDocument();
    expect(screen.getByText('b:idle:blur')).toBeInTheDocument();
    screen.getByRole('tab', { name: '패널 a' }).focus();
    await waitFor(() => { expect(screen.getByText('a:active:focus')).toBeInTheDocument(); });
    expect(screen.getByText('b:idle:focus')).toBeInTheDocument();
    expect(screen.getByText('c:active:blur')).toBeInTheDocument();
  });

  it('the default tab shows the title and the tab is named by it', async () => {
    mountDock({ layout: group(['a', 'b']) });
    await ready();
    expect(screen.getByRole('tab', { name: '패널 a' })).toHaveTextContent('패널 a');
  });
});

describe('DockLayout FIX1 regressions', () => {
  it('C1: a tab change while a group is maximized is reported and shown', async () => {
    const { calls } = mountDock({ layout: row([50, 50], group(['a', 'b'], 'a'), group(['c'])), maximized: 'a' });
    await ready();
    await userEvent.click(screen.getByRole('tab', { name: '패널 b' }));
    await waitFor(() => { expect(JSON.stringify(calls.layout.at(-1))).toContain('"active":"b"'); });
    await waitFor(() => { expect(root('b')).toHaveAttribute('data-dock-visible', 'true'); });
    expect(root('b')).not.toHaveAttribute('inert');
    expect(root('a')).toHaveAttribute('inert');
    expect(mounts).toEqual({ a: 1, b: 1, c: 1 });
  });

  it('C1: a parent that ignores a tab change made while maximized gets the engine back, still maximized', async () => {
    const { calls } = mountDock({ layout: row([50, 50], group(['a', 'b'], 'a'), group(['c'])), maximized: 'a', controlled: false });
    await ready();
    await userEvent.click(screen.getByRole('tab', { name: '패널 b' }));
    await waitFor(() => { expect(calls.layout.length).toBeGreaterThan(0); });
    await waitFor(() => { expect(activeTabs()).toContain('a'); });
    expect(activeTabs()).not.toContain('b');
    expect(root('c')).toHaveAttribute('inert');
    expect(root('a')).not.toHaveAttribute('inert');
    expect(mounts).toEqual({ a: 1, b: 1, c: 1 });
  });

  it('C2: a tab change keeps the stored ratios, not the engine\'s clamped sizes', async () => {
    const { calls } = mountDock({ layout: row([90, 10], group(['a', 'b'], 'a'), group(['c'])), controlled: false, props: { minPanelSize: { width: 300, height: 20 } } });
    await ready();
    await userEvent.click(screen.getByRole('tab', { name: '패널 b' }));
    await waitFor(() => { expect(calls.layout.length).toBeGreaterThan(0); });
    expect(calls.layout.at(-1)).toMatchObject({ type: 'branch', sizes: [90, 10] });
  });

  it('C4: one engine change is reported once', async () => {
    const { calls } = mountDock({ layout: row([50, 50], group(['a', 'b'], 'a'), group(['c'])), controlled: false });
    await ready();
    await userEvent.click(screen.getByRole('tab', { name: '패널 b' }));
    await waitFor(() => { expect(calls.layout.length).toBeGreaterThan(0); });
    await waitFor(() => { expect(activeTabs()).toContain('a'); });
    await new Promise(resolve => { setTimeout(resolve, 50); });
    expect(calls.layout).toHaveLength(1);
  });

  it('C5: a title-only change while maximized keeps the engine maximized', async () => {
    const { controls } = mountDock({ layout: row([50, 50], group(['a', 'b']), group(['c'])), maximized: 'c' });
    await ready();
    await waitFor(() => { expect(root('a')).toHaveAttribute('data-dock-visible', 'false'); });
    controls.setTitleSuffix(' (새 이름)');
    await waitFor(() => { expect(screen.getByRole('tab', { name: '패널 a (새 이름)' })).toBeInTheDocument(); });
    await waitFor(() => { expect(document.querySelectorAll('.dv-view:not(.visible) .dv-groupview').length).toBeGreaterThan(0); });
    expect(root('a')).toHaveAttribute('inert');
    expect(mounts).toEqual({ a: 1, b: 1, c: 1 });
  });
});

function NestedActivation({ log, startMaximized = null, expose }: { log: string[]; startMaximized?: string | null; expose?: { set?: (id: string | null) => void } }) {
  const [maximized, setMaximized] = useState<string | null>(startMaximized);
  if (expose) expose.set = setMaximized;
  const panels = useMemo(() => ['x', 'y', 'z'].map(id => ({ id, title: `안쪽 ${id}`, render: () => <button type="button">inner {id}</button> })), []);
  const layout = useMemo(() => row([50, 50], group(['x', 'y']), group(['z'])), []);
  return <DockLayout panels={panels} layout={layout} onLayoutChange={() => {}} onActivate={id => { log.push(id); }} maximizedPanelId={maximized} onMaximizedChange={setMaximized}
    separatorLabel={() => '안쪽 경계'} label="안쪽 배치" minPanelSize={{ width: 20, height: 20 }} />;
}

describe('DockLayout nested activation (C3)', () => {
  it('a click on an inner tab activates only the inner layout', async () => {
    const inner: string[] = [];
    const { calls } = mountDock({ layout: row([50, 50], group(['a']), group(['c'])), inner: id => (id === 'a' ? <NestedActivation log={inner} /> : null) });
    await screen.findByRole('tab', { name: '안쪽 y' });
    await userEvent.click(screen.getByRole('tab', { name: '안쪽 y' }));
    expect(inner).toContain('y');
    expect(calls.activate).not.toContain('y');
    expect(calls.activate).toEqual([]);
  });

  it('arrow keys on an inner tab activate only the inner layout', async () => {
    const inner: string[] = [];
    const { calls } = mountDock({ layout: row([50, 50], group(['a']), group(['c'])), inner: id => (id === 'a' ? <NestedActivation log={inner} /> : null) });
    const tab = await screen.findByRole('tab', { name: '안쪽 x' });
    tab.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(inner.length).toBeGreaterThan(0);
    expect(calls.activate).toEqual([]);
  });

  it('programmatic focus (inner maximize restore from body focus) activates nothing, inner or outer', async () => {
    const inner: string[] = [];
    const handle: { set?: (id: string | null) => void } = {};
    const { calls } = mountDock({ layout: row([50, 50], group(['a']), group(['c'])), inner: id => (id === 'a' ? <NestedActivation log={inner} startMaximized="x" expose={handle} /> : null) });
    const button = await screen.findByRole('button', { name: 'inner x' });
    button.focus();
    button.blur();
    expect(document.body).toHaveFocus();
    inner.length = 0; calls.activate.length = 0;
    act(() => { handle.set?.(null); });
    await waitFor(() => { expect(screen.getByRole('tab', { name: '안쪽 x' })).toHaveFocus(); });
    expect(calls.activate).toEqual([]);
    expect(inner).toEqual([]);
  });
});

describe('DockLayout host controls: current panel, tab order, tab speech', () => {
  afterEach(() => { observer.resize(900, 600); });

  it('the narrow display shows the host\'s current panel instead of the first group\'s active tab, and tabs follow the panels\' order', async () => {
    observer.resize(500, 600);
    mountDock({ layout: row([50, 50], group(['a', 'b'], 'b'), group(['c'])), ids: ['c', 'a', 'b'], props: { stackBelow: 692, currentPanelId: 'c' } });
    await ready();
    await waitFor(() => { expect(screen.getAllByRole('tablist')).toHaveLength(1); });
    expect(groupsOnScreen()).toEqual([['c', 'a', 'b']]);
    expect(activeTabs()).toEqual(['c']);
    expect(root('c')).not.toHaveAttribute('inert');
    expect(root('b')).toHaveAttribute('inert');
  });

  it('sets the description and the key shortcuts the host gives a tab on the tab itself', async () => {
    mountDock({
      layout: row([50, 50], group(['a', 'b'], 'a'), group(['c'])),
      props: { tabA11y: id => (id === 'a' ? { description: '편집 대상', keyShortcuts: 'Delete Shift+F10' } : id === 'c' ? { keyShortcuts: 'Shift+F10' } : undefined) },
    });
    await ready();
    const tab = (id: string) => screen.getByRole('tab', { name: `패널 ${id}` });
    await waitFor(() => { expect(tab('a')).toHaveAttribute('aria-description', '편집 대상'); });
    expect(tab('a')).toHaveAttribute('aria-keyshortcuts', 'Delete Shift+F10');
    expect(tab('b')).not.toHaveAttribute('aria-description');
    expect(tab('c')).not.toHaveAttribute('aria-description');
    expect(tab('c')).toHaveAttribute('aria-keyshortcuts', 'Shift+F10');
  });

  it('Tab runs tab → its content → the next group\'s tab, and Shift+Tab runs it backwards; a panel without a stop takes focus itself', async () => {
    mountDock({ layout: row([50, 50], group(['a']), group(['c'])), ids: ['a', 'c'], inner: id => (id === 'a' ? <><button type="button">first a</button><button type="button">last a</button></> : null) });
    await ready();
    const tab = (id: string) => screen.getByRole('tab', { name: `패널 ${id}` });
    tab('a').focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'first a' }));
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'last a' }));
    await userEvent.tab();
    expect(document.activeElement).toBe(tab('c'));
    await userEvent.tab();
    expect(document.activeElement).toBe(root('c'));
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(tab('c'));
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'last a' }));
    await userEvent.tab({ shift: true });
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(tab('a'));
  });
});
