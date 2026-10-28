import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './fixture.ts';
import { checkAppMarkers } from './generate.ts';
import { checkCodeowners, checkMenuVersions, checkGroups, checkMarkers, checkNoProbe, checkUniqueness, checkWiring, loadShape } from './repo-invariants.ts';

/**
 * Extensible wiring locks read from the real repo: whatever the current union, groups and
 * packages are, they must be wired completely. During the probe the temporary gen-probe folder
 * is excluded from CODEOWNERS and the probe-name check is skipped (GEN_MENU_PROBE=1).
 */
describe('committed wiring locks (real repo, read-only)', () => {
  const shape = loadShape(repoRoot());

  it('has markers present, unique and correctly ordered', () => {
    expect(() => checkMarkers(shape)).not.toThrow();
  });

  it('meets the generator marker contract (standalone markers, import-only regions, spreads inside the endpoints array)', () => {
    expect(() => checkAppMarkers(shape.menusTs, shape.styleCss, shape.mockAssemblyTsx)).not.toThrow();
  });

  it('discovers package indexes under menus/<space>/<folder> and platform/<folder>', () => {
    expect(shape.folders.length).toBeGreaterThan(0);
    expect(Object.keys(shape.indexes).sort()).toEqual([...shape.folders].sort());
    for (const folder of shape.folders) expect(folder.split('/')).toHaveLength(folder.startsWith('platform/') ? 2 : 3);
    expect(shape.folders.some(folder => folder.startsWith('platform/'))).toBe(true);
    expect(shape.folders.some(folder => folder.startsWith('menus/'))).toBe(true);
  });

  it('keeps package names, menu ids and route shapes unique across both roots', () => {
    expect(() => checkUniqueness(shape)).not.toThrow();
  });

  it('gives every GROUPS row exactly one package owner', () => {
    expect(() => checkGroups(shape)).not.toThrow();
  });

  it('covers every menu group in CODEOWNERS and references existing menu folders', () => {
    const root = repoRoot();
    const folders = process.env.GEN_MENU_PROBE === '1' ? shape.folders.filter(f => f.split('/').at(-1) !== 'gen-probe') : shape.folders;
    const systems = readdirSync(join(root, 'menus'), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
    expect(() => checkCodeowners(folders, readFileSync(join(root, '.github/CODEOWNERS'), 'utf8'), systems)).not.toThrow();
  });

  it('wires every menu dependency to import+spread and every styles.css to the style markers', () => {
    expect(() => checkWiring(shape)).not.toThrow();
  });

  it('records version metadata for every menu package', () => {
    expect(() => checkMenuVersions(repoRoot())).not.toThrow();
  });

  it('has no probe leftovers (skipped while the probe menu exists)', () => {
    expect(() => checkNoProbe(shape, process.env.GEN_MENU_PROBE === '1')).not.toThrow();
  });
});
