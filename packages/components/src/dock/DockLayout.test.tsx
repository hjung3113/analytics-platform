import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useMemo, useState } from 'react';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
const widths = () => Array.from(document.querySelectorAll<HTMLElement>('.dv-view')).filter(view => view.querySelector(':scope > .dv-groupview')).map(view => parseFloat(view.style.width));
const frame = () => act(() => new Promise<void>(resolve => { setTimeout(resolve, 60); }));

describe('DockLayout reconcile (D9: remount 0)', () => {
  it('renders the layout it is given: groups, tab order and active tabs', async () => {
    mountDock({ layout: row([60, 40], group(['a', 'b'], 'b'), group(['c'])) });
    await ready();
    expect(groupsOnScreen()).toEqual([['a', 'b'], ['c']]);
    expect(activeTabs().sort()).toEqual(['b', 'c']);
    expect(screen.getByRole('region', { name: '테스트 배치' })).toBeInTheDocument();
  });

  it('group containers are not landmarks: the only regions are the layout root and what panel content declares, also after the engine re-sets them', async () => {
    const { controls } = mountDock({ layout: row([50, 50], group(['a', 'b'], 'a'), group(['c'])), inner: id => <section role="region" aria-label={`card ${id}`}>x</section> });
    await ready();
    const regions = () => screen.getAllByRole('region', { hidden: true }).map(element => element.getAttribute('aria-label'));
    const expectNoGroupRegion = () => {
      expect(document.querySelectorAll('.dv-groupview[role], .dv-groupview[aria-label]')).toHaveLength(0);
      expect(regions().filter(name => name !== '테스트 배치' && !name?.startsWith('card '))).toEqual([]);
    };
    expectNoGroupRegion();
    controls.setLayout(row([50, 50], group(['a', 'b'], 'b'), group(['c'])));
    await waitFor(() => { expect(activeTabs()).toContain('b'); });
    await waitFor(expectNoGroupRegion);
    controls.setTitleSuffix(' 2');
    await waitFor(() => { expect(screen.getAllByRole('tab').some(tab => tab.textContent?.includes(' 2'))).toBe(true); });
    await waitFor(expectNoGroupRegion);
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

  // The engine caches a hidden group's px size and restores it as it was; a resize in between would leave the shares skewed (#575 2c).
  it('resizing while a group is maximized and then restoring keeps the stored column proportions', async () => {
    // jsdom has no layout parent, and the engine ignores a resize of an element without one.
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.parentNode; } });
    try {
      const { controls } = mountDock({ layout: row([50, 50], group(['a']), group(['c'])) });
      await ready();
      await frame();
      const [left0, right0] = widths();
      expect(left0! + right0!).toBeGreaterThan(800);
      controls.setMaximized('a');
      await waitFor(() => { expect(root('c')).toHaveAttribute('data-dock-visible', 'false'); });
      observer.resize(600, 600);
      await frame();
      controls.setMaximized(null);
      await waitFor(() => { expect(root('c')).toHaveAttribute('data-dock-visible', 'true'); });
      await frame();
      const [left, right] = widths();
      expect(left! + right!).toBeLessThan(700);
      expect(Math.abs(left! - right!)).toBeLessThanOrEqual(2);
      observer.resize(900, 600);
      await frame();
      const [wideLeft, wideRight] = widths();
      expect(Math.abs(wideLeft! - wideRight!)).toBeLessThanOrEqual(2);
    } finally {
      delete (HTMLElement.prototype as { offsetParent?: unknown }).offsetParent;
    }
  });

  // The size at the start of the maximize and at the restore are equal here, so only the in-between resize can tell the engine's cached px sizes are stale.
  it('resizing while a group is maximized and back to the same size, then restoring keeps the stored column proportions', async () => {
    // jsdom has no layout parent, and the engine ignores a resize of an element without one.
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.parentNode; } });
    try {
      const { controls } = mountDock({ layout: row([50, 50], group(['a']), group(['c'])) });
      await ready();
      await frame();
      const [left0, right0] = widths();
      expect(left0! + right0!).toBeGreaterThan(800);
      controls.setMaximized('a');
      await waitFor(() => { expect(root('c')).toHaveAttribute('data-dock-visible', 'false'); });
      observer.resize(600, 600);
      await frame();
      observer.resize(900, 600);
      await frame();
      controls.setMaximized(null);
      await waitFor(() => { expect(root('c')).toHaveAttribute('data-dock-visible', 'true'); });
      await frame();
      const [left, right] = widths();
      expect(left! + right!).toBeGreaterThan(800);
      expect(Math.abs(left! - right!)).toBeLessThanOrEqual(2);
    } finally {
      delete (HTMLElement.prototype as { offsetParent?: unknown }).offsetParent;
    }
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

  it('opens the menu with its first item focused, so Enter acts at once', async () => {
    mountDock({ layout: row([50, 50], group(['a', 'b']), group(['c'])), props: { renderGroupActions: actions } });
    await ready();
    screen.getByRole('tab', { name: '패널 a' }).focus();
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    const item = await screen.findByRole('menuitem', { name: '그룹 항목' });
    await waitFor(() => { expect(document.activeElement).toBe(item); });
  });

  it('a right-click on a tab opens the same menu', async () => {
    mountDock({ layout: row([50, 50], group(['a', 'b']), group(['c'])), props: { renderGroupActions: actions } });
    await ready();
    fireEvent.contextMenu(screen.getByRole('tab', { name: '패널 c' }));
    expect(await screen.findByRole('menuitem', { name: '그룹 항목' })).toBeInTheDocument();
  });

  it('on a background tab it activates that tab first (onActivate), then opens the menu', async () => {
    const { calls } = mountDock({ layout: row([50, 50], group(['a', 'b'], 'a'), group(['c'])), props: { renderGroupActions: actions } });
    await ready();
    screen.getByRole('tab', { name: '패널 b' }).focus();
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    expect(await screen.findByRole('menuitem', { name: '그룹 항목' })).toBeInTheDocument();
    expect(calls.activate).toEqual(['b']);
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

describe('DockLayout slot after the tabs (renderGroupTabsEnd)', () => {
  it('draws once per group right after its last tab, outside the tab list and every tab', async () => {
    mountDock({ layout: row([50, 50], group(['a', 'b'], 'b'), group(['c'])), props: { renderGroupTabsEnd: g => <button type="button" data-testid={`end-${g.active}`}>{g.panels.join('')}</button> } });
    await ready();
    const end = screen.getByTestId('end-b');
    expect(end).toHaveTextContent('ab');
    expect(screen.getByTestId('end-c')).toHaveTextContent('c');
    expect(end.closest('[role="tablist"]')).toBeNull();
    expect(end.closest('[role="tab"]')).toBeNull();
    const strip = end.closest('.dv-tabs-and-actions-container')!;
    const tabs = within(strip as HTMLElement).getAllByRole('tab');
    expect(tabs[tabs.length - 1]!.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Tab runs the active tab → the slot after the tabs → the header-right slot → the content, and Shift+Tab runs back', async () => {
    mountDock({ layout: row([50, 50], group(['a']), group(['c'])), ids: ['a', 'c'], inner: id => (id === 'a' ? <button type="button">content a</button> : null),
      props: { renderGroupTabsEnd: group => <button type="button">{group.active} end</button>, renderGroupActions: group => <button type="button">{group.active} right</button> } });
    await ready();
    const tab = (id: string) => screen.getByRole('tab', { name: `패널 ${id}` });
    tab('a').focus();
    const order: (string | null)[] = [];
    for (let step = 0; step < 3; step++) { await userEvent.tab(); order.push(document.activeElement?.textContent ?? null); }
    expect(order).toEqual(['a end', 'a right', 'content a']);
    await userEvent.tab();
    expect(document.activeElement).toBe(tab('c'));
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'content a' }));
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'a right' }));
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'a end' }));
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(tab('a'));
  });
});

describe('DockLayout header slot and Tab order of a group (2c)', () => {
  const slot = (group: string[]) => (_: unknown, state: { stripWidth: number }) => (
    <><button type="button">{group.join('')} first {state.stripWidth}</button><button type="button">{group.join('')} last</button></>
  );

  it('hands the strip width to renderGroupActions and marks the slot with the group\'s active tab', async () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const width = this.classList.contains('dv-tabs-and-actions-container') ? 321 : 0;
      return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) };
    });
    try {
      mountDock({ layout: row([50, 50], group(['a', 'b'], 'b'), group(['c'])), props: { renderGroupActions: (g, state) => <span data-testid={`slot-${g.active}`}>{state.stripWidth}</span> } });
      await ready();
      await waitFor(() => { expect(screen.getByTestId('slot-b')).toHaveTextContent('321'); });
      expect(screen.getByTestId('slot-c')).toHaveTextContent('321');
      expect(screen.getByTestId('slot-b').closest('[data-dock-group-actions]')).toHaveAttribute('data-dock-active', 'b');
      expect(screen.getByTestId('slot-b').closest('[role="tablist"]')).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('Tab runs the active tab → the slot\'s buttons → the content, and Shift+Tab runs back the same way', async () => {
    mountDock({ layout: row([50, 50], group(['a']), group(['c'])), ids: ['a', 'c'], inner: id => (id === 'a' ? <button type="button">content a</button> : null),
      props: { renderGroupActions: group => <><button type="button">{group.active} one</button><button type="button">{group.active} two</button></> } });
    await ready();
    const tab = (id: string) => screen.getByRole('tab', { name: `패널 ${id}` });
    tab('a').focus();
    const order: (string | null)[] = [];
    for (let step = 0; step < 3; step++) { await userEvent.tab(); order.push(document.activeElement?.textContent ?? null); }
    expect(order).toEqual(['a one', 'a two', 'content a']);
    await userEvent.tab();
    expect(document.activeElement).toBe(tab('c'));
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'content a' }));
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'a two' }));
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'a one' }));
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(tab('a'));
  });

  it('visits the groups in reading order, not the engine\'s tree order: two columns of two read a, b / c, d', async () => {
    mountDock({ layout: row([50, 50], column([50, 50], group(['a']), group(['c'])), column([50, 50], group(['b']), group(['d']))), ids: ['a', 'b', 'c', 'd'] });
    await ready();
    expect(groupsOnScreen().flat()).toEqual(['a', 'c', 'b', 'd']);
    screen.getByRole('tab', { name: '패널 a' }).focus();
    const visited = ['a'];
    for (let step = 0; step < 12 && visited.length < 4; step++) {
      await userEvent.tab();
      const tab = document.activeElement?.closest<HTMLElement>('[role="tab"]');
      if (tab) visited.push(tab.dataset.tabPanelId ?? '');
    }
    expect(visited).toEqual(['a', 'b', 'c', 'd']);
    for (let step = 0; step < 12 && visited.length < 7; step++) {
      await userEvent.tab({ shift: true });
      const tab = document.activeElement?.closest<HTMLElement>('[role="tab"]');
      if (tab) visited.push(tab.dataset.tabPanelId ?? '');
    }
    expect(visited.slice(4)).toEqual(['c', 'b', 'a']);
  });
});

describe('DockLayout keyboard order, FIX1 (#575 2c)', () => {
  const tab = (id: string) => screen.getByRole('tab', { name: `패널 ${id}` });
  const slot = (g: { active: string }) => <><button type="button">{g.active} one</button><button type="button">{g.active} two</button></>;
  /** What a Radix roving-focus group does: the wrapper is a tab stop that hands focus to its item. */
  const roving = (id: string) => <div tabIndex={0} data-testid={`wrap-${id}`} onFocus={event => { if (event.target === event.currentTarget) event.currentTarget.querySelector('button')?.focus(); }}><button type="button">{id} item</button></div>;
  const outside: HTMLElement[] = [];
  const outsideButton = (label: string, where: 'before' | 'after') => {
    const button = document.createElement('button');
    button.textContent = label;
    if (where === 'before') document.body.prepend(button); else document.body.append(button);
    outside.push(button);
    return button;
  };
  afterEach(() => { outside.splice(0).forEach(button => { button.remove(); }); });

  it('O1: Shift+Tab from the first control of a content whose first stop is a roving-focus wrapper goes to its own head, then its own tab', async () => {
    mountDock({ layout: row([50, 50], group(['a']), group(['c'])), ids: ['a', 'c'], inner: id => roving(id), props: { renderGroupActions: slot } });
    await ready();
    screen.getByRole('button', { name: 'c item' }).focus();
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'c two' }));
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'c one' }));
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(tab('c'));
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'a item' }));
  });

  it('C1: after the last group in reading order Tab leaves the layout, with unequal row ratios where reading order is not DOM order', async () => {
    mountDock({
      layout: row([50, 50], column([75, 25], group(['a']), group(['c'])), column([50, 50], group(['b']), group(['d']))), ids: ['a', 'b', 'c', 'd'],
      inner: id => <button type="button">content {id}</button>,
    });
    await ready();
    const before = outsideButton('before layout', 'before');
    const next = outsideButton('after layout', 'after');
    // Reading order is a, b, d, c (c sits lowest); the engine keeps panels in tree order a, c, b, d.
    expect(groupsOnScreen().flat()).toEqual(['a', 'c', 'b', 'd']);
    tab('a').focus();
    const visited: string[] = ['a'];
    for (let step = 0; step < 14 && document.activeElement !== next; step++) {
      await userEvent.tab();
      const stop = document.activeElement?.closest<HTMLElement>('[role="tab"]');
      if (stop) visited.push(stop.dataset.tabPanelId ?? '');
    }
    expect(visited).toEqual(['a', 'b', 'd', 'c']);
    expect(document.activeElement).toBe(next);
    // Back: next → the last control of c, ... → tab a → the focusable before the layout.
    for (let step = 0; step < 14 && document.activeElement !== before; step++) await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(before);
    tab('a').focus();
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(before);
  });

  it('O2: Tab into a pane with nothing to stop at lands on the content\'s own focus target, not the engine panel', async () => {
    mountDock({ layout: row([50, 50], group(['a']), group(['c'])), ids: ['a', 'c'], inner: id => <div tabIndex={-1} data-testid={`pane-${id}`}>pane {id}</div> });
    await ready();
    tab('c').focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByTestId('pane-c'));
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(tab('c'));
    tab('a').focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByTestId('pane-a'));
    await userEvent.tab();
    expect(document.activeElement).toBe(tab('c'));
    // Entering the previous group from behind lands on the same target.
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByTestId('pane-a'));
  });

  it('Esc on a menu that a tab opened (Shift+F10) returns focus to that tab', async () => {
    mountDock({
      layout: row([50, 50], group(['a', 'b']), group(['c'])),
      props: { renderGroupActions: () => (
        <DropdownMenu><DropdownMenuTrigger asChild><button type="button" data-dock-group-menu>그룹 동작</button></DropdownMenuTrigger>
          <DropdownMenuContent><DropdownMenuItem>그룹 항목</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      ) },
    });
    await ready();
    tab('a').focus();
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    await screen.findByRole('menuitem', { name: '그룹 항목' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => { expect(screen.queryByRole('menu')).toBeNull(); });
    await waitFor(() => { expect(document.activeElement).toBe(tab('a')); });
  });
});

describe('DockLayout tab extras and clipping, FIX1 (#575 2c)', () => {
  it('U2: every tab keeps its aria-keyshortcuts and the selected one its aria-description after panels move between groups', async () => {
    const { controls } = mountDock({
      layout: row([50, 50], group(['a', 'b'], 'a'), group(['c'])),
      props: { tabA11y: id => ({ keyShortcuts: 'Delete Shift+F10', description: id === 'a' ? '편집 대상 칸' : undefined }) },
    });
    await ready();
    const tab = (id: string) => screen.getByRole('tab', { name: `패널 ${id}` });
    await waitFor(() => { expect(tab('a')).toHaveAttribute('aria-keyshortcuts', 'Delete Shift+F10'); });
    controls.setLayout(row([50, 50], group(['a']), group(['b', 'c'], 'b')));
    await waitFor(() => { expect(groupsOnScreen()).toEqual([['a'], ['b', 'c']]); });
    await waitFor(() => {
      for (const id of ['a', 'b', 'c']) expect(tab(id)).toHaveAttribute('aria-keyshortcuts', 'Delete Shift+F10');
      expect(tab('a')).toHaveAttribute('aria-description', '편집 대상 칸');
    });
  });

  it('U3: the layout clips its content, so an overlay left at an old position cannot widen the container it sits in', async () => {
    mountDock({ layout: row([50, 50], group(['a']), group(['c'])), ids: ['a', 'c'] });
    await ready();
    expect(screen.getByRole('region', { name: '테스트 배치' }).className).toContain('overflow-hidden');
  });
});

describe('dock.css, FIX1 (#575 2c): rules jsdom cannot lay out', () => {
  it('U1: every strip has a 1px border-subtle line under it inside its 40px; U5: the wrapped row is right-aligned', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/dock/dock.css'), 'utf8');
    const strip = /\.ap-dock \.dv-tabs-and-actions-container \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(strip).toContain('box-sizing: border-box');
    expect(strip).toContain('border-bottom: 1px solid var(--color-border-subtle)');
    expect(css).toMatch(/\[data-dock-wrap\]\) \.dv-right-actions-container > \[data-dock-group-actions\] \{ margin-left: auto; \}/);
  });

  it('U6 (#893a): a one-tab group with a tabs-end slot lets the void container, not the tab list, take the free space, so the slot stays against the tab', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/dock/dock.css'), 'utf8');
    const single = '\\.dv-tabs-and-actions-container\\.dv-single-tab\\.dv-full-width-single-tab';
    expect(css).toMatch(new RegExp(`${single}:not\\(:has\\(\\[data-dock-group-tabs-end\\]\\)\\) \\.dv-scrollable \\{ flex: 1 1 0; \\}`));
    expect(css).toMatch(new RegExp(`${single}:has\\(\\[data-dock-group-tabs-end\\]\\) \\.dv-scrollable \\{ flex: 0 1 auto; \\}`));
    expect(css).toMatch(new RegExp(`${single}:has\\(\\[data-dock-group-tabs-end\\]\\) \\.dv-tabs-container \\{ flex-grow: 0; \\}`));
    expect(css).toMatch(new RegExp(`${single}:has\\(\\[data-dock-group-tabs-end\\]\\) \\.dv-void-container \\{ flex: 1 1 0;`));
  });
});
