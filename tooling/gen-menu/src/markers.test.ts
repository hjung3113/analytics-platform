import { afterAll, describe, expect, it } from 'vitest';
import { PACKAGE_PREFIX } from './prefix.ts';
import { FIXTURE_GROUP, GEN_ARGS, appSnapshot, fixtureMenusTs, makeFixture, removeFixture, runCli } from './fixture.ts';

const movedSpreadEnd = fixtureMenusTs().replace(
  `  // </gen:menu-spreads>
];`,
  `];
// </gen:menu-spreads>`,
);

const duplicatedImportEnd = fixtureMenusTs().replace(
  `// </gen:menu-imports>`,
  `// </gen:menu-imports>
// </gen:menu-imports>`,
);

const reversedSpreads = fixtureMenusTs().replace(
  `  // <gen:menu-spreads>
  ...home,
  // </gen:menu-spreads>`,
  `  // </gen:menu-spreads>
  ...home,
  // <gen:menu-spreads>`,
);

const commentedImportMarkers = fixtureMenusTs().replace(
  `// <gen:menu-imports>
import { manifests as home } from '${PACKAGE_PREFIX}menu-home';
// </gen:menu-imports>`,
  `/*
// <gen:menu-imports>
// </gen:menu-imports>
*/`,
);

describe('marker context validation (F7)', () => {
  const keep: string[] = [];
  const fresh = (menusTs: string): string => { const root = makeFixture({ menusTs }); keep.push(root); return root; };
  afterAll(() => { for (const root of keep) removeFixture(root); });

  it('refuses a spread end marker moved outside the MENUS array', () => {
    const root = fresh(movedSpreadEnd);
    const before = appSnapshot(root);
    const res = runCli([FIXTURE_GROUP, ...GEN_ARGS], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/not inside the 'MENUS' array literal/);
    expect(appSnapshot(root)).toEqual(before);
  });

  it('refuses a duplicated marker', () => {
    const root = fresh(duplicatedImportEnd);
    const before = appSnapshot(root);
    const res = runCli([FIXTURE_GROUP, ...GEN_ARGS], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/expected exactly once/);
    expect(appSnapshot(root)).toEqual(before);
  });

  it('refuses a reversed marker pair', () => {
    const root = fresh(reversedSpreads);
    const before = appSnapshot(root);
    const res = runCli([FIXTURE_GROUP, ...GEN_ARGS], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/must precede/);
    expect(appSnapshot(root)).toEqual(before);
  });

  it('refuses import markers hidden inside a block comment (R3)', () => {
    const root = fresh(commentedImportMarkers);
    const before = appSnapshot(root);
    const res = runCli([FIXTURE_GROUP, ...GEN_ARGS], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/missing marker '\/\/ <gen:menu-imports>'/);
    expect(appSnapshot(root)).toEqual(before);
  });
});
