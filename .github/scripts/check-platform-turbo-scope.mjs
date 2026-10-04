import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const withoutFilter = process.argv.includes('--without-filter');
const taskNames = ['test', 'typecheck', 'lint', 'build'];
let failed = false;

for (const taskName of taskNames) {
  // --without-filter is a local negative control that proves this guard catches a removed package filter.
  const args = withoutFilter ? ['exec', 'turbo', 'run', taskName, '--only', '--dry=json'] : [taskName, '--dry=json'];
  if (taskName === 'test') args.push('--concurrency=2');

  const output = execFileSync('pnpm', args, { cwd: repoRoot, encoding: 'utf8' });
  const jsonStart = output.indexOf('{');
  if (jsonStart === -1) throw new Error(`${taskName}: Turbo dry run did not emit JSON`);
  const plan = JSON.parse(output.slice(jsonStart));
  const feedbackOpsTasks = plan.tasks
    .filter(({ package: packageName }) => packageName?.startsWith('@fops/'))
    .map(({ taskId }) => taskId);

  if (feedbackOpsTasks.length > 0) {
    console.error(`${taskName}: unexpected FeedbackOps tasks: ${feedbackOpsTasks.join(', ')}`);
    failed = true;
  } else {
    console.log(`${taskName}: ${plan.tasks.length} tasks; no @fops/* tasks`);
  }

  if (taskName === 'typecheck' && !plan.tasks.some(({ taskId }) => taskId === '@ap/ui#typecheck')) {
    console.error('typecheck: @ap/ui#typecheck is missing from the platform task graph');
    failed = true;
  }
}

if (failed) {
  process.exitCode = 1;
} else if (withoutFilter) {
  console.error('The unfiltered control unexpectedly contains no @fops/* tasks.');
  process.exitCode = 1;
}
