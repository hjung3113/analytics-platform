// CI `changes` job (#1019): the baseline of a push to main. Prints the head SHA of the latest completed push run of ci.yml on main whose conclusion is `success`
// (the current run and manual runs excluded), so select-e2e.mjs diffs against code a green run already covered: a spec that failed on a red main commit is not
// "last green", its changes stay in the next diff until a green run covers them. A separate script (not a part of classify-changes.mjs): it is the only one that
// talks to the network, and classify-changes.mjs stays a pure git + Node-builtins decision.
// Fail-safe: any error (token scope, API down, no green run, no candidate reachable in the checkout and an ancestor of SHA) prints nothing → select-e2e.mjs runs everything.
// Always exits 0. Needs `actions: read` on GITHUB_TOKEN and a full-history checkout.
//
//   node .github/scripts/last-green-main-sha.mjs    reads GITHUB_TOKEN, GITHUB_REPOSITORY, RUN_ID, SHA, WORKFLOW (default ci.yml); prints the SHA, writes `sha=<sha>` to $GITHUB_OUTPUT
//   node .github/scripts/last-green-main-sha.mjs --self-test
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Newest-first run list → the first usable SHA, or ''. `usable(sha)` tells whether the commit is in the checkout and an ancestor of the current SHA. */
export function pickBaseline(runs, { runId, usable }) {
  if (!Array.isArray(runs)) return '';
  for (const run of runs) {
    if (!run || run.status !== 'completed' || run.conclusion !== 'success') continue;
    if (run.event !== 'push' || run.head_branch !== 'main') continue;
    if (String(run.id) === String(runId)) continue;
    if (typeof run.head_sha !== 'string' || !/^[0-9a-f]{40}$/.test(run.head_sha)) continue;
    if (usable(run.head_sha)) return run.head_sha;
  }
  return '';
}

function gitOk(args, cwd) {
  try {
    execFileSync('git', args, { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function gitUsable(sha, cwd) {
  return (candidate) => gitOk(['cat-file', '-e', `${candidate}^{commit}`], cwd) && gitOk(['merge-base', '--is-ancestor', candidate, sha], cwd);
}

/** `fetchJson(url)` resolves to the parsed body or throws. Never throws itself: errors → ''. */
export async function findBaseline({ repo, runId, sha, workflow = 'ci.yml', fetchJson, cwd }) {
  try {
    if (!repo || !sha) return '';
    const url = `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/runs?branch=main&event=push&status=success&per_page=50`;
    const body = await fetchJson(url);
    return pickBaseline(body?.workflow_runs, { runId, usable: gitUsable(sha, cwd) });
  } catch (error) {
    process.stderr.write(`last-green-main-sha: ${String(error?.message ?? error).split('\n')[0]} → no baseline\n`);
    return '';
  }
}

async function main() {
  const env = process.env;
  const fetchJson = async (url) => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN ?? ''}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    return res.json();
  };
  const sha = await findBaseline({ repo: env.GITHUB_REPOSITORY, runId: env.RUN_ID, sha: env.SHA, workflow: env.WORKFLOW || 'ci.yml', fetchJson, cwd: process.cwd() });
  if (!sha) process.stderr.write('last-green-main-sha: no usable green main run → baseline empty (E2E runs everything)\n');
  process.stdout.write(`baseline: ${sha || '<none>'}\n`);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `sha=${sha}\n`);
}

async function selfTest() {
  let bad = 0;
  const check = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) { bad += 1; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } else console.log(`ok   ${name}`);
  };
  const dir = mkdtempSync(join(tmpdir(), 'last-green-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 't');
    git('config', 'commit.gpgsign', 'false');
    const commit = (name) => { writeFileSync(join(dir, 'f'), `${name}\n`); git('add', '-A'); git('commit', '-q', '-m', name); return git('rev-parse', 'HEAD'); };
    const c1 = commit('c1');
    const c2 = commit('c2');
    const c3 = commit('c3');
    git('checkout', '-q', '-b', 'side', c1);
    const side = commit('side');
    git('checkout', '-q', 'main');
    const missing = 'ab'.repeat(20);
    const run = (id, head_sha, over = {}) => ({ id, head_sha, head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success', ...over });
    const ask = (runs, extra = {}) => findBaseline({ repo: 'o/r', runId: 99, sha: c3, fetchJson: async () => ({ workflow_runs: runs }), cwd: dir, ...extra });

    check('success found: newest usable', await ask([run(3, c2), run(2, c1)]), c2);
    check('skips the current run id', await ask([run(99, c2), run(2, c1)]), c1);
    check('skips non-success conclusions', await ask([run(5, c2, { conclusion: 'failure' }), run(4, c2, { conclusion: 'cancelled' }), run(2, c1)]), c1);
    check('skips runs not completed', await ask([run(5, c2, { status: 'in_progress', conclusion: null }), run(2, c1)]), c1);
    check('skips workflow_dispatch runs', await ask([run(5, c2, { event: 'workflow_dispatch' }), run(2, c1)]), c1);
    check('skips other branches', await ask([run(5, c2, { head_branch: 'feat/x' }), run(2, c1)]), c1);
    check('skips an unreachable SHA, falls to the next', await ask([run(5, missing), run(2, c1)]), c1);
    check('skips a SHA that is not an ancestor of SHA', await ask([run(5, side), run(2, c1)]), c1);
    check('skips a malformed SHA', await ask([run(5, 'HEAD'), run(2, c1)]), c1);
    check('none: empty list', await ask([]), '');
    check('none: only red runs', await ask([run(5, c2, { conclusion: 'failure' })]), '');
    check('none: only unreachable', await ask([run(5, missing)]), '');
    check('none: workflow_runs missing', await ask(undefined), '');
    check('API error (throws) → empty', await ask([], { fetchJson: async () => { throw new Error('HTTP 403'); } }), '');
    check('API body not an object → empty', await ask([], { fetchJson: async () => null }), '');
    check('no repo → empty', await ask([run(2, c1)], { repo: '' }), '');
    check('no sha → empty', await ask([run(2, c1)], { sha: '' }), '');
    check('not a repository → empty', await ask([run(2, c1)], { cwd: tmpdir() }), '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  if (bad > 0) { console.error(`last-green-main-sha self-test: ${bad} failing`); process.exit(1); }
  console.log('last-green-main-sha self-test passed');
}

if (process.argv[2] === '--self-test') await selfTest();
else if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
