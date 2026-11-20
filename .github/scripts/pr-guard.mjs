// CI `PR guard` job (#2643): the three caps a lead or worker cannot waive. Rules: .agents/conductor/PROFILE.md §Size and path, «Mechanical caps».
//
//   size    more than MAX_LINES changed lines (additions + deletions) or MAX_FILES files, tests included, generated files, snapshots and
//           lockfiles excluded (EXCLUDED) → fails unless the PR carries the owner's `owner-ok:size` label.
//   rounds  the PR's branch has had more than MAX_PUSHES pull_request runs of ci.yml (open + two fix rounds; superseded and cancelled runs
//           count, a force-push does not erase them) → fails unless the PR body has a `Round cap: <who> — <revert | split | 질문 #n>` line.
//   scope   every issue the PR closes (`Closes|Fixes|Resolves #n` in the body, or `type(#n)` in the title) must be listed in `## 범위` of the
//           newest `.planning/releases/v<semver>.md` on the base branch → fails unless the PR carries `owner-ok:scope`. A PR whose head adds
//           numbers to that section needs the same label. No release file or no `## 범위` section → fails (the owner picks the scope first).
// Fail-closed: an API error fails the job (rerun it); a guard that skips on error would be the lead's exception by another name.
// Node builtins only (sparse checkout, no install). Needs GITHUB_TOKEN with pull-requests: read and actions: read.
//
//   node .github/scripts/pr-guard.mjs              reads GITHUB_TOKEN, REPO (owner/name), PR_NUMBER; writes GITHUB_STEP_SUMMARY when set
//   node .github/scripts/pr-guard.mjs --self-test  pure decisions only, no network
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';

export const MAX_LINES = 400;
export const MAX_FILES = 40;
export const MAX_PUSHES = 3;
export const SIZE_LABEL = 'owner-ok:size';
export const SCOPE_LABEL = 'owner-ok:scope';
export const EXCLUDED = /((^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$|\/__snapshots__\/|\.snap$|^tooling\/sdk\/api\/|^packages\/sdk\/CHANGELOG\.md$)/;
const ROUND_LINE = /^[ \t]*Round cap:[ \t]*(\S.*)$/m;
const RELEASE_FILE = /^v(\d+)\.(\d+)\.(\d+)\.md$/;

/** Changed lines and files after exclusions; `over` is true when either cap is exceeded. */
export function sizeVerdict(files, labels) {
  const counted = files.filter((f) => !EXCLUDED.test(f.filename) && !(f.previous_filename && EXCLUDED.test(f.previous_filename)));
  const lines = counted.reduce((n, f) => n + (f.additions ?? 0) + (f.deletions ?? 0), 0);
  const over = lines > MAX_LINES || counted.length > MAX_FILES;
  return { lines, files: counted.length, excluded: files.length - counted.length, over, waived: over && labels.includes(SIZE_LABEL), ok: !over || labels.includes(SIZE_LABEL) };
}

/** Pushes = pull_request runs of ci.yml on the head branch; past MAX_PUSHES the body must carry a Round cap line. */
export function roundsVerdict(pushes, body) {
  const answer = (body ?? '').match(ROUND_LINE)?.[1]?.trim() ?? null;
  const over = pushes > MAX_PUSHES;
  return { pushes, over, answer, ok: !over || answer !== null };
}

/** Issue numbers a PR closes: closing keywords in the body (comma/and lists too) and the conventional `type(#n …)` title scope. */
export function closingIssues(title, body) {
  const out = new Set();
  for (const m of (body ?? '').matchAll(/(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\s*:?\s+((?:#\d+(?:\s*(?:,|and)?\s*)?)+)/gi)) {
    for (const n of m[1].matchAll(/#(\d+)/g)) out.add(Number(n[1]));
  }
  const scope = (title ?? '').match(/^\w+\(((?:#\d+[\s,]*)+)\)/);
  if (scope) for (const n of scope[1].matchAll(/#(\d+)/g)) out.add(Number(n[1]));
  return [...out].sort((a, b) => a - b);
}

/** Issue numbers under the `## 범위` heading (to the next `## `), or null when the section is missing. */
export function scopeIssues(markdown) {
  if (markdown === null || markdown === undefined) return null;
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => l.trim() === '## 범위');
  if (start < 0) return null;
  const out = new Set();
  for (const l of lines.slice(start + 1)) {
    if (/^## /.test(l)) break;
    for (const n of l.matchAll(/#(\d+)/g)) out.add(Number(n[1]));
  }
  return out;
}

/** Newest release file name among a directory listing, or null. */
export function newestReleaseFile(names) {
  const parsed = names.map((n) => ({ n, v: n.match(RELEASE_FILE) })).filter((x) => x.v);
  parsed.sort((a, b) => Number(b.v[1]) - Number(a.v[1]) || Number(b.v[2]) - Number(a.v[2]) || Number(b.v[3]) - Number(a.v[3]));
  return parsed[0]?.n ?? null;
}

export function scopeVerdict({ closes, baseScope, headScope, labels }) {
  const waived = labels.includes(SCOPE_LABEL);
  if (baseScope === null) return { closes, missing: closes, grew: [], noSection: true, waived, ok: waived };
  const missing = closes.filter((n) => !baseScope.has(n));
  const grew = headScope ? [...headScope].filter((n) => !baseScope.has(n)) : [];
  return { closes, missing, grew, noSection: false, waived, ok: waived || (missing.length === 0 && grew.length === 0) };
}

export function summarize({ size, rounds, scope, labelEvents, releaseFile }) {
  const mark = (ok) => (ok ? 'ok' : 'FAIL');
  const rows = [
    `| size | ${mark(size.ok)} | ${size.lines} lines, ${size.files} files (cap ${MAX_LINES}/${MAX_FILES}; ${size.excluded} generated/snapshot/lockfile excluded)${size.waived ? `, waived by \`${SIZE_LABEL}\`` : ''} |`,
    `| rounds | ${mark(rounds.ok)} | ${rounds.pushes} pushes (cap ${MAX_PUSHES} without an answer)${rounds.answer ? `, Round cap: ${rounds.answer}` : rounds.over ? ', no `Round cap:` line in the PR body' : ''} |`,
    `| scope | ${mark(scope.ok)} | closes ${scope.closes.length ? scope.closes.map((n) => `#${n}`).join(' ') : 'nothing'}; ${scope.noSection ? `no \`## 범위\` in ${releaseFile ?? 'any release file'} on the base branch` : `missing from ${releaseFile}: ${scope.missing.map((n) => `#${n}`).join(' ') || 'none'}`}${scope.grew.length ? `; head adds ${scope.grew.map((n) => `#${n}`).join(' ')} to \`## 범위\`` : ''}${scope.waived ? `; waived by \`${SCOPE_LABEL}\`` : ''} |`,
  ];
  const events = labelEvents.length ? labelEvents.map((e) => `- \`${e.label}\` applied by ${e.actor} at ${e.at}`).join('\n') : '- none';
  return `## PR guard\n\n| check | verdict | detail |\n| --- | --- | --- |\n${rows.join('\n')}\n\nOwner labels:\n${events}\n`;
}

function selfTest() {
  const f = (filename, additions, deletions, previous_filename) => ({ filename, additions, deletions, previous_filename });
  // size
  assert.deepEqual(sizeVerdict([f('a.ts', 10, 5), f('pnpm-lock.yaml', 900, 0), f('x/__snapshots__/a.snap', 50, 0), f('tooling/sdk/api/ui.md', 70, 0), f('packages/sdk/CHANGELOG.md', 20, 0)], []), { lines: 15, files: 1, excluded: 4, over: false, waived: false, ok: true });
  assert.equal(sizeVerdict([f('a.ts', 401, 0)], []).ok, false);
  assert.equal(sizeVerdict([f('a.ts', 400, 0)], []).ok, true);
  assert.equal(sizeVerdict([f('a.test.ts', 300, 101)], []).ok, false, 'tests count');
  assert.equal(sizeVerdict(Array.from({ length: 41 }, (_, i) => f(`f${i}.ts`, 1, 0)), []).ok, false);
  assert.equal(sizeVerdict(Array.from({ length: 40 }, (_, i) => f(`f${i}.ts`, 1, 0)), []).ok, true);
  assert.deepEqual(sizeVerdict([f('a.ts', 401, 0)], [SIZE_LABEL]), { lines: 401, files: 1, excluded: 0, over: true, waived: true, ok: true });
  assert.equal(sizeVerdict([f('b.ts', 1, 0, 'tooling/sdk/api/old.md')], []).files, 0, 'a rename out of an excluded path stays excluded');
  // rounds
  assert.equal(roundsVerdict(3, '').ok, true);
  assert.equal(roundsVerdict(4, 'body without a line').ok, false);
  assert.deepEqual(roundsVerdict(4, 'x\nRound cap: lead — split, PR-2 follows\ny'), { pushes: 4, over: true, answer: 'lead — split, PR-2 follows', ok: true });
  assert.equal(roundsVerdict(5, 'Round cap:   ').ok, false, 'an empty answer is no answer');
  assert.equal(roundsVerdict(9, '  Round cap: owner — 질문 #3 answered: revert').ok, true);
  // closing refs
  assert.deepEqual(closingIssues('fix(#2632): x', 'Closes #2632'), [2632]);
  assert.deepEqual(closingIssues('feat(ui): x', 'Closes #2619 #2621\n\nFixes #7, #8 and #9'), [7, 8, 9, 2619, 2621]);
  assert.deepEqual(closingIssues('fix(#2619 #2621): x', ''), [2619, 2621]);
  assert.deepEqual(closingIssues('fix(main): x', 'Part of #2643. See #2534.'), []);
  assert.deepEqual(closingIssues('chore: x', 'closes: #12'), [12]);
  // scope section
  assert.equal(scopeIssues('# t\n\n## 소유자 결정\n- #1'), null);
  assert.equal(scopeIssues(null), null);
  assert.deepEqual([...scopeIssues('## 범위\n\n- #2553\n- 표: #2529 #2530\n\n## 범위 밖에서 병합된 것\n#2554')].sort(), [2529, 2530, 2553]);
  assert.equal(newestReleaseFile(['v0.44.0.md', 'v0.45.0.md', 'v0.9.0.md', 'notes.md']), 'v0.45.0.md');
  assert.equal(newestReleaseFile(['v0.44.0.md', 'v0.44.10.md', 'v0.44.9.md']), 'v0.44.10.md');
  assert.equal(newestReleaseFile(['README.md']), null);
  // scope verdict
  const base = new Set([2553, 2529]);
  assert.equal(scopeVerdict({ closes: [2529], baseScope: base, headScope: base, labels: [] }).ok, true);
  assert.equal(scopeVerdict({ closes: [], baseScope: base, headScope: base, labels: [] }).ok, true, 'a PR without an issue is not scope-checked');
  assert.deepEqual(scopeVerdict({ closes: [2529, 2600], baseScope: base, headScope: base, labels: [] }).missing, [2600]);
  assert.equal(scopeVerdict({ closes: [2600], baseScope: base, headScope: base, labels: [SCOPE_LABEL] }).ok, true);
  assert.equal(scopeVerdict({ closes: [2529], baseScope: base, headScope: new Set([2553, 2529, 2600]), labels: [] }).ok, false, 'growing the list needs the label');
  assert.equal(scopeVerdict({ closes: [2529], baseScope: base, headScope: new Set([2553]), labels: [] }).ok, true, 'shrinking the list is free');
  assert.equal(scopeVerdict({ closes: [2529], baseScope: null, headScope: null, labels: [] }).ok, false, 'no section fails closed');
  assert.equal(scopeVerdict({ closes: [], baseScope: null, headScope: null, labels: [] }).ok, false, 'no section fails even without an issue');
  assert.equal(scopeVerdict({ closes: [], baseScope: null, headScope: null, labels: [SCOPE_LABEL] }).ok, true);
  // summary renders every row
  const text = summarize({ size: sizeVerdict([f('a.ts', 401, 0)], []), rounds: roundsVerdict(4, ''), scope: scopeVerdict({ closes: [1], baseScope: new Set(), headScope: new Set(), labels: [] }), labelEvents: [], releaseFile: 'v0.44.0.md' });
  assert.match(text, /\| size \| FAIL \| 401 lines/);
  assert.match(text, /\| rounds \| FAIL \| 4 pushes/);
  assert.match(text, /\| scope \| FAIL \| closes #1; missing from v0\.44\.0\.md: #1/);
  console.log('pr-guard self-test passed');
}

async function api(path, { raw = false } = {}) {
  const url = path.startsWith('https://') ? path : `https://api.github.com${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
  if (res.status === 404 && raw) return null;
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
  return raw ? res.text() : res.json();
}

async function paged(path) {
  const out = [];
  for (let page = 1; page <= 50; page++) {
    const chunk = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    const items = Array.isArray(chunk) ? chunk : chunk.workflow_runs;
    out.push(...items);
    if (items.length < 100) break;
  }
  return out;
}

async function main() {
  const repo = process.env.REPO;
  const n = process.env.PR_NUMBER;
  if (!repo || !n || !process.env.GITHUB_TOKEN) throw new Error('REPO, PR_NUMBER and GITHUB_TOKEN are required');
  const pr = await api(`/repos/${repo}/pulls/${n}`);
  const labels = pr.labels.map((l) => l.name);
  const files = await paged(`/repos/${repo}/pulls/${n}/files`);
  const runs = (await paged(`/repos/${repo}/actions/workflows/ci.yml/runs?event=pull_request&branch=${encodeURIComponent(pr.head.ref)}`))
    .filter((r) => r.head_repository?.full_name === pr.head.repo?.full_name && r.created_at >= pr.created_at);
  const dir = await api(`/repos/${repo}/contents/.planning/releases?ref=${pr.base.sha}`).catch(() => []);
  const releaseFile = newestReleaseFile((Array.isArray(dir) ? dir : []).map((e) => e.name));
  const baseText = releaseFile ? await api(`/repos/${repo}/contents/.planning/releases/${releaseFile}?ref=${pr.base.sha}`, { raw: true }) : null;
  const headText = releaseFile ? await api(`/repos/${repo}/contents/.planning/releases/${releaseFile}?ref=${pr.head.sha}`, { raw: true }) : null;
  const labelEvents = (await paged(`/repos/${repo}/issues/${n}/events`))
    .filter((e) => e.event === 'labeled' && e.label?.name?.startsWith('owner-ok:'))
    .map((e) => ({ label: e.label.name, actor: e.actor?.login ?? '?', at: e.created_at }));

  const size = sizeVerdict(files, labels);
  const rounds = roundsVerdict(runs.length, pr.body);
  const scope = scopeVerdict({ closes: closingIssues(pr.title, pr.body), baseScope: scopeIssues(baseText), headScope: scopeIssues(headText), labels });
  const text = summarize({ size, rounds, scope, labelEvents, releaseFile });
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  if (!(size.ok && rounds.ok && scope.ok)) {
    console.error(`pr-guard: FAIL (size=${size.ok} rounds=${rounds.ok} scope=${scope.ok}). Rules: .agents/conductor/PROFILE.md §Size and path, Mechanical caps.`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ''))) {
  if (process.argv.includes('--self-test')) selfTest();
  else main().catch((e) => { console.error(`pr-guard: ${e.message}`); process.exit(1); });
}
