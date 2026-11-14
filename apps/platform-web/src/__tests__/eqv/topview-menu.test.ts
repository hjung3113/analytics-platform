import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { groupId } from '@ap/contracts';
import { registry } from '../../menus';

// The app source root (this file sits in src/__tests__/eqv/).
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function sourcesOutsideDev(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'dev' ? [] : sourcesOutsideDev(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe('viewer menu package (#801, #1659)', () => {
  it('registers its group, menus, paths and aliases', () => {
    expect(registry.groupById(groupId('topview'))?.space).toBe('tools');
    expect(registry.menuById('eqv:topview')?.path).toBe('/tools/eqv-topview');
    expect(registry.menuById('eqv:topview')?.aliases).toEqual(['/tools/topview']);
    expect(registry.menuById('eqv:topview')?.group).toBe('topview');
    expect(registry.menuById('eqv:focus')?.path).toBe('/tools/eqv-focus');
    expect(registry.menuById('eqv:focus')?.aliases).toEqual(['/tools/topview/focus']);
    expect(registry.menuById('eqv:focus')?.parent).toBe('eqv:topview');
  });

  it('is the Tools space home and guarded by eqv:view, which the app declares', () => {
    expect(registry.spaces.find(space => space.id === 'tools')?.homeMenuId).toBe('eqv:topview');
    expect(registry.menuById('eqv:topview')?.permission).toBe('eqv:view');
    expect(registry.menuById('eqv:focus')?.permission).toBe('eqv:view');
    expect(registry.permissions).toContain('eqv:view');
  });

  it('keeps the viewer group before the authoring group in the sidebar order', () => {
    const ids = registry.groups.map(group => group.id as string);
    expect(ids.indexOf('topview')).toBe(ids.indexOf('topviewStudio') - 1);
  });

  it('registers the screens lazily so the main entry stays free of the viewer screens', () => {
    const lazyType = Symbol.for('react.lazy');
    for (const id of ['eqv:topview', 'eqv:focus']) expect((registry.menuById(id).component as unknown as { $$typeof: symbol }).$$typeof).toBe(lazyType);
  });

  it('imports the viewer mock data from src/dev/ only (ADR-0009)', () => {
    const offenders = sourcesOutsideDev(SRC)
      .filter(file => !file.endsWith('server-conformance.test.ts') && !file.endsWith('topview-menu.test.ts'))
      .filter(file => readFileSync(file, 'utf8').includes('@ap/menu-topview/mock-data'));
    expect(offenders).toEqual([]);
  });
});
