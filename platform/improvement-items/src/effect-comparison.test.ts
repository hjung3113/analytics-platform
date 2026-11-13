import { describe, expect, it, vi } from 'vitest';
import { emptyGlobal, isAppRelativePath, serializeGlobal } from '@ap/contracts';
import type { LinkOptions } from '@ap/kernel';
import { comparisonFor } from './effect-comparison';
const origin = { menuId: 'cycle-time', context: { scopeId: 'MEM', metricId: 'cycle & time', metricVersion: 'v1', selection: ['EQ 01', 'EQ-02'] } };
const resolve = vi.fn((_id: string, options: LinkOptions = {}) => ({ kind: 'link' as const, allowed: true, href: `/mars/cycle-time?${new URLSearchParams(serializeGlobal({ ...emptyGlobal, ...options.global }))}`, droppedPageKeys: [] }));
describe('effect comparison wiring', () => {
  it.each([
    ['2026-11-04', 7, '2026-10-28T00:00:00', '2026-11-11T00:00:00'],
    ['2026-01-01', 1, '2025-12-31T00:00:00', '2026-01-02T00:00:00'],
    ['2024-03-01', 1, '2024-02-29T00:00:00', '2024-03-02T00:00:00'],
    ['2024-02-29', 1, '2024-02-28T00:00:00', '2024-03-01T00:00:00'],
  ])('uses the action calendar day %s at midnight with %i equal days', (day, days, from, to) => {
    const value = comparisonFor(day, origin, days, resolve);
    expect(value.periods).toEqual({ before: { from, to: `${day}T00:00:00` }, after: { from: `${day}T00:00:00`, to } });
  });
  it('encodes saved Context and the after period in a bounded app-relative analysis link', () => {
    const value = comparisonFor('2026-11-04', origin, 7, resolve);
    expect(value.reason).toBeNull();
    expect(isAppRelativePath(value.href!)).toBe(true);
    expect(value.href!.length).toBeLessThanOrEqual(2000);
    const url = new URL(value.href!, 'https://local.test');
    expect(url.pathname).toBe('/mars/cycle-time');
    expect(url.searchParams.get('metricId')).toBe('cycle & time');
    expect(url.searchParams.getAll('selectedEquipmentIds')).toEqual(['EQ 01', 'EQ-02']);
    expect(url.searchParams.get('from')).toBe('2026-11-04T00:00:00');
    expect(url.searchParams.get('to')).toBe('2026-11-11T00:00:00');
  });
  it.each([[null, origin, 'noDate'], ['2026-11-04', null, 'noOrigin']] as const)('explains missing prerequisites', (day, source, reason) => {
    expect(comparisonFor(day, source, 7, resolve)).toMatchObject({ href: null, reason });
  });
  it.each(['https://evil.test/x', '//evil.test/x', '/%09/evil.test/x', '/a#fragment', `/a?q=${'a'.repeat(2000)}`])('does not offer an unsafe or oversized href %s', href => {
    expect(comparisonFor('2026-11-04', origin, 7, () => ({ kind: 'link' as const, href, allowed: true, droppedPageKeys: [] }))).toMatchObject({ href: null, reason: 'unavailable' });
  });
  it('handles inaccessible, retired and invalid sources without a dead link', () => {
    expect(comparisonFor('2026-11-04', origin, 7, () => ({ kind: 'link' as const, href: '/x', allowed: false, droppedPageKeys: [] })).reason).toBe('unavailable');
    expect(comparisonFor('2026-11-04', origin, 7, () => { throw new Error('retired'); }).reason).toBe('unavailable');
    expect(comparisonFor('2026-02-30', origin, 7, resolve).reason).toBe('unavailable');
  });
});


it('keeps the saved drill page when opening a before/after comparison (#1408)', () => {
  const resolver = vi.fn(() => ({ kind: 'link' as const, allowed: true, href: '/analysis', droppedPageKeys: [] }));
  comparisonFor('2026-11-04', { menuId: 'analysis', context: { selection: ['EQ-1'], page: { drillEquipment: 'EQ-2' } } }, 7, resolver);
  expect(resolver).toHaveBeenCalledWith('analysis', expect.objectContaining({ page: { drillEquipment: 'EQ-2' }, global: expect.objectContaining({ selection: ['EQ-1'], from: '2026-11-04T00:00:00' }) }));
});
