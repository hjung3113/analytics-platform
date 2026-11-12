import { defineConfig } from 'vitest/config';

// Any one of the database variables can enable an integration suite (some gate on DATABASE_URL_MIGRATE alone), so any
// one of them makes the run serial. Without them every integration suite skips and files can run in parallel (#1871).
const databaseEnv = ['DATABASE_URL', 'DATABASE_URL_MIGRATE', 'WORKSPACE_ID'].some((name) => Boolean(process.env[name]));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
    // Integration suites share a single Postgres (and the migration role's
    // tables). Running test files in parallel causes one suite's
    // `delete from core.sessions ...` cleanup to clobber another suite's
    // active fixtures. With a database in the env, force a single-file-at-a-time
    // pool so the cleanup story is local to each file.
    fileParallelism: !databaseEnv,
    // Truncates + re-seeds when the integration env is exported, so failure
    // counts stop depending on how many times the suite ran before (#205).
    // No-op without DATABASE_URL / DATABASE_URL_MIGRATE / WORKSPACE_ID.
    globalSetup: ['./src/test-support/global-setup.ts'],
  },
});
