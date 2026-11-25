import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { contextCapabilities, defineEndpoint, groupId, menuPermission, type PanelBinding } from '@ap/contracts';
import { I18nProvider } from '../../i18n';
import { useAnalysisSelectionChips, useAnalysisSelectionOutput } from '../../context/analysisSelection';
import { PlatformProvider, usePlatform } from '../../platform/platform';
import { lentPanelOutputs } from '../../platform/lent-panel-platform';
import { testAdapter, testMenu, testSession, testSpace } from '../../testing';
import { LentPanel, registerLentPanel, type LentPanelProps } from '../LentPanel';
import { lentOutputProblem } from '../analysis-selections';
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
  return createRegistry({
    spaces: [testSpace()], groups: [{ id: groupId('overview'), label: home.label, icon: home.icon, space: testSpace().id }],
    menus: [home, receiver, owner], permissions: [receiving, owning, reading],
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

  it('keeps an unbound lent output a no-op, as before', async () => {
    const { outputs: _, ...unbound } = bound;
    mount(unbound);
    expect(await screen.findByText('outputs:none')).toBeTruthy();
    act(() => screen.getByRole('button', { name: 'pick' }).click());
    expect(selected).toBe(false);
    expect(screen.getByText('days:')).toBeTruthy();
  });

  it('gives the lent writer a setPage that refuses any key the binding does not map', () => {
    const calls: unknown[] = [];
    const receiver = { setPage: (patch: unknown) => calls.push(patch) } as unknown as Parameters<typeof lentPanelOutputs>[0];
    const outputs = lentPanelOutputs(receiver, source, { picked: { key: 'days' } })!;
    outputs.receiver.setPage({ days: '2026-09-21/2026-09-23' });
    expect(() => outputs.receiver.setPage({ other: 'x' })).toThrow(/only the receiving keys/);
    expect(() => outputs.receiver.setPage({ days: null, other: 'x' })).toThrow(/only the receiving keys/);
    expect(calls).toEqual([{ days: '2026-09-21/2026-09-23' }]);
    expect(lentPanelOutputs(receiver, source, undefined)).toBeNull();
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
