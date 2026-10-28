import assert from 'node:assert/strict';
import test from 'node:test';
import { requireSafeRealDatabaseEnv } from './database-safety.ts';

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';
const url = (
  role: string,
  database: string,
  tail = '',
  host = 'localhost',
  port = '5439',
  password = 'pw',
) => `postgres://${role}:${password}@${host}:${port}/${database}${tail}`;
const env = (overrides: Record<string, string> = {}) => ({
  DATABASE_URL: url('platform_app', 'platform_wave'),
  DATABASE_URL_MIGRATE: url('platform_migrate', 'platform_wave'),
  WORKSPACE_ID,
  ...overrides,
});

test('accepts the platform roles on a platform_<name> clone at localhost:5439', () => {
  const safe = requireSafeRealDatabaseEnv(env());
  assert.equal(safe.database, 'platform_wave');
  assert.equal(safe.app.username, 'platform_app');
  assert.equal(safe.migrate.username, 'platform_migrate');
  assert.equal(safe.app.port, 5439);
});

test('refuses the old role names and the old clone prefix', () => {
  assert.throws(
    () => requireSafeRealDatabaseEnv(env({ DATABASE_URL: url('fops_app', 'platform_wave') })),
    /platform_app role/,
  );
  assert.throws(
    () =>
      requireSafeRealDatabaseEnv(
        env({ DATABASE_URL_MIGRATE: url('fops_migrate', 'platform_wave') }),
      ),
    /platform_migrate role/,
  );
  assert.throws(
    () =>
      requireSafeRealDatabaseEnv(
        env({
          DATABASE_URL: url('platform_app', 'feedbackops_wave'),
          DATABASE_URL_MIGRATE: url('platform_migrate', 'feedbackops_wave'),
        }),
      ),
    /platform_<name> database/,
  );
});

test('refuses the platform template, mismatched databases and swapped roles', () => {
  assert.throws(
    () =>
      requireSafeRealDatabaseEnv(
        env({
          DATABASE_URL: url('platform_app', 'platform'),
          DATABASE_URL_MIGRATE: url('platform_migrate', 'platform'),
        }),
      ),
    /template is refused/,
  );
  assert.throws(
    () =>
      requireSafeRealDatabaseEnv(
        env({ DATABASE_URL_MIGRATE: url('platform_migrate', 'platform_other') }),
      ),
    /same platform_<name> database/,
  );
  assert.throws(
    () =>
      requireSafeRealDatabaseEnv(env({ DATABASE_URL: url('platform_migrate', 'platform_wave') })),
    /platform_app role/,
  );
});

test('keeps the host, port, password and override protections', () => {
  assert.throws(
    () =>
      requireSafeRealDatabaseEnv(
        env({ DATABASE_URL: url('platform_app', 'platform_wave', '', 'db.example') }),
      ),
    /localhost only/,
  );
  assert.throws(
    () =>
      requireSafeRealDatabaseEnv(
        env({ DATABASE_URL: url('platform_app', 'platform_wave', '', 'localhost', '5434') }),
      ),
    /development port 5434/,
  );
  assert.throws(
    () =>
      requireSafeRealDatabaseEnv(
        env({ DATABASE_URL: url('platform_app', 'platform_wave', '', 'localhost', '5432') }),
      ),
    /port 5439/,
  );
  assert.throws(
    () =>
      requireSafeRealDatabaseEnv(
        env({ DATABASE_URL: url('platform_app', 'platform_wave', '', 'localhost', '5439', '') }),
      ),
    /non-empty password/,
  );
  assert.throws(
    () =>
      requireSafeRealDatabaseEnv(
        env({ DATABASE_URL: url('platform_app', 'platform_wave', '?host=other') }),
      ),
    /query or fragment/,
  );
  assert.throws(
    () =>
      requireSafeRealDatabaseEnv(env({ DATABASE_URL: ` ${url('platform_app', 'platform_wave')}` })),
    /whitespace/,
  );
  assert.throws(
    () => requireSafeRealDatabaseEnv(env({ DATABASE_URL: '' })),
    /DATABASE_URL is required/,
  );
});
