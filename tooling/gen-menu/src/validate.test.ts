import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PACKAGE_PREFIX } from './prefix.ts';
import { SPREADS_START } from './generate.ts';
import { FIXTURE_FOLDER, FIXTURE_GROUP, GEN_ARGS, appSnapshot, fixtureMenusTs, makeFixture, menusTree, removeFixture, runCli } from './fixture.ts';

describe('validation refusals (exit 1, nothing written)', () => {
  const keep: string[] = [];
  afterAll(() => { for (const root of keep) removeFixture(root); });

  const refix = (variants?: { menusTs?: string; appPkg?: string }): string => {
    const root = makeFixture(variants);
    keep.push(root);
    return root;
  };

  const expectRefused = (root: string, args: string[], pattern: RegExp): void => {
    const snapshot = appSnapshot(root);
    const res = runCli(args, root);
    expect(res.status, res.stderr).toBe(1);
    expect(res.stderr).toMatch(pattern);
    expect(appSnapshot(root)).toEqual(snapshot);
    expect(menusTree(root)).toEqual(['menus/metric-catalog/src/index.ts']);
  };

  it('rejects a group missing from the GroupId union', () => {
    expectRefused(refix(), ['ghost', ...GEN_ARGS], /GroupId union/);
  });

  it('rejects a group without a GROUPS row', () => {
    expectRefused(refix(), ['equipment', ...GEN_ARGS], /GROUPS row/);
  });

  it('rejects an unknown page type', () => {
    expectRefused(refix(), [FIXTURE_GROUP, ...GEN_ARGS, '--page-type', 'dashboard'], /invalid --page-type/);
  });

  it('rejects kebab and Pascal group ids', () => {
    expectRefused(refix(), ['master-data', ...GEN_ARGS], /invalid group id/);
    expectRefused(refix(), ['MasterData', ...GEN_ARGS], /invalid group id/);
  });

  it('rejects a non-kebab menu id', () => {
    expectRefused(refix(), [FIXTURE_GROUP, ...GEN_ARGS, '--menu', 'GenProbe'], /invalid --menu/);
  });

  it('rejects bad paths', () => {
    expectRefused(refix(), [FIXTURE_GROUP, ...GEN_ARGS, '--path', '/Gen-Probe'], /invalid --path/);
    expectRefused(refix(), [FIXTURE_GROUP, ...GEN_ARGS, '--path', '/'], /home owns/);
  });

  it('rejects labels with quotes and missing labels', () => {
    expectRefused(refix(), [FIXTURE_GROUP, '--label-ko', "it's", '--label-en', 'x'], /--label-ko/);
    expectRefused(refix(), [FIXTURE_GROUP, '--label-en', 'x'], /--label-ko is required/);
  });

  it('rejects an existing folder', () => {
    const root = refix();
    mkdirSync(join(root, 'menus', FIXTURE_FOLDER), { recursive: true });
    expectRefused(root, [FIXTURE_GROUP, ...GEN_ARGS], /already exists/);
  });

  it('rejects an owned group', () => {
    expectRefused(refix(), ['metrics', ...GEN_ARGS], /already owned by menus\/metric-catalog/);
  });

  it('rejects a taken menu id', () => {
    expectRefused(refix(), [FIXTURE_GROUP, ...GEN_ARGS, '--menu', 'metric-catalog'], /already used by menus\/metric-catalog/);
  });

  it('rejects a path-shape collision naming the other menu', () => {
    expectRefused(refix(), [FIXTURE_GROUP, ...GEN_ARGS, '--path', '/metrics/:equipmentId'], /collides with menus\/metric-catalog/);
  });

  it('rejects a missing marker', () => {
    const root = refix({ menusTs: fixtureMenusTs().replace(`${SPREADS_START}\n`, '') });
    expectRefused(root, [FIXTURE_GROUP, ...GEN_ARGS], /missing marker/);
  });

  it('rejects a non-contiguous menu dependency block', () => {
    const appPkg = `{
  "name": "fixture-app",
  "private": true,
  "dependencies": {
    "${PACKAGE_PREFIX}menu-home": "workspace:*",
    "${PACKAGE_PREFIX}mock-server": "workspace:*",
    "${PACKAGE_PREFIX}components": "workspace:*",
    "${PACKAGE_PREFIX}menu-analytics": "workspace:*",
    "react": "^19.3.0"
  }
}
`;
    expectRefused(refix({ appPkg }), [FIXTURE_GROUP, ...GEN_ARGS], /not contiguous/);
  });

  it('rejects an already-imported binding', () => {
    const menusTs = `import { Gauge, LayoutDashboard } from 'lucide-react';
// <gen:menu-imports>
import { manifests as home } from '${PACKAGE_PREFIX}menu-home';
import { manifests as ${FIXTURE_GROUP} } from '${PACKAGE_PREFIX}menu-${FIXTURE_FOLDER}';
// </gen:menu-imports>

export const GROUPS: GroupDef[] = [
  { id: 'metrics', label: { ko: '지표관리', en: 'Metrics' }, icon: Gauge },
  { id: '${FIXTURE_GROUP}', label: { ko: '생성 확인', en: 'Gen probe' }, icon: LayoutDashboard },
  // </gen:menu-groups>
];

export const MENUS: MenuEntry[] = [
  // <gen:menu-spreads>
  ...home,
  // </gen:menu-spreads>
];
`;
    expectRefused(refix({ menusTs }), [FIXTURE_GROUP, ...GEN_ARGS], /already imported/);
  });
});
