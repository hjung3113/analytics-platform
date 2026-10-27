import { describe, expect, it, vi } from 'vitest';
import { createRegistry, pathFor } from '@ap/kernel';
import { EQV_MODULE } from './modules';
import { MENUS, SPACES, registry } from './menus';

// Spy on the kernel's createRegistry so the test sees the arguments menus.ts really assembled with.
vi.mock('@ap/kernel', async importOriginal => {
  const actual = await importOriginal<typeof import('@ap/kernel')>();
  return { ...actual, createRegistry: vi.fn(actual.createRegistry) };
});
// The first call is menus.ts at import time.
const ASSEMBLY_CALL = vi.mocked(createRegistry).mock.calls[0]![0];
const RESERVED_ROOTS = ['home', 'survey', 'voc', 'notifications', 'notices', 'permission-requests'];

// ADR-0093 / kernel.md §6.4: the assembled app's old → canonical path table. A menu added without canonical/alias coverage fails here.
const RAW = [...MENUS, ...EQV_MODULE.menus];
const segments = (path: string) => path.split('/').filter(Boolean);
const slugOf = (id: string) => id.replace(/:/g, '-').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

describe('assembled registry: canonical paths and legacy aliases', () => {
  it('menus.ts assembles the registry with the app reserved roots', () => {
    expect(ASSEMBLY_CALL.reservedRoots).toEqual(RESERVED_ROOTS);
  });

  it.each(RESERVED_ROOTS)('the assembly call refuses a space with the reserved id "%s"', root => {
    const clash = { ...SPACES[0], id: root } as (typeof SPACES)[number];
    expect(() => createRegistry({ ...ASSEMBLY_CALL, spaces: [clash], groups: [], menus: [] })).toThrow(/reserved platform root/);
  });

  it('registers every manifest exactly once', () => {
    expect(registry.menus.map(menu => menu.id).sort()).toEqual(RAW.map(menu => menu.id).sort());
  });

  it.each(RAW.map(raw => [raw.id, raw] as const))('%s: canonical path, legacy aliases and route matches', (_id, raw) => {
    const menu = registry.menuById(raw.id);
    const space = registry.spaceOf(menu);
    const legacy = [raw.path, ...(raw.aliases ?? [])];
    if (space === null) {
      // Space-less menus keep their declared path (the platform home declares /home with / as its alias).
      expect(menu.path).toBe(raw.path);
      for (const path of legacy.filter(path => path !== raw.path)) expect(menu.aliases ?? []).toContain(path);
    } else {
      const params = segments(raw.path).filter(segment => segment.startsWith(':'));
      expect(menu.path).toBe('/' + [space.id, slugOf(raw.id), ...params].join('/'));
      for (const path of legacy.filter(path => path !== menu.path)) expect(menu.aliases ?? []).toContain(path);
    }
    const fill = (path: string) => path.replace(/:[A-Za-z0-9_]+/g, 'x1');
    expect(registry.matchRoute(fill(menu.path))).toMatchObject({ menu: { id: raw.id }, viaAlias: false });
    for (const alias of menu.aliases ?? []) {
      const hit = registry.matchRoute(fill(alias));
      // A legacy path another menu now owns as its canonical path would be a silent hijack; none exists today.
      expect(hit, `${alias} of ${raw.id}`).toMatchObject({ menu: { id: raw.id }, viaAlias: true });
    }
  });

  it.each(RAW.map(raw => [raw.id] as const))('%s: the canonical path round-trips to the same menu and params for probe values equal to every static sibling segment', id => {
    const menu = registry.menuById(id);
    const statics = new Set(registry.menus.flatMap(m => [m.path, ...(m.aliases ?? [])]).flatMap(segments).filter(segment => !segment.startsWith(':')));
    for (const probe of ['x1', ...statics]) {
      const params = Object.fromEntries(segments(menu.path).filter(segment => segment.startsWith(':')).map(segment => [segment.slice(1), probe]));
      const hit = registry.matchRoute(pathFor(menu, params));
      expect(hit, `${id} with ${probe}`).toMatchObject({ menu: { id }, params, viaAlias: false });
    }
  });

  it('opens / on the platform home /home', () => {
    expect(registry.platformHome?.id).toBe('home');
    expect(registry.platformHome?.path).toBe('/home');
    expect(registry.matchRoute('/')).toMatchObject({ menu: { id: 'home' }, viaAlias: true });
  });

  it('keeps the survey canonical paths and their legacy aliases (the FeedbackOps standalone /surveys address is not a platform path)', () => {
    expect(registry.menuById('surveys')).toMatchObject({ path: '/survey', aliases: ['/surveys'] });
    expect(registry.menuById('survey-respond')).toMatchObject({ path: '/survey/:surveyId/respond', aliases: ['/surveys/:surveyId/respond'] });
  });
});
