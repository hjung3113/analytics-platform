import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contextCapabilities, defineEndpoint, emptyGlobal, groupId, menuPermission, type ApiResponse, type MenuQuery } from '@ap/contracts';
import { useEffect, useState } from 'react';
import { HeldAnalysisSelections, type HeldAnalysisSelection } from '../../context/analysisSelection';
import { I18nProvider } from '../../i18n';
import { PlatformProvider, usePlatform } from '../../platform/platform';
import { useQueryDraft } from '../../query/query-draft';
import { useMenuFetch, useMenuQuery, type MenuFetch } from '../../query/query';
import { settleQueries, testAdapter, testMenu, testSession, testSpace } from '../../testing';
import { at } from '../../test-support';
import { LentPanel, useLentPanel, registerLentPanel, type LentPanelProps } from '../LentPanel';
import { createRegistry } from '../registry';

const receiving = menuPermission('receiver:view');
const owning = menuPermission('source:view');
const reading = menuPermission('data:read');
const spec = defineEndpoint<{ level: unknown }, string>({
  id: 'source.summary', menuId: 'source', paramKeys: { level: true }, permission: reading,
  context: { time: 'apply', selection: 'apply' }, requiresScope: true, kinds: [], mergeTimeDomain: false,
});
const undeclared = { ...spec, id: 'source.other' };
const source = 'source/summary';
const context = contextCapabilities(spec.context);
const receiver = testMenu({
  id: 'receiver', path: '/receiver', primary: false, permission: receiving, requiresScope: true, context, pageKeys: ['chosen'],
  lentPanels: [{
    source,
    context: { scopeId: { kind: 'context', key: 'scopeId' }, time: { kind: 'context', key: 'time' }, selection: { kind: 'value', key: 'equipment' } },
    page: { level: { kind: 'value', key: 'mapped' } },
  }],
});
const owner = testMenu({
  id: 'source', path: '/source', primary: false, permission: owning, requiresScope: true, context, pageKeys: ['level'],
  panels: [{
    id: 'summary', title: { ko: '요약', en: 'Summary' }, queryInputs: { page: [{ key: 'level', required: true }] },
    displayInputs: {}, outputs: [], grain: 'dailyStat', endpoints: [spec],
  }],
});
const home = testMenu({ path: '/overview' });
const registry = createRegistry({
  spaces: [testSpace()], groups: [{ id: groupId('overview'), label: home.label, icon: home.icon, space: testSpace().id }],
  menus: [home, receiver, owner], permissions: [receiving, owning, reading],
});
const queryContext = { scopeId: 'MEM', from: '2026-09-25T00:00:00', to: '2026-09-27T00:00:00' };
const url = '/mars/receiver?v=1&scopeId=MEM&from=2026-09-25T00:00:00&to=2026-09-27T00:00:00&selectedEquipmentIds=EQ01&selectedEquipmentIds=EQ02&chosen=held';
const values = { equipment: 'EQ02', mapped: 'mapped-level' };
const answer: ApiResponse<string> = { outcome: 'ok', data: 'from source', assessments: [], trust: null, correlationId: 'synthetic' };

function SourceSummary({ inputs, actions }: LentPanelProps) {
  const query = useMenuQuery(spec, { level: inputs.page.level });
  useMenuQuery(undeclared, { level: inputs.page.level });
  return <div>
    <p>{`${inputs.context.scopeId}/${inputs.context.selection?.join(',')}/${inputs.page.level}`}</p>
    <p>{query.response?.data}</p>
    {actions}
  </div>;
}

function Receiver({ selection }: { selection: Readonly<Record<string, unknown>> }) {
  const verdict = useLentPanel(source, selection);
  return <>
    {!verdict.allowed ? <p>{verdict.reason.kind}</p> : null}
    <LentPanel source={source} values={selection} actions={<button type="button">Close</button>} />
  </>;
}

function mount(selection: Readonly<Record<string, unknown>>, { permission = true, menuQuery = vi.fn(async () => answer), panelRegistry = registry } = {}) {
  const session = testSession(permission ? [receiving, owning, reading] : [receiving, owning]);
  const adapter = testAdapter({ session: () => session, menuQuery });
  window.history.replaceState(null, '', url);
  const tree = (selected: Readonly<Record<string, unknown>>) => (
    <I18nProvider><PlatformProvider registry={panelRegistry} adapter={adapter}><Receiver selection={selected} /></PlatformProvider></I18nProvider>
  );
  const result = render(tree(selection));
  return { menuQuery, update: (selected: Readonly<Record<string, unknown>>) => result.rerender(tree(selected)) };
}

afterEach(cleanup);

describe('LentPanel held time', () => {
  const holdTime = { key: 'period', dimension: 'wall-clock' };
  const heldPeriod = { shape: 'range', from: '2026-09-21T00:00:00', to: '2026-09-23T00:00:00' } as const;
  const heldValue = { dimension: holdTime.dimension, selection: heldPeriod };

  function mountHeld(held: HeldAnalysisSelection, accepts: (inputs: LentPanelProps['inputs']) => string | undefined, { panelRegistry = registry, component = SourceSummary } = {}) {
    registerLentPanel(source, { component, accepts });
    const session = testSession([receiving, owning, reading]);
    const menuQuery = vi.fn(async () => answer);
    const adapter = testAdapter({ session: () => session, menuQuery });
    window.history.replaceState(null, '', url);
    function Instance({ optIn }: { optIn: boolean }) {
      const options = optIn ? { holdTime } : undefined;
      const verdict = useLentPanel(source, values, options);
      return <>
        {!verdict.allowed && <p>{verdict.reason.kind}:{verdict.reason.key}</p>}
        <LentPanel source={source} values={values} {...options} />
      </>;
    }
    const tree = (current: Readonly<Record<string, HeldAnalysisSelection>>, optIn = true) =>
      <I18nProvider><PlatformProvider registry={panelRegistry} adapter={adapter}>
        <HeldAnalysisSelections held={current}><Instance optIn={optIn} /></HeldAnalysisSelections>
      </PlatformProvider></I18nProvider>;
    const { rerender } = render(tree({ period: held }));
    return { menuQuery, follow: () => rerender(tree({})), optOut: () => rerender(tree({ period: held }, false)) };
  }

  it('passes only the held period to the source and endpoint, and follows again when cleared', async () => {
    const accepts = vi.fn((_inputs: LentPanelProps['inputs']) => undefined);
    const { menuQuery, follow } = mountHeld(heldValue, accepts);
    await screen.findByText('from source');
    expect(accepts).toHaveBeenCalledWith(expect.objectContaining({
      context: { ...emptyGlobal, scopeId: 'MEM', from: heldPeriod.from, to: heldPeriod.to, selection: ['EQ02'] },
      page: { level: 'mapped-level' },
    }));
    expect(menuQuery).toHaveBeenCalledExactlyOnceWith({
      endpoint: spec.id,
      context: { scopeId: 'MEM', from: heldPeriod.from, to: heldPeriod.to, selection: ['EQ02'] },
      params: { level: 'mapped-level' },
    }, expect.any(AbortSignal));
    expect(window.location.pathname + window.location.search).toBe(url);
    follow();
    await waitFor(() => expect(menuQuery).toHaveBeenLastCalledWith({
      endpoint: spec.id, context: { ...queryContext, selection: ['EQ02'] }, params: { level: 'mapped-level' },
    }, expect.any(AbortSignal)));
  });

  it('reports a source rejection of the held period without querying or falling back', async () => {
    const accepts = vi.fn((inputs: LentPanelProps['inputs']) => inputs.context.from === heldPeriod.from ? 'time' : undefined);
    const { menuQuery, optOut } = mountHeld(heldValue, accepts);
    await screen.findByText('rejected-held:period');
    expect(menuQuery).not.toHaveBeenCalled();
    expect(screen.queryByText('from source')).toBeNull();
    optOut();
    await screen.findByText('from source');
    expect(menuQuery).toHaveBeenCalledTimes(1);
  });

  it('rejects a held period when the source has no bound time and never queries', async () => {
    const [originalBinding] = receiver.lentPanels!;
    const { time: _time, ...bindingContext } = originalBinding!.context!;
    const timelessSpec = { ...spec, context: { selection: 'apply' as const } };
    const timelessContext = contextCapabilities(timelessSpec.context);
    const withoutTime = createRegistry({
      spaces: registry.spaces, groups: registry.groups, permissions: [receiving, owning, reading],
      menus: [
        home,
        { ...receiver, context: timelessContext, lentPanels: [{ ...originalBinding!, context: bindingContext }] },
        { ...owner, context: timelessContext, panels: owner.panels!.map(panel => ({ ...panel, endpoints: [timelessSpec] })) },
      ],
    });
    function SourceWithoutTime({ inputs }: LentPanelProps) {
      const query = useMenuQuery(timelessSpec, { level: inputs.page.level });
      return <p>{query.response?.data}</p>;
    }
    const accepts = vi.fn();
    const { menuQuery, follow } = mountHeld(heldValue, accepts, { panelRegistry: withoutTime, component: SourceWithoutTime });
    await screen.findByText('rejected-held:period');
    expect(accepts).not.toHaveBeenCalled();
    expect(menuQuery).not.toHaveBeenCalled();
    follow();
    await screen.findByText('from source');
    expect(menuQuery).toHaveBeenCalledTimes(1);
  });

  it.each([
    { dimension: 'date', selection: heldPeriod },
    { dimension: holdTime.dimension, selection: { shape: 'set', values: ['EQ02'] } as const },
    { dimension: holdTime.dimension, selection: { ...heldPeriod, from: '2026-02-30T00:00:00' } },
    { dimension: holdTime.dimension, selection: { ...heldPeriod, from: heldPeriod.to } },
  ] satisfies HeldAnalysisSelection[])('rejects a held time with a mismatched dimension, shape or invalid period (%j)', async held => {
    const accepts = vi.fn();
    const { menuQuery } = mountHeld(held, accepts);
    await screen.findByText('rejected-held:period');
    expect(accepts).not.toHaveBeenCalled();
    expect(menuQuery).not.toHaveBeenCalled();
  });
});

describe('LentPanel', () => {
  it('keeps source rendering and its platform reference stable across an equivalent receiver rerender', async () => {
    const observed = vi.fn();
    function Probe({ actions }: LentPanelProps) {
      const [count, setCount] = useState(0);
      observed(usePlatform());
      return <>{actions}<button type="button" onClick={() => setCount(count + 1)}>Source render {count}</button></>;
    }
    registerLentPanel(source, Probe);
    const session = testSession([receiving, owning, reading]);
    const adapter = testAdapter({ session: () => session });
    window.history.replaceState(null, '', url);
    const view = (selection: typeof values, actionLabel: string) => (
      <I18nProvider><PlatformProvider registry={registry} adapter={adapter}>
        <LentPanel source={source} values={selection} actions={<button type="button">{actionLabel}</button>} />
      </PlatformProvider></I18nProvider>
    );
    const { rerender } = render(view(values, 'Close panel'));
    const sourceButton = await screen.findByRole('button', { name: 'Source render 0' });
    const count = observed.mock.calls.length;
    const platform = observed.mock.lastCall?.[0];
    rerender(view({ ...values }, 'Dismiss panel'));
    expect(screen.getByRole('button', { name: 'Dismiss panel' })).toBeTruthy();
    expect(observed).toHaveBeenCalledTimes(count);
    fireEvent.click(sourceButton);
    expect(observed).toHaveBeenCalledTimes(count + 1);
    expect(observed.mock.lastCall?.[0]).toBe(platform);
  });

  it('keeps the missing Selection key available to code and out of both messages', () => {
    const binding = at(registry.lentPanels(receiver.id), 0);
    const verdict = binding.verdict(testSession(binding.permissions), {
      context: { ...emptyGlobal, ...queryContext, selection: ['EQ01'] }, values,
    });
    expect(verdict).toEqual({
      allowed: false, reason: { kind: 'missing-input', key: 'selection', text: {
        ko: '패널에 필요한 설비 선택이 없습니다.', en: 'No equipment is selected for this panel.',
      } },
    });
  });

  it('reports not-registered when the host omits the source menu', () => {
    const panelRegistry = createRegistry({
      spaces: [testSpace()], groups: registry.groups, menus: [home, receiver], permissions: [receiving],
    });
    mount(values, { panelRegistry });
    expect(screen.getByText('not-registered')).toBeTruthy();
  });

  function displayRegistry() {
    return createRegistry({
      spaces: registry.spaces, groups: registry.groups, permissions: [receiving, owning, reading],
      menus: [home, {
        ...receiver,
        lentPanels: receiver.lentPanels!.map(binding => ({ ...binding, display: { labels: { kind: 'value', key: 'aliases' } } })),
      }, {
        ...owner,
        panels: owner.panels!.map(panel => ({ ...panel, display: [{ key: 'labels' }] })),
      }],
    });
  }

  it('passes detached frozen display values without changing the query or the source page', async () => {
    let received: LentPanelProps['inputs'] | undefined;
    function DisplaySummary(props: LentPanelProps) {
      const labels = props.inputs.display?.labels as { alias: string };
      const platform = usePlatform();
      useEffect(() => { received = props.inputs; }, [props.inputs]);
      return <><SourceSummary {...props} /><p>{labels?.alias}</p><p>{`page labels: ${platform.pageParam('labels')}`}</p></>;
    }
    registerLentPanel(source, DisplaySummary);
    const aliases = { alias: 'Initial alias' };
    const { menuQuery, update } = mount({ ...values, aliases }, { panelRegistry: displayRegistry() });
    await screen.findByText('from source');
    expect(screen.getByText('Initial alias')).toBeTruthy();
    expect(screen.getByText('page labels: null')).toBeTruthy();
    expect(received?.display?.labels).toEqual(aliases);
    expect(received?.display?.labels).not.toBe(aliases);
    expect(Object.isFrozen(received?.display)).toBe(true);
    expect(Object.isFrozen(received?.display?.labels)).toBe(true);
    expect(Object.isFrozen(aliases)).toBe(false);
    expect(received?.page).toEqual({ level: 'mapped-level' });
    expect(menuQuery).toHaveBeenCalledWith({
      endpoint: spec.id, context: { ...queryContext, selection: ['EQ02'] }, params: { level: 'mapped-level' },
    }, expect.any(AbortSignal));
    update({ ...values, aliases: { alias: 'Updated alias' } });
    expect(screen.getByText('Updated alias')).toBeTruthy();
    await settleQueries();
    expect(menuQuery).toHaveBeenCalledTimes(1);
  });

  it('keeps a display record with a null constructor field mounted across a receiver rerender', async () => {
    let received: LentPanelProps['inputs'] | undefined;
    function DisplayRecord(props: LentPanelProps) {
      useEffect(() => { received = props.inputs; }, [props.inputs]);
      return <SourceSummary {...props} />;
    }
    registerLentPanel(source, DisplayRecord);
    const { menuQuery, update } = mount({ ...values, aliases: { constructor: null, alias: 'A' } }, { panelRegistry: displayRegistry() });
    await screen.findByText('from source');
    update({ ...values, aliases: { constructor: null, alias: 'A' } });
    await settleQueries();
    expect(screen.getByText('from source')).toBeTruthy();
    expect(received?.display?.labels).toEqual({ constructor: null, alias: 'A' });
    expect(menuQuery).toHaveBeenCalledTimes(1);
  });

  it.each([false, 0, '', [], null].map(value => ({ value })))('passes through the supplied display value $value', async ({ value }) => {
    const accepts = vi.fn(() => undefined);
    registerLentPanel(source, { component: SourceSummary, accepts });
    mount({ ...values, aliases: value }, { panelRegistry: displayRegistry() });
    await screen.findByText('from source');
    expect(accepts).toHaveBeenCalledWith(expect.objectContaining({ display: { labels: value } }));
  });

  it.each([
    ['absent', values],
    ['symbol', { ...values, aliases: Symbol('label') }],
    ['Map', { ...values, aliases: new Map([['alias', 'Label']]) }],
    ['nested Map', { ...values, aliases: { label: new Map() } }],
    ['Uint8Array', { ...values, aliases: new Uint8Array([1]) }],
    ['deep object', { ...values, aliases: Array.from({ length: 9 }).reduce<object>(child => ({ child }), {}) }],
  ] as const)('opens without the %s display value', async (_label, selection) => {
    await expectOmittedDisplay(selection);
  });

  async function expectOmittedDisplay(selection: Readonly<Record<string, unknown>>) {
    const accepts = vi.fn((inputs: LentPanelProps['inputs']) => Object.hasOwn(inputs.display ?? {}, 'labels') ? undefined : 'labels');
    registerLentPanel(source, {
      component: props => <><SourceSummary {...props} /><p>{Object.keys(props.inputs.display ?? {}).length} display values</p></>,
      accepts,
    });
    mount(selection, { panelRegistry: displayRegistry() });
    await screen.findByText('from source');
    expect(screen.getByText('0 display values')).toBeTruthy();
    expect(accepts).toHaveBeenCalled();
    expect(accepts.mock.calls.every(([inputs]) => !Object.hasOwn(inputs.display ?? {}, 'labels'))).toBe(true);
  }

  it.skipIf(typeof SharedArrayBuffer === 'undefined')('omits a SharedArrayBuffer display value', async () => {
    await expectOmittedDisplay({ ...values, aliases: new SharedArrayBuffer(4) });
  });

  it('omits a cyclic display record across a rerender', async () => {
    registerLentPanel(source, props => <><SourceSummary {...props} /><p>{Object.keys(props.inputs.display ?? {}).length} display values</p></>);
    const aliases: Record<string, unknown> = {};
    aliases.self = aliases;
    const selection = { ...values, aliases };
    const { update } = mount(selection, { panelRegistry: displayRegistry() });
    await screen.findByText('from source');
    update({ ...selection });
    expect(screen.getByText('0 display values')).toBeTruthy();
  });

  it('closes the panel and sends no query when the receiver applies Line and the source cannot', async () => {
    registerLentPanel(source, SourceSummary);
    const lineRegistry = createRegistry({
      spaces: registry.spaces, groups: registry.groups, permissions: [receiving, owning, reading],
      menus: [home, { ...receiver, context: { ...context, line: 'apply' } }, owner],
    });
    const session = testSession([receiving, owning, reading]);
    const menuQuery = vi.fn(async () => answer);
    const adapter = testAdapter({ session: () => session, menuQuery });
    window.history.replaceState(null, '', url + '&lineNames=L1');
    render(<I18nProvider><PlatformProvider registry={lineRegistry} adapter={adapter}><Receiver selection={values} /></PlatformProvider></I18nProvider>);
    await settleQueries();
    expect(menuQuery).not.toHaveBeenCalled();
    expect(screen.getByText('unsupported-context')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it.each([
    ['permission', values, false],
    ['missing-input', { equipment: 'EQ02' }, true],
    ['missing-input', { ...values, equipment: 'EQ99' }, true],
    ['missing-input', { ...values, mapped: Symbol('uncloneable') }, true],
    ['missing-input', { ...values, mapped: new Uint8Array([1]) }, true],
  ] as const)('does not mount or query when denied for %s (%j, granted=%s)', async (reason, selection, permission) => {
    registerLentPanel(source, SourceSummary);
    const { menuQuery } = mount(selection, { permission });
    expect(screen.getByText(reason)).toBeTruthy();
    await settleQueries();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    expect(menuQuery).not.toHaveBeenCalled();
  });

  it('queries only the declared source endpoint with narrowed Context and props, leaving the receiver page keys unchanged', async () => {
    registerLentPanel(source, SourceSummary);
    const { menuQuery } = mount(values);
    expect(await screen.findByText('from source')).toBeTruthy();
    expect(screen.getByText('MEM/EQ02/mapped-level')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(menuQuery).toHaveBeenCalledTimes(1);
    expect(menuQuery).toHaveBeenCalledWith({
      endpoint: spec.id, context: { ...queryContext, selection: ['EQ02'] }, params: { level: 'mapped-level' },
    }, expect.any(AbortSignal));
    expect(new URLSearchParams(window.location.search).get('chosen')).toBe('held');
    expect(new URLSearchParams(window.location.search).getAll('selectedEquipmentIds')).toEqual(['EQ01', 'EQ02']);
    expect(window.location.search).not.toContain('level');
  });

  it('gives the source bound screen reads and no writes while header actions keep the receiving screen', async () => {
    function SourceWrites({ actions }: LentPanelProps) {
      const platform = usePlatform();
      const draft = useQueryDraft();
      return <>
        <p>{`source: ${platform.pageParam('level')} / ${platform.pageParam('chosen')} / ${platform.global.selection?.join(',')}`}</p>
        <button type="button" onClick={() => {
          platform.setPage({ chosen: 'source-write' });
          platform.setGlobal({ selection: ['EQ01'] });
          platform.resetContext();
          platform.location.push('/mars/receiver?chosen=location-write');
          draft.setDraftPage({ chosen: 'draft-write' });
          draft.setDraftGlobal({ selection: ['EQ01'] });
          draft.apply();
          draft.reset();
        }}>Source writes</button>
        {actions}
      </>;
    }
    function HeaderAction() {
      const { pageParam, setPage } = usePlatform();
      return <button type="button" onClick={() => setPage({ chosen: 'header-write' })}>{`Header: ${pageParam('chosen')}`}</button>;
    }
    function Screen() {
      const { global } = usePlatform();
      return <>
        <p>{`receiver: ${global.selection?.join(',')}`}</p>
        <LentPanel source={source} values={values} actions={<HeaderAction />} />
      </>;
    }
    registerLentPanel(source, SourceWrites);
    const session = testSession([receiving, owning, reading]);
    const adapter = testAdapter({ session: () => session });
    window.history.replaceState(null, '', url);
    render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter}><Screen /></PlatformProvider></I18nProvider>);
    const writer = await screen.findByRole('button', { name: 'Source writes' });
    const before = window.location.href;
    fireEvent.click(writer);
    expect(window.location.href).toBe(before);
    expect(screen.getByText('receiver: EQ01,EQ02')).toBeTruthy();
    expect(screen.getByText('source: mapped-level / null / EQ02')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Header: held' }));
    expect(new URLSearchParams(window.location.search).get('chosen')).toBe('header-write');
    expect(screen.getByText('receiver: EQ01,EQ02')).toBeTruthy();
  });

  it.each(['accepts', 'source component'] as const)('preserves the receiver and request when the %s tries to change Room', async (mutator) => {
    const roomSpec = { ...spec, context: { ...spec.context, roomNames: 'apply' as const } };
    const roomContext = contextCapabilities(roomSpec.context);
    const lentPanels = receiver.lentPanels;
    if (lentPanels === undefined) throw new Error('missing lent panels');
    const binding = at(lentPanels, 0);
    const roomRegistry = createRegistry({
      spaces: registry.spaces, groups: registry.groups, permissions: [receiving, owning, reading],
      menus: [home, {
        ...receiver, context: roomContext,
        lentPanels: [{
          ...binding,
          context: { ...binding.context, roomNames: { kind: 'context', key: 'roomNames' } },
          page: { level: { kind: 'context', key: 'roomNames' } },
        }],
      }, {
        ...owner, context: roomContext,
        panels: owner.panels!.map(panel => ({ ...panel, endpoints: [roomSpec] })),
      }],
    });
    const addRoom = vi.fn((rooms: string[]) => {
      try { rooms.push('R2'); } catch (error) {
        if (!(error instanceof TypeError)) throw error;
      }
    });
    function Source({ inputs, actions }: LentPanelProps) {
      if (mutator === 'source component') addRoom(inputs.page.level as string[]);
      const query = useMenuQuery(roomSpec, { level: 'fixed' });
      return <>{query.response?.data}{actions}</>;
    }
    const readReceiver = vi.fn();
    function Screen() {
      const { global } = usePlatform();
      return <LentPanel source={source} values={values} actions={
        <button type="button" onClick={() => readReceiver(global)}>Read receiver</button>
      } />;
    }
    registerLentPanel(source, {
      component: Source,
      accepts: inputs => {
        if (mutator === 'accepts') addRoom(inputs.context.roomNames!);
        return undefined;
      },
    });
    const session = testSession([receiving, owning, reading]);
    const menuQuery = vi.fn(async () => answer);
    const adapter = testAdapter({ session: () => session, menuQuery });
    window.history.replaceState(null, '', url + '&roomNames=R1');
    const before = window.location.href;
    render(<I18nProvider><PlatformProvider registry={roomRegistry} adapter={adapter}><Screen /></PlatformProvider></I18nProvider>);
    expect(await screen.findByText('from source')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Read receiver' }));
    expect.soft(window.location.href).toBe(before);
    expect.soft(readReceiver).toHaveBeenCalledWith(expect.objectContaining({ roomNames: ['R1'], selection: ['EQ01', 'EQ02'] }));
    expect.soft(menuQuery).toHaveBeenCalledTimes(1);
    expect.soft(menuQuery).toHaveBeenCalledWith({
      endpoint: roomSpec.id, context: { ...queryContext, roomNames: ['R1'], selection: ['EQ02'] }, params: { level: 'fixed' },
    }, expect.any(AbortSignal));
    expect(addRoom).toHaveBeenCalled();
    expect(addRoom.mock.calls.every(([rooms]) => Object.isFrozen(rooms))).toBe(true);
  });

  it('unmounts when the next selection is incomplete, even if the previous answer arrives late', async () => {
    registerLentPanel(source, SourceSummary);
    let finish!: (value: ApiResponse<string>) => void;
    const reply = new Promise<ApiResponse<string>>(resolve => { finish = resolve; });
    const { menuQuery, update } = mount(values, { menuQuery: vi.fn(() => reply) });
    await waitFor(() => expect(menuQuery).toHaveBeenCalledTimes(1));
    update({ equipment: 'EQ02' });
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    await act(async () => finish(answer));
    await settleQueries();
    expect(screen.queryByText('from source')).toBeNull();
    expect(menuQuery).toHaveBeenCalledTimes(1);
  });

  it('blocks retained fetch and cancels its in-flight request after a required input is lost', async () => {
    let retained: MenuFetch<{ level: unknown }, string>['fetch'] | undefined;
    function SourceFetch() {
      const { fetch, ready } = useMenuFetch(spec);
      useEffect(() => { if (ready) retained = fetch; }, [fetch, ready]);
      return null;
    }
    registerLentPanel(source, SourceFetch);
    let finish!: (value: ApiResponse<string>) => void;
    const reply = new Promise<ApiResponse<string>>(resolve => { finish = resolve; });
    const transport = vi.fn((_request: MenuQuery, _signal?: AbortSignal) => reply);
    const { update } = mount(values, { menuQuery: transport });
    await waitFor(() => expect(retained).toBeTypeOf('function'));
    const pending = retained!({ level: 'mapped-level' });
    expect(transport).toHaveBeenCalledTimes(1);
    update({ equipment: 'EQ02' });
    finish(answer);
    await pending.catch(error => { if (error.name !== 'AbortError') throw error; });
    await retained!({ level: 'stale' });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]?.[1]?.aborted).toBe(true);
  });

  it('starts a fresh request for a replacement binding with the same endpoint params', async () => {
    function FixedQuery() {
      const query = useMenuQuery(spec, { level: 'fixed' });
      return <p>{query.response?.data}</p>;
    }
    registerLentPanel(source, FixedQuery);
    let finish!: (value: ApiResponse<string>) => void;
    const reply = new Promise<ApiResponse<string>>(resolve => { finish = resolve; });
    const transport = vi.fn((_request: MenuQuery, _signal?: AbortSignal) => reply)
      .mockResolvedValueOnce(answer)
      .mockImplementationOnce(() => reply)
      .mockResolvedValueOnce({ ...answer, data: 'replacement answer' });
    const { update } = mount(values, { menuQuery: transport });
    await screen.findByText('from source');
    update({ ...values, equipment: 'EQ01' });
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    update({ equipment: 'EQ01', mapped: 'replacement' });
    expect(await screen.findByText('replacement answer')).toBeTruthy();
    expect(transport.mock.calls[1]?.[1]?.aborted).toBe(true);
    await act(async () => finish(answer));
    expect(screen.queryByText('from source')).toBeNull();
  });

  it('leaves endpoint Context keys outside the binding absent', () => {
    const binding = at(registry.lentPanels(receiver.id), 0);
    const session = testSession([receiving, owning, reading]);
    const result = binding.resolve(session, {
      context: { ...emptyGlobal, ...queryContext, metricId: 'held-metric' }, values,
    });
    expect(result).toMatchObject({ allowed: true, inputs: { context: { metricId: null, selection: ['EQ02'] } } });
  });
});
