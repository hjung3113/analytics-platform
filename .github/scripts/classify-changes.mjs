// CI `changes` job (#671 B6, #1018, #1019): decides which parts of ci.yml do real work. Node builtins only (the job has no setup-node or install).
//
//   code  'false' only for a pull request with a non-empty diff whose every file is Markdown or under .agents/; the heavy steps then skip.
//   site  'false' only for a pull request with a non-empty diff that touches nothing the intro-site captures depend on (#608).
//   full  'true' for a manual run with full=true (release gate), and whenever this script cannot decide: the consumers then run cold
//         (turbo --force, no cache restore).
// Fail-safe: any exception or git failure prints code=true site=true full=true and exits 0 (stderr says why). If the job itself fails the
// outputs are empty and every consumer treats a value other than exactly 'false' as "run it".
//
//   node .github/scripts/classify-changes.mjs                 reads EVENT, BASE, HEAD (pull_request), BEFORE, SHA (push), FULL_INPUT (dispatch); writes $GITHUB_OUTPUT once
//   node .github/scripts/classify-changes.mjs --self-test
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DOCS_ONLY = /(\.md$|^\.agents\/)/;
// FeedbackOps frontend sources are bundled into the demo through the `@` alias; GLOSSARY.md feeds the site's banned-term check.
const SITE_DIRS = /^(menus|packages|apps\/feature-screens|apps\/platform-web|site|tooling|patches)\//;
const SITE_FILES = /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|GLOSSARY\.md|apps\/platform-e2e\/package\.json|\.github\/workflows\/(ci|pages)\.yml)$/;
const ZERO_SHA = /^0+$/;

const ALL = Object.freeze({ code: 'true', site: 'true', full: 'true' });

/**
 * Pure decision. `files` is the changed-file list of the event, or null when it could not be computed.
 * event: 'pull_request' | 'push' | 'workflow_dispatch' (anything else is undecidable → everything, cold).
 */
export function classify({ event, files, fullInput }) {
  if (event === 'workflow_dispatch') return { code: 'true', site: 'true', full: String(fullInput === true || fullInput === 'true') };
  if (event === 'push') return files === null ? { ...ALL } : { code: 'true', site: 'true', full: 'false' };
  if (event !== 'pull_request' || files === null) return { ...ALL };
  const list = files.filter(Boolean);
  const nonEmpty = list.length > 0;
  const code = nonEmpty && list.every((f) => DOCS_ONLY.test(f)) ? 'false' : 'true';
  const touchesSite = list.some((f) => (!f.endsWith('.md') && SITE_DIRS.test(f)) || SITE_FILES.test(f));
  const site = nonEmpty && !touchesSite ? 'false' : 'true';
  return { code, site, full: 'false' };
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
const lines = (text) => text.split('\n').filter(Boolean);

/** Changed files for the event, or null when the base is unknown (new branch, force-push) or git fails. */
export function changedFiles({ event, base, head, before, sha }, cwd) {
  try {
    if (event === 'pull_request') {
      if (!base || !head) return null;
      return lines(git(['diff', '--name-only', '--no-renames', `${base}...${head}`], cwd));
    }
    if (event === 'push') {
      if (!before || !sha || ZERO_SHA.test(before)) return null;
      return lines(git(['diff', '--name-only', '--no-renames', before, sha], cwd));
    }
  } catch (error) {
    process.stderr.write(`classify-changes: git diff failed: ${String(error.message).split('\n')[0]}\n`);
  }
  return null;
}

export function run(env, cwd) {
  const input = { event: env.EVENT, base: env.BASE, head: env.HEAD, before: env.BEFORE, sha: env.SHA };
  const files = input.event === 'workflow_dispatch' ? [] : changedFiles(input, cwd);
  if (files === null && input.event !== 'workflow_dispatch') process.stderr.write(`classify-changes: changed files unknown for ${input.event} → code=true site=true full=true\n`);
  if (!['pull_request', 'push', 'workflow_dispatch'].includes(input.event)) process.stderr.write(`classify-changes: unsupported event "${input.event}" → everything\n`);
  const result = classify({ event: input.event, files, fullInput: env.FULL_INPUT });
  return { result, files };
}

function main() {
  let result = { ...ALL };
  let files = null;
  try {
    ({ result, files } = run(process.env, process.cwd()));
  } catch (error) {
    process.stderr.write(`classify-changes: ${error.stack ?? error}\n`);
    result = { ...ALL };
  }
  if (files) process.stdout.write(`changed files:\n${files.join('\n')}\n`);
  const text = `code=${result.code}\nsite=${result.site}\nfull=${result.full}\n`;
  process.stdout.write(text);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, text);
}

function selfTest() {
  let bad = 0;
  const check = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) { bad += 1; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } else console.log(`ok   ${name}`);
  };
  const F = 'false', T = 'true';
  const out = (code, site, full) => ({ code, site, full });
  const pr = (files) => classify({ event: 'pull_request', files });
  // Pull-request rules (unchanged since #1018): the existing code/site examples.
  check('pr: .md only → code=false', pr(['README.md', 'docs/a.md']).code, F);
  check('pr: .agents only → code=false', pr(['.agents/conductor/PROFILE.md', '.agents/skills/x/run.sh']).code, F);
  check('pr: .agents + packages ts → code=true', pr(['.agents/a.md', 'packages/kernel/src/x.ts']).code, T);
  check('pr: nested apps/x/.agents/y.ts → code=true', pr(['apps/x/.agents/y.ts']).code, T);
  check('pr: empty diff → code=true site=true', pr([]), out(T, T, F));
  check('pr: md + code → code=true', pr(['a.md', 'tooling/x.mjs']).code, T);
  check('pr: docs-only → site=false', pr(['docs/a.md', '.agents/x.md']), out(F, F, F));
  check('pr: menus ts → site=true', pr(['menus/mars/hw-time/src/x.ts']).site, T);
  check('pr: menus md only → site=false', pr(['menus/mars/hw-time/README.md']).site, F);
  check('pr: root package.json → site=true', pr(['package.json']).site, T);
  check('pr: GLOSSARY.md → site=true', pr(['GLOSSARY.md']).site, T);
  check('pr: ci.yml → site=true', pr(['.github/workflows/ci.yml']).site, T);
  check('pr: css-selectors.yml → site=false', pr(['.github/workflows/css-selectors.yml']).site, F);
  check('pr: e2e package.json → site=true', pr(['apps/platform-e2e/package.json']).site, T);
  check('pr: e2e spec only → site=false code=true', pr(['apps/platform-e2e/tests/a.spec.ts']), out(T, F, F));
  check('pr: feature-screens src → site=true', pr(['apps/feature-screens/src/a.ts']).site, T);
  check('pr: platform-api src → site=false', pr(['apps/platform-api/src/a.ts']).site, F);
  check('pr: computation failed (null) → everything cold', pr(null), out(T, T, T));
  // Push to main: code stays true, turbo decides the scope; undecidable base → cold.
  check('push: diff known → code=true site=true full=false', classify({ event: 'push', files: ['docs/a.md'] }), out(T, T, F));
  check('push: empty diff → code=true', classify({ event: 'push', files: [] }), out(T, T, F));
  check('push: diff unknown → full=true', classify({ event: 'push', files: null }), out(T, T, T));
  // Manual run.
  check('dispatch: full=true', classify({ event: 'workflow_dispatch', files: [], fullInput: 'true' }), out(T, T, T));
  check('dispatch: full=true (boolean)', classify({ event: 'workflow_dispatch', files: [], fullInput: true }), out(T, T, T));
  check('dispatch: full=false', classify({ event: 'workflow_dispatch', files: [], fullInput: 'false' }), out(T, T, F));
  check('dispatch: full missing', classify({ event: 'workflow_dispatch', files: [] }), out(T, T, F));
  check('unknown event → everything cold', classify({ event: 'schedule', files: [] }), out(T, T, T));
  check('undefined event → everything cold', classify({ files: [] }), out(T, T, T));

  // Real git: a temporary repository (removed at the end).
  const dir = mkdtempSync(join(tmpdir(), 'classify-changes-'));
  try {
    const g = (...args) => git(args, dir).trim();
    g('init', '-q', '-b', 'main');
    g('config', 'user.email', 't@example.com');
    g('config', 'user.name', 't');
    g('config', 'commit.gpgsign', 'false');
    const commit = (name, files) => {
      for (const f of files) { execFileSync('mkdir', ['-p', join(dir, f, '..')]); writeFileSync(join(dir, f), `${name}\n`); }
      g('add', '-A');
      g('commit', '-q', '-m', name);
      return g('rev-parse', 'HEAD');
    };
    const base = commit('base', ['README.md', 'packages/kernel/src/a.ts']);
    const docs = commit('docs', ['docs/a.md', '.agents/x.sh']);
    const code = commit('code', ['packages/kernel/src/a.ts']);
    const env = (extra) => ({ ...extra });
    check('git pr: docs-only range', run(env({ EVENT: 'pull_request', BASE: base, HEAD: docs }), dir).result, out(F, F, F));
    check('git pr: code range', run(env({ EVENT: 'pull_request', BASE: base, HEAD: code }), dir).result, out(T, T, F));
    check('git pr: unknown base sha → everything cold', run(env({ EVENT: 'pull_request', BASE: 'deadbeef'.repeat(5), HEAD: code }), dir).result, out(T, T, T));
    check('git pr: missing BASE → everything cold', run(env({ EVENT: 'pull_request', HEAD: code }), dir).result, out(T, T, T));
    check('git push: before..sha', run(env({ EVENT: 'push', BEFORE: base, SHA: code }), dir).result, out(T, T, F));
    check('git push: before all zeros → cold', run(env({ EVENT: 'push', BEFORE: '0'.repeat(40), SHA: code }), dir).result, out(T, T, T));
    check('git push: before unknown (force-push) → cold', run(env({ EVENT: 'push', BEFORE: 'abc123'.repeat(6), SHA: code }), dir).result, out(T, T, T));
    check('git dispatch: needs no git', run(env({ EVENT: 'workflow_dispatch', FULL_INPUT: 'true' }), join(dir, 'does-not-exist')).result, out(T, T, T));
    check('git pr: not a repository → everything cold', run(env({ EVENT: 'pull_request', BASE: base, HEAD: code }), tmpdir()).result, out(T, T, T));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  if (bad > 0) { console.error(`classify-changes self-test: ${bad} failing`); process.exit(1); }
  console.log('classify-changes self-test passed');
}

if (process.argv[2] === '--self-test') selfTest();
else if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
