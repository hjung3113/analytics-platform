import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageRoot, '../..');
const sourceManifestPath = join(packageRoot, 'package.json');
/** The second entry point (#674): generated vocabulary JSON for servers outside the workspace, shipped as-is. */
const VOCAB_ENTRY = './vocab.json';
const VOCAB_SOURCE = './src/vocab.json';
const VOCAB_DIST = './dist/vocab.json';
const ENTRY_POINTS = ['.', VOCAB_ENTRY].join(',');
let temporaryRoot;

function oneLine(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function fail(message) {
  throw new Error(message);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.error) fail(`${command} could not run: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = result.stderr || result.stdout || `exit ${result.status ?? 'unknown'}`;
    fail(`${command} ${args.join(' ')} failed (${result.status}): ${oneLine(detail)}`);
  }
  return result.stdout;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`cannot read ${path}: ${error.message}`);
  }
}

function validateExports(entry, label) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    fail(`${label} exports["."] must define types and import conditions`);
  }
  const conditions = Object.keys(entry).sort();
  if (conditions.join(',') !== 'import,types') {
    fail(`${label} exports["."] must contain only types and import conditions`);
  }
  for (const [condition, target] of Object.entries(entry)) {
    if (typeof target !== 'string' || !target.startsWith('./dist/') || target.split('/').includes('..')) {
      fail(`${label} exports["."].${condition} must point inside dist`);
    }
  }
  if (!entry.types.endsWith('.d.ts') || !entry.import.endsWith('.js')) {
    fail(`${label} exports["."] must target .d.ts types and an ESM .js file`);
  }
}

function validateSourceManifest() {
  const manifest = readJson(sourceManifestPath);
  if (manifest.exports?.['.'] !== './src/index.ts') {
    fail('workspace exports["."] must keep pointing to ./src/index.ts');
  }
  if (Object.keys(manifest.exports ?? {}).join(',') !== ENTRY_POINTS || manifest.exports[VOCAB_ENTRY] !== VOCAB_SOURCE) {
    fail(`the package must expose only the . and ${VOCAB_ENTRY} entry points`);
  }
  if (!Array.isArray(manifest.files) || !manifest.files.includes('dist')) {
    fail('package.json files must include dist');
  }
  const publishExports = manifest.publishConfig?.exports;
  if (!publishExports || Object.keys(publishExports).join(',') !== ENTRY_POINTS || publishExports[VOCAB_ENTRY] !== VOCAB_DIST) {
    fail(`publishConfig.exports must expose only the . and ${VOCAB_ENTRY} entry points`);
  }
  validateExports(publishExports['.'], 'publishConfig');
}

function archiveRelativePath(path) {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  if (normalized.split('/').includes('..') || normalized.startsWith('/')) {
    fail(`unsafe path in packed archive: ${path}`);
  }
  if (normalized === 'package') return '';
  if (!normalized.startsWith('package/')) fail(`unexpected packed archive path: ${path}`);
  return normalized.slice('package/'.length);
}

function validatePackedFiles(paths) {
  const files = paths.map(archiveRelativePath).filter(Boolean);
  const forbiddenSource = files.find((path) => path === 'src' || path.startsWith('src/'));
  if (forbiddenSource) fail(`packed archive includes source path ${forbiddenSource}`);
  const forbiddenTest = files.find((path) => /(^|\/)[^/]*\.test\.[^/]+$/.test(path));
  if (forbiddenTest) fail(`packed archive includes test file ${forbiddenTest}`);
  const forbiddenGlobals = files.find((path) => basename(path) === 'globals.d.ts');
  if (forbiddenGlobals) fail(`packed archive includes ${forbiddenGlobals}`);
  const forbiddenConfig = files.find((path) => path.split('/').some((part) => part.startsWith('tsconfig')));
  if (forbiddenConfig) fail(`packed archive includes TypeScript config ${forbiddenConfig}`);
  return new Set(files);
}

function validatePackedDeclarations(installRoot) {
  const distRoot = join(installRoot, 'dist');
  const declarations = readdirSync(distRoot, { recursive: true })
    .filter((path) => typeof path === 'string' && path.endsWith('.d.ts'));
  if (declarations.length === 0) fail('packed archive has no .d.ts declarations');
  for (const declarationPath of declarations) {
    const source = readFileSync(join(distRoot, declarationPath), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/[^\r\n]*/gm, '$1');
    if (/\b(?:URLSearchParams|URL)\b/.test(source)) {
      fail(`public declaration ${declarationPath} exposes URL or URLSearchParams`);
    }
  }
}

function writeConsumerFiles(consumerRoot) {
  writeFileSync(join(consumerRoot, 'package.json'), JSON.stringify({
    name: 'contracts-pack-consumer',
    private: true,
    type: 'module',
  }, null, 2) + '\n');
  writeFileSync(join(consumerRoot, 'consumer.ts'), [
    "import { buildQuery, defineEndpoint, parseQuery, PERMISSIONS } from '@ap/contracts';",
    'void buildQuery;',
    'void defineEndpoint;',
    'void parseQuery;',
    'void PERMISSIONS;',
    '',
  ].join('\n'));
  writeFileSync(join(consumerRoot, 'runtime-consumer.mjs'), [
    "import { buildQuery, defineEndpoint, parseQuery, PERMISSIONS } from '@ap/contracts';",
    'for (const [name, value] of Object.entries({ buildQuery, defineEndpoint, parseQuery })) {',
    "  if (typeof value !== 'function') throw new Error(`${name} is not a function`);",
    '}',
    "if (!Array.isArray(PERMISSIONS) || PERMISSIONS.length === 0) throw new Error('PERMISSIONS is not a non-empty value');",
    "const { default: vocab } = await import('@ap/contracts/vocab.json', { with: { type: 'json' } });",
    "if (JSON.stringify(vocab.permissions) !== JSON.stringify(PERMISSIONS)) throw new Error('vocab.json permissions differ from PERMISSIONS');",
    '',
  ].join('\n'));
  for (const [name, module, moduleResolution] of [
    ['tsconfig.bundler.json', 'ESNext', 'Bundler'],
    ['tsconfig.nodenext.json', 'NodeNext', 'NodeNext'],
  ]) {
    writeFileSync(join(consumerRoot, name), JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module,
        moduleResolution,
        strict: true,
        noEmit: true,
        lib: ['ES2022', 'DOM'],
        types: [],
        skipLibCheck: false,
      },
      files: ['consumer.ts'],
    }, null, 2) + '\n');
  }
}

function main() {
  validateSourceManifest();
  temporaryRoot = mkdtempSync(join(tmpdir(), 'ap-contracts-pack-'));
  const relativeTemporaryRoot = relative(resolve(repoRoot), resolve(temporaryRoot));
  if (relativeTemporaryRoot === '' || (!relativeTemporaryRoot.startsWith(`..${sep}`) && relativeTemporaryRoot !== '..')) {
    fail('temporary consumer must be outside the repository workspace');
  }

  const packRoot = join(temporaryRoot, 'pack');
  mkdirSync(packRoot);
  run('pnpm', ['pack', '--pack-destination', packRoot], packageRoot);
  const tarballs = readdirSync(packRoot).filter((name) => name.endsWith('.tgz'));
  if (tarballs.length !== 1) fail(`expected one pnpm pack tarball, found ${tarballs.length}`);
  const tarballPath = join(packRoot, tarballs[0]);
  const archivePaths = run('tar', ['-tzf', tarballPath], temporaryRoot).split(/\r?\n/).filter(Boolean);
  const archiveFiles = validatePackedFiles(archivePaths);

  const extractedRoot = join(temporaryRoot, 'extracted');
  mkdirSync(extractedRoot);
  run('tar', ['-xzf', tarballPath, '-C', extractedRoot], temporaryRoot);
  const extractedPackage = join(extractedRoot, 'package');
  const packedManifestPath = join(extractedPackage, 'package.json');
  if (!existsSync(packedManifestPath)) fail('packed archive has no package.json');
  const packedManifest = readJson(packedManifestPath);
  if (Object.keys(packedManifest.exports ?? {}).join(',') !== ENTRY_POINTS || packedManifest.exports[VOCAB_ENTRY] !== VOCAB_DIST) {
    fail(`packed package must expose only the . and ${VOCAB_ENTRY} entry points`);
  }
  if (!archiveFiles.has(VOCAB_DIST.slice('./'.length))) fail(`packed archive is missing ${VOCAB_DIST}`);
  const packedExports = packedManifest.exports['.'];
  validateExports(packedExports, 'packed package');
  for (const target of Object.values(packedExports)) {
    const archivePath = target.slice('./'.length);
    if (!archiveFiles.has(archivePath)) fail(`packed exports target is missing from tarball: ${target}`);
  }

  const installRoot = join(temporaryRoot, 'consumer', 'node_modules', '@ap', 'contracts');
  mkdirSync(dirname(installRoot), { recursive: true });
  renameSync(extractedPackage, installRoot);
  validatePackedDeclarations(installRoot);

  const consumerRoot = dirname(dirname(dirname(installRoot)));
  writeConsumerFiles(consumerRoot);
  const typescriptCli = join(packageRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  if (!existsSync(typescriptCli)) fail(`repository TypeScript CLI is missing: ${typescriptCli}`);
  run(process.execPath, [typescriptCli, '--project', join(consumerRoot, 'tsconfig.bundler.json')], consumerRoot);
  run(process.execPath, [typescriptCli, '--project', join(consumerRoot, 'tsconfig.nodenext.json')], consumerRoot);
  run(process.execPath, [join(consumerRoot, 'runtime-consumer.mjs')], consumerRoot);
}

try {
  main();
  process.stdout.write('check:pack passed: packed external consumer typechecks with Bundler and NodeNext and imports at runtime\n');
} catch (error) {
  process.stderr.write(`check:pack FAILED: ${oneLine(error instanceof Error ? error.message : String(error))}\n`);
  process.exitCode = 1;
} finally {
  if (temporaryRoot) {
    try {
      rmSync(temporaryRoot, { recursive: true, force: true });
    } catch (error) {
      process.stderr.write(`check:pack FAILED: cannot remove temporary directory: ${oneLine(error instanceof Error ? error.message : String(error))}\n`);
      process.exitCode = 1;
    }
  }
}
