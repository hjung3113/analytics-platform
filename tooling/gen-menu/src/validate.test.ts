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

  const expectRefused = async (root: string, args: string[], pattern: RegExp): Promise<void> => {
    const snapshot = appSnapshot(root);
    const res = await runCli(args, root);
    expect(res.status, res.stderr).toBe(1);
    expect(res.stderr).toMatch(pattern);
    expect(appSnapshot(root)).toEqual(snapshot);
    expect(menusTree(root)).toEqual(['menus/mars/metric-catalog/src/index.ts']);
  };

  it('rejects a group the app does not declare in GROUPS', async () => {
    await expectRefused(refix(), ['ghost', ...GEN_ARGS], /no GROUPS row/);
  });

  it('rejects a group without a GROUPS row', async () => {
    await expectRefused(refix(), ['equipment', ...GEN_ARGS], /GROUPS row/);
  });

  it('rejects an unknown page type', async () => {
    await expectRefused(refix(), [FIXTURE_GROUP, ...GEN_ARGS, '--page-type', 'dashboard'], /invalid --page-type/);
  });

  it('rejects kebab and Pascal group ids', async () => {
    await expectRefused(refix(), ['master-data', ...GEN_ARGS], /invalid group id/);
    await expectRefused(refix(), ['MasterData', ...GEN_ARGS], /invalid group id/);
  });

  it('rejects a non-kebab menu id', async () => {
    await expectRefused(refix(), [FIXTURE_GROUP, ...GEN_ARGS, '--menu', 'GenProbe'], /invalid --menu/);
  });

  it('rejects bad paths', async () => {
    await expectRefused(refix(), [FIXTURE_GROUP, ...GEN_ARGS, '--path', '/Gen-Probe'], /invalid --path/);
    await expectRefused(refix(), [FIXTURE_GROUP, ...GEN_ARGS, '--path', '/'], /home owns/);
  });

  it('rejects labels with quotes and missing labels', async () => {
    await expectRefused(refix(), [FIXTURE_GROUP, '--label-ko', "it's", '--label-en', 'x'], /--label-ko/);
    await expectRefused(refix(), [FIXTURE_GROUP, '--label-en', 'x'], /--label-ko is required/);
  });

  it('rejects an existing folder', async () => {
    const root = refix();
    mkdirSync(join(root, 'menus', 'mars', FIXTURE_FOLDER), { recursive: true });
    await expectRefused(root, [FIXTURE_GROUP, ...GEN_ARGS], /already exists/);
  });

  it('rejects an owned group', async () => {
    await expectRefused(refix(), ['metrics', ...GEN_ARGS], /already owned by menus\/mars\/metric-catalog/);
  });

  it('rejects a taken menu id', async () => {
    await expectRefused(refix(), [FIXTURE_GROUP, ...GEN_ARGS, '--menu', 'metric-catalog'], /already used by menus\/mars\/metric-catalog/);
  });

  it('rejects a path-shape collision naming the other menu', async () => {
    await expectRefused(refix(), [FIXTURE_GROUP, ...GEN_ARGS, '--path', '/metrics/:equipmentId'], /collides with menus\/mars\/metric-catalog/);
  });

  it('rejects a missing marker', async () => {
    const root = refix({ menusTs: fixtureMenusTs().replace(`${SPREADS_START}\n`, '') });
    await expectRefused(root, [FIXTURE_GROUP, ...GEN_ARGS], /missing marker/);
  });

  it('rejects a non-contiguous menu dependency block', async () => {
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
    await expectRefused(refix({ appPkg }), [FIXTURE_GROUP, ...GEN_ARGS], /not contiguous/);
  });

  it('rejects an already-imported binding', async () => {
    const menusTs = `import { Gauge, LayoutDashboard } from 'lucide-react';
// <gen:menu-imports>
import { manifests as home } from '${PACKAGE_PREFIX}menu-home';
import { manifests as ${FIXTURE_GROUP} } from '${PACKAGE_PREFIX}menu-${FIXTURE_FOLDER}';
// </gen:menu-imports>

export const GROUPS: GroupDef[] = [
  { id: 'metrics', label: { ko: '지표관리', en: 'Metrics' }, icon: Gauge, space: 'mars' },
  { id: '${FIXTURE_GROUP}', label: { ko: '생성 확인', en: 'Gen probe' }, icon: LayoutDashboard, space: 'mars' },
  // </gen:menu-groups>
];

export const SPACES: SpaceDef[] = [{ id: 'mars' }];

export const MENUS: MenuEntry[] = [
  // <gen:menu-spreads>
  ...home,
  // </gen:menu-spreads>
];
`;
    await expectRefused(refix({ menusTs }), [FIXTURE_GROUP, ...GEN_ARGS], /already imported/);
  });
});
