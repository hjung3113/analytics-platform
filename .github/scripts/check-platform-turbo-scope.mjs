import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const taskNames = ['test', 'typecheck', 'lint', 'build'];
let failed = false;

for (const taskName of taskNames) {
  const args = [taskName, '--dry=json'];
  if (taskName === 'test') args.push('--concurrency=2');

  const output = execFileSync('pnpm', args, { cwd: repoRoot, encoding: 'utf8' });
  const jsonStart = output.indexOf('{');
  if (jsonStart === -1) throw new Error(`${taskName}: Turbo dry run did not emit JSON`);
  const plan = JSON.parse(output.slice(jsonStart));
  // ADR-0046 (#441): products/feedbackops keeps its own nested workspace; no @fops/* package may rejoin this graph.
  const feedbackOpsTasks = plan.tasks
    .filter(({ package: packageName }) => packageName?.startsWith('@fops/'))
    .map(({ taskId }) => taskId);

  if (feedbackOpsTasks.length > 0) {
    console.error(`${taskName}: unexpected FeedbackOps tasks: ${feedbackOpsTasks.join(', ')}`);
    failed = true;
  } else {
    console.log(`${taskName}: ${plan.tasks.length} tasks; no @fops/* packages`);
  }

  if (taskName === 'typecheck' && !plan.tasks.some(({ taskId }) => taskId === '@ap/ui#typecheck')) {
    console.error('typecheck: @ap/ui#typecheck is missing from the platform task graph');
    failed = true;
  }
}

if (failed) process.exitCode = 1;
