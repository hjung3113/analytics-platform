import { afterAll, describe, expect, it } from 'vitest';
import { PACKAGE_PREFIX } from './prefix.ts';
import { FIXTURE_GROUP, GEN_ARGS, appSnapshot, fixtureMockAssemblyTsx, fixtureMenusTs, makeFixture, removeFixture, runCli } from './fixture.ts';

/** The mock spread markers moved OUT of the MOCK_ENDPOINTS array. */
const mockSpreadOutsideEndpoints = fixtureMockAssemblyTsx().replace(
  `export const MOCK_ENDPOINTS: readonly AnyMockEndpoint[] = [
  // <gen:menu-mock-spreads>
  ...analyticsMock,
  // </gen:menu-mock-spreads>
];`,
  `export const MOCK_ENDPOINTS: readonly AnyMockEndpoint[] = [...analyticsMock];
// <gen:menu-mock-spreads>
// </gen:menu-mock-spreads>`,
);

const mockMarkersMissing = fixtureMockAssemblyTsx()
  .replace('// <gen:menu-mock-imports>\n', '')
  .replace('// </gen:menu-mock-imports>\n', '');

/** The write-sample entry markers moved OUT of the MOCK_WRITE_SAMPLES array. */
const sampleEntriesOutsideArray = fixtureMockAssemblyTsx().replace(
  `= [
  // <gen:menu-mock-sample-entries>
  // </gen:menu-mock-sample-entries>
];`,
  `= [];
// <gen:menu-mock-sample-entries>
// </gen:menu-mock-sample-entries>`,
);

/** The action spread markers moved OUT of the MOCK_ACTIONS array. */
const actionSpreadsOutsideArray = fixtureMockAssemblyTsx().replace(
  `= [
  // <gen:menu-mock-action-spreads>
  // </gen:menu-mock-action-spreads>
];`,
  `= [];
// <gen:menu-mock-action-spreads>
// </gen:menu-mock-action-spreads>`,
);

const actionImportMarkersMissing = fixtureMockAssemblyTsx()
  .replace('// <gen:menu-mock-action-imports>\n', '')
  .replace('// </gen:menu-mock-action-imports>\n', '');

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
  const fresh = (variants: { menusTs?: string; mockAssemblyTsx?: string }): string => { const root = makeFixture(variants); keep.push(root); return root; };
  afterAll(() => { for (const root of keep) removeFixture(root); });

  it('refuses mock spread markers moved outside the MOCK_ENDPOINTS array', async () => {
    const root = fresh({ mockAssemblyTsx: mockSpreadOutsideEndpoints });
    const before = appSnapshot(root);
    const res = await runCli([FIXTURE_GROUP, ...GEN_ARGS], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/not inside the MOCK_ENDPOINTS array/);
    expect(appSnapshot(root)).toEqual(before);
  });

  it('refuses a missing mock-assembly.tsx mock marker pair', async () => {
    const root = fresh({ mockAssemblyTsx: mockMarkersMissing });
    const before = appSnapshot(root);
    const res = await runCli([FIXTURE_GROUP, ...GEN_ARGS], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/missing marker '\/\/ <gen:menu-mock-imports>'/);
    expect(appSnapshot(root)).toEqual(before);
  });

  it.each([
    { name: 'sample entry markers moved outside MOCK_WRITE_SAMPLES', text: sampleEntriesOutsideArray, message: /not inside the MOCK_WRITE_SAMPLES array/ },
    { name: 'action spread markers moved outside MOCK_ACTIONS', text: actionSpreadsOutsideArray, message: /not inside the MOCK_ACTIONS array/ },
    { name: 'a missing action import marker pair', text: actionImportMarkersMissing, message: /missing marker '\/\/ <gen:menu-mock-action-imports>'/ },
  ])('refuses $name (#1904)', async ({ text, message }) => {
    const root = fresh({ mockAssemblyTsx: text });
    const before = appSnapshot(root);
    const res = await runCli([FIXTURE_GROUP, ...GEN_ARGS], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(message);
    expect(appSnapshot(root)).toEqual(before);
  });

  it('refuses a spread end marker moved outside the MENUS array', async () => {
    const root = fresh({ menusTs: movedSpreadEnd });
    const before = appSnapshot(root);
    const res = await runCli([FIXTURE_GROUP, ...GEN_ARGS], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/not inside the 'MENUS' array literal/);
    expect(appSnapshot(root)).toEqual(before);
  });

  it('refuses a duplicated marker', async () => {
    const root = fresh({ menusTs: duplicatedImportEnd });
    const before = appSnapshot(root);
    const res = await runCli([FIXTURE_GROUP, ...GEN_ARGS], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/expected exactly once/);
    expect(appSnapshot(root)).toEqual(before);
  });

  it('refuses a reversed marker pair', async () => {
    const root = fresh({ menusTs: reversedSpreads });
    const before = appSnapshot(root);
    const res = await runCli([FIXTURE_GROUP, ...GEN_ARGS], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/must precede/);
    expect(appSnapshot(root)).toEqual(before);
  });

  it('refuses import markers hidden inside a block comment (R3)', async () => {
    const root = fresh({ menusTs: commentedImportMarkers });
    const before = appSnapshot(root);
    const res = await runCli([FIXTURE_GROUP, ...GEN_ARGS], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/missing marker '\/\/ <gen:menu-imports>'/);
    expect(appSnapshot(root)).toEqual(before);
  });
});
