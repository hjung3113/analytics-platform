// Build the installed outside-consumer kit twice. Rollup chunk.modules is the evidence, never JS text markers.
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function bundledModuleIds(result) {
  return [
    ...new Set(
      [result].flat().flatMap(({ output }) => output.flatMap((entry) => (entry.type === 'chunk' ? Object.keys(entry.modules) : []))),
    ),
  ].sort();
}

/** The kit's menu declaration snapshot (ADR-0156): the real build writes it (with the sample endpoint), the mock build does not. */
export function assertKitSnapshot(mode, result) {
  const assets = [result].flat().flatMap(({ output }) => output.filter((entry) => entry.type === 'asset' && entry.fileName === 'menu-declarations.snapshot.json'));
  if (mode !== 'real') {
    if (assets.length) throw new Error(`${mode}: writes menu-declarations.snapshot.json, which only the real build may`);
    return;
  }
  if (assets.length !== 1) throw new Error('real: menu-declarations.snapshot.json is not in the build output');
  const snapshot = JSON.parse(String(assets[0].source));
  if (snapshot.schemaVersion !== 1 || !snapshot.endpoints?.length || !snapshot.menus?.length) throw new Error('real: menu-declarations.snapshot.json lacks the kit menus or endpoints');
}

/**
 * The kit folder by its real path: Vite reports module ids and resolves index.html by the real path, so a root reached
 * through a symbolic link (macOS TMPDIR /var → /private/var, #1852) must be compared and built as its real path.
 */
export function kitRoot(root) {
  const absolute = resolve(root);
  return existsSync(absolute) ? realpathSync(absolute) : absolute;
}

export function assertKitGraph(mode, ids, root) {
  const normalized = ids.map((id) => id.replaceAll('\\', '/').replace(/^\0/, '').split('?')[0]);
  const directory = `${kitRoot(root).replaceAll('\\', '/')}/`;
  const adapter = mode === 'real' ? 'http-adapter' : 'mock-server';
  const other = mode === 'real' ? 'mock-server' : 'http-adapter';
  const assembly = `${directory}${mode}/assembly.${mode === 'real' ? 'tsx' : 'ts'}`;
  const hasPackage = (id, name) => id.includes(`/node_modules/@ap/${name}/`);
  if (!normalized.includes(assembly) || !normalized.some((id) => hasPackage(id, adapter)))
    throw new Error(`${mode}: missing assembly or @ap/${adapter}`);
  const forbidden = normalized.filter(
    (id) =>
      hasPackage(id, other) ||
      (mode === 'real' && id.startsWith(directory) && /\/(mock\/|mock\.[^/]+$)/.test(`/${id.slice(directory.length)}`)),
  );
  if (forbidden.length) throw new Error(`${mode}: forbidden modules:\n${forbidden.join('\n')}`);
  // All absolute source paths must belong to this external project, including its installed tarballs. Virtual ids are allowed.
  const outside = normalized.filter((id) => /^(\/|[A-Za-z]:\/)/.test(id) && !id.startsWith(directory));
  if (outside.length) throw new Error(`${mode}: source outside the installed kit:\n${outside.join('\n')}`);
}

export async function checkKitGraphs(givenRoot) {
  const root = kitRoot(givenRoot);
  const require = createRequire(join(root, 'package.json'));
  const { build } = await import(pathToFileURL(require.resolve('vite')).href);
  const directory = join(root, '.kit-graphs');
  mkdirSync(directory, { recursive: true });
  for (const mode of ['mock', 'real']) {
    const result = await build({ root, mode, logLevel: 'error', build: { write: false } });
    const ids = bundledModuleIds(result);
    const path = join(directory, `${mode}.json`);
    writeFileSync(path, `${JSON.stringify(ids, null, 2)}\n`);
    assertKitGraph(mode, ids, root);
    assertKitSnapshot(mode, result);
    process.stdout.write(`kit ${mode}: ${ids.length} bundled module ids listed in ${path}\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkKitGraphs(resolve(process.argv[2] ?? '.')).catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
