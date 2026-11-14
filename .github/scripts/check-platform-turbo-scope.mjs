// Root tasks include every feature leaf with that script. Ops convenience aggregates never re-enter the graph.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { globSync, readFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURE_PACKAGES } from '../../tooling/eslint/src/feature-packages.js';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const taskNames = ['lint', 'typecheck', 'test', 'build'];
const paths = ['apps/platform-api', 'apps/feature-screens', 'packages/feature-shared', 'packages/feature-ui', 'ops/platform-api'];
const read = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const manifests = paths.map((path) => read(`${path}/package.json`));

export function configErrors(root, packages) {
  const errors = [];
  for (const name of FEATURE_PACKAGES) {
    if (!packages.some((pkg) => pkg.name === name)) errors.push(`missing identity: ${name}`);
  }
  for (const task of taskNames) {
    if (root.scripts?.[task] !== `turbo run ${task}`) errors.push(`${task}: root must run the unified unfiltered task`);
  }
  for (const pkg of packages) {
    if (/@fops\//.test(pkg.name)) errors.push(`old identity: ${pkg.name}`);
    for (const task of taskNames) {
      const command = pkg.scripts?.[task] ?? '';
      if (/\bturbo\b/.test(command)) errors.push(`${pkg.name}#${task}: recursive aggregate`);
      if (/@fops\//.test(command)) errors.push(`${pkg.name}#${task}: old identity`);
    }
  }
  return errors;
}

export function planErrors(task, plan, packages = manifests) {
  const errors = [];
  for (const pkg of packages) {
    if (pkg.scripts?.[task] && !plan.tasks.some((entry) => entry.taskId === `${pkg.name}#${task}` && entry.package === pkg.name && entry.command === pkg.scripts[task])) {
      errors.push(`${task}: missing leaf ${pkg.name}#${task}`);
    }
  }
  for (const entry of plan.tasks) {
    if (/@fops\//.test(entry.package ?? '')) errors.push(`${task}: old identity ${entry.package}`);
    if (entry.package === '@ap/platform-api-ops' && /\bturbo\b/.test(entry.command ?? '')) errors.push(`${task}: recursive ops aggregation`);
  }
  if (task === 'typecheck' && !plan.tasks.some((entry) => entry.taskId === '@ap/ui#typecheck')) errors.push('typecheck: lost @ap/ui');
  return errors;
}

// A task can hash a workspace dependency through its graph, or an explicit whole source-folder input.
export function workspaceDependencyErrors(task, plan, packages) {
  if (!['test', 'typecheck', 'lint'].includes(task)) return [];
  const errors = [];
  const byName = new Map(packages.map(pkg => [pkg.name, pkg]));
  const byId = new Map(plan.tasks.map(entry => [entry.taskId, entry]));
  for (const entry of plan.tasks.filter(entry => entry.taskId === `${entry.package}#${task}`)) {
    const pkg = byName.get(entry.package);
    if (!pkg) continue;
    const closure = new Map();
    const visit = (node) => {
      if (!node || closure.has(node.taskId)) return;
      closure.set(node.taskId, node);
      for (const id of node.dependencies ?? []) visit(byId.get(id));
    };
    visit(entry);
    const entries = [...closure.values()];
    const inputs = entries.flatMap(node => (node.resolvedTaskDefinition?.inputs ?? [])
      .filter(input => !input.startsWith('!'))
      .map(input => posix.normalize(posix.join(node.directory ?? pkg.directory, input))));
    const dependencies = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies };
    for (const [name, version] of Object.entries(dependencies)) {
      if (!version.startsWith('workspace:')) continue;
      const dependency = byName.get(name);
      if (!dependency) { errors.push(`${entry.taskId}: unknown workspace dependency ${name}`); continue; }
      if (entries.some(node => node.package === name)) continue;
      if (inputs.includes(`${dependency.directory}/**`) || inputs.includes(`${dependency.directory}/src/**`)) continue;
      errors.push(`${entry.taskId}: workspace dependency ${name} is absent from the task closure and source-folder inputs`);
    }
  }
  return errors;
}

function selfTest() {
  // Independent acceptance identities: do not build the fixture from FEATURE_PACKAGES.
  const required = ['@ap/platform-api', '@ap/feature-screens', '@ap/feature-shared', '@ap/feature-ui', '@ap/platform-api-ops'];
  assert.deepEqual([...FEATURE_PACKAGES].sort(), [...required].sort());
  const packages = required.map((name) => ({ name, scripts: Object.fromEntries((name.endsWith('-ops') ? ['lint'] : taskNames).map((task) => [task, `leaf-${task}`])) }));
  const root = { scripts: Object.fromEntries(taskNames.map((task) => [task, `turbo run ${task}`])) };
  let count = 0;
  const check = (errors, fails) => { assert.equal(errors.length > 0, fails, errors.join('; ')); count++; };
  check(configErrors(root, packages), false);
  check(configErrors({ scripts: { ...root.scripts, test: "turbo run test --filter='!@fops/*'" } }, packages), true);
  check(configErrors(root, packages.slice(1)), true);
  check(configErrors(root, [...packages, { name: '@fops/backend', scripts: {} }]), true);
  check(configErrors(root, packages.map((pkg) => pkg.name.endsWith('-ops') ? { ...pkg, scripts: { test: 'turbo run test' } } : pkg)), true);
  for (const task of taskNames) {
    const tasks = [...packages.filter((pkg) => pkg.scripts[task]).map((pkg) => ({ package: pkg.name, taskId: `${pkg.name}#${task}`, command: pkg.scripts[task] })), { package: '@ap/ui', taskId: `@ap/ui#${task}` }];
    check(planErrors(task, { tasks }, packages), false);
    check(planErrors(task, { tasks: tasks.slice(1) }, packages), true); // missing renamed task: old-prefix-only detector would vacuously pass
    check(planErrors(task, { tasks: [...tasks, { package: '@fops/backend' }] }, packages), true);
    if (task === 'typecheck') check(planErrors(task, { tasks: tasks.slice(0, -1) }, packages), true);
  }
  check(planErrors('test', { tasks: [{ package: '@ap/platform-api-ops', command: 'turbo run test' }] }, []), true);
  console.log(`turbo-scope self-test: ${count} cases passed`);
}

function main() {
  const errors = configErrors(read('package.json'), manifests);
  const workspacePackages = globSync(['apps/*/package.json', 'packages/*/package.json', 'packages/sdk/*/package.json', 'packages/adapters/*/package.json', 'packages/eqv/*/package.json', 'menus/*/*/package.json', 'platform/*/package.json', 'tooling/*/package.json', 'ops/*/package.json'], { cwd: repoRoot })
    .map(path => ({ ...read(path), directory: posix.dirname(path) }));
  for (const task of taskNames) {
    const output = execFileSync('pnpm', [task, '--dry=json'], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const start = output.indexOf('{');
    if (start < 0) throw new Error(`${task}: missing Turbo JSON`);
    const plan = JSON.parse(output.slice(start));
    errors.push(...planErrors(task, plan));
    errors.push(...workspaceDependencyErrors(task, plan, workspacePackages));
  }
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('All four root graphs include the expected feature leaves and @ap/ui typecheck; workspace dependencies are hashed.');
}
if (process.argv.includes('--self-test')) selfTest();
else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
