import { afterEach, beforeEach, expect, it } from 'vitest';
import { aggregateUsageNext, resetUsage, storedUsage } from '@ap/mock-server';
import { createAssembly } from './mock-assembly';
import { registry } from '../menus';

beforeEach(() => resetUsage());
afterEach(() => resetUsage());
it('seeds real registry rows once per empty mock store with masked, empty, tail, back, self-loop and dominant cases', () => {
  createAssembly({ registry });
  const events = storedUsage();
  expect(events.length).toBeGreaterThan(0);
  expect(events.every(event => registry.menus.some(menu => menu.id === event.menuId))).toBe(true);
  const read = (menuId: string, includeBack = false) => aggregateUsageNext(events, menuId, includeBack);
  expect(read('admin-roles').masked).toBe(true);
  expect(read('chart-catalog').entries).toBe(0);
  expect(read('admin-audit').hiddenDestinations).toBe(2);
  expect(read('admin-audit').next).toHaveLength(4);
  const back = read('admin-usage');
  expect(back.summary.backOrReturn).toBeGreaterThan(back.summary.moved);
  expect(read('admin-usage', true).next.reduce((sum, row) => sum + row.count, 0)).toBeGreaterThan(back.next.reduce((sum, row) => sum + row.count, 0));
  expect(read('admin-registry', true).next.some(row => row.menuId === 'admin-registry')).toBe(true);
  const dominant = read('metric-catalog');
  expect(dominant.next[0]!.count).toBeGreaterThan(dominant.next[1]!.count * 3);
  for (const menuId of ['admin-audit', 'admin-usage', 'admin-registry', 'metric-catalog']) {
    const result = read(menuId);
    expect(Object.values(result.summary).reduce((sum, count) => sum + count, 0)).toBe(result.entries);
  }
  const length = events.length;
  createAssembly({ registry });
  expect(storedUsage()).toHaveLength(length);
});
