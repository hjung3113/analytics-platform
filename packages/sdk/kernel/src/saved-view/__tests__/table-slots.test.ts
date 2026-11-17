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
