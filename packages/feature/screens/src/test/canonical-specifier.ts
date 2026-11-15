import path from 'node:path';

/**
 * The `@/…` form of a relative import specifier: the import guards were written against that alias form, and the alias is gone since #2211
 * (every import is relative). A specifier that resolves under `sourceRoot` becomes `@/<path under src>`; a package specifier or one that
 * leaves `src` is returned unchanged.
 */
export function canonicalSpecifier(importer: string, specifier: string, sourceRoot: string): string {
  if (!specifier.startsWith('.')) return specifier;
  const target = path.relative(sourceRoot, path.resolve(path.dirname(importer), specifier)).split(path.sep).join('/');
  return target === '..' || target.startsWith('../') ? specifier : `@/${target}`;
}
