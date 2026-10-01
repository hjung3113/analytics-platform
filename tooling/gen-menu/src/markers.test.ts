import { afterAll, describe, expect, it } from 'vitest';
import { PACKAGE_PREFIX } from './prefix.ts';
import { FIXTURE_GROUP, GEN_ARGS, appSnapshot, fixtureMainTsx, fixtureMenusTs, makeFixture, removeFixture, runCli } from './fixture.ts';

/** The mock spread markers moved OUT of the createMockAdapter endpoints array. */
const mockSpreadOutsideEndpoints = fixtureMainTsx().replace(
  `const adapter = createMockAdapter({
  endpoints: [
    // <gen:menu-mock-spreads>
    ...analyticsMock,
    // </gen:menu-mock-spreads>
  ],
  registry,
});`,
  `const endpoints = [];
const adapter = createMockAdapter({ endpoints: [...endpoints, ...analyticsMock], registry });
// <gen:menu-mock-spreads>
// </gen:menu-mock-spreads>`,
);

const mockMarkersMissing = fixtureMainTsx()
  .replace('// <gen:menu-mock-imports>\n', '')
  .replace('// </gen:menu-mock-imports>\n', '');

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
  const fresh = (variants: { menusTs?: string; mainTsx?: string }): string => { const root = makeFixture(variants); keep.push(root); return root; };
  afterAll(() => { for (const root of keep) removeFixture(root); });

  it('refuses mock spread markers moved outside the createMockAdapter endpoints array', () => {
    const root = fresh({ mainTsx: mockSpreadOutsideEndpoints });
    const before = appSnapshot(root);
    const res = runCli([FIXTURE_GROUP, ...GEN_ARGS], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/not inside the createMockAdapter endpoints array/);
    expect(appSnapshot(root)).toEqual(before);
  });

  it('refuses a missing main.tsx mock marker pair', () => {
    const root = fresh({ mainTsx: mockMarkersMissing });
    const before = appSnapshot(root);
    const res = runCli([FIXTURE_GROUP, ...GEN_ARGS], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/missing marker '\/\/ <gen:menu-mock-imports>'/);
    expect(appSnapshot(root)).toEqual(before);
  });

  it('refuses a spread end marker moved outside the MENUS array', () => {
    const root = fresh({ menusTs: movedSpreadEnd });
    const before = appSnapshot(root);
    const res = runCli([FIXTURE_GROUP, ...GEN_ARGS], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/not inside the 'MENUS' array literal/);
    expect(appSnapshot(root)).toEqual(before);
  });

  it('refuses a duplicated marker', () => {
    const root = fresh({ menusTs: duplicatedImportEnd });
    const before = appSnapshot(root);
    const res = runCli([FIXTURE_GROUP, ...GEN_ARGS], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/expected exactly once/);
    expect(appSnapshot(root)).toEqual(before);
  });

  it('refuses a reversed marker pair', () => {
    const root = fresh({ menusTs: reversedSpreads });
    const before = appSnapshot(root);
    const res = runCli([FIXTURE_GROUP, ...GEN_ARGS], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/must precede/);
    expect(appSnapshot(root)).toEqual(before);
  });

  it('refuses import markers hidden inside a block comment (R3)', () => {
    const root = fresh({ menusTs: commentedImportMarkers });
    const before = appSnapshot(root);
    const res = runCli([FIXTURE_GROUP, ...GEN_ARGS], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/missing marker '\/\/ <gen:menu-imports>'/);
    expect(appSnapshot(root)).toEqual(before);
  });
});
