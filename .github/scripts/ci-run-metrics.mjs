// Report job timing from this Actions run attempt. This snapshot never changes the workspace verdict.
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync } from 'node:fs';

function measure(jobs, now) {
  let longest = null;
  let runner = 0;
  let queue = 0;
  let missingQueue = 0;
  let active = 0;
  for (const job of jobs) {
    if (job.conclusion === 'skipped') continue;
    const start = Date.parse(job.started_at);
    const created = Date.parse(job.created_at);
    const completed = Date.parse(job.completed_at);
    if (!Number.isFinite(completed)) active++;
    if (!Number.isFinite(created)) missingQueue++;
    else {
      let queueEnd = Number.isFinite(completed) ? completed : now;
      if (Number.isFinite(start)) queueEnd = start;
      queue += Math.max(0, queueEnd - created);
    }
    if (!Number.isFinite(start)) continue;
    const elapsed = Math.max(0, (Number.isFinite(completed) ? completed : now) - start);
    runner += elapsed;
    if (!longest || elapsed > longest.elapsed) longest = { name: job.name, elapsed };
  }
  return { longest, runner, queue, missingQueue, active };
}

function selfTest() {
  const start = Date.parse('2026-01-01T12:00:00Z');
  const at = (seconds) => new Date(start + seconds * 1000).toISOString();
  const fixture = [
    { name: 'static', created_at: at(0), started_at: at(15), completed_at: at(135) },
    { name: 'test', created_at: at(20), started_at: at(30), completed_at: at(210) },
    { name: 'guard', created_at: at(135), started_at: at(180) },
    { name: 'legacy', started_at: at(200), completed_at: at(240) },
    { name: 'report', created_at: at(230) },
    { name: 'cancelled in queue', created_at: at(0), completed_at: at(30), conclusion: 'cancelled' },
    { name: 'skipped', conclusion: 'skipped' },
  ];
  assert.deepEqual(measure(fixture, start + 250000), {
    longest: { name: 'test', elapsed: 180000 }, runner: 410000, queue: 120000, missingQueue: 1, active: 2,
  });
  assert.deepEqual(measure([], start), { longest: null, runner: 0, queue: 0, missingQueue: 0, active: 0 });
  console.log('ci-run-metrics self-test passed');
}

async function main() {
  const { GITHUB_API_URL, GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT, GITHUB_STEP_SUMMARY, GITHUB_EVENT_NAME } = process.env;
  let summary = '## CI runner usage\n\n';
  try {
    const endpoint = `${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/attempts/${GITHUB_RUN_ATTEMPT}/jobs`;
    const signal = AbortSignal.timeout(5000);
    const jobs = [];
    for (let page = 1; ; page++) {
      const response = await fetch(`${endpoint}?per_page=100&page=${page}`, {
        signal, headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
      });
      if (!response.ok) throw new Error(`Actions jobs API returned HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.jobs)) throw new Error('Actions jobs API returned no job list');
      jobs.push(...data.jobs);
      if (data.jobs.length < 100) break;
    }
    const { longest, runner, queue, missingQueue, active } = measure(jobs, Date.now());
    const minutes = (ms) => (ms / 60000).toFixed(2);
    const { maxJobMinutes } = JSON.parse(readFileSync(new URL('../ci-budget.json', import.meta.url), 'utf8'));
    summary += `- Longest job runtime — ${longest ? `${minutes(longest.elapsed)} min (${longest.name})` : 'unavailable'}\n`;
    if (longest && GITHUB_EVENT_NAME === 'pull_request' && longest.elapsed > maxJobMinutes * 60000) {
      summary += `- PR job budget exceeded — ${maxJobMinutes} min\n`;
    }
    summary += `- Total queue wait — ${minutes(queue)} min${missingQueue ? ` (partial, ${missingQueue} job(s) lack creation timestamps)` : ''}\n`;
    summary += `- Runner-minutes — ${minutes(runner)}\n- Snapshot of this attempt with ${active} unfinished job(s)\n`;
  } catch (error) {
    summary += `Timing unavailable (${error.message}).\n`;
  }
  process.stdout.write(summary);
  if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, summary);
}

if (process.argv[2] === '--self-test') selfTest();
else main().catch((error) => console.warn(`ci-run-metrics: ${error.message}`));
