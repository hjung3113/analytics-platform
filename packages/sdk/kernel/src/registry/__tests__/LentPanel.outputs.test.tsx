import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import { contextCapabilities, defineEndpoint, groupId, menuPermission, type PanelBinding } from '@ap/contracts';
import { I18nProvider } from '../../i18n';
import { useAnalysisSelectionChips, useAnalysisSelectionOutput } from '../../context/analysisSelection';
import { PlatformProvider, usePlatform } from '../../platform/platform';
import { lentPanelOutputs } from '../../platform/lent-panel-platform';
import { testAdapter, testMenu, testSession, testSpace } from '../../testing';
import { LentPanel, registerLentPanel, type LentPanelProps } from '../LentPanel';
import { lentOutputProblem, menuAnalysisSelections } from '../analysis-selections';
import { createRegistry } from '../registry';

// #2763 (ADR-0176): a lent panel's analysis selection output may write a selection key the receiving menu owns, and nothing else.
const receiving = menuPermission('receiver:view');
const owning = menuPermission('source:view');
const reading = menuPermission('data:read');
const spec = defineEndpoint<Record<string, never>, string>({
  id: 'source.days', menuId: 'source', paramKeys: {}, permission: reading,
  context: { time: 'apply' }, requiresScope: true, kinds: [], mergeTimeDomain: false,
});
const source = 'source/days';
const context = contextCapabilities(spec.context);
const sourceTitle = { ko: '일별 추세', en: 'Daily trend' };
const bound: PanelBinding = {
  source,
  context: { scopeId: { kind: 'context', key: 'scopeId' }, time: { kind: 'context', key: 'time' } },
  outputs: { picked: { kind: 'page', key: 'days' } },
};
function registryWith(binding: PanelBinding) {
  const receiver = testMenu({
    id: 'receiver', path: '/receiver', primary: false, permission: receiving, requiresScope: true, context, pageKeys: ['days', 'other'], contextResetKeys: ['days'],
    analysisSelectionInbound: [{ key: 'days', dimension: 'date', shape: 'range', label: { ko: '날짜', en: 'Date' } }],
    lentPanels: [binding],
  });
  const owner = testMenu({
    id: 'source', path: '/source', primary: false, permission: owning, requiresScope: true, context, pageKeys: ['picked'], contextResetKeys: ['picked'],
    panels: [{
      id: 'days', title: sourceTitle, queryInputs: {}, displayInputs: {}, grain: 'dailyStat', endpoints: [spec],
      outputs: [{ key: 'picked', action: 'select', selection: { dimension: 'date', shape: 'range' } }],
    }],
  });
  const home = testMenu({ path: '/overview' });
  // Another menu that receives a date range, to see the lent-written key carry across menus (R C5).
  const target = testMenu({
    id: 'target', path: '/target', primary: false, permission: receiving, pageKeys: ['span'], contextResetKeys: ['span'],
    analysisSelectionInbound: [{ key: 'span', dimension: 'date', shape: 'range', label: { ko: '날짜', en: 'Date' } }],
  });
  return createRegistry({
    spaces: [testSpace()], groups: [{ id: groupId('overview'), label: home.label, icon: home.icon, space: testSpace().id }],
    menus: [home, receiver, owner, target], permissions: [receiving, owning, reading],
  });
}
const url = '/mars/receiver?v=1&scopeId=MEM&from=2026-09-20T00:00:00&to=2026-09-27T00:00:00';

let selected: boolean | undefined;
function SourceDays({ outputs }: LentPanelProps) {
  const output = useAnalysisSelectionOutput('days', 'picked');
  return <>
    <p>{`outputs:${outputs?.join(',') ?? 'none'}`}</p>
    <button type="button" onClick={() => { selected = output.select({ shape: 'range', from: '2026-09-21', to: '2026-09-23' }); }}>pick</button>
  </>;
}
registerLentPanel(source, SourceDays);

function Receiver() {
  const { pageParam } = usePlatform();
  const { chips } = useAnalysisSelectionChips();
  return <>
    <p>{`days:${pageParam('days') ?? ''}`}</p>
    <p>{`chips:${chips.map(chip => `${chip.key}<${chip.source?.title.ko ?? '-'}`).join(',')}`}</p>
    <LentPanel source={source} />
  </>;
}

function mount(binding: PanelBinding) {
  const session = testSession([receiving, owning, reading]);
  window.history.replaceState(null, '', url);
  render(<I18nProvider><PlatformProvider registry={registryWith(binding)} adapter={testAdapter({ session: () => session })}><Receiver /></PlatformProvider></I18nProvider>);
}

afterEach(() => { cleanup(); selected = undefined; });

describe('lent panel outputs (#2763)', () => {
  it('writes only the bound receiving key, and the chip names the borrowed chart', async () => {
    mount(bound);
    expect(await screen.findByText('outputs:picked')).toBeTruthy();
    act(() => screen.getByRole('button', { name: 'pick' }).click());
    expect(selected).toBe(true);
    expect(screen.getByText('days:2026-09-21/2026-09-23')).toBeTruthy();
    expect(screen.getByText('chips:days<일별 추세')).toBeTruthy();
    expect(window.location.search).not.toContain('picked=');
  });

  it('refuses a select callback kept after the lent panel is closed (R C2)', async () => {
    let kept: ((next: null | { shape: 'range'; from: string; to: string }) => boolean) | undefined;
    function Keeper() {
      const output = useAnalysisSelectionOutput('days', 'picked');
      kept = output.select;
      return null;
    }
    registerLentPanel(source, Keeper);
    function Toggle() {
      const [open, setOpen] = useState(true);
      const { pageParam } = usePlatform();
      return <>
        <p>{`days:${pageParam('days') ?? ''}`}</p>
        <button type="button" onClick={() => setOpen(false)}>close</button>
        {open && <LentPanel source={source} />}
      </>;
    }
    const session = testSession([receiving, owning, reading]);
    window.history.replaceState(null, '', url);
    render(<I18nProvider><PlatformProvider registry={registryWith(bound)} adapter={testAdapter({ session: () => session })}><Toggle /></PlatformProvider></I18nProvider>);
    await screen.findByText('close');
    expect(kept).toBeDefined();
    act(() => screen.getByRole('button', { name: 'close' }).click());
    let result: boolean | undefined;
    act(() => { result = kept!({ shape: 'range', from: '2026-09-21', to: '2026-09-23' }); });
    expect(result).toBe(false);
    expect(screen.getByText('days:')).toBeTruthy();
    registerLentPanel(source, SourceDays);
  });

  it('carries a lent-written key to another menu like the menu\'s own output (R C5)', async () => {
    let href: string | null = null;
    function Linker() {
      const platform = usePlatform();
      href = platform.resolveSelectionLink('target').href;
      return null;
    }
    const session = testSession([receiving, owning, reading]);
    window.history.replaceState(null, '', `${url}&days=2026-09-21/2026-09-23`);
    render(<I18nProvider><PlatformProvider registry={registryWith(bound)} adapter={testAdapter({ session: () => session })}><Linker /></PlatformProvider></I18nProvider>);
    expect(decodeURIComponent(href ?? '')).toContain('span=2026-09-21/2026-09-23');
  });

  it('keeps an unbound lent output a no-op, as before', async () => {
    const { outputs: _, ...unbound } = bound;
    mount(unbound);
    expect(await screen.findByText('outputs:none')).toBeTruthy();
    act(() => screen.getByRole('button', { name: 'pick' }).click());
    expect(selected).toBe(false);
    expect(screen.getByText('days:')).toBeTruthy();
  });

  it('gives the lent writer a setPage that refuses any key the binding does not map', () => {
    const calls: unknown[][] = [];
    // A full receiver double: the output object must not carry any of its other writes (R2 C1).
    const receiver = {
      setPage: (...args: unknown[]) => calls.push(args), navigate: () => true, setGlobal: () => {}, resetContext: () => {},
      route: null, pageParam: () => null, pageParams: () => [], registry: {},
    } as unknown as Parameters<typeof lentPanelOutputs>[0];
    const lifetime = new AbortController();
    let current = true;
    const outputs = lentPanelOutputs(receiver, source, { picked: { key: 'days' } }, lifetime.signal, () => current)!;
    (outputs.receiver.setPage as (...args: unknown[]) => void)({ days: '2026-09-21/2026-09-23' }, { replace: true, focus: 'main' });
    // A session or revision change ends writes at call time, before React commits (R2 C2).
    current = false;
    expect(outputs.alive()).toBe(false);
    outputs.receiver.setPage({ days: '2026-09-20/2026-09-21' });
    current = true;
    expect(() => outputs.receiver.setPage({ other: 'x' })).toThrow(/only the receiving keys/);
    expect(() => outputs.receiver.setPage({ days: null, other: 'x' })).toThrow(/only the receiving keys/);
    expect(Object.keys(outputs.receiver).sort()).toEqual(['pageParam', 'pageParams', 'registry', 'route', 'setPage']);
    lifetime.abort();
    outputs.receiver.setPage({ days: '2026-09-22/2026-09-23' });
    expect(outputs.alive()).toBe(false);
    expect(calls).toEqual([[{ days: '2026-09-21/2026-09-23' }]]);
    expect(lentPanelOutputs(receiver, source, undefined, lifetime.signal)).toBeNull();
  });

  it.each([
    ['an unknown source output', { missing: { kind: 'page', key: 'days' } }, /"missing" is not an analysis selection output/],
    ['a Context target', { picked: { kind: 'context', key: 'time' } }, /must bind a receiving page key/],
    ['a receiving page key that is not a selection channel', { picked: { kind: 'page', key: 'other' } }, /must write an analysis selection key of the receiving menu, not "other"/],
    ['a non-map', ['picked'], /outputs must be a map/],
  ])('refuses %s at registration', (_name, outputs, message) => {
    expect(() => registryWith({ ...bound, outputs } as unknown as PanelBinding)).toThrow(message);
  });
});

describe('lentOutputProblem (#2763)', () => {
  const channels = new Map([['days', { dimension: 'date', shape: 'range' }]]);
  const declaration = { outputs: [{ key: 'picked', action: 'select', selection: { dimension: 'date', shape: 'range' } }] } as const;
  it('allows a receiving channel of the same dimension and shape', () => {
    expect(lentOutputProblem(channels, declaration, 'picked', { kind: 'page', key: 'days' })).toBeNull();
  });
  it.each([
    ['dimension', new Map([['days', { dimension: 'time', shape: 'range' }]])],
    ['shape', new Map([['days', { dimension: 'date', shape: 'set' }]])],
  ])('refuses a different %s', (_name, receiver) => {
    expect(lentOutputProblem(receiver, declaration, 'picked', { kind: 'page', key: 'days' })).toMatch(/does not match "days"/);
  });
});

describe('menuAnalysisSelections with lent panels (#2763)', () => {
  const menu = { panels: [], analysisSelectionInbound: [{ key: 'days', dimension: 'date', shape: 'range' }] } as const;
  const source = {
    title: { ko: '원본', en: 'Source' },
    outputs: [{ key: 'picked', action: 'select', selection: { dimension: 'date', shape: 'range' } }],
    queryInputs: { page: [{ key: 'within', selection: 'filter' }] }, displayInputs: {},
  } as const;
  it('lists a lent writer after the menu, and a lent page-bound filter input as a reader (R C6)', () => {
    const lent = [{ binding: { source: 'src/days', outputs: { picked: { kind: 'page', key: 'days' } }, page: { within: { kind: 'page', key: 'days' } } }, source }] as const;
    const channel = menuAnalysisSelections(menu, lent).get('days');
    expect(channel?.writers.map(writer => [writer.panelId, writer.title.ko])).toEqual([['src/days', '원본']]);
    expect(channel?.readers).toEqual([{ panelId: 'src/days', use: 'filter' }]);
    expect(menuAnalysisSelections(menu).get('days')?.writers).toEqual([]);
  });
});
