import { afterAll, describe, expect, it } from 'vitest';
import { FIXTURE_GROUP, GEN_ARGS, makeFixture, removeFixture, runCli } from './fixture.ts';

const DOUBLE_QUOTED_INDEX = `export const manifests = [{ "id": "metric-catalog", "group": "metrics", "path": "/metrics/:metricId" }];\n`;
const UNDERSCORE_INDEX = `export const manifests = [{ id: 'metric-catalog', group: 'metrics', path: '/metrics/:metric_id' }];\n`;
const TRAILING_SLASH_INDEX = `export const manifests = [{ id: 'metric-catalog', group: 'metrics', path: '/metrics/' }];\n`;
const SPREAD_INDEX = `const base = { id: 'metric-catalog', group: 'metrics', path: '/metrics/:metricId' };\nexport const manifests = [{ ...base }];\n`;

describe('manifest parsing and route shapes (F6)', () => {
  const keep: string[] = [];
  const fresh = (index: string): string => { const root = makeFixture({ existingMenuIndex: index }); keep.push(root); return root; };
  afterAll(() => { for (const root of keep) removeFixture(root); });

  it('sees ids and groups in double-quoted index files', () => {
    const root = fresh(DOUBLE_QUOTED_INDEX);
    const res = runCli([FIXTURE_GROUP, ...GEN_ARGS, '--menu', 'metric-catalog'], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/already used by menus\/metric-catalog/);
  });

  it('sees path shapes in double-quoted index files', () => {
    const root = fresh(DOUBLE_QUOTED_INDEX);
    const res = runCli([FIXTURE_GROUP, ...GEN_ARGS, '--path', '/metrics/:other'], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/collides with menus\/metric-catalog/);
  });

  it('normalizes underscore parameter names like the kernel', () => {
    const root = fresh(UNDERSCORE_INDEX);
    const res = runCli([FIXTURE_GROUP, ...GEN_ARGS, '--path', '/metrics/:other'], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/collides with menus\/metric-catalog/);
  });

  it('normalizes trailing slashes like the kernel', () => {
    const root = fresh(TRAILING_SLASH_INDEX);
    const res = runCli([FIXTURE_GROUP, ...GEN_ARGS, '--path', '/metrics'], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/collides with menus\/metric-catalog/);
  });

  it('refuses manifest forms it cannot parse instead of skipping them', () => {
    const root = fresh(SPREAD_INDEX);
    const res = runCli([FIXTURE_GROUP, ...GEN_ARGS], root);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/unsupported manifest form in menus\/metric-catalog\/src\/index\.ts/);
  });
});
