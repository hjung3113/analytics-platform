import { GLOBAL_KEYS, projectContext, type AnyEndpointSpec } from '@ap/contracts';
import { createRegistry } from '@ap/kernel';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { Map as MapIcon } from 'lucide-react';
import { groupId, menuPermission, spaceId } from '@ap/contracts';
import { equipmentOptions, topviewContext, topviewEvents, type TopviewContextParams, type TopviewEventsParams } from '../src/endpoints.js';
import { manifests } from '../src/index.js';

describe('manifests vs the Kernel registry', () => {
  const build = () => createRegistry({
    permissions: [menuPermission('eqv:view')],
    spaces: [{ id: spaceId('tools'), label: { ko: '도구', en: 'Tools' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'eqv:topview' }],
    groups: [{ id: groupId('topview'), label: { ko: '설비', en: 'Equipment' }, icon: MapIcon, space: spaceId('tools') }],
    menus: manifests,
  });

  it('registers as ordinary menus: ids, paths, aliases, one primary screen and the eqv:view permission', () => {
    const registry = build();
    expect(registry.menuById('eqv:topview')).toMatchObject({ path: '/tools/eqv-topview', aliases: ['/tools/topview'], primary: true, permission: 'eqv:view', group: 'topview' });
    expect(registry.menuById('eqv:focus')).toMatchObject({ path: '/tools/eqv-focus', aliases: ['/tools/topview/focus'], parent: 'eqv:topview', permission: 'eqv:view' });
  });

  it('keeps the equipment a page key, never a route param, and no page key is a global Context key', () => {
    for (const menu of manifests) {
      expect(menu.path).not.toContain(':');
      expect(menu.pageKeys).toContain('equipment');
      expect(menu.pageKeys.every((key) => !GLOBAL_KEYS.has(key))).toBe(true);
    }
    expect(manifests.find((menu) => menu.id === 'eqv:focus')?.pageKeys).toEqual(['equipment', 'entityType', 'anchor', 'rangeFrom', 'rangeTo']);
  });
});

describe('endpoint declarations', () => {
  const endpoints: AnyEndpointSpec[] = [topviewContext, topviewEvents];
  const registered = manifests.map((menu) => menu.id);

  it('offers equipment discovery without applied time, scope or params', () => {
    expect(equipmentOptions).toMatchObject({ id: 'eqv.equipment-options', menuId: 'eqv:focus', permission: 'eqv:view', paramKeys: {}, requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false });
  });

  it('declares an eight-hour initial period on both menus', () => {
    expect(manifests.map(menu => menu.defaultPeriodHours)).toEqual([8, 8]);
  });

  it.each(endpoints.map((e) => [e.id, e] as const))('%s names a registered screen (eqv:<screen>) and applies time', (_id, spec) => {
    expect(registered).toContain(spec.menuId);
    expect(spec.id).toMatch(/^eqv\.[a-z-]+$/);
    expect(spec.context).toEqual({ time: 'apply' });
    expect(spec.permission).toBe('eqv:view');
  });

  it.each(endpoints.map((e) => [e.id, e] as const))('%s merges no time domains: one equipment, and the server registry refuses true until #1087', (_id, spec) => {
    expect(spec.mergeTimeDomain).toBe(false);
    expect(spec.kinds).toContain('time_domain');
  });

  it('projects from/to only because time is applied', () => {
    const g = { from: '2026-01-01T00:00:00', to: '2026-01-01T01:00:00' } as Parameters<typeof projectContext>[1];
    expect(Object.keys(projectContext(topviewEvents, g))).toEqual(['from', 'to']);
  });

  it('bounds the event window to one shift', () => {
    expect(topviewEvents.limits).toEqual({ maxHours: 8 });
  });

  it('lists every params key in paramKeys', () => {
    expectTypeOf(topviewContext.paramKeys).toEqualTypeOf<Readonly<Record<keyof TopviewContextParams & string, true>>>();
    expectTypeOf(topviewEvents.paramKeys).toEqualTypeOf<Readonly<Record<keyof TopviewEventsParams & string, true>>>();
    expect(Object.keys(topviewEvents.paramKeys).sort()).toEqual(['continuationToken', 'equipmentId']);
  });
});
