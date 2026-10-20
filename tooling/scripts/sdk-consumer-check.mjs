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

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PACKAGES = ['contracts', 'kernel', 'ui', 'components', 'shell'];
// One utility class that only the named package's source uses (the consumer app never writes it), so finding it in the
// emitted CSS proves Tailwind scanned that package's dist through its `@source` line.
const PACKAGE_CLASSES = [
  { pkg: 'ui', css: String.raw`.max-w-\[1600px\]`, usedIn: 'packages/ui/src/layout/PageShell.tsx' },
  { pkg: 'components', css: String.raw`.min-h-\[100px\]`, usedIn: 'packages/components/src/StatCard.tsx' },
  { pkg: 'shell', css: String.raw`.min-w-\[204px\]`, usedIn: 'packages/shell/src/GlobalContextBar.tsx' },
];
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
  const lines = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8').split('\n');
  const start = lines.findIndex((line) => line.trim() === 'overrides:');
  if (start < 0) fail('pnpm-workspace.yaml has no overrides block');
  const block = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith('  ')) break;
    block.push(line);
  }
  if (!block.some((line) => line.includes('"@tiptap/'))) fail('pnpm-workspace.yaml overrides carry no @tiptap pins');
  return block;
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
  'tsconfig.json': `${JSON.stringify({
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
    include: ['src', 'vite.config.ts'],
  }, null, 2)}\n`,
  'src/style.css': `@import "tailwindcss";
@import "@ap/ui/styles.css";
@import "@ap/components/styles.css";
@import "@ap/shell/styles.css";
`,
  'src/App.tsx': `import { House } from 'lucide-react';
import { PERMISSIONS, type Permission } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { Button } from '@ap/ui';
import { readColorToken, THEME_COLOR_TOKENS } from '@ap/ui/theme';
import { AuditTimeline } from '@ap/components';
import { AppShell } from '@ap/shell';

const registry = createRegistry({
  spaces: [testSpace({ id: 'analytics', homeMenuId: 'home' })],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics', hideLabelWhenSingle: true }],
  menus: [{
    id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/',
    icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview',
    features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [],
  }],
});

const session = testSession(['platform:view']);
export const adapter = testAdapter({ session: () => session });

/** Kernel hook used under a Provider from the same kernel copy; components and shell render around it. */
function Probe() {
  const { session: current } = usePlatform();
  const known: readonly Permission[] = PERMISSIONS;
  const token = THEME_COLOR_TOKENS[0];
  return (
    <section data-testid="probe" data-user={current.user.id} data-permissions={known.length} data-token={token} data-resolved={typeof readColorToken}>
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
    const file = readdirSync(tarballDir).find((candidate) => candidate.startsWith(`ap-${name}-`) && candidate.endsWith('.tgz'));
    if (!file) fail(`no ap-${name}-*.tgz in ${tarballDir}`);
    return join(tarballDir, file);
  };
  const dependencies = {};
  for (const name of PACKAGES) dependencies[`@ap/${name}`] = `file:${tarball(name)}`;
  const external = { 'lucide-react': installedVersion('lucide-react') };
  for (const name of CONSUMER_DEPENDENCIES) external[name] = installedVersion(name);
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({
    name: 'ap-sdk-outside-consumer',
    private: true,
    type: 'module',
    dependencies: { ...dependencies, ...external },
  }, null, 2)}\n`);

  mkdirSync(join(root, 'patches'));
  cpSync(join(repoRoot, 'patches', '@formkit__auto-animate@0.10.0.patch'), join(root, 'patches', '@formkit__auto-animate@0.10.0.patch'));
  const overrides = PACKAGES.map((name) => `  "@ap/${name}": "file:${tarball(name)}"`);
  writeFileSync(join(root, 'pnpm-workspace.yaml'), [
    'packages: []',
    'allowBuilds:',
    '  esbuild: true',
    'patchedDependencies:',
    '  "@formkit/auto-animate@0.10.0": patches/@formkit__auto-animate@0.10.0.patch',
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
  const dirs = Object.fromEntries(PACKAGES.map((name) => [name, dirOf(root, `@ap/${name}`)]));
  const mismatches = [];
  for (const [consumer, wants] of [['kernel', ['contracts']], ['components', ['kernel', 'ui', 'contracts']], ['shell', ['components', 'kernel', 'ui', 'contracts']]]) {
    for (const dep of wants) {
      const found = dirOf(dirs[consumer], `@ap/${dep}`);
      if (found !== dirs[dep]) mismatches.push(`@ap/${consumer} resolves @ap/${dep} to ${found}, the app resolves ${dirs[dep]}`);
    }
  }
  const reactDirs = new Set([dirOf(root, 'react')]);
  for (const name of PACKAGES.filter((candidate) => candidate !== 'contracts')) reactDirs.add(dirOf(dirs[name], 'react'));
  if (reactDirs.size !== 1) mismatches.push(`react resolves to ${[...reactDirs].join(' and ')}`);
  if (mismatches.length > 0) fail(mismatches.join('; '));
}

function assertCssClasses(root) {
  const assets = join(root, 'dist', 'assets');
  const cssFiles = existsSync(assets) ? readdirSync(assets).filter((file) => file.endsWith('.css')) : [];
  if (cssFiles.length === 0) fail('vite build emitted no CSS file');
  const css = cssFiles.map((file) => readFileSync(join(assets, file), 'utf8')).join('\n');
  const missing = PACKAGE_CLASSES.filter(({ css: selector }) => !css.includes(selector));
  if (missing.length > 0) {
    fail(`emitted CSS lacks ${missing.map(({ pkg, css: selector }) => `${selector} (only ${pkg} uses it)`).join(', ')}: the @source of that package's styles.css did not reach its dist`);
  }
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
    runStep('tsc --noEmit (strict, Bundler, no @types/node)', () => run('pnpm', ['exec', 'tsc', '--noEmit', '-p', 'tsconfig.json'], root));
    runStep('vite build', () => run('pnpm', ['exec', 'vite', 'build'], root));
    runStep('built CSS carries a ui, components and shell class', () => assertCssClasses(root));
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
