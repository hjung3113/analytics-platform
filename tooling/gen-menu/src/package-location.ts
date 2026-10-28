import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GenMenuError } from './errors.ts';

/**
 * Where a generated or scanned consumer package may live (ADR-0097):
 * `menus/<space>/<folder>` for domain-system menus, `platform/<folder>` for platform features.
 * The repository-relative folder path is the one representation every caller passes around.
 */
export type PlacementRoot = 'menus' | 'platform';

export const PLACEMENT_ROOTS: readonly PlacementRoot[] = ['menus', 'platform'];

export type PackageLocation =
  | { root: 'menus'; path: string; space: string; folder: string }
  | { root: 'platform'; path: string; folder: string };

const SEGMENT = /^[a-z][a-z0-9-]*$/;

/** The repo-relative folder for a package: domain `menus/<space>/<folder>`, feature `platform/<folder>`. */
export function locationPath(root: PlacementRoot, space: string | null, folder: string): string {
  if (root === 'platform') return `platform/${folder}`;
  if (space === null) throw new GenMenuError(`menus/ placement needs a named space for '${folder}' — a null-space group lives in platform/`);
  return `menus/${space}/${folder}`;
}

/** Shape check only (root, depth, segment form). Group/space correspondence is the caller's job. Throws on one-level menus and nested platform folders. */
export function parseLocation(path: string): PackageLocation {
  const parts = path.split('/');
  const [root, ...rest] = parts;
  if (root === 'menus') {
    if (rest.length !== 2) throw new GenMenuError(`${rest.length < 2 ? 'one-level menu package' : 'nested menu package'}: ${path}`);
    const [space, folder] = rest as [string, string];
    if (!SEGMENT.test(space) || !SEGMENT.test(folder)) throw new GenMenuError(`invalid package folder: ${path}`);
    return { root, path, space, folder };
  }
  if (root === 'platform') {
    if (rest.length !== 1) throw new GenMenuError(`nested platform package: ${path}`);
    const [folder] = rest as [string];
    if (!SEGMENT.test(folder)) throw new GenMenuError(`invalid package folder: ${path}`);
    return { root, path, folder };
  }
  throw new GenMenuError(`unknown package root: ${path}`);
}

const isDir = (path: string): boolean => existsSync(path) && statSync(path).isDirectory();
const hasPackage = (dir: string): boolean => existsSync(join(dir, 'package.json')) || existsSync(join(dir, 'src/index.ts'));
const subdirs = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true })
    .filter(e => (e.isDirectory() || e.isSymbolicLink()) && !e.name.startsWith('.') && isDir(join(dir, e.name)))
    .map(e => e.name);

/**
 * Repo-relative consumer package folders of both roots, including malformed ones (one-level
 * `menus/<x>`, nested `platform/<x>/<y>`) so callers can reject them.
 */
export function packageFolders(root: string): string[] {
  const folders: string[] = [];
  const menus = join(root, 'menus');
  if (isDir(menus)) {
    for (const space of subdirs(menus)) {
      const parent = join(menus, space);
      if (hasPackage(parent)) folders.push(`menus/${space}`);
      else for (const group of subdirs(parent)) folders.push(`menus/${space}/${group}`);
    }
  }
  const platform = join(root, 'platform');
  if (isDir(platform)) {
    for (const feature of subdirs(platform)) {
      const dir = join(platform, feature);
      const nested = hasPackage(dir) ? [] : subdirs(dir);
      if (nested.length === 0) folders.push(`platform/${feature}`);
      else for (const inner of nested) folders.push(`platform/${feature}/${inner}`);
    }
  }
  return folders;
}
