import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PACKAGE_PREFIX } from './prefix.ts';
import { APP_PKG } from './generate.ts';
import { FIXTURE_GROUP, GEN_ARGS, REAL_SHAPE_APP_PKG, appSnapshot, makeFixture, removeFixture, runCli } from './fixture.ts';

const EOL_APP_PKG = REAL_SHAPE_APP_PKG.replace(/\n/g, '\r\n');

describe('dependency block wiring (real-shape regressions)', () => {
  const keep: string[] = [];
  const fresh = (appPkg: string, extraGroups?: string[]): string => {
    const root = makeFixture({ appPkg, extraGroups });
    keep.push(root);
    return root;
  };
  afterAll(() => { for (const root of keep) removeFixture(root); });

  it('inserts before, inside and after the real block lexicographically', () => {
    const extra = ['aaaProbe', 'zZulu'];
    for (const [group, folder, prev, next] of [
      ['aaaProbe', 'aaa-probe', `${PACKAGE_PREFIX}kernel`, `${PACKAGE_PREFIX}menu-admin`],
      ['genProbe', 'gen-probe', `${PACKAGE_PREFIX}menu-equipment`, `${PACKAGE_PREFIX}menu-home`],
      ['zZulu', 'z-zulu', `${PACKAGE_PREFIX}menu-notice-voc`, `${PACKAGE_PREFIX}mock-server`],
    ] as const) {
      const root = fresh(REAL_SHAPE_APP_PKG, extra);
      const res = runCli([group, ...GEN_ARGS], root);
      expect(res.status, res.stderr).toBe(0);
      const lines = readFileSync(join(root, APP_PKG), 'utf8').split('\n');
      const at = lines.findIndex(l => l.includes(`"${PACKAGE_PREFIX}menu-${folder}"`));
      expect(at, group).toBeGreaterThan(-1);
      expect(lines[at - 1], group).toContain(prev);
      expect(lines[at + 1], group).toContain(next);
      expect(() => JSON.parse(readFileSync(join(root, APP_PKG), 'utf8')), group).not.toThrow();
    }
  });

  it('preserves CRLF endings across generate and remove', () => {
    const root = fresh(EOL_APP_PKG);
    expect(runCli([FIXTURE_GROUP, ...GEN_ARGS], root).status).toBe(0);
    const after = readFileSync(join(root, APP_PKG), 'utf8');
    expect(after).toContain(`"${PACKAGE_PREFIX}menu-gen-probe": "workspace:*",`);
    expect(after.replace(/\r\n/g, '').includes('\n')).toBe(false);
    expect(() => JSON.parse(after)).not.toThrow();
    expect(runCli(['--remove', FIXTURE_GROUP], root).status).toBe(0);
    const restored = readFileSync(join(root, APP_PKG), 'utf8');
    expect(restored).toBe(EOL_APP_PKG);
    expect(appSnapshot(root)['apps/platform-web/package.json']).toBe(EOL_APP_PKG);
  });

  it('adds and moves commas when the block ends the object', () => {
    const appPkg = `{
  "name": "fixture-app",
  "private": true,
  "dependencies": {
    "${PACKAGE_PREFIX}menu-analytics": "workspace:*",
    "${PACKAGE_PREFIX}menu-home": "workspace:*"
  }
}
`;
    const root = fresh(appPkg);
    expect(runCli([FIXTURE_GROUP, ...GEN_ARGS], root).status).toBe(0);
    const text = readFileSync(join(root, APP_PKG), 'utf8');
    expect(() => JSON.parse(text)).not.toThrow();
    const lines = text.split('\n');
    const at = lines.findIndex(l => l.includes(`"${PACKAGE_PREFIX}menu-gen-probe"`));
    expect(lines[at - 1]).toContain('menu-analytics');
    expect(lines[at + 1]).toContain('menu-home');
    // Inserted before the comma-less last entry: the new line takes the comma, the last stays last.
    expect(lines[at].trimEnd().endsWith(',')).toBe(true);
    expect(lines[at + 1].trimEnd().endsWith(',')).toBe(false);
    expect(runCli(['--remove', FIXTURE_GROUP], root).status).toBe(0);
    expect(readFileSync(join(root, APP_PKG), 'utf8')).toBe(appPkg);
  });

  it('appends after a comma-less last entry keeping the JSON valid', () => {
    const appPkg = `{
  "name": "fixture-app",
  "private": true,
  "dependencies": {
    "${PACKAGE_PREFIX}menu-home": "workspace:*"
  }
}
`;
    const root = fresh(appPkg, ['masterData']);
    expect(runCli(['masterData', '--label-ko', 'm', '--label-en', 'm'], root).status).toBe(0);
    const text = readFileSync(join(root, APP_PKG), 'utf8');
    expect(() => JSON.parse(text)).not.toThrow();
    const lines = text.split('\n');
    const at = lines.findIndex(l => l.includes('menu-master-data'));
    expect(lines[at]).toBe(`    "${PACKAGE_PREFIX}menu-master-data": "workspace:*"`);
    expect(lines[at - 1]).toBe(`    "${PACKAGE_PREFIX}menu-home": "workspace:*",`);
    expect(lines[at + 1]?.trimStart().startsWith('}')).toBe(true);
    const rem = runCli(['--remove', 'masterData'], root);
    expect(rem.status, rem.stderr).toBe(0);
    expect(readFileSync(join(root, APP_PKG), 'utf8')).toBe(appPkg);
  });
});
