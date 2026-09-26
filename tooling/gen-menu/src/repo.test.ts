import { describe, expect, it } from 'vitest';
import { repoRoot } from './fixture.ts';
import { checkGroups, checkMarkers, checkNoProbe, checkWiring, loadShape } from './repo-invariants.ts';

/**
 * Extensible wiring locks read from the real repo: whatever the current union, groups and
 * packages are, they must be wired completely. During the probe the generated menu is part of
 * the tree, so these still hold — only the probe-name check is skipped (GEN_MENU_PROBE=1).
 */
describe('committed wiring locks (real repo, read-only)', () => {
  const shape = loadShape(repoRoot());

  it('has markers present, unique and correctly ordered', () => {
    expect(() => checkMarkers(shape)).not.toThrow();
  });

  it('gives every GroupId member exactly one GROUPS row and one package owner', () => {
    expect(() => checkGroups(shape)).not.toThrow();
  });

  it('wires every menu dependency to import+spread and every styles.css to the style markers', () => {
    expect(() => checkWiring(shape)).not.toThrow();
  });

  it('has no probe leftovers (skipped while the probe menu exists)', () => {
    expect(() => checkNoProbe(shape, process.env.GEN_MENU_PROBE === '1')).not.toThrow();
  });
});
