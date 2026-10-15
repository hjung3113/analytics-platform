// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createPageNavigation } from './pageNavigation';
import { createPaletteFocus } from './paletteFocus';

function fixture() {
  const palette = createPaletteFocus({ cancel: () => navigation.cancel(), notify: () => navigation.notify() });
  const navigation = createPageNavigation('/home?v=1', palette.isBlocked);
  return { palette, navigation };
}

function pendingPage(navigation: ReturnType<typeof createPageNavigation>) {
  navigation.advance('/equipment?v=1', 'page');
}

describe('palette focus handoff', () => {
  it('preserves a blocked pathname request, notifies on release and consumes exactly once', () => {
    const { palette, navigation } = fixture();
    const session = palette.setOpen(true, null)!;
    const owner = Symbol();
    session.claim(owner);
    pendingPage(navigation);
    const listener = vi.fn();
    navigation.subscribe(listener);
    expect(navigation.consume('/equipment')).toBeNull();
    palette.setOpen(false, null);
    session.release(owner);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(navigation.consume('/equipment')).toBe('page');
    expect(navigation.consume('/equipment')).toBeNull();
    session.release(owner);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it.each(['before cleanup', 'after cleanup'])('lets a remounted owner reclaim the open session %s', timing => {
    const { palette, navigation } = fixture();
    const session = palette.setOpen(true, null)!;
    const oldOwner = Symbol();
    const newOwner = Symbol();
    session.claim(oldOwner);
    if (timing === 'after cleanup') session.release(oldOwner);
    session.claim(newOwner);
    pendingPage(navigation);
    session.release(oldOwner);
    expect(navigation.consume('/equipment')).toBeNull();
    session.release(newOwner);
    expect(navigation.consume('/equipment')).toBe('page');
  });

  it('ignores a non-owner release and keeps rendered sessions blocked on close', () => {
    const { palette, navigation } = fixture();
    const session = palette.setOpen(true, null)!;
    const owner = Symbol();
    session.claim(owner);
    pendingPage(navigation);
    palette.setOpen(false, null);
    palette.releaseUnrendered();
    session.release(Symbol());
    expect(navigation.consume('/equipment')).toBeNull();
    session.release(owner);
    expect(navigation.consume('/equipment')).toBe('page');
  });

  it('releases an unrendered closed session and wakes subscribers before consumption', () => {
    const { palette, navigation } = fixture();
    palette.setOpen(true, null);
    pendingPage(navigation);
    const consumed: unknown[] = [];
    navigation.subscribe(() => consumed.push(navigation.consume('/equipment')));
    palette.releaseUnrendered();
    expect(consumed).toEqual([]);
    palette.setOpen(false, null);
    palette.releaseUnrendered();
    expect(consumed).toEqual(['page']);
    expect(navigation.consume('/equipment')).toBeNull();
  });

  it('cancels the previous lazy selection when reopened and ignores old claim/release', () => {
    const { palette, navigation } = fixture();
    const old = palette.setOpen(true, null)!;
    const owner = Symbol();
    old.claim(owner);
    old.select();
    palette.setOpen(false, null);
    expect(old.isCurrent()).toBe(true);
    pendingPage(navigation);
    const current = palette.setOpen(true, null)!;
    expect(current).not.toBe(old);
    expect(current.isSelecting()).toBe(false);
    expect(old.isSelecting()).toBe(true);
    expect(old.isCurrent()).toBe(false);
    current.release(owner);
    expect(navigation.consume('/equipment')).toBeNull();
    current.claim(owner);
    pendingPage(navigation);
    old.claim(Symbol());
    old.release(owner);
    expect(navigation.consume('/equipment')).toBeNull();
    current.release(owner);
    expect(navigation.consume('/equipment')).toBe('page');
  });

  it('disposes a replaced Provider session and protects the next generation from old handles', () => {
    const { palette, navigation } = fixture();
    const old = palette.setOpen(true, null)!;
    const owner = Symbol();
    old.claim(owner);
    pendingPage(navigation);
    const listener = vi.fn();
    navigation.subscribe(listener);
    palette.reset();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(old.isCurrent()).toBe(false);
    expect(navigation.consume('/equipment')).toBe('page');
    const current = palette.setOpen(true, null)!;
    current.claim(owner);
    pendingPage(navigation);
    old.claim(Symbol());
    old.release(owner);
    expect(navigation.consume('/equipment')).toBeNull();
    current.release(owner);
    expect(navigation.consume('/equipment')).toBe('page');
  });

  it('keeps the current handle and opener on repeated open calls', () => {
    const { palette } = fixture();
    const session = palette.setOpen(true, null)!;
    session.select();
    expect(palette.setOpen(true, null)).toBe(session);
    expect(session.isSelecting()).toBe(true);
    expect(session.isCurrent()).toBe(false);
    palette.setOpen(false, null);
    expect(session.isCurrent()).toBe(true);
  });
});
