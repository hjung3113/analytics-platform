import { expect, it, vi } from 'vitest';
import { createViewSlotStore } from '../table-slots';

it('collects the latest registration, applies to all, and never reapplies a consumed key on remount', () => {
  const screen = createViewSlotStore().screen('home');
  const first = vi.fn(); const second = vi.fn();
  const release = screen.register('tables', 'raw', { value: {}, apply: first });
  screen.register('tables', 'raw', { value: { groups: { basis: 'a', items: [] } }, apply: second });
  expect(screen.capture('tables')).toEqual({ raw: { groups: { basis: 'a', items: [] } } });
  screen.apply('v', { tables: { raw: {} } });
  expect(first).toHaveBeenCalledOnce(); expect(second).toHaveBeenCalledOnce();
  release();
  screen.register('tables', 'raw', { value: {}, apply: first });
  expect(first).toHaveBeenCalledOnce();
  screen.apply('v', { tables: { raw: {} } });
  expect(first).toHaveBeenCalledTimes(2);
});
it('late mounts apply once, absent entries stay untouched, and selection changes retire the token', () => {
  const screen = createViewSlotStore().screen('home'); const apply = vi.fn();
  screen.apply('v', { tables: { raw: {} } });
  screen.register('tables', 'other', { value: {}, apply });
  expect(apply).not.toHaveBeenCalled();
  screen.register('tables', 'raw', { value: {}, apply });
  expect(apply).toHaveBeenCalledOnce();
  screen.select(null);
  screen.register('tables', 'late', { value: {}, apply });
  expect(apply).toHaveBeenCalledOnce();
});
it('restore and a default apply of the same view reach each slot once in either order; a pick reapplies', () => {
  for (const order of ['restore-first', 'default-first'] as const) {
    const screen = createViewSlotStore().screen('home'); const panels = vi.fn(); const tables = vi.fn();
    screen.register('panels', 'panels', { value: null, apply: panels });
    screen.register('tables', 'raw', { value: {}, apply: tables });
    const reentry = () => screen.restore('v', { panels: { panels: 'saved' } });
    const viaDefault = () => screen.restore('v', { tables: { raw: {} }, panels: { panels: 'saved' } });
    if (order === 'restore-first') { reentry(); viaDefault(); } else { viaDefault(); reentry(); }
    expect(panels).toHaveBeenCalledExactlyOnceWith('saved');
    expect(tables).toHaveBeenCalledOnce();
    screen.apply('v', { tables: { raw: {} }, panels: { panels: 'saved' } });
    expect(panels).toHaveBeenCalledTimes(2);
  }
});
