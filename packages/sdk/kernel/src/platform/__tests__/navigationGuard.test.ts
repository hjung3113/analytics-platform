import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNavigationGuard, type UnsavedGuardOptions } from '../navigationGuard';

const change = { from: '/a?x=1', to: '/b' };
const offs: (() => void)[] = [];
const reg = (g: ReturnType<typeof createNavigationGuard>, opts: UnsavedGuardOptions = {}) => { const off = g.register(() => opts); offs.push(off); return off; };
const ask = (g: ReturnType<typeof createNavigationGuard>, proceed = vi.fn(), c = change) => ({ proceed, view: g.request({ change: c, destination: null, via: 'link', proceed }) });

afterEach(() => { for (const off of offs.splice(0)) off(); vi.restoreAllMocks(); });

describe('navigation guard store (ADR-0115)', () => {
  it('blocks only while a registrant exists, and unregisters on cleanup', () => {
    const g = createNavigationGuard();
    expect(g.shouldBlock(change)).toBe(false);
    const off = reg(g);
    expect(g.shouldBlock(change)).toBe(true);
    off();
    expect(g.shouldBlock(change)).toBe(false);
    expect(ask(g).view).toBeNull();
  });

  it.each([
    ['path', '/a?x=1', '/a?x=2', false],
    ['path', '/a?x=1', '/b', true],
    ['address', '/a?x=1', '/a?x=2', true],
    ['address', '/a?x=1', '/a?x=1#frag', false],
    ['address', '/a?x=1', '/b', true],
  ] as const)('leaves=%s: %s -> %s blocks=%s', (leaves, from, to, blocked) => {
    const g = createNavigationGuard();
    reg(g, { leaves });
    expect(g.shouldBlock({ from, to })).toBe(blocked);
  });

  it('confirm runs every blocker onDiscard (newest first) once, then replays once; the innermost message wins', () => {
    const g = createNavigationGuard();
    const order: string[] = [];
    reg(g, { message: 'outer', onDiscard: () => order.push('outer') });
    reg(g, { message: 'inner', onDiscard: () => order.push('inner') });
    const { view, proceed } = ask(g);
    expect(view?.message).toBe('inner');
    view!.confirm();
    view!.confirm();
    expect(order).toEqual(['inner', 'outer']);
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(g.getRequest()).toBeNull();
  });

  it('confirm skips a blocker that unmounted while the request was pending', () => {
    const g = createNavigationGuard();
    const order: string[] = [];
    reg(g, { onDiscard: () => order.push('live') });
    const off = reg(g, { onDiscard: () => order.push('gone') });
    const { view, proceed } = ask(g);
    off();
    expect(g.getRequest()).toBe(view);
    view!.confirm();
    expect(order).toEqual(['live']);
    expect(proceed).toHaveBeenCalledTimes(1);
  });

  it('a registrant that is not left keeps its draft: its onDiscard does not run', () => {
    const g = createNavigationGuard();
    const kept = vi.fn(); const left = vi.fn();
    reg(g, { onDiscard: kept });
    reg(g, { leaves: 'address', onDiscard: left });
    ask(g, vi.fn(), { from: '/a?x=1', to: '/a?x=2' }).view!.confirm();
    expect(left).toHaveBeenCalledTimes(1);
    expect(kept).not.toHaveBeenCalled();
  });

  it('cancel drops the request without discarding or replaying; a stale handle does nothing', () => {
    const g = createNavigationGuard();
    const discard = vi.fn();
    reg(g, { onDiscard: discard });
    const { view, proceed } = ask(g);
    view!.cancel();
    view!.confirm();
    expect(g.getRequest()).toBeNull();
    expect(discard).not.toHaveBeenCalled();
    expect(proceed).not.toHaveBeenCalled();
  });

  it('a new request replaces the pending one; the old handle is inert', () => {
    const g = createNavigationGuard();
    reg(g);
    const first = ask(g); const second = ask(g);
    first.view!.confirm();
    expect(first.proceed).not.toHaveBeenCalled();
    expect(g.getRequest()).toBe(second.view);
  });

  it('the request is dropped, never confirmed, when its last blocker goes away', () => {
    const g = createNavigationGuard();
    const off = reg(g);
    const { proceed } = ask(g);
    off();
    expect(g.getRequest()).toBeNull();
    expect(proceed).not.toHaveBeenCalled();
  });

  it('attaches ONE beforeunload listener while any registrant exists', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const g = createNavigationGuard();
    const a = reg(g); const b = reg(g);
    expect(add.mock.calls.filter(([t]) => t === 'beforeunload')).toHaveLength(1);
    a();
    expect(remove.mock.calls.filter(([t]) => t === 'beforeunload')).toHaveLength(0);
    b();
    expect(remove.mock.calls.filter(([t]) => t === 'beforeunload')).toHaveLength(1);
  });

  it('beforeunload asks the browser to confirm (default text only)', () => {
    const g = createNavigationGuard();
    const off = reg(g);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    off();
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
});
