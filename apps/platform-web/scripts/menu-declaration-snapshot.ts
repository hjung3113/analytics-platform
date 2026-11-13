/**
 * The app's menu declaration snapshot (#1900, ADR-0156): every non-mock build writes dist/menu-declarations.snapshot.json
 * from the same Registry input (`src/menus.ts` `declarations`) and the same menu `endpoints.ts` files the web uses. The
 * core server refuses a declaration bundle whose menu-owned fields differ from it. Never written by hand.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { menuDeclarationSnapshotPlugin } from '@ap/contracts/build';
import { runnerImport } from 'vite';

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const FEATURE_SRC = fileURLToPath(new URL('../../feature-screens/src', import.meta.url));

/** `menus/<space>/<group>/src/endpoints.ts` and `platform/<feature>/src/endpoints.ts` — the set `endpoints.json` also reads. */
export function declarationModules(root = REPO_ROOT): string[] {
  const dirs = (path: string) => (existsSync(path) ? readdirSync(path, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => `${path}/${entry.name}`) : []);
  const packages = [...dirs(`${root}menus`).flatMap(dirs), ...dirs(`${root}platform`)];
  return packages.map((dir) => `${dir}/src/endpoints.ts`).filter((path) => existsSync(path)).sort();
}

const sdkVersion = (): string =>
  (JSON.parse(readFileSync(new URL('../package.json', import.meta.resolve('@ap/contracts')), 'utf8')) as { version: string }).version;

export function menuDeclarationSnapshot() {
  return menuDeclarationSnapshotPlugin({
    registry: `${APP_ROOT}src/menus.ts`,
    declarationModules: declarationModules(),
    sdkVersion: sdkVersion(),
    load: async (path) => (await runnerImport<Record<string, unknown>>(path, { configFile: false, root: APP_ROOT, logLevel: 'error', resolve: { alias: { '@': FEATURE_SRC } } })).module,
  });
}
