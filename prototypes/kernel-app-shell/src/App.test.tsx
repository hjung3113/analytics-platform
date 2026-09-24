import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App, shellDimensions } from './App';
import { FIXTURE_NOTICE, menus } from './registry';
import { readLocation, writeLocation } from './kernel';
import { PlatformPage, type PageSlots, slotNames } from './PlatformPage';
afterEach(cleanup);
function mount(url = '/sample-analysis') { window.history.replaceState(null, '', url); return render(<App />); }
const origin = '/sample-analysis?scopeId=fixture-scope-a&roomNames=fixture-room-a&equipmentGroup=%7B%22axis%22%3A%22team%22%2C%22id%22%3A%22fixture-team%22%7D&equipmentSelection=none&lotIds=L&unknown=local';
describe('platform shell acceptance — 합성 fixture, 실제 메뉴 아님', () => {
  it('declares all registry fields with distinct context capabilities and unique routes', () => {
    expect(menus).toHaveLength(3);
    expect(new Set(menus.map(m => m.path)).size).toBe(3);
    for (const m of menus) {
      expect(Object.keys(m).sort()).toEqual(['id', 'group', 'name', 'path', 'icon', 'fixture', 'requiredPermissions', 'requiredScope', 'supportedContext', 'pageType', 'features'].sort());
      expect(m.fixture).toBe(FIXTURE_NOTICE); expect(m.requiredScope).toBe('single-requested');
      expect(m.requiredPermissions).toEqual(['fixture:inspect']);
      expect(Object.keys(m.supportedContext)).toHaveLength(8);
      expect(Object.values(m.features)).toEqual([false, false, false, false]);
    }
    expect(new Set(menus.map(m => JSON.stringify(m.supportedContext))).size).toBe(3);
  });
  it('retains registered context through unsupported and supported routes, dropping unknown keys only on transfer', () => {
    mount(origin);
    fireEvent.click(screen.getByRole('button', { name: 'Sample reference' }));
    const reference = readLocation(window.location.pathname + window.location.search);
    expect(reference.context.selection).toEqual([]); expect(reference.context.extras).toEqual([]);
    expect(reference.context.room_names).toEqual(['fixture-room-a']); expect(reference.context.condition?.axis).toBe('team');
    expect(reference.context.unapplied_globals).toEqual([['lotIds', 'L']]);
    expect(screen.getAllByText(/Not used on this page/)).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Sample overview' }));
    expect(screen.getByText(/Reference only/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sample analysis' }));
    expect(screen.getAllByText(/Supported · server validation pending/)).toHaveLength(3);
    expect(readLocation(window.location.pathname + window.location.search).context.selection).toEqual([]);
    expect(document.querySelector('[data-slot=content]')?.textContent).toBe('');
  });
  it('uses codec for controls and preserves fixed selection when condition changes', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Scope'), { target: { value: 'fixture-scope-b' } });
    fireEvent.change(screen.getByLabelText('room'), { target: { value: 'fixture-room-b' } });
    fireEvent.change(screen.getByLabelText('Selection'), { target: { value: 'fixture-equipment-a' } });
    fireEvent.change(screen.getByLabelText('Condition'), { target: { value: JSON.stringify({ axis: 'stgroup', values: ['fixture-group'] }) } });
    const state = readLocation(window.location.pathname + window.location.search).context;
    expect(state.scope_id).toBe('fixture-scope-b'); expect(state.room_names).toEqual(['fixture-room-b']);
    expect(state.selection).toEqual(['fixture-equipment-a']); expect(state.condition?.axis).toBe('stgroup');
    expect(screen.getAllByLabelText('Scope')).toHaveLength(1);
  });
  it('never defaults absent scope and preserves explicit unknown scope as unverified', () => {
    mount(); expect(screen.getByText(/Scope selection required/)).toBeTruthy(); cleanup();
    mount('/sample-analysis?scopeId=unauthorized');
    expect((screen.getByLabelText('Scope') as HTMLSelectElement).value).toBe('unauthorized');
    expect(screen.getByText(/Requested Scope: unauthorized/)).toBeTruthy();
  });
  it('renders inherited multi-ID selection without narrowing it', () => {
    mount('/sample-analysis?selectedEquipmentIds=A&selectedEquipmentIds=B');
    expect(screen.getByRole('option', { name: 'Inherited: A, B' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('room'), { target: { value: 'none' } });
    expect(readLocation(window.location.pathname + window.location.search).context.selection).toEqual(['A', 'B']);
  });
  it('reports future version errors without URL rewriting or partial navigation', () => {
    const url = '/sample-analysis?v=99&roomNames=%ZZ'; mount(url);
    expect(screen.getByRole('alert').textContent).toContain('unsupported_version');
    expect(window.location.pathname + window.location.search).toBe(url);
    expect((screen.getByRole('button', { name: 'Sample overview' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('restores URL-owned state on browser popstate', () => {
    mount(origin); fireEvent.click(screen.getByRole('button', { name: 'Sample reference' }));
    window.history.replaceState(null, '', origin); fireEvent.popState(window);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Sample analysis');
    expect(screen.getAllByText(/Supported · server validation pending/)).toHaveLength(3);
  });
  it('renders canonical expanded/collapsed sidebar and header dimensions', () => {
    mount(); expect(shellDimensions).toEqual({ expanded: 270, collapsed: 64, header: 54 });
    expect(document.querySelector('aside')?.style.width).toBe('270px');
    expect(document.querySelector('header')?.style.height).toBe('54px');
    fireEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }));
    expect(document.querySelector('aside')?.style.width).toBe('64px');
    expect(screen.getByRole('button', { name: 'Sample reference' })).toBeTruthy();
  });
  it('opens palette with Cmd+K and closes with Escape and returns focus', async () => {
    const user = userEvent.setup(); mount();
    const trigger = screen.getByRole('button', { name: 'Search ⌘K' }); trigger.focus();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('button')).toHaveLength(4);
    expect(within(dialog).queryByRole('textbox')).toBeNull();
    await user.keyboard('{Escape}'); expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it('palette uses the same context-preserving registry navigation', () => {
    mount(origin); fireEvent.click(screen.getByRole('button', { name: 'Search ⌘K' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Sample reference/ }));
    expect(window.location.pathname).toBe('/sample-reference');
    expect(readLocation(window.location.pathname + window.location.search).context.selection).toEqual([]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('requires exactly seven named slots at runtime and exposes no shell injection props', () => {
    const slots: PageSlots = { title: 't', description: 'd', primaryAction: null, secondaryActions: null, contextExtension: null, content: null, dataTrustSummary: 'fixture' };
    expect(Object.keys(slots)).toEqual(slotNames);
    expect(() => PlatformPage({ ...slots, children: 'bad' } as unknown as PageSlots)).toThrow('exactly seven');
    expect(() => PlatformPage({ title: 'missing slots' } as PageSlots)).toThrow('exactly seven');
    render(<PlatformPage {...slots} />); expect(document.querySelector('header')).toBeNull(); expect(document.querySelector('aside')).toBeNull();
  });
  it('roundtrips opaque context and keeps current unknown keys until menu transfer', () => {
    const { context, menu } = readLocation(origin);
    expect(readLocation(writeLocation(menu, context)).context).toEqual(context);
    expect(readLocation(writeLocation(menus[2], context, true)).context.extras).toEqual([]);
  });
});
