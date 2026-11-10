import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { BUNDLED_ASSETS_DIR, dataRootFromEnv, findRepoRoot } from '../server/roots.js';

const serverDir = join(dirname(fileURLToPath(import.meta.url)), '../server');

it('derives the repository root from the AP workspace, not the EV package folder', () => {
  const root = findRepoRoot(serverDir);
  expect(root).toBe(resolve(process.cwd(), '../..'));
  expect(existsSync(join(root, 'pnpm-workspace.yaml'))).toBe(true);
  expect(existsSync(join(root, BUNDLED_ASSETS_DIR, 'templates/cluster-single.template.json'))).toBe(true);
});

it('throws when no workspace file is above the start folder', () => {
  expect(() => findRepoRoot('/')).toThrow(/pnpm-workspace\.yaml/);
});

it.each([
  [{}, undefined],
  [{ EQV_STUDIO_ASSETS: '' }, undefined],
  [{ EQV_STUDIO_ASSETS: '/data/eqv' }, '/data/eqv'],
])('reads the data root from EQV_STUDIO_ASSETS only (%j)', (env, expected) => {
  expect(dataRootFromEnv(env)).toBe(expected);
});
