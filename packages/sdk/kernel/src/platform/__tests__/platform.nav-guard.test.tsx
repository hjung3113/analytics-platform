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
    entry({ id: 'editor', path: '/mars/editor', pageKeys: ['q', 't'], primary: true }),
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
// jsdom runs each history traversal as two chained zero-delay timers (queue, then popstate), and a guarded Back adds a compensating traversal.
// A fixed wall-clock wait races that chain when the loop stalls (CI load, #1417); a count of zero-delay hops is ordered after it whatever the load.
// 8 hops cover the two chained traversals of a guarded Back plus the replayed one after confirm.
const HOPS = 8;
const settle = () => act(async () => { for (let i = 0; i < HOPS; i++) await new Promise(r => setTimeout(r, 0)); });
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

  it('a host replace with guard: true asks first; cancel stays, confirm replaces once with onDiscard (#2061)', () => {
    const onDiscard = vi.fn();
    guardOptions = { onDiscard };
    mount('/mars/editor');
    act(() => setDirty(true));
    const length = window.history.length;
    let moved = true;
    act(() => { moved = platform.navigate('/mars/other', { replace: true, guard: true }); });
    expect(moved).toBe(false);
    expect(here()).toBe('/mars/editor');
    expect(request?.destination).toEqual({ ko: 'other', en: 'other' });
    act(() => request!.cancel());
    expect(here()).toBe('/mars/editor');
    expect(onDiscard).not.toHaveBeenCalled();
    act(() => { platform.navigate('/mars/other', { replace: true, guard: true }); });
    act(() => request!.confirm());
    expect(here()).toBe('/mars/other');
    expect(window.history.length).toBe(length);
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(request).toBeNull();
  });

  it('a host replace with guard: true and no dirty editor moves at once (#2061)', () => {
    mount('/mars/editor');
    let moved = false;
    act(() => { moved = platform.navigate('/mars/other', { replace: true, guard: true }); });
    expect(moved).toBe(true);
    expect(here()).toBe('/mars/other');
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

  it('leaves { pageKeys } asks for a change of a named key and for leaving the menu, never for another key', () => {
    guardOptions = { leaves: { pageKeys: ['q'] } };
    mount('/mars/editor');
    act(() => setDirty(true));
    act(() => platform.setPage({ t: 'x' }));
    expect(here()).toBe('/mars/editor?v=1&t=x');
    expect(request).toBeNull();
    act(() => platform.setGlobal({ scopeId: 'S1' }));
    expect(here()).toBe('/mars/editor?v=1&scopeId=S1&t=x');
    expect(request).toBeNull();
    act(() => platform.setPage({ q: 'x' }));
    expect(here()).toBe('/mars/editor?v=1&scopeId=S1&t=x');
    expect(request).not.toBeNull();
    act(() => request!.cancel());
    act(() => platform.setPage({ q: 'x' }, { replace: true }));
    expect(request).toBeNull();
    act(() => { platform.navigate('/mars/other'); });
    expect(request).not.toBeNull();
  });

  it('leaves { pageKeys } on Back asks when the named key differs from the entry it returns to', async () => {
    guardOptions = { leaves: { pageKeys: ['q'] } };
    mount('/mars/editor');
    act(() => platform.setPage({ t: '1' }));
    act(() => platform.setPage({ q: 'a' }));
    act(() => setDirty(true));
    window.history.back();
    await settle();
    expect(request).not.toBeNull();
    expect(here()).toBe('/mars/editor?v=1&t=1&q=a');
  });

  it('leaves { pageKeys } on Back goes through when only another key differs', async () => {
    guardOptions = { leaves: { pageKeys: ['q'] } };
    mount('/mars/editor');
    act(() => platform.setPage({ q: 'a' }));
    act(() => platform.setPage({ t: '1' }));
    act(() => setDirty(true));
    window.history.back();
    await settle();
    expect(request).toBeNull();
    expect(here()).toBe('/mars/editor?v=1&q=a');
  });

  it('leaves { pageKeys } on Back skips a declared hidden key that an older entry still carries in its address', async () => {
    window.history.replaceState({ apIdx: 0 }, '', '/mars/hid?v=1&hk=old');
    window.history.pushState({ apIdx: 1 }, '', '/mars/hid?v=1');
    guardOptions = { leaves: { pageKeys: ['hk'] } };
    const tree = <I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><Probe /><Gate /></PlatformProvider></I18nProvider>;
    render(tree);
    act(() => setDirty(true));
    const onDiscard = vi.fn();
    guardOptions = { leaves: { pageKeys: ['hk'] }, onDiscard };
    act(() => { setMounted(false); });
    act(() => { setMounted(true); });
    act(() => setDirty(true));
    expect(traversals).toBe(0);
    window.history.back();
    await settle();
    // The pop ran and was accepted as an ordinary arrival: the traversal signal fired, nothing was asked or discarded.
    expect(traversals).toBe(1);
    expect(request).toBeNull();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(here()).toBe('/mars/hid?v=1');
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

  it('a replace that is accepted while a request is pending retires the request (F3)', () => {
    mount('/mars/editor');
    act(() => setDirty(true));
    act(() => { platform.navigate('/mars/other'); });
    expect(request).not.toBeNull();
    const stale = request!;
    act(() => { platform.navigate('/mars/third', { replace: true }); });
    expect(here()).toBe('/mars/third');
    expect(request).toBeNull();
    act(() => stale.confirm());
    expect(here()).toBe('/mars/third');
  });

  it('a Scope switch while a request is pending retires the request (F3)', () => {
    mount('/mars/editor?v=1&scopeId=S1');
    act(() => setDirty(true));
    act(() => { platform.navigate('/mars/other?v=1&scopeId=S1'); });
    expect(request).not.toBeNull();
    const stale = request!;
    act(() => platform.setGlobal({ scopeId: 'S2' }));
    expect(here()).toContain('scopeId=S2');
    expect(request).toBeNull();
    act(() => stale.confirm());
    expect(here()).toContain('/mars/editor');
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
  it('clears a coalesced compensation after two Back arrivals (#2034 KER-17)', () => {
    stack();
    act(() => setDirty(true));
    const state = window.history.state as Record<string, unknown>;
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {});
    const pop = (idx: number, url: string) => act(() => {
      window.history.replaceState({ ...state, apIdx: idx }, '', url);
      window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
    });
    // Two Back arrivals before either correction lands. Chromium may coalesce both corrections into one pop at the origin.
    pop(1, '/mars/editor');
    pop(0, '/mars/other');
    expect(go.mock.calls).toEqual([[1], [2]]);
    pop(2, '/mars/third');
    expect(platform.pathname).toBe('/mars/third');
    expect(traversals).toBe(0);
    expect(request?.destination).toEqual({ ko: 'other', en: 'other' });
    act(() => request!.cancel());
    // A later same-position fragment arrival is ordinary history, not another compensation to swallow.
    pop(2, '/mars/third#section');
    expect(traversals).toBe(1);
    expect(request).toBeNull();
  });

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

  it('a stalled event loop between a multi-step Back and its settle does not skip the compensation (#1417)', async () => {
    stack();
    act(() => setDirty(true));
    const go = vi.spyOn(window.history, 'go');
    const settled = settle(); // armed before the stall, like a CI worker that is descheduled right after `go(-2)`
    window.history.go(-2);
    for (const start = Date.now(); Date.now() - start < 60;); // block the loop past any wall-clock wait
    await settled;
    expect(go.mock.calls.map(([d]) => d as number)).toEqual([-2, 2]);
    expect(here()).toBe('/mars/third');
    expect(request).not.toBeNull();
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

  it('after a foreign entry the old numbering is not trusted: a multi-step Back never retargets (F1)', async () => {
    mount('/mars/other');
    act(() => { platform.navigate('/mars/editor'); });
    window.history.pushState(null, '', '/mars/third'); // an entry the Kernel did not write
    window.history.back();
    await settle();
    window.history.forward();
    await settle();
    expect(here()).toBe('/mars/third');
    act(() => { platform.navigate('/mars/other'); });
    expect(here()).toBe('/mars/other');
    act(() => setDirty(true));
    window.history.go(-2);
    await settle();
    // Either the person is asked about the real destination (editor) or the move passes through; it is never silently retargeted to the foreign entry.
    if (request !== null) expect(request.destination).toEqual({ ko: 'editor', en: 'editor' });
    else expect(here()).toBe('/mars/editor');
    expect(request === null ? platform.pathname : here()).not.toBe('/mars/third');
  });

  it('a history error while replaying a confirmed leave still lands on the destination (F2)', async () => {
    const onDiscard = vi.fn();
    guardOptions = { onDiscard };
    const reportClientError = vi.fn(async () => ({ accepted: true as const }));
    mount('/mars/other', { reportClientError });
    act(() => { platform.navigate('/mars/editor'); });
    act(() => { platform.navigate('/mars/third'); });
    act(() => setDirty(true));
    window.history.back();
    await settle();
    expect(here()).toBe('/mars/third');
    expect(request).not.toBeNull();
    const real = window.history.go.bind(window.history);
    vi.spyOn(window.history, 'go').mockImplementation((d?: number) => { if (d !== undefined && d < 0) throw new DOMException('rate', 'SecurityError'); real(d); });
    act(() => request!.confirm());
    await settle();
    expect(here()).toBe('/mars/editor');
    expect(platform.pathname).toBe('/mars/editor');
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(reportClientError.mock.calls).toEqual(expect.arrayContaining([[expect.objectContaining({ name: 'NavGuardHistoryError' })]]));
  });

  it('reloading at a foreign entry never continues an older numbering segment (R2-1)', async () => {
    stack(); // other(0) editor(1) third(2), the first segment
    window.history.pushState(null, '', '/mars/other'); // an entry the Kernel did not write
    cleanup(); // a reload: new Provider, same session history, current entry unstamped
    const tree = <I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><Probe /><Gate /></PlatformProvider></I18nProvider>;
    render(tree);
    act(() => { platform.navigate('/mars/third'); });
    act(() => setDirty(true));
    window.history.go(-4); // the very first entry
    await settle();
    expect(here()).toBe('/mars/other');
    expect(platform.pathname).toBe('/mars/other');
    expect(request).toBeNull();
  });

  describe('a confirmed leave whose replay cannot travel arrives like a Back (R2-2..R2-4)', () => {
    const failReplay = () => {
      const real = window.history.go.bind(window.history);
      vi.spyOn(window.history, 'go').mockImplementation((d?: number) => { if (d !== undefined && d < 0) throw new DOMException('rate', 'SecurityError'); real(d); });
    };
    it('keeps the destination hidden pairs, sends the traversal signal and the page focus', async () => {
      mount('/mars/other');
      act(() => { platform.navigate('/mars/hid?hk=1'); });
      act(() => { platform.navigate('/mars/third'); });
      act(() => setDirty(true));
      window.history.back();
      await settle();
      expect(here()).toBe('/mars/third');
      expect(request).not.toBeNull();
      expect(traversals).toBe(0); // the compensation sent no signal
      failReplay();
      act(() => request!.confirm());
      await settle();
      expect(here()).toBe('/mars/hid');
      expect(platform.pageParam('hk')).toBe('1');
      expect(traversals).toBe(1);
      expect(platform.pageNavigation.consume('/mars/hid')).toBe('page');
    });
    it('a cancelled Back sends no traversal signal', async () => {
      stack();
      act(() => setDirty(true));
      window.history.back();
      await settle();
      act(() => request!.cancel());
      await settle();
      expect(traversals).toBe(0);
    });
  });
});
