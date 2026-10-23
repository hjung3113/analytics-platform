import { act, cleanup, render, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PlatformAdapter } from '@ap/contracts';
import { I18nProvider } from './i18n';
import { PlatformProvider, usePlatform } from './platform';
import { createRegistry } from './registry';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from './testing';
import { useAxisOptions, useEquipmentSearch, useResolvedSelection } from './selection-ports';

const axes = [{ id: 'a', label: { ko: 'A', en: 'A' }, membershipHistory: true }];
const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: 'overview', label: { ko: 'G', en: 'G' }, icon: House, space: 'analytics' }], menus: [{ id: 'home', group: 'overview', primary: true, label: { ko: 'H', en: 'H' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: true, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }] });
beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); window.history.replaceState(null, '', '/?scopeId=S'); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function fixture(over: Partial<PlatformAdapter>) {
  const session = testSession(['platform:view']);
  return testAdapter({ session: () => session, ...over });
}
function mount(adapter: PlatformAdapter, child: React.ReactNode) {
  return render(<I18nProvider><PlatformProvider equipmentAxes={axes} adapter={adapter} registry={registry}>{child}</PlatformProvider></I18nProvider>);
}

it('aborts changed inputs, drops late replies, pages single-flight, and caches semantically equal inputs', async () => {
  const calls: { query?: string; cursor?: string | null; signal?: AbortSignal; resolve: (value: { items: { id: string; label: string }[]; nextCursor: string | null }) => void }[] = [];
  const adapter = fixture({ listAxisOptions: (input, signal) => new Promise(resolve => { calls.push({ ...input, signal, resolve }); }) });
  let result: ReturnType<typeof useAxisOptions>;
  function Probe({ query }: { query: string }) { result = useAxisOptions({ axisId: 'a', query }); return null; }
  const tree = mount(adapter, <Probe query="old" />);
  await waitFor(() => expect(calls).toHaveLength(1));
  tree.rerender(<I18nProvider><PlatformProvider equipmentAxes={axes} adapter={adapter} registry={registry}><Probe query="new" /></PlatformProvider></I18nProvider>);
  expect(result!.items).toEqual([]);
  await waitFor(() => expect(calls).toHaveLength(2));
  expect(calls[0].signal?.aborted).toBe(true);
  await act(async () => { calls[0].resolve({ items: [{ id: 'stale', label: 'stale' }], nextCursor: null }); calls[1].resolve({ items: [{ id: '1', label: 'one' }], nextCursor: 'next' }); });
  expect(result!.items.map(i => i.id)).toEqual(['1']);
  act(() => { result!.loadMore(); result!.loadMore(); });
  await waitFor(() => expect(calls).toHaveLength(3));
  expect(calls[2].cursor).toBe('next');
  await act(async () => calls[2].resolve({ items: [{ id: '1', label: 'one' }, { id: '2', label: 'two' }], nextCursor: null }));
  expect(result!.items.map(i => i.id)).toEqual(['1', '2']);
  tree.rerender(<I18nProvider><PlatformProvider equipmentAxes={axes} adapter={adapter} registry={registry}><Probe query="old" /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(calls).toHaveLength(4));
  tree.rerender(<I18nProvider><PlatformProvider equipmentAxes={axes} adapter={adapter} registry={registry}><Probe query="new" /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(result!.items).toHaveLength(2));
  expect(calls).toHaveLength(4);
});

it.each(['options', 'search', 'resolve'] as const)('%s exposes transport/timeout and internal AbortError failures and retry, while Kernel abort is silent', async port => {
  let signal: AbortSignal | undefined;
  let attempt = 0;
  const fail = async (_input: unknown, nextSignal?: AbortSignal) => { signal = nextSignal; if (++attempt < 3) throw attempt === 1 ? new Error('network timeout') : new DOMException('timeout', 'AbortError'); return { items: [], nextCursor: null }; };
  const adapter = fixture({ listAxisOptions: fail, searchEquipment: fail, resolveSelection: fail });
  let result: { status: string; error: { code: string | null; retryable: boolean } | null; retry: () => void };
  function Probe({ enabled }: { enabled: boolean }) {
    const options = useAxisOptions({ axisId: 'a', enabled: enabled && port === 'options' });
    const search = useEquipmentSearch({ enabled: enabled && port === 'search' });
    const resolve = useResolvedSelection(['x'], { enabled: enabled && port === 'resolve' });
    result = port === 'options' ? options : port === 'search' ? search : resolve;
    return null;
  }
  const tree = mount(adapter, <Probe enabled />);
  await waitFor(() => expect(result!.status).toBe('error'));
  expect(result!.error).toMatchObject({ code: null, retryable: true });
  act(() => result!.retry());
  await waitFor(() => expect(attempt).toBe(2));
  await waitFor(() => expect(result!.status).toBe('error'));
  expect(signal!.aborted).toBe(false);
  act(() => result!.retry());
  await waitFor(() => expect(result!.status).toBe('ready'));
  tree.rerender(<I18nProvider><PlatformProvider equipmentAxes={axes} adapter={adapter} registry={registry}><Probe enabled={false} /></PlatformProvider></I18nProvider>);
  expect(result!.status).toBe('idle');
});

it('keeps prior pages on failure, retries the failed cursor, and restarts invalid cursors without appending old items', async () => {
  const { PortError } = await import('@ap/contracts');
  let n = 0;
  const send = vi.fn(async ({ cursor }: { cursor?: string | null }) => {
    n++;
    if (n === 2) throw new Error('offline');
    if (n === 4) throw new PortError('invalid_cursor', 'expired');
    return { items: [{ equipmentId: `${n}`, room: 'R', axes: {} }], nextCursor: cursor === 'second' ? 'third' : 'second' };
  });
  let result: ReturnType<typeof useEquipmentSearch>;
  function Probe() { result = useEquipmentSearch(); return null; }
  mount(fixture({ searchEquipment: send }), <Probe />);
  await waitFor(() => expect(result!.status).toBe('ready'));
  act(() => result!.loadMore());
  await waitFor(() => expect(result!.loadMoreError).toMatchObject({ retryable: true }));
  expect(result!.items.map(v => v.equipmentId)).toEqual(['1']);
  act(() => result!.retry());
  await waitFor(() => expect(result!.items).toHaveLength(2));
  expect(send.mock.calls[1][0].cursor).toBe('second');
  expect(send.mock.calls[2][0].cursor).toBe('second');
  act(() => result!.loadMore());
  await waitFor(() => expect(result!.loadMoreError?.code).toBe('invalid_cursor'));
  act(() => result!.retry());
  expect(result!.items).toEqual([]);
  await waitFor(() => expect(result!.items.map(v => v.equipmentId)).toEqual(['5']));
  expect(send.mock.calls[4][0].cursor).toBe(null);
});

it('validates complete override Scope/context and uses preserved global values with explicit empty sets', async () => {
  const send = vi.fn(async () => ({ items: [], nextCursor: null }));
  const adapter = fixture({ searchEquipment: send });
  const base = { scopeId: 'S', roomNames: null, lineNames: [], prcGroups: null, condition: null, membershipBasis: null, period: null };
  let result: ReturnType<typeof useEquipmentSearch>;
  function Probe({ scopeId, enabled = true }: { scopeId: string; enabled?: boolean }) { result = useEquipmentSearch({ context: { ...base, scopeId }, enabled }); return null; }
  const tree = mount(adapter, <Probe scopeId="other" />);
  await waitFor(() => expect(result!.error?.code).toBe('scope_forbidden'));
  expect(send).not.toHaveBeenCalled();
  tree.rerender(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Probe scopeId="S" /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(result!.status).toBe('ready'));
  expect(send.mock.calls[0]).toBeDefined();
  expect((send.mock.calls as unknown[][])[0][0]).toMatchObject({ scopeId: 'S', lineNames: [], roomNames: null, limit: 50 });
});

it('resolution ignores condition/period changes, drops late replies, and keeps requested IDs outside search pages', async () => {
  const send = vi.fn<PlatformAdapter['resolveSelection']>();
  let finish: (value: Awaited<ReturnType<PlatformAdapter['resolveSelection']>>) => void = () => {};
  send.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue({ items: [{ id: 'b', status: 'forbidden' }, { id: 'c', status: 'not_found' }] });
  const adapter = fixture({ resolveSelection: send });
  let result: ReturnType<typeof useResolvedSelection>;
  function Probe({ ids }: { ids: string[] }) { result = useResolvedSelection(ids); return null; }
  const tree = mount(adapter, <Probe ids={['a']} />);
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  tree.rerender(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Probe ids={['b', 'c', 'b']} /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(result!.status).toBe('ready'));
  await act(async () => finish({ items: [{ id: 'a', status: 'not_found' }] }));
  expect([...result!.byId]).toEqual([['b', 'forbidden'], ['c', 'not_found']]);
  expect(result!.summaries.size).toBe(0);
  tree.unmount();
  expect(send.mock.calls[0][1]?.aborted).toBe(true);
});

it('invalidates for same-user session, server revision and adapter replacement, and hides stale results immediately', async () => {
  let session = testSession(['platform:view']);
  const listeners = new Set<() => void>();
  const calls: { signal?: AbortSignal; finish: (v: { items: { equipmentId: string; room: string; axes: {} }[]; nextCursor: null }) => void }[] = [];
  const send: PlatformAdapter['searchEquipment'] = (_input, signal) => new Promise(finish => calls.push({ signal, finish }));
  const adapter = fixture({ session: () => session, subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; }, searchEquipment: send });
  let result: ReturnType<typeof useEquipmentSearch>;
  function Probe() { result = useEquipmentSearch(); return null; }
  const tree = mount(adapter, <Probe />);
  await waitFor(() => expect(calls).toHaveLength(1));
  await act(async () => calls[0].finish({ items: [{ equipmentId: 'old', room: 'R', axes: {} }], nextCursor: null }));
  act(() => listeners.forEach(l => l()));
  expect(result!.items).toEqual([]);
  await waitFor(() => expect(calls).toHaveLength(2));
  act(() => { session = { ...session }; listeners.forEach(l => l()); });
  expect(result!.items).toEqual([]);
  await waitFor(() => expect(calls).toHaveLength(3));
  expect(calls[1].signal?.aborted).toBe(true);
  const replacement = fixture({ searchEquipment: send });
  tree.rerender(<I18nProvider><PlatformProvider adapter={replacement} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(calls).toHaveLength(4));
  expect(calls[2].signal?.aborted).toBe(true);
  tree.unmount();
  expect(calls[3].signal?.aborted).toBe(true);
});

it('does not send disabled, contract-invalid, or period-less asOf requests and normalizes equal set inputs', async () => {
  const send = vi.fn<PlatformAdapter['searchEquipment']>().mockResolvedValue({ items: [], nextCursor: null });
  const context = { scopeId: 'S', roomNames: ['R2', 'R1'], lineNames: null, prcGroups: null, condition: null, membershipBasis: null, period: null };
  const adapter = fixture({ searchEquipment: send });
  let result: ReturnType<typeof useEquipmentSearch>;
  function Probe({ over = {}, enabled = true }: { over?: Partial<typeof context>; enabled?: boolean }) { result = useEquipmentSearch({ context: { ...context, ...over }, enabled }); return null; }
  const tree = mount(adapter, <Probe enabled={false} />);
  await waitFor(() => expect(result!.status).toBe('idle'));
  expect(send).not.toHaveBeenCalled();
  const view = (over: Partial<typeof context> = {}) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Probe over={over} /></PlatformProvider></I18nProvider>;
  tree.rerender(view());
  await waitFor(() => expect(result!.status).toBe('ready'));
  tree.rerender(view({ roomNames: ['R1', 'R2', 'R1'] }));
  await act(async () => {});
  expect(send).toHaveBeenCalledTimes(1);
  tree.rerender(view({ condition: { unknown: ['v'] } } as never));
  expect(result!.status).toBe('error');
  expect(result!.items).toEqual([]);
  expect(send).toHaveBeenCalledTimes(1);
  tree.rerender(view({ membershipBasis: 'asOf', prcGroups: ['p'] } as never));
  expect(result!.status).toBe('idle');
  expect(send).toHaveBeenCalledTimes(1);
});

it.each(['options', 'search', 'resolve'] as const)('%s exposes nonretryable PortError validation failures separately from successful empty/status data', async port => {
  const { PortError } = await import('@ap/contracts');
  const send = vi.fn(async () => { throw new PortError('invalid_input', 'invalid'); });
  let result: { status: string; error: { code: string | null; retryable: boolean } | null; retry: () => void };
  function Probe() {
    const options = useAxisOptions({ axisId: 'a', enabled: port === 'options' });
    const search = useEquipmentSearch({ enabled: port === 'search' });
    const resolve = useResolvedSelection(['x'], { enabled: port === 'resolve' });
    result = port === 'options' ? options : port === 'search' ? search : resolve;
    return null;
  }
  mount(fixture({ listAxisOptions: send, searchEquipment: send, resolveSelection: send }), <Probe />);
  await waitFor(() => expect(result!.status).toBe('error'));
  expect(result!.error).toMatchObject({ code: 'invalid_input', retryable: false });
  act(() => result!.retry());
  expect(send).toHaveBeenCalledTimes(1);
});

it('treats a PortError-shaped rejection from another contracts copy as a judged failure', async () => {
  const foreign = { name: 'PortError', code: 'scope_forbidden', message: 'denied' };
  const send = vi.fn(async () => { throw foreign; });
  let result: ReturnType<typeof useAxisOptions>;
  function Probe() { result = useAxisOptions({ axisId: 'a' }); return null; }
  mount(fixture({ listAxisOptions: send }), <Probe />);
  await waitFor(() => expect(result!.status).toBe('error'));
  expect(result!.error).toMatchObject({ code: 'scope_forbidden', retryable: false });
});

it('isPortError is structural: name and a known code, nothing else', async () => {
  const { PortError, isPortError } = await import('@ap/contracts');
  expect(isPortError(new PortError('invalid_cursor', 'x'))).toBe(true);
  expect(isPortError({ name: 'PortError', code: 'room_forbidden', message: 'x' })).toBe(true);
  expect(isPortError({ name: 'PortError', code: 'nope', message: 'x' })).toBe(false);
  expect(isPortError({ name: 'Error', code: 'room_forbidden', message: 'x' })).toBe(false);
  for (const v of [null, undefined, 'PortError', new Error('x')]) expect(isPortError(v)).toBe(false);
});

it('never dispatches through callbacks retained from an unmounted hook', async () => {
  const send = vi.fn<PlatformAdapter['searchEquipment']>().mockResolvedValue({ items: [], nextCursor: 'more' });
  let result: ReturnType<typeof useEquipmentSearch>;
  function Probe() { result = useEquipmentSearch(); return null; }
  const tree = mount(fixture({ searchEquipment: send }), <Probe />);
  await waitFor(() => expect(result!.status).toBe('ready'));
  const retained = result!;
  tree.unmount();
  act(() => retained.loadMore());
  await act(async () => {});
  expect(send).toHaveBeenCalledTimes(1);
});

it('holds all ports behind pending Scope validation and resolution ignores unrelated context changes', async () => {
  let validate: (v: { status: 'valid'; grantedRooms: string[] }) => void = () => {};
  const options = vi.fn<PlatformAdapter['listAxisOptions']>().mockResolvedValue({ items: [], nextCursor: null });
  const search = vi.fn<PlatformAdapter['searchEquipment']>().mockResolvedValue({ items: [], nextCursor: null });
  const resolve = vi.fn<PlatformAdapter['resolveSelection']>().mockResolvedValue({ items: [{ id: 'x', status: 'not_found' }] });
  let platform: ReturnType<typeof usePlatform>;
  let result: ReturnType<typeof useResolvedSelection>;
  function Probe() { platform = usePlatform(); useAxisOptions({ axisId: 'a' }); useEquipmentSearch(); result = useResolvedSelection(['x']); return null; }
  mount(fixture({ validateScope: () => new Promise(done => { validate = done; }), listAxisOptions: options, searchEquipment: search, resolveSelection: resolve }), <Probe />);
  await act(async () => {});
  expect(options).not.toHaveBeenCalled(); expect(search).not.toHaveBeenCalled(); expect(resolve).not.toHaveBeenCalled();
  expect(result!.status).toBe('idle');
  await act(async () => validate({ status: 'valid', grantedRooms: ['R'] }));
  await waitFor(() => expect(result!.status).toBe('ready'));
  act(() => platform!.setGlobal({ roomNames: ['R'], from: '2026-01-01T00:00:00', to: '2026-02-01T00:00:00' }));
  expect([...result!.byId]).toEqual([['x', 'not_found']]);
  await act(async () => {});
  expect(resolve).toHaveBeenCalledTimes(1);
  expect(search).toHaveBeenCalledTimes(2);
});

it.each(['lineNames', 'prcGroups'] as const)('requests SDK global %s options without an injected Condition descriptor', async axisId => {
  const send = vi.fn<PlatformAdapter['listAxisOptions']>().mockResolvedValue({ items: [{ id: 'global-value', label: 'Global value' }], nextCursor: null });
  let result: ReturnType<typeof useAxisOptions>;
  function Probe() { result = useAxisOptions({ axisId, parents: { roomNames: ['R'] } }); return null; }
  mount(fixture({ listAxisOptions: send }), <Probe />);
  await waitFor(() => expect(result!.status).toBe('ready'));
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ scopeId: 'S', axisId, parents: { roomNames: ['R'] } }), expect.any(AbortSignal));
  expect(result!.items).toEqual([{ id: 'global-value', label: 'Global value' }]);
});
