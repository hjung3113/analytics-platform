/**
 * The workspace package prefix (docs/integration/platform-packages.md §8). Single decision source:
 * every specifier the generator emits or scans for is built from this constant, so no other file
 * in this package writes the literal.
 */
export const PACKAGE_PREFIX = '@ap/';
