import { House } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { createRegistry, RegistryError, type GroupDef, type MenuEntry } from './registry';

const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const groups: GroupDef[] = [{ id: 'metrics', label: { ko: '지표', en: 'Metrics' }, icon: House }];
const menu = (id: string, path: string, extra: Partial<MenuEntry> = {}): MenuEntry => ({
  id, group: 'metrics', label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House,
  permission: 'metrics:view', requiresScope: false, context: none, pageType: 'catalog',
  features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], ...extra,
});
const catalog = menu('catalog', '/metrics', { primary: true });

describe('createRegistry validation (platform-packages.md §5)', () => {
  it('rejects duplicate ids, unknown parents and undeclared groups', () => {
    expect(() => createRegistry({ groups, menus: [catalog, menu('catalog', '/x')] })).toThrow(RegistryError);
    expect(() => createRegistry({ groups, menus: [catalog, menu('detail', '/metrics/:id', { parent: 'nope' })] })).toThrow(/unknown parent/);
    expect(() => createRegistry({ groups, menus: [catalog, menu('a', '/a', { group: 'admin' })] })).toThrow(/undeclared group/);
  });

  it('rejects duplicate group ids and parents whose route needs parameters', () => {
    expect(() => createRegistry({ groups: [...groups, ...groups], menus: [catalog] })).toThrow(/Duplicate group id/);
    const detail = menu('detail', '/metrics/:metricId', { parent: 'catalog' });
    expect(() => createRegistry({ groups, menus: [catalog, detail, menu('sub', '/metrics/:metricId/versions', { parent: 'detail' })] })).toThrow(/needs parameters/);
  });

  it('requires exactly one primary per group', () => {
    expect(() => createRegistry({ groups, menus: [menu('a', '/a')] })).toThrow(/exactly one primary.*found 0/);
    expect(() => createRegistry({ groups, menus: [catalog, menu('b', '/b', { primary: true })] })).toThrow(/found 2/);
  });

  it('rejects page keys that collide with global Context keys', () => {
    expect(() => createRegistry({ groups, menus: [menu('a', '/a', { primary: true, pageKeys: ['scopeId'] })] })).toThrow(/global Context key/);
  });

  it('rejects routes with the same shape once parameter names are erased', () => {
    expect(() => createRegistry({ groups, menus: [catalog, menu('x', '/metrics/:metricId'), menu('y', '/metrics/:id')] })).toThrow(/same route shape/);
  });
});

describe('matchRoute: static segments win, whatever the declaration order', () => {
  const detail = menu('detail', '/metrics/:metricId', { parent: 'catalog' });
  const create = menu('new', '/metrics/new', { parent: 'catalog' });
  for (const [label, menus] of [['param first', [catalog, detail, create]], ['static first', [catalog, create, detail]]] as const) {
    it(label, () => {
      const r = createRegistry({ groups, menus: [...menus] });
      expect(r.matchRoute('/metrics/new')?.menu.id).toBe('new');
      expect(r.matchRoute('/metrics/cycle_time')).toMatchObject({ menu: { id: 'detail' }, params: { metricId: 'cycle_time' } });
    });
  }
});
