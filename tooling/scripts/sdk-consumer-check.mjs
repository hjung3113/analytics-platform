// Clean outside-consumer gate for the SDK release tarballs (ADR-0056, ADR-0044 ②③, #519).
// Usage: pnpm sdk:consumer-check <dir with the five ap-*.tgz from `pnpm sdk:pack`>
//
// Creates a temp project outside the repo that depends on the five tarballs only (no workspace link, no SDK source) and
// runs: install → single-copy check → tsc → vite build (CSS classes) → vitest. The first failing step is named in the error.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SDK_PACKAGES } from './sdk-exports.mjs';
import { hasCssSelector, selectCssProbes } from './sdk-css-probes.mjs';
import { readAutoAnimatePatch, readWorkspaceBlock } from './sdk-pnpm-config.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// The consumer installs the versions this repo's workspace resolved (the web app is the reference install).
const REFERENCE_APP = join(repoRoot, 'apps', 'platform-web');
const CONSUMER_DEPENDENCIES = ['react', 'react-dom', 'vite', 'vitest', 'typescript', 'jsdom', 'tailwindcss', '@tailwindcss/vite', '@testing-library/react', '@testing-library/dom', '@types/react', '@types/react-dom'];

let step = 'setup';

function fail(message) {
  throw new Error(message);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, CI: 'true' } });
  if (result.error) fail(`${command} could not run: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim() || `exit ${result.status ?? 'unknown'}`;
    fail(`${command} ${args.join(' ')} exited ${result.status}:\n${detail.slice(-3000)}`);
  }
  return result.stdout;
}

function installedVersion(name) {
  const manifest = join(REFERENCE_APP, 'node_modules', name, 'package.json');
  if (!existsSync(manifest)) fail(`reference install of ${name} not found at ${manifest}; run pnpm install in the repo first`);
  return JSON.parse(readFileSync(manifest, 'utf8')).version;
}

/** The `overrides:` lines of this repo's pnpm-workspace.yaml that pin @tiptap/* (consumer condition, sdk-git-tag-consumption.md). */
function tiptapOverrides() {
  const workspaceYaml = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
  const block = readWorkspaceBlock(workspaceYaml, 'overrides');
  if (!block.some((line) => line.includes('"@tiptap/'))) fail('pnpm-workspace.yaml overrides carry no @tiptap pins');
  return block;
}

function javascriptFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(path);
    return entry.isFile() && entry.name.endsWith('.js') ? [path] : [];
  });
}

function runStep(name, action) {
  step = name;
  const started = Date.now();
  const result = action();
  process.stdout.write(`sdk:consumer-check PASS ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)\n`);
  return result;
}

const APP_FILES = {
  'index.html': `<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n`,
  'vite.config.ts': `import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  test: { environment: 'jsdom', include: ['src/**/*.test.tsx'] },
});
`,
  // Browser SDK check: the program is the app source only (no vite.config.ts, no tests, so no Vite/Vitest Node declarations).
  'tsconfig.browser.json': `${JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      moduleResolution: 'Bundler',
      jsx: 'react-jsx',
      strict: true,
      noEmit: true,
      // No @types/node, no vitest/globals: the SDK must not need either from its consumer.
      types: [],
      skipLibCheck: false,
    },
    include: ['src/main.tsx'],
  }, null, 2)}\n`,
  // Self-test: the same browser program plus a file that needs Node types; the browser check must reject it.
  'tsconfig.poisoned.json': `${JSON.stringify({ extends: './tsconfig.browser.json', include: ['src/main.tsx', 'src/poison.ts'] }, null, 2)}\n`,
  'src/poison.ts': `export const poisoned: NodeJS.Timeout | undefined = undefined;\n`,
  // Config and tests may use Node/Vitest types; they are checked apart from the browser program.
  'tsconfig.json': `${JSON.stringify({
    extends: './tsconfig.browser.json',
    compilerOptions: { types: [] },
    include: ['src', 'vite.config.ts'],
  }, null, 2)}\n`,
  'src/style.css': `@import "tailwindcss";
@import "@ap/ui/styles.css";
@import "@ap/components/styles.css";
@import "@ap/shell/styles.css";
`,
  'src/App.tsx': `import { House } from 'lucide-react';
import { groupId, KERNEL_PERMISSIONS, spaceId, type Permission } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import { useOverlayState } from '@ap/kernel/host';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { Button } from '@ap/ui';
import { readColorToken, THEME_COLOR_TOKENS } from '@ap/ui/theme';
import { AuditTimeline } from '@ap/components';
import { DockLayout, normalizeDockTree } from '@ap/components/dock';
import { AppShell } from '@ap/shell';

const registry = createRegistry({
  spaces: [testSpace({ id: spaceId('analytics'), homeMenuId: 'home' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('analytics'), hideLabelWhenSingle: true }],
  menus: [{
    id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/',
    icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview',
    features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [],
  }],
});

const session = testSession(['platform:view']);
export const adapter = testAdapter({ session: () => session });

/** Kernel hook used under a Provider from the same kernel copy; components and shell render around it. */
function Probe() {
  const { session: current } = usePlatform();
  const { paletteOpen } = useOverlayState();
  const known: readonly Permission[] = KERNEL_PERMISSIONS;
  const token = THEME_COLOR_TOKENS[0];
  return (
    <section data-testid="probe" data-user={current.user.id} data-permissions={known.length} data-token={token} data-resolved={typeof readColorToken} data-host={String(paletteOpen)} data-dock={typeof DockLayout + ':' + normalizeDockTree(null, ['a']).type}>
      <Button>consumer button</Button>
      <AuditTimeline events={[]} />
    </section>
  );
}

export function App() {
  return (
    <I18nProvider>
      <PlatformProvider adapter={adapter} registry={registry}>
        <AppShell><Probe /></AppShell>
      </PlatformProvider>
    </I18nProvider>
  );
}
`,
  'src/main.tsx': `import { createRoot } from 'react-dom/client';
import './style.css';
import { App } from './App';

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
`,
  'src/App.test.tsx': `import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { App } from './App';

afterEach(cleanup);

it('renders the shell, a components widget and a kernel hook under one PlatformProvider', async () => {
  render(<App />);
  const probe = await screen.findByTestId('probe');
  expect(probe.getAttribute('data-user')).toBe('u1');
  expect(Number(probe.getAttribute('data-permissions'))).toBeGreaterThan(0);
  expect(screen.getByText('consumer button')).toBeTruthy();
  expect(screen.getByText('변경 이력이 없습니다.')).toBeTruthy();
  expect(screen.getByRole('navigation', { name: '앱 레일' })).toBeTruthy();
});
`,
};

function writeProject(root, tarballDir) {
  const tarball = (name) => {
    const files = readdirSync(tarballDir).filter((candidate) => candidate.startsWith(`ap-${name}-`) && candidate.endsWith('.tgz'));
    if (files.length === 0) fail(`no ap-${name}-*.tgz in ${tarballDir}`);
    if (files.length > 1) fail(`more than one ap-${name}-*.tgz in ${tarballDir}: ${files.join(', ')}; pass a directory with one release`);
    return join(tarballDir, files[0]);
  };
  const dependencies = {};
  for (const name of SDK_PACKAGES) dependencies[`@ap/${name}`] = `file:${tarball(name)}`;
  const external = { 'lucide-react': installedVersion('lucide-react') };
  for (const name of CONSUMER_DEPENDENCIES) external[name] = installedVersion(name);
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({
    name: 'ap-sdk-outside-consumer',
    private: true,
    type: 'module',
    dependencies: { ...dependencies, ...external },
  }, null, 2)}\n`);

  const workspaceYaml = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
  const autoAnimatePatch = readAutoAnimatePatch(workspaceYaml);
  const sourcePatch = join(repoRoot, autoAnimatePatch.path);
  const consumerPatch = join(root, autoAnimatePatch.path);
  if (!existsSync(sourcePatch)) fail(`patch file from pnpm-workspace.yaml not found: ${autoAnimatePatch.path}`);
  mkdirSync(dirname(consumerPatch), { recursive: true });
  cpSync(sourcePatch, consumerPatch);
  const overrides = SDK_PACKAGES.map((name) => `  "@ap/${name}": "file:${tarball(name)}"`);
  writeFileSync(join(root, 'pnpm-workspace.yaml'), [
    'packages: []',
    'allowBuilds:',
    '  esbuild: true',
    'patchedDependencies:',
    `  ${JSON.stringify(autoAnimatePatch.id)}: ${JSON.stringify(autoAnimatePatch.path)}`,
    'overrides:',
    ...overrides,
    ...tiptapOverrides(),
    '',
  ].join('\n'));

  for (const [path, content] of Object.entries(APP_FILES)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

/** One copy of react and of every @ap package, whichever package resolves it. */
function assertSingleCopies(root) {
  // Node lookup from `dir` upward; package.json is not an exported subpath of the SDK packages, so walk node_modules by hand.
  const dirOf = (dir, name) => {
    for (let current = realpathSync(dir); ; current = dirname(current)) {
      const candidate = join(current, 'node_modules', name);
      if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
      if (dirname(current) === current) fail(`${name} does not resolve from ${dir}`);
    }
  };
  const dirs = Object.fromEntries(SDK_PACKAGES.map((name) => [name, dirOf(root, `@ap/${name}`)]));
  const mismatches = [];
  for (const [consumer, wants] of [['kernel', ['contracts']], ['components', ['kernel', 'ui', 'contracts']], ['shell', ['components', 'kernel', 'ui', 'contracts']]]) {
    for (const dep of wants) {
      const found = dirOf(dirs[consumer], `@ap/${dep}`);
      if (found !== dirs[dep]) mismatches.push(`@ap/${consumer} resolves @ap/${dep} to ${found}, the app resolves ${dirs[dep]}`);
    }
  }
  const reactDirs = new Set([dirOf(root, 'react')]);
  for (const name of SDK_PACKAGES.filter((candidate) => candidate !== 'contracts')) reactDirs.add(dirOf(dirs[name], 'react'));
  if (reactDirs.size !== 1) mismatches.push(`react resolves to ${[...reactDirs].join(' and ')}`);
  if (mismatches.length > 0) fail(mismatches.join('; '));
}

function assertBrowserCheckRejectsNode(root) {
  const result = spawnSync('pnpm', ['exec', 'tsc', '--noEmit', '-p', 'tsconfig.poisoned.json'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) fail(`tsc could not run: ${result.error.message}`);
  if (result.status === 0) fail('the browser tsc check accepted a NodeJS.Timeout declaration: it is not Node-free');
  if (!`${result.stdout}${result.stderr}`.includes('NodeJS')) fail(`the poisoned check failed for another reason:\n${`${result.stdout}${result.stderr}`.slice(-1500)}`);
}

function assertCssClasses(root) {
  const assets = join(root, 'dist', 'assets');
  const cssFiles = existsSync(assets) ? readdirSync(assets).filter((file) => file.endsWith('.css')) : [];
  if (cssFiles.length === 0) fail('vite build emitted no CSS file');
  const css = cssFiles.map((file) => readFileSync(join(assets, file), 'utf8')).join('\n');
  const packages = SDK_PACKAGES.map((name) => {
    const packageDirectory = join(root, 'node_modules', '@ap', name);
    const manifest = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8'));
    const files = javascriptFiles(join(packageDirectory, 'dist'));
    if (files.length === 0) fail(`installed @ap/${name} package has no dist JS to probe`);
    return {
      packageName: name,
      sourceText: files.map((file) => readFileSync(file, 'utf8')).join('\n'),
      hasStyles: Boolean(manifest.exports?.['./styles.css']),
    };
  });
  const targetPackages = packages.filter(({ hasStyles }) => hasStyles).map(({ packageName }) => packageName);
  const probes = selectCssProbes(packages, 3, targetPackages);
  const missing = probes.flatMap(({ packageName, classNames }) => classNames
    .filter((className) => !hasCssSelector(css, className))
    .map((className) => `@ap/${packageName} .${className}`));
  if (missing.length > 0) {
    fail(`built CSS is missing package-specific utility selectors found in installed SDK dist JS: ${missing.join(', ')}; check the package stylesheet imports and Tailwind source scanning`);
  }
}

// Button throws this under NODE_ENV !== 'production' (the production fallback only warns, with different wording after the
// dash); the production bundle must have the throw dead-code-eliminated, which only happens when the SDK dist carries a
// statically replaceable `process.env.NODE_ENV` (bare import.meta stays in Vite builds).
const BUTTON_DEV_ERROR = 'Slot enforces single-child contract';

function assertProductionSignal(root) {
  const assets = join(root, 'dist', 'assets');
  const jsFiles = existsSync(assets) ? readdirSync(assets).filter((file) => file.endsWith('.js')) : [];
  if (jsFiles.length === 0) fail('vite build emitted no JS file');
  const hit = jsFiles.find((file) => readFileSync(join(assets, file), 'utf8').includes(BUTTON_DEV_ERROR));
  if (hit) fail(`dist/assets/${hit} still carries Button's dev-only error: the production signal did not reach the SDK dist`);
}

function main() {
  const tarballArg = process.argv[2];
  if (!tarballArg) fail('usage: sdk:consumer-check <dir with the ap-*.tgz files>');
  const tarballDir = resolve(tarballArg);
  if (!existsSync(tarballDir)) fail(`tarball directory ${tarballDir} does not exist`);
  const root = mkdtempSync(join(tmpdir(), 'ap-sdk-consumer-'));
  try {
    const relativeRoot = relative(repoRoot, root);
    if (relativeRoot === '' || !relativeRoot.startsWith(`..${sep}`)) fail('consumer directory must be outside the repository');
    runStep('write consumer project', () => writeProject(root, tarballDir));
    runStep('pnpm install (tarballs, tiptap overrides, auto-animate patch)', () => run('pnpm', ['install', '--no-frozen-lockfile'], root));
    runStep('single copy of react and @ap/* packages', () => assertSingleCopies(root));
    runStep('browser tsc self-test: a Node-only declaration is rejected', () => assertBrowserCheckRejectsNode(root));
    runStep('tsc --noEmit (app source only, strict, Bundler, no @types/node)', () => run('pnpm', ['exec', 'tsc', '--noEmit', '-p', 'tsconfig.browser.json'], root));
    runStep('tsc --noEmit (vite config + tests)', () => run('pnpm', ['exec', 'tsc', '--noEmit', '-p', 'tsconfig.json'], root));
    runStep('vite build', () => run('pnpm', ['exec', 'vite', 'build'], root));
    runStep('built JS has no Button dev-only error (NODE_ENV reached dist)', () => assertProductionSignal(root));
    runStep('built CSS carries utility classes from package-specific ui, components and shell dist JS', () => assertCssClasses(root));
    runStep('vitest (jsdom): shell + components + kernel under one PlatformProvider', () => run('pnpm', ['exec', 'vitest', 'run'], root));
    process.stdout.write('sdk:consumer-check passed\n');
  } finally {
    if (process.env.AP_SDK_KEEP === '1') process.stdout.write(`sdk:consumer-check kept ${root}\n`);
    else rmSync(root, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`sdk:consumer-check FAILED at step "${step}": ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
