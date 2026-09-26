import { existsSync, readFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { STYLE_CSS } from './generate.ts';
import { FIXTURE_GROUP, GEN_ARGS, appSnapshot, makeFixture, removeFixture, runCli } from './fixture.ts';

describe('generate rollback on write faults (F3)', () => {
  const keep: { root: string; css?: string }[] = [];
  const fresh = (): string => { const root = makeFixture(); keep.push({ root }); return root; };
  afterAll(() => {
    for (const { root, css } of keep) {
      if (css !== undefined) chmodSync(join(root, STYLE_CSS), 0o644);
      removeFixture(root);
    }
  });

  it('unwritable style.css: exits 1, app files pristine, package dir absent', () => {
    const root = fresh();
    const before = appSnapshot(root);
    const css = join(root, STYLE_CSS);
    chmodSync(css, 0o444);
    keep[keep.length - 1].css = css;
    const res = runCli([FIXTURE_GROUP, ...GEN_ARGS], root);
    expect(res.status).toBe(1);
    expect(appSnapshot(root)).toEqual(before);
    expect(existsSync(join(root, 'menus', 'gen-probe'))).toBe(false);
    expect(menusHasOnlyCatalog(root)).toBe(true);
  });

  it('unwritable app package.json: earlier completed writes are restored too', () => {
    const root = fresh();
    const before = appSnapshot(root);
    const pkg = join(root, 'apps/platform-web/package.json');
    chmodSync(pkg, 0o444);
    keep[keep.length - 1].css = undefined;
    const closer = (): void => chmodSync(pkg, 0o644);
    try {
      const res = runCli([FIXTURE_GROUP, ...GEN_ARGS], root);
      expect(res.status).toBe(1);
      expect(appSnapshot(root)).toEqual(before);
      expect(existsSync(join(root, 'menus', 'gen-probe'))).toBe(false);
    } finally {
      closer();
    }
  });
});

function menusHasOnlyCatalog(root: string): boolean {
  return readFileSync(join(root, 'menus/metric-catalog/src/index.ts'), 'utf8').includes('metric-catalog');
}
