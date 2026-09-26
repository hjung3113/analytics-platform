import { afterAll, describe, expect, it } from 'vitest';
import { FIXTURE_GROUP, GEN_ARGS, appSnapshot, makeFixture, removeFixture, runCli } from './fixture.ts';

describe('binding safety (F5)', () => {
  const keep: string[] = [];
  const fresh = (extraGroups?: string[]): string => { const root = makeFixture({ extraGroups }); keep.push(root); return root; };
  afterAll(() => { for (const root of keep) removeFixture(root); });

  it('rejects strict-mode-invalid bindings eval and arguments', () => {
    for (const group of ['eval', 'arguments']) {
      const root = fresh();
      const res = runCli([group, ...GEN_ARGS], root);
      expect(res.status, group).toBe(1);
      expect(res.stderr, group).toMatch(/reserved word/);
      expect(appSnapshot(root)).toEqual(appSnapshot(makeFixture()));
    }
  });

  it('rejects a binding colliding with an existing top-level declaration in menus.ts', () => {
    const root = fresh(['registry']);
    const before = appSnapshot(root);
    const res = runCli(['registry', ...GEN_ARGS], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/already imported or declared/);
    expect(appSnapshot(root)).toEqual(before);
  });

  it('rejects menu ids whose page component collides with the page template imports', () => {
    for (const menu of ['platform-page', 'query-view']) {
      const root = fresh();
      const before = appSnapshot(root);
      const res = runCli([FIXTURE_GROUP, ...GEN_ARGS, '--menu', menu], root);
      expect(res.status, menu).toBe(1);
      expect(res.stderr, menu).toMatch(/collides with the page template imports/);
      expect(appSnapshot(root)).toEqual(before);
    }
  });
});
