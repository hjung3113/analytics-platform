import { StrictMode, useContext, useEffect, useState } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, useUnsavedGuard, type UnsavedGuardOptions } from '../../index';
import { useHostPlatform, useLeaveRequest, type LeaveRequest } from '../../host';
import { AppContext } from '../contexts';
import { noContext, testAdapter, testSession, testSpace } from '../../testing';
import { groupId, spaceId, type PlatformAdapter } from '@ap/contracts';

const features = { export: false, savedView: false, annotate: false, compare: false };
const entry = (partial: { id: string; path: string; pageKeys: string[]; primary?: boolean; hiddenPageKeys?: string[] }) => ({
  group: groupId('g'), label: { ko: partial.id, en: partial.id }, description: { ko: '', en: '' }, icon: House,
  permission: 'platform:view' as const, requiresScope: false, context: noContext, pageType: 'overview' as const, features,
  ...partial,
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'editor' })],
  groups: [{ id: groupId('g'), label: { ko: '그룹', en: 'G' }, icon: House, space: spaceId('mars') }],
  menus: [
    entry({ id: 'editor', path: '/mars/editor', pageKeys: ['q'], primary: true }),
    entry({ id: 'other', path: '/mars/other', pageKeys: [] }),
    entry({ id: 'third', path: '/mars/third', pageKeys: [] }),
    entry({ id: 'hid', path: '/mars/hid', pageKeys: ['hk'], hiddenPageKeys: ['hk'] }),
  ],
});
const session = testSession(['platform:view']);

let platform: ReturnType<typeof useHostPlatform>;
let request: LeaveRequest | null = null;
let setDirty: (v: boolean) => void = () => {};
let setMounted: (v: boolean) => void = () => {};
let guardOptions: UnsavedGuardOptions = {};
let traversals = 0;
function Editor() {
  const [dirty, d] = useState(false);
  setDirty = d;
  useUnsavedGuard(dirty, guardOptions);
  return null;
}
function Gate() {
  const [on, setOn] = useState(true);
  setMounted = setOn;
  return on ? <Editor /> : null;
}
function Probe() {
  platform = useHostPlatform();
  request = useLeaveRequest();
  const guard = useContext(AppContext)!.internal.guard;
  useEffect(() => guard.onTraversal(() => { traversals++; }), [guard]);
  return null;
}
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 30)); });
const here = () => window.location.pathname + window.location.search;
function mount(url: string, over: Partial<PlatformAdapter> = {}, strict = false) {
  window.history.replaceState(null, '', url);
  const tree = <I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session, ...over })} registry={registry}><Probe /><Gate /></PlatformProvider></I18nProvider>;
  render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}
/** Mount at /mars/other, then push editor and third through the Kernel so every entry is stamped (positions 0, 1, 2). */
function stack() {
  mount('/mars/other');
  act(() => { platform.navigate('/mars/editor'); });
  act(() => { platform.navigate('/mars/third'); });
}

afterEach(() => { cleanup(); guardOptions = {}; traversals = 0; vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('menu leave guard: links and navigate (ADR-0115)', () => {
  it('a blocked move writes nothing and returns false; confirm replays once with onDiscard, cancel changes nothing', () => {
    const onDiscard = vi.fn();
    guardOptions = { onDiscard, message: 'draft' };
    mount('/mars/editor');
    act(() => setDirty(true));
    const length = window.history.length;
    let moved = true;
    act(() => { moved = platform.navigate('/mars/other'); });
    expect(moved).toBe(false);
    expect(here()).toBe('/mars/editor');
    expect(window.history.length).toBe(length);
    expect(request?.message).toBe('draft');
    expect(request?.destination).toEqual({ ko: 'other', en: 'other' });
    act(() => request!.cancel());
    expect(request).toBeNull();
    expect(onDiscard).not.toHaveBeenCalled();
    act(() => { platform.navigate('/mars/other'); });
    act(() => request!.confirm());
    expect(here()).toBe('/mars/other');
    expect(window.history.length).toBe(length + 1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(request).toBeNull();
  });

  it('while a request is pending a second leaving move returns false and keeps the first', () => {
    mount('/mars/editor');
    act(() => setDirty(true));
    act(() => { platform.navigate('/mars/other'); });
    const first = request;
    let moved = true;
    act(() => { moved = platform.navigate('/mars/third'); });
    expect(moved).toBe(false);
    expect(request).toBe(first);
  });

  it('same-pathname writes and replace never ask', () => {
    mount('/mars/editor');
    act(() => setDirty(true));
    act(() => platform.setPage({ q: 'x' }));
    expect(here()).toBe('/mars/editor?v=1&q=x');
    act(() => platform.setGlobal({ scopeId: 'S1' }));
    act(() => platform.setPage({ q: 'y' }, { replace: true }));
    let moved = false;
    act(() => { moved = platform.navigate('/mars/other', { replace: true }); });
    expect(moved).toBe(true);
    expect(request).toBeNull();
  });

  it("leaves 'address' also asks for a push to the same path with another query", () => {
    guardOptions = { leaves: 'address' };
    mount('/mars/editor');
    act(() => setDirty(true));
    act(() => platform.setPage({ q: 'x' }));
    expect(here()).toBe('/mars/editor');
    expect(request).not.toBeNull();
    act(() => platform.setPage({ q: 'x' }, { replace: true }));
    expect(here()).toBe('/mars/editor?v=1&q=x');
  });

  it('a hidden-key arrival rewrite of a dirty screen goes through', () => {
    window.history.replaceState(null, '', '/mars/hid?hk=1');
    guardOptions = {};
    const tree = <I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><Probe /><DirtyFromStart /></PlatformProvider></I18nProvider>;
    render(tree);
    expect(here()).toBe('/mars/hid');
    expect(request).toBeNull();
  });

  it('Scope change and a session change never ask', () => {
    let notify = () => {};
    mount('/mars/editor', { subscribe: l => { notify = l; return () => {}; } });
    act(() => setDirty(true));
    act(() => platform.setGlobal({ scopeId: 'S2' }));
    act(() => notify());
    expect(request).toBeNull();
    expect(here()).toContain('scopeId=S2');
  });

  it("a Scope change is not held even by a guard that leaves on 'address'", () => {
    guardOptions = { leaves: 'address' };
    mount('/mars/editor');
    act(() => setDirty(true));
    act(() => platform.setGlobal({ scopeId: 'S2' }));
    expect(request).toBeNull();
    expect(here()).toContain('scopeId=S2');
  });

  it('unmounting the guard while a request is pending drops it without leaving', () => {
    mount('/mars/editor');
    act(() => setDirty(true));
    act(() => { platform.navigate('/mars/other'); });
    expect(request).not.toBeNull();
    act(() => setMounted(false));
    expect(request).toBeNull();
    expect(here()).toBe('/mars/editor');
  });

  it('two mounts of the effects (StrictMode) leave one working registration and one beforeunload listener', () => {
    const add = vi.spyOn(window, 'addEventListener');
    mount('/mars/editor', {}, true);
    act(() => setDirty(true));
    expect(add.mock.calls.filter(([t]) => t === 'beforeunload')).toHaveLength(1);
    act(() => { platform.navigate('/mars/other'); });
    expect(request).not.toBeNull();
    act(() => setDirty(false));
    expect(request).toBeNull();
  });

  it('beforeunload is held only while dirty', () => {
    mount('/mars/editor');
    const probe = () => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };
    expect(probe()).toBe(false);
    act(() => setDirty(true));
    expect(probe()).toBe(true);
    act(() => setDirty(false));
    expect(probe()).toBe(false);
  });

  it('keeps one popstate listener across pathname changes', () => {
    const add = vi.spyOn(window, 'addEventListener');
    mount('/mars/other');
    act(() => { platform.navigate('/mars/editor'); });
    act(() => { platform.navigate('/mars/third'); });
    expect(add.mock.calls.filter(([t]) => t === 'popstate')).toHaveLength(1);
  });
});

function DirtyFromStart() {
  platform = useHostPlatform();
  useUnsavedGuard(true);
  return null;
}

describe('menu leave guard: browser Back and Forward (ADR-0115)', () => {
  it('stamps entries with their position', () => {
    stack();
    expect(window.history.state).toMatchObject({ apIdx: 2 });
  });

  it('Back is undone, asks, and a confirm travels there once', async () => {
    const onDiscard = vi.fn();
    guardOptions = { onDiscard };
    stack();
    act(() => setDirty(true));
    window.history.back();
    await settle();
    expect(here()).toBe('/mars/third');
    expect(request).not.toBeNull();
    expect(request?.via).toBe('history');
    expect(traversals).toBe(0);
    act(() => request!.confirm());
    await settle();
    expect(here()).toBe('/mars/editor');
    expect(platform.pathname).toBe('/mars/editor');
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(traversals).toBe(1);
  });

  it('a multi-step Back is undone by one exact go and confirms to the right entry', async () => {
    stack();
    act(() => setDirty(true));
    const go = vi.spyOn(window.history, 'go');
    window.history.go(-2);
    await settle();
    expect(here()).toBe('/mars/third');
    expect(go.mock.calls.map(([d]) => d as number)).toEqual([-2, 2]);
    act(() => request!.confirm());
    await settle();
    expect(here()).toBe('/mars/other');
  });

  it('cancel keeps the screen; Forward still works afterwards', async () => {
    stack();
    window.history.back();
    await settle();
    expect(here()).toBe('/mars/editor');
    act(() => setDirty(true));
    window.history.forward();
    await settle();
    expect(here()).toBe('/mars/editor');
    act(() => request!.cancel());
    expect(traversals).toBe(1);
    act(() => setDirty(false));
    window.history.forward();
    await settle();
    expect(here()).toBe('/mars/third');
    expect(platform.pathname).toBe('/mars/third');
    expect(traversals).toBe(2);
  });

  it('a Back that is not held is an ordinary arrival', async () => {
    stack();
    window.history.back();
    await settle();
    expect(platform.pathname).toBe('/mars/editor');
    expect(request).toBeNull();
  });

  it('an unstamped entry fails open and reports the error', async () => {
    window.history.replaceState(null, '', '/mars/other');
    window.history.pushState(null, '', '/mars/editor');
    const reportClientError = vi.fn(async () => ({ accepted: true as const }));
    const tree = <I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session, reportClientError })} registry={registry}><Probe /><Gate /></PlatformProvider></I18nProvider>;
    render(tree);
    act(() => setDirty(true));
    window.history.back();
    await settle();
    expect(here()).toBe('/mars/other');
    expect(platform.pathname).toBe('/mars/other');
    expect(request).toBeNull();
    expect(reportClientError).toHaveBeenCalledTimes(1);
    expect(reportClientError.mock.calls[0]).toMatchObject([{ name: 'NavGuardUncompensable' }]);
  });

  it('a history error while undoing lets the move through and reports it', async () => {
    stack();
    act(() => setDirty(true));
    const real = window.history.go.bind(window.history);
    vi.spyOn(window.history, 'go').mockImplementation((d?: number) => { if (d !== undefined && d > 0) throw new DOMException('rate', 'SecurityError'); real(d); });
    window.history.back();
    await settle();
    expect(platform.pathname).toBe('/mars/editor');
    expect(request).toBeNull();
  });
});
