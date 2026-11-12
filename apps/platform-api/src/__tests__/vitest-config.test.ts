// #1871: test files run in parallel only when no database variable is set. Integration suites share one Postgres and
// clean up each other's fixtures, so any DB variable (some suites gate on DATABASE_URL_MIGRATE alone) keeps the run serial.
import { afterEach, expect, it, vi } from 'vitest';

// The config sits outside `src` (tsc rootDir), so it is imported by a runtime path, not a static specifier.
const CONFIG_PATH = '../../vitest.config.ts';
const DB_VARS = ['DATABASE_URL', 'DATABASE_URL_MIGRATE', 'WORKSPACE_ID'] as const;
const saved = Object.fromEntries(DB_VARS.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of DB_VARS) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
  vi.resetModules();
});

async function fileParallelism(env: Partial<Record<(typeof DB_VARS)[number], string>>): Promise<boolean | undefined> {
  for (const name of DB_VARS) delete process.env[name];
  Object.assign(process.env, env);
  vi.resetModules();
  const { default: config } = (await import(/* @vite-ignore */ CONFIG_PATH)) as { default: { test?: { fileParallelism?: boolean } } };
  return config.test?.fileParallelism;
}

it('runs files in parallel without any database variable', async () => {
  expect(await fileParallelism({})).toBe(true);
});

it.each(DB_VARS)('runs files serially when only %s is set', async (name) => {
  expect(await fileParallelism({ [name]: 'synthetic' })).toBe(false);
});

it('runs files serially with the full integration env', async () => {
  expect(await fileParallelism({ DATABASE_URL: 'postgres://syn', DATABASE_URL_MIGRATE: 'postgres://syn', WORKSPACE_ID: 'syn' })).toBe(false);
});
