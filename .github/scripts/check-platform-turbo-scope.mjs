// ADR-0066 (#642): FeedbackOps packages (`@fops/*`, including the `@fops/ops` tool package in ops/platform-api) share the workspace but the root
// scripts filter them out; FeedbackOps gates run via its own CI. Reads `pnpm <task> --dry=json` for each root task and fails
// when the plan holds any FeedbackOps task, or when typecheck lost @ap/ui.
//
//   node .github/scripts/check-platform-turbo-scope.mjs
//   node .github/scripts/check-platform-turbo-scope.mjs --self-test
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const taskNames = ['test', 'typecheck', 'lint', 'build'];

const isFeedbackOpsPackage = (packageName) => Boolean(packageName?.startsWith('@fops/'));

/** Errors for one task's dry-run plan (`{ tasks: [{ taskId, package }] }`); empty when the plan is platform-only. */
export function planErrors(taskName, plan) {
  const errors = [];
  const feedbackOpsTasks = plan.tasks
    .filter(({ package: packageName }) => isFeedbackOpsPackage(packageName))
    .map(({ taskId }) => taskId);
  if (feedbackOpsTasks.length > 0) errors.push(`${taskName}: unexpected FeedbackOps tasks: ${feedbackOpsTasks.join(', ')}`);
  if (taskName === 'typecheck' && !plan.tasks.some(({ taskId }) => taskId === '@ap/ui#typecheck')) {
    errors.push('typecheck: @ap/ui#typecheck is missing from the platform task graph');
  }
  return errors;
}

function selfTest() {
  const task = (pkg, name) => ({ taskId: `${pkg}#${name}`, package: pkg });
  const cases = [
    { name: 'platform-only test plan passes', taskName: 'test', tasks: [task('@ap/ui', 'test'), task('@ap/kernel', 'test')], fails: false },
    { name: 'platform-only typecheck plan passes', taskName: 'typecheck', tasks: [task('@ap/ui', 'typecheck')], fails: false },
    { name: 'an @fops/* task fails', taskName: 'test', tasks: [task('@ap/ui', 'test'), task('@fops/x', 'test')], fails: true },
    { name: 'an @fops/ops tool package task fails', taskName: 'test', tasks: [task('@ap/ui', 'test'), task('@fops/ops', 'test')], fails: true },
    { name: 'typecheck without @ap/ui fails', taskName: 'typecheck', tasks: [task('@ap/kernel', 'typecheck')], fails: true },
  ];
  let bad = 0;
  for (const { name, taskName, tasks, fails } of cases) {
    const errors = planErrors(taskName, { tasks });
    const ok = (errors.length > 0) === fails;
    if (!ok) bad += 1;
    console.log(`${ok ? 'ok' : 'FAIL'}: ${name}${errors.length ? ` (${errors.join('; ')})` : ''}`);
  }
  if (bad > 0) {
    console.error(`check-platform-turbo-scope self-test: ${bad} case(s) failed`);
    process.exitCode = 1;
  } else {
    console.log(`check-platform-turbo-scope self-test: ${cases.length} cases passed`);
  }
}

function main() {
  let failed = false;
  for (const taskName of taskNames) {
    const output = execFileSync('pnpm', [taskName, '--dry=json'], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); // the plan JSON passed the 1 MiB default as packages grew
    const jsonStart = output.indexOf('{');
    if (jsonStart === -1) throw new Error(`${taskName}: Turbo dry run did not emit JSON`);
    const plan = JSON.parse(output.slice(jsonStart));
    const errors = planErrors(taskName, plan);
    for (const error of errors) console.error(error);
    if (errors.length > 0) failed = true;
    else console.log(`${taskName}: ${plan.tasks.length} tasks; no FeedbackOps packages`);
  }
  if (failed) process.exitCode = 1;
}

if (process.argv.includes('--self-test')) selfTest();
else main();
