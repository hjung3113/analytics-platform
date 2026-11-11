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

  it.each([
    ['a watched key changes', '/a?q=1&t=1', '/a?q=2&t=1', ['q'], true],
    ['only an unwatched key changes', '/a?q=1&t=1', '/a?q=1&t=2', ['q'], false],
    ['watched key added', '/a', '/a?q=1', ['q'], true],
    ['empty value differs from absent', '/a', '/a?q=', ['q'], true],
    ['same list, other key order in the address', '/a?q=1&t=1', '/a?t=1&q=1', ['q'], false],
    ['repeated key: order matters', '/a?q=1&q=2', '/a?q=2&q=1', ['q'], true],
    ['repeated key: [a%00b] is not [a, b]', '/a?q=a%00b', '/a?q=a&q=b', ['q'], true],
    ['a literal second ? belongs to the value', '/a?q=a?old', '/a?q=a?new', ['q'], true],
    ['percent-encoding equivalence', '/a?q=%41', '/a?q=A', ['q'], false],
    ['fragment is ignored', '/a?q=1#x', '/a?q=1#y', ['q'], false],
    ['leaving the path always asks', '/a?q=1', '/b?q=1', ['q'], true],
    ['empty list is the path default (same path)', '/a?q=1', '/a?q=2', [], false],
    ['empty list is the path default (other path)', '/a?q=1', '/b', [], true],
  ] as const)('leaves { pageKeys }: %s', (_label, from, to, pageKeys, blocked) => {
    const g = createNavigationGuard();
    reg(g, { leaves: { pageKeys } });
    expect(g.shouldBlock({ from, to })).toBe(blocked);
  });

  it('leaves { pageKeys } skips keys the destination declares hidden (an older entry can still carry one)', () => {
    const g = createNavigationGuard();
    reg(g, { leaves: { pageKeys: ['hk', 'q'] } });
    expect(g.shouldBlock({ from: '/h?hk=old', to: '/h', hiddenKeys: ['hk'] })).toBe(false);
    expect(g.shouldBlock({ from: '/h?hk=old&q=1', to: '/h?q=2', hiddenKeys: ['hk'] })).toBe(true);
    expect(g.shouldBlock({ from: '/h?hk=old', to: '/h' })).toBe(true);
    reg(g, { leaves: 'address' });
    expect(g.shouldBlock({ from: '/h?hk=old', to: '/h', hiddenKeys: ['hk'] })).toBe(true);
  });

  it('registrants with different leaves: only the ones the move leaves are asked, discarded and heard', () => {
    const g = createNavigationGuard();
    const order: string[] = [];
    reg(g, { leaves: { pageKeys: ['q'] }, message: 'watching q', onDiscard: () => order.push('q') });
    reg(g, { leaves: { pageKeys: [] }, message: 'path only', onDiscard: () => order.push('path') });
    reg(g, { onDiscard: () => order.push('default') });
    const sameKeyMove = { from: '/a?q=1', to: '/a?q=2' };
    const { view, proceed } = ask(g, vi.fn(), sameKeyMove);
    expect(view?.message).toBe('watching q');
    view?.confirm();
    expect(order).toEqual(['q']);
    expect(proceed).toHaveBeenCalledTimes(1);
    order.length = 0;
    const leave = ask(g, vi.fn(), { from: '/a?q=1', to: '/b' });
    expect(leave.view?.message).toBe('path only');
    leave.view?.confirm();
    expect(order).toEqual(['default', 'path', 'q']);
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
