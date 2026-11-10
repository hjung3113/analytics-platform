import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** The bundled, read-only EV assets (Template catalog) inside the AP repository. */
export const BUNDLED_ASSETS_DIR = 'packages/eqv/assets';

export const DATA_ROOT_ENV = 'EQV_STUDIO_ASSETS';
export const DATA_ROOT_UNSET = `${DATA_ROOT_ENV} is not set: point it at a writable assets folder outside this repository.`;

/** The analytics-platform repository root: the nearest ancestor holding `pnpm-workspace.yaml`. */
export function findRepoRoot(from: string): string {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    if (dirname(dir) === dir) throw new Error(`No pnpm-workspace.yaml above ${from}`);
  }
}

/** The writable data root: `EQV_STUDIO_ASSETS`, never a default inside the repository. `undefined` when unset. */
export const dataRootFromEnv = (env: NodeJS.ProcessEnv): string | undefined => {
  const value = env[DATA_ROOT_ENV];
  return value === undefined || value === '' ? undefined : resolve(value);
};
