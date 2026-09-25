import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App, shellDimensions } from './App';
import { FIXTURE_NOTICE, menus } from './registry';
import { RETURN_KEY, readLocation, writeLocation } from './kernel';
import { PlatformPage, type PageSlots, slotNames } from './PlatformPage';
afterEach(cleanup);
function mount(url = '/sample-analysis') { window.history.replaceState(null, '', url); return render(<App />); }
const here = () => window.location.pathname + window.location.search;
// Global controls are Radix Selects (shadcn port): pick an option the way a pointer user does instead of firing native change events.
async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  await user.click(screen.getByLabelText(label));
  await user.click(screen.getByRole('option', { name: option }));
}
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
    expect(document.querySelector('[data-slot=content]')?.textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Sample overview' }));
    expect(screen.getByText(/Reference only/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sample analysis' }));
    expect(screen.getAllByText(/Supported · server validation pending/)).toHaveLength(3);
    expect(readLocation(window.location.pathname + window.location.search).context.selection).toEqual([]);
    // Analysis carries only the synthetic drill-down rows that exercise the detail Context Link.
    expect(within(screen.getByRole('list', { name: 'Synthetic executions' })).getAllByRole('button', { name: /^Open detail / })).toHaveLength(3);
  });
  it('uses codec for controls and preserves fixed selection when condition changes', async () => {
    const user = userEvent.setup(); mount();
    await choose(user, 'Scope', 'fixture-scope-b');
    await choose(user, 'room', 'fixture-room-b');
    await choose(user, 'Selection', 'fixture-equipment-a');
    await choose(user, 'Condition', 'stgroup: fixture-group');
    const state = readLocation(here()).context;
    expect(state.scope_id).toBe('fixture-scope-b'); expect(state.room_names).toEqual(['fixture-room-b']);
    expect(state.selection).toEqual(['fixture-equipment-a']); expect(state.condition?.axis).toBe('stgroup');
    expect(screen.getByLabelText('Condition').textContent).toBe('stgroup: fixture-group');
    expect(screen.getAllByLabelText('Scope')).toHaveLength(1);
  });
  it('matches URL conditions to JSON-string option values and clears through the absent sentinel', async () => {
    const user = userEvent.setup(); mount(origin);
    const condition = screen.getByLabelText('Condition');
    expect(condition.textContent).toBe('team: fixture-team');
    await user.click(condition);
    expect(screen.getAllByRole('option', { name: 'team: fixture-team' })).toHaveLength(1);
    expect(screen.getByRole('option', { name: 'team: fixture-team' }).getAttribute('data-state')).toBe('checked');
    await user.click(screen.getByRole('option', { name: 'Not selected' }));
    const state = readLocation(here()).context;
    expect(state.condition).toBeNull(); expect(state.selection).toEqual([]);
    expect(condition.textContent).toBe('Not selected');
  });
  it('never defaults absent scope and preserves explicit unknown scope as unverified', async () => {
    mount(); expect(screen.getByText(/Scope selection required/)).toBeTruthy();
    expect(screen.getByLabelText('Scope').textContent).toBe('Select scope'); cleanup();
    const user = userEvent.setup(); mount('/sample-analysis?scopeId=unauthorized');
    expect(screen.getByLabelText('Scope').textContent).toBe('unauthorized · unverified');
    await user.click(screen.getByLabelText('Scope'));
    expect(screen.getByRole('option', { name: 'unauthorized · unverified' }).getAttribute('data-state')).toBe('checked');
    await user.keyboard('{Escape}');
    expect(screen.getByText(/Requested Scope: unauthorized/)).toBeTruthy();
  });
  it('keeps an opaque scopeId of "__absent" distinct from the placeholder option and clearable', async () => {
    const user = userEvent.setup(); mount('/sample-analysis?scopeId=__absent');
    expect(screen.getByText(/Requested Scope: __absent/)).toBeTruthy();
    await user.click(screen.getByLabelText('Scope'));
    const options = screen.getAllByRole('option');
    expect(options.map(option => option.textContent)).toEqual(['Select scope', 'fixture-scope-a', 'fixture-scope-b', '__absent · unverified']);
    const checked = options.filter(option => option.getAttribute('data-state') === 'checked');
    expect(checked).toHaveLength(1);
    expect(checked[0].textContent).toBe('__absent · unverified');
    await user.click(screen.getByRole('option', { name: 'Select scope' }));
    expect(here()).toBe('/sample-analysis?v=1');
    expect(readLocation(here()).context.scope_id).toBeNull();
    expect(screen.getByLabelText('Scope').textContent).toBe('Select scope');
  });
  it('renders inherited multi-ID selection without narrowing it', async () => {
    const user = userEvent.setup(); mount('/sample-analysis?selectedEquipmentIds=A&selectedEquipmentIds=B');
    expect(screen.getByLabelText('Selection').textContent).toBe('Inherited: A, B');
    await user.click(screen.getByLabelText('Selection'));
    expect(screen.getByRole('option', { name: 'Inherited: A, B' })).toBeTruthy();
    await user.keyboard('{Escape}');
    await choose(user, 'room', 'Explicit empty set');
    expect(readLocation(here()).context.room_names).toEqual([]);
    expect(readLocation(here()).context.selection).toEqual(['A', 'B']);
  });
  it('keeps inherited multi-ID selection when the inherited sentinel option is re-selected', async () => {
    const url = '/sample-analysis?selectedEquipmentIds=fixture-equipment-a&selectedEquipmentIds=fixture-equipment-b';
    const user = userEvent.setup(); mount(url);
    const history = window.history.length;
    expect(screen.getByLabelText('Selection').textContent).toBe('Inherited: fixture-equipment-a, fixture-equipment-b');
    await choose(user, 'Selection', 'Inherited: fixture-equipment-a, fixture-equipment-b');
    expect(readLocation(here()).context.selection).toEqual(['fixture-equipment-a', 'fixture-equipment-b']);
    expect(here()).toBe(url); expect(window.history.length).toBe(history);
    expect(screen.queryByRole('listbox')).toBeNull();
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
  it('opens detail through the Context Link with the destination as a path segment, never touching Selection', () => {
    const selected = '/sample-analysis?scopeId=fixture-scope-a&selectedEquipmentIds=fixture-equipment-a&selectedEquipmentIds=fixture-equipment-b&lotIds=L&unknown=local';
    mount(selected);
    fireEvent.click(screen.getByRole('button', { name: 'Open detail fixture-equipment-c' }));
    expect(window.location.pathname).toBe('/equipment/fixture-equipment-c');
    const params = new URLSearchParams(window.location.search);
    expect(params.getAll('selectedEquipmentIds')).toEqual(['fixture-equipment-a', 'fixture-equipment-b']);
    expect(params.get(RETURN_KEY)).toBe(selected); expect(params.has('unknown')).toBe(false);
    const detail = readLocation(here()).context;
    expect(detail.destination).toBe('fixture-equipment-c'); expect(detail.selection).toEqual(['fixture-equipment-a', 'fixture-equipment-b']);
    expect(detail.scope_id).toBe('fixture-scope-a'); expect(detail.unapplied_globals).toEqual([['lotIds', 'L']]);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Sample equipment detail');
    expect(document.querySelector('[data-destination]')?.textContent).toBe('fixture-equipment-c');
    expect(document.querySelector('[data-context=Selection]')?.textContent).toMatch(/^Selection: fixture-equipment-a, fixture-equipment-b · /);
    // A destination that is already in the Selection does not narrow it either.
    fireEvent.click(screen.getByRole('link', { name: '← Back to Sample analysis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open detail fixture-equipment-a' }));
    expect(window.location.pathname).toBe('/equipment/fixture-equipment-a');
    expect(readLocation(here()).context.selection).toEqual(['fixture-equipment-a', 'fixture-equipment-b']);
    // Leaving detail through the sidebar is an ordinary menu transfer: destination and return target are dropped.
    fireEvent.click(screen.getByRole('button', { name: 'Sample reference' }));
    expect(here()).toBe('/sample-reference?v=1&scopeId=fixture-scope-a&selectedEquipmentIds=fixture-equipment-a&selectedEquipmentIds=fixture-equipment-b&lotIds=L');
  });
  it('Back restores the exact pre-entry origin URL even after Context edits on the detail page', async () => {
    const user = userEvent.setup(); mount(origin);
    fireEvent.click(screen.getByRole('button', { name: 'Open detail fixture-equipment-c' }));
    expect(here()).not.toBe(origin);
    fireEvent.click(screen.getByRole('link', { name: '← Back to Sample analysis' }));
    expect(here()).toBe(origin);
    fireEvent.click(screen.getByRole('button', { name: 'Open detail fixture-equipment-c' }));
    await choose(user, 'room', 'fixture-room-b');
    expect(window.location.pathname).toBe('/equipment/fixture-equipment-c');
    expect(readLocation(here()).context.room_names).toEqual(['fixture-room-b']);
    fireEvent.click(screen.getByRole('link', { name: '← Back to Sample analysis' }));
    expect(here()).toBe(origin);
    expect(readLocation(here()).context).toEqual(readLocation(origin).context);
  });
  it('shows detail-unsupported Context as not used and re-applies it on the origin after Back', () => {
    mount('/sample-analysis?roomNames=fixture-room-a&equipmentGroup=%7B%22axis%22%3A%22team%22%2C%22id%22%3A%22fixture-team%22%7D&selectedEquipmentIds=fixture-equipment-a&selectedEquipmentIds=fixture-equipment-b');
    const capability = (key: string) => document.querySelector(`[data-context=${key}] small`)?.textContent;
    expect([capability('room'), capability('Condition'), capability('Selection')]).toEqual(Array(3).fill(' · Supported · server validation pending'));
    fireEvent.click(screen.getByRole('button', { name: 'Open detail fixture-equipment-d' }));
    expect([capability('room'), capability('Condition'), capability('Selection')]).toEqual([' · Reference only', ' · Not used on this page', ' · Not used on this page']);
    fireEvent.click(screen.getByRole('link', { name: '← Back to Sample analysis' }));
    expect([capability('room'), capability('Condition'), capability('Selection')]).toEqual(Array(3).fill(' · Supported · server validation pending'));
  });
  it.each([
    ['missing', '/equipment/fixture-equipment-c?v=1'],
    ['external', '/equipment/fixture-equipment-c?returnTo=' + encodeURIComponent('https://evil.example/sample-analysis')],
    ['protocol-relative', '/equipment/fixture-equipment-c?returnTo=' + encodeURIComponent('//evil.example/sample-analysis')],
    ['another detail', '/equipment/fixture-equipment-c?returnTo=' + encodeURIComponent('/equipment/fixture-equipment-d?v=1')],
    ['duplicated', '/equipment/fixture-equipment-c?returnTo=%2Fsample-analysis&returnTo=%2Fsample-reference'],
  ])('refuses a %s Back target instead of guessing one', (_, url) => {
    mount(url);
    expect(document.querySelector('[data-destination]')?.textContent).toBe('fixture-equipment-c');
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Return context unavailable');
  });
  // §12: the Shell picks the archetype from the registry's pageType and places it inside PlatformPage's content slot only.
  const regionsOf = () => [...document.querySelectorAll('[data-slot=content] > [data-archetype] > [data-region]')].map(node => node.getAttribute('aria-label'));
  it('renders sample-overview as the Overview archetype with empty region landmarks', () => {
    mount('/sample-overview');
    expect(document.querySelector('[data-slot=content] > [data-archetype]')?.getAttribute('data-archetype')).toBe('overview');
    expect(regionsOf()).toEqual(['Primary KPI / Summary', 'Main trend or status', 'Attention list']);
    expect(document.querySelector('[data-slot=content]')?.textContent).toBe('');
    // Page Header, Global Context and Data Trust stay Shell slots outside the archetype.
    expect(screen.getByRole('heading', { level: 1 }).closest('[data-archetype]')).toBeNull();
    expect(screen.getByRole('region', { name: 'Global Context' }).closest('[data-archetype]')).toBeNull();
    expect(document.querySelector('[data-slot=dataTrustSummary]')?.closest('[data-archetype]')).toBeNull();
  });
  it('renders sample-analysis as the Analysis Workspace archetype with the Context Link rows in Breakdown table', () => {
    mount();
    expect(document.querySelector('[data-slot=content] > [data-archetype]')?.getAttribute('data-archetype')).toBe('analysis');
    expect(regionsOf()).toEqual(['KPI summary', 'Primary chart', 'Selection / Annotation', 'Breakdown table']);
    const breakdown = screen.getByRole('region', { name: 'Breakdown table' });
    expect(within(breakdown).getByRole('list', { name: 'Synthetic executions' })).toBe(screen.getByRole('list', { name: 'Synthetic executions' }));
    expect(within(breakdown).getAllByRole('button', { name: /^Open detail / })).toHaveLength(3);
    for (const name of ['KPI summary', 'Primary chart', 'Selection / Annotation']) expect(screen.getByRole('region', { name }).textContent).toBe('');
  });
  it('renders sample-reference as the Catalog archetype and keeps the detail page outside any archetype', () => {
    mount('/sample-reference');
    expect(document.querySelector('[data-slot=content] > [data-archetype]')?.getAttribute('data-archetype')).toBe('catalog');
    expect(regionsOf()).toEqual(['Catalog list', 'Definition detail', 'Version', 'Ownership', 'Coverage', 'Usage / Dependency', 'History']);
    cleanup(); mount('/equipment/fixture-equipment-c');
    expect(document.querySelector('[data-archetype]')).toBeNull();
    expect(document.querySelector('[data-destination]')?.textContent).toBe('fixture-equipment-c');
  });
  it('roundtrips opaque context and keeps current unknown keys until menu transfer', () => {
    const { context, menu } = readLocation(origin);
    expect(readLocation(writeLocation(menu, context)).context).toEqual(context);
    expect(readLocation(writeLocation(menus[2], context, true)).context.extras).toEqual([]);
  });
});
