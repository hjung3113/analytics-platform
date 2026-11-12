// Checks the start-kit release asset the way a developer uses it (#1790): the packed asset, not the repo copy.
// Usage: node tooling/sdk/sdk-kit-check.mjs <release dir with ap-start-kit-<version>.tgz and SHA256SUMS>
//
// Steps: release SHA256SUMS line → unpack into an empty folder outside the repo → bundle verify → pnpm install
// --frozen-lockfile → one copy of each @ap/* → `check` → `build` → build output has no .map and no external origin →
// `dev` serves the first screen → the README «둘째 메뉴» steps (copy menus/sample, change its three constants, add two
// import lines) → `check` renders the second menu → `build`. The first failing step is named.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkInstalled, parseSums, verifyBundle } from './sdk-bundle-check.mjs';
import { assertNoPlatformSource, KIT_PREFIX, listFiles, sha256File } from './sdk-kit.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
/**
 * Origins a production bundle may name without fetching them. Anything else in the build output is an external origin
 * (acceptance 5). Exact origins only, each with its reason:
 * - www.w3.org: XML namespace identifiers (SVG, XHTML, MathML).
 * - react.dev: React's error-decoder link in production error messages.
 * - app.invalid, x: base URLs @ap/kernel hands `new URL()` to parse a path (context/location.ts, MainScreenProvider.tsx).
 */
export const ALLOWED_ORIGINS = Object.freeze(['http://www.w3.org', 'https://www.w3.org', 'https://react.dev', 'http://app.invalid', 'http://x']);

let step = 'setup';

function fail(message) {
  throw new Error(message);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, CI: 'true' } });
  if (result.error) fail(`${command} could not run: ${result.error.message}`);
  if (result.status !== 0) fail(`${command} ${args.join(' ')} exited ${result.status}:\n${`${result.stdout}\n${result.stderr}`.trim().slice(-3000)}`);
  return result.stdout;
}

function runStep(name, action) {
  step = name;
  const started = Date.now();
  const result = action();
  process.stdout.write(`sdk:kit-check PASS ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)\n`);
  return result;
}

async function runStepAsync(name, action) {
  step = name;
  const started = Date.now();
  const result = await action();
  process.stdout.write(`sdk:kit-check PASS ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)\n`);
  return result;
}

/** Source maps and external origins in a build output folder. Returns failure strings. */
export function scanBuildOutput(dist, allowed = ALLOWED_ORIGINS) {
  const failures = [];
  for (const path of listFiles(dist)) {
    if (path.endsWith('.map')) {
      failures.push(`${path}: source map in the build output`);
      continue;
    }
    if (!/\.(js|mjs|css|html|json|svg|txt)$/.test(path)) continue;
    const text = readFileSync(join(dist, path), 'utf8');
    if (/[#@]\s*sourceMappingURL=/.test(text)) failures.push(`${path}: sourceMappingURL comment`);
    const origins = new Set([...text.matchAll(/\bhttps?:\/\/[A-Za-z0-9.-]+(?::\d+)?/g)].map((match) => match[0]));
    for (const origin of origins) if (!allowed.includes(origin)) failures.push(`${path}: external origin ${origin}`);
  }
  return failures;
}

/** The README «둘째 메뉴» steps, done by script: the second menu is a renamed copy of menus/sample. */
export function addSecondMenu(kit, { folder = 'second', id = 'kit-second', path = '/second', label = { ko: '둘째 메뉴', en: 'Second menu' } } = {}) {
  cpSync(join(kit, 'menus', 'sample'), join(kit, 'menus', folder), { recursive: true });
  const replaceOnce = (file, pattern, replacement) => {
    const text = readFileSync(file, 'utf8');
    if (!pattern.test(text)) fail(`${relative(kit, file)} has no ${pattern} (README «둘째 메뉴» step out of date)`);
    writeFileSync(file, text.replace(pattern, replacement));
  };
  const menuFile = join(kit, 'menus', folder, 'menu.ts');
  replaceOnce(menuFile, /export const MENU_ID = '[^']*';/, `export const MENU_ID = '${id}';`);
  replaceOnce(menuFile, /export const MENU_PATH = '[^']*';/, `export const MENU_PATH = '${path}';`);
  replaceOnce(menuFile, /export const MENU_LABEL: Text = \{[^}]*\};/, `export const MENU_LABEL: Text = { ko: '${label.ko}', en: '${label.en}' };`);
  const menus = join(kit, 'menus.ts');
  replaceOnce(menus, /(import \{ manifests as sample \} from '\.\/menus\/sample';)/, `$1\nimport { manifests as ${folder} } from './menus/${folder}';`);
  replaceOnce(menus, /(const MENU_PACKAGES: [^=]+= \[)([^\]]*)\]/, `$1$2, ${folder}]`);
  const assembly = join(kit, 'mock', 'assembly.ts');
  replaceOnce(assembly, /(import \{ mockEndpoints as sample \} from '\.\.\/menus\/sample\/mock';)/, `$1\nimport { mockEndpoints as ${folder} } from '../menus/${folder}/mock';`);
  replaceOnce(assembly, /(const MOCK_ENDPOINTS = \[)([^\]]*)\]/, `$1$2, ${folder}]`);
}

function freePort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolvePromise(port));
    });
  });
}

/** `pnpm dev` on a free port: the index page and the transformed entry module answer, then the server stops. */
async function assertDevServes(kit) {
  const port = await freePort();
  const child = spawn('pnpm', ['run', 'dev', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: kit, env: { ...process.env, CI: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  try {
    const base = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 60_000;
    let index;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) fail(`pnpm dev exited ${child.exitCode}:\n${output.slice(-2000)}`);
      try {
        const response = await fetch(`${base}/`);
        if (response.ok) {
          index = await response.text();
          break;
        }
      } catch {
        // not listening yet
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
    }
    if (!index) fail(`pnpm dev did not answer within 60 s:\n${output.slice(-2000)}`);
    if (!index.includes('id="root"')) fail('dev index page has no #root element');
    const entry = await fetch(`${base}/src/main.tsx`);
    if (!entry.ok) fail(`dev server did not transform src/main.tsx (HTTP ${entry.status})`);
  } finally {
    child.kill('SIGTERM');
  }
}

/** The vitest JSON report of `pnpm run check` lists a passed render test for every given menu id. */
function assertRendered(kit, ids) {
  const report = join(kit, 'vitest-report.json');
  run('pnpm', ['exec', 'vitest', 'run', '--reporter=json', `--outputFile=${report}`], kit);
  const results = JSON.parse(readFileSync(report, 'utf8')).testResults.flatMap((file) => file.assertionResults);
  rmSync(report, { force: true });
  for (const id of ids) {
    const hit = results.find((result) => result.title.includes(`menu package ${id} renders`));
    if (!hit) fail(`no render test ran for ${id}`);
    if (hit.status !== 'passed') fail(`render test for ${id} ${hit.status}`);
  }
}

async function main() {
  const releaseArg = process.argv[2];
  if (!releaseArg) fail('usage: sdk-kit-check <release dir with ap-start-kit-<version>.tgz and SHA256SUMS>');
  const release = resolve(releaseArg);
  const assets = readdirSync(release).filter((file) => file.startsWith(KIT_PREFIX) && file.endsWith('.tgz'));
  if (assets.length !== 1) fail(`expected one ${KIT_PREFIX}*.tgz in ${release}, found ${assets.length}`);
  const [asset] = assets;
  const root = mkdtempSync(join(tmpdir(), 'ap-sdk-kit-check-'));
  try {
    const relativeRoot = relative(repoRoot, root);
    if (relativeRoot === '' || !relativeRoot.startsWith(`..${sep}`)) fail('the kit check folder must be outside the repository');
    runStep(`release SHA256SUMS covers ${asset}`, () => {
      const sums = parseSums(readFileSync(join(release, 'SHA256SUMS'), 'utf8'));
      if (sums.get(asset) !== sha256File(join(release, asset))) fail(`${asset} does not match the release SHA256SUMS`);
    });
    runStep('unpack into an empty folder', () => run('tar', ['-xzf', join(release, asset), '-C', root], root));
    const top = readdirSync(root);
    if (top.length !== 1 || `${top[0]}.tgz` !== asset) fail(`the asset must hold one folder named after it, found ${top.join(', ')}`);
    const kit = join(root, top[0]);
    runStep('no kit file is a copy of tracked apps/, menus/, platform/ or packages/ source', () => assertNoPlatformSource(kit));
    runStep('bundle verify (checksums, nine exact-version tarballs, lockfile, third-party list)', () => {
      const failures = verifyBundle(kit);
      if (failures.length > 0) fail(failures.join('\n'));
    });
    runStep('pnpm install --frozen-lockfile', () => run('pnpm', ['install', '--frozen-lockfile'], kit));
    runStep('bundle installed (one copy of each @ap/* package)', () => {
      const failures = checkInstalled(kit);
      if (failures.length > 0) fail(failures.join('\n'));
    });
    runStep("kit script 'check' (tsc + vitest render)", () => run('pnpm', ['run', 'check'], kit));
    runStep("kit script 'build'", () => run('pnpm', ['run', 'build'], kit));
    runStep('build output: no source map, no external origin', () => {
      const failures = scanBuildOutput(join(kit, 'dist'));
      if (failures.length > 0) fail(failures.join('\n'));
    });
    await runStepAsync("kit script 'dev' serves the first screen", () => assertDevServes(kit));
    runStep('README «둘째 메뉴»: copy menus/sample, change its constants, register it', () => addSecondMenu(kit));
    runStep("kit script 'check' with the second menu", () => run('pnpm', ['run', 'check'], kit));
    runStep('render tests ran and passed for kit-sample and kit-second', () => assertRendered(kit, ['kit-sample', 'kit-second']));
    runStep("kit script 'build' with the second menu", () => run('pnpm', ['run', 'build'], kit));
    process.stdout.write('sdk:kit-check passed\n');
  } finally {
    if (process.env.AP_SDK_KEEP === '1') process.stdout.write(`sdk:kit-check kept ${root}\n`);
    else rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`sdk:kit-check FAILED at step "${step}": ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

