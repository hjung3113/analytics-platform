import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { request } from '@playwright/test';
import { requireSafeRealDatabaseEnv } from './database-safety';
import { parsePort } from './port';

const ROOT = resolve(import.meta.dirname, '../../..');
const STATE_DIR = resolve(import.meta.dirname, '../test-results-real/auth');
const PORT = parsePort('E2E_PORT', 4190);
const ORIGIN = `http://127.0.0.1:${PORT}`;

function runBackendScript(script: 'db:migrate' | 'db:seed'): void {
  const databaseEnv = requireSafeRealDatabaseEnv();
  const result = spawnSync('pnpm', ['--config.verify-deps-before-run=false', '--filter', '@fops/backend', 'run', script], {
    cwd: ROOT,
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL,
      DATABASE_URL_MIGRATE: process.env.DATABASE_URL_MIGRATE,
      WORKSPACE_ID: databaseEnv.workspaceId,
      NODE_ENV: 'development',
      AUTH_PROVIDER: 'mock',
      SEED_MODE: 'core',
    },
    stdio: 'inherit',
  });
  if (result.error) throw new Error(`Could not run backend ${script}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`Backend ${script} failed with exit code ${result.status ?? 'unknown'}.`);
}

async function writeLoginState(externalId: 'mock-admin-1' | 'mock-user-1', file: string): Promise<void> {
  const context = await request.newContext({ baseURL: ORIGIN });
  try {
    const response = await context.post('/auth/mock-login', { data: { external_id: externalId } });
    if (!response.ok()) throw new Error(`Mock login for ${externalId} failed with HTTP ${response.status()}.`);
    const state = await context.storageState();
    if (state.cookies.length === 0) throw new Error(`Mock login for ${externalId} did not set a session cookie.`);
    await context.storageState({ path: file });
  } finally {
    await context.dispose();
  }
}

export default async function globalSetup(): Promise<void> {
  requireSafeRealDatabaseEnv();
  runBackendScript('db:migrate');
  runBackendScript('db:seed');
  await mkdir(STATE_DIR, { recursive: true });
  await writeLoginState('mock-admin-1', resolve(STATE_DIR, 'admin.json'));
  await writeLoginState('mock-user-1', resolve(STATE_DIR, 'user.json'));
}
