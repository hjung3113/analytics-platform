import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PACKAGE_PREFIX } from './prefix.ts';
import { STYLE_CSS } from './generate.ts';
import { FIXTURE_FOLDER, FIXTURE_GROUP, GEN_ARGS, appSnapshot, makeFixture, removeFixture, runCli } from './fixture.ts';

const CSS_LINE = `@import "${PACKAGE_PREFIX}menu-${FIXTURE_FOLDER}/styles.css";`;

function cssOf(root: string): string {
  return readFileSync(join(root, STYLE_CSS), 'utf8');
}

describe('remove ownership is bounded to the marker region (F4)', () => {
  const keep: string[] = [];
  const fresh = (): string => { const root = makeFixture(); keep.push(root); return root; };
  afterAll(() => { for (const root of keep) removeFixture(root); });

  it('removes the in-region line and leaves an identical copy outside the region untouched', () => {
    const root = fresh();
    const pristine = appSnapshot(root);
    const pristineCss = cssOf(root);
    expect(runCli([FIXTURE_GROUP, ...GEN_ARGS], root).status).toBe(0);
    // Human copy of the exact import sits above the markers; the owned insert stays in-region.
    writeFileSync(join(root, STYLE_CSS), `${CSS_LINE}\n${cssOf(root)}`);
    const res = runCli(['--remove', FIXTURE_GROUP], root);
    expect(res.status, res.stderr).toBe(0);
    // The human copy above the markers survives verbatim; only the owned line went away.
    expect(cssOf(root)).toBe(`${CSS_LINE}\n${pristineCss}`);
    const after = appSnapshot(root);
    expect(after['apps/platform-web/src/menus.ts']).toBe(pristine['apps/platform-web/src/menus.ts']);
    expect(after['apps/platform-web/package.json']).toBe(pristine['apps/platform-web/package.json']);
    expect(existsSync(join(root, 'menus', FIXTURE_FOLDER))).toBe(false);
  });

  it('refuses an indented in-region line even when an exact copy exists outside', () => {
    const root = fresh();
    expect(runCli([FIXTURE_GROUP, ...GEN_ARGS], root).status).toBe(0);
    const region = cssOf(root);
    const indented = region.replace(CSS_LINE, `  ${CSS_LINE}`);
    writeFileSync(join(root, STYLE_CSS), `${CSS_LINE}\n${indented}`);
    const tampered = appSnapshot(root);
    const res = runCli(['--remove', FIXTURE_GROUP], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/not present inside its owned region/);
    expect(appSnapshot(root)).toEqual(tampered);
    expect(existsSync(join(root, 'menus', FIXTURE_FOLDER))).toBe(true);
  });

  it('refuses when the generated line appears twice inside the region', () => {
    const root = fresh();
    expect(runCli([FIXTURE_GROUP, ...GEN_ARGS], root).status).toBe(0);
    writeFileSync(join(root, STYLE_CSS), cssOf(root).replace(`/* </gen:menu-styles> */`, `${CSS_LINE}\n/* </gen:menu-styles> */`));
    const tampered = appSnapshot(root);
    const res = runCli(['--remove', FIXTURE_GROUP], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/appears 2 times inside its owned region/);
    expect(appSnapshot(root)).toEqual(tampered);
    expect(existsSync(join(root, 'menus', FIXTURE_FOLDER))).toBe(true);
  });
});
