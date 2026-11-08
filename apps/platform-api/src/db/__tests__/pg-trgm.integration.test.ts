import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../client.js';

const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const runIntegration = Boolean(process.env.DATABASE_URL && MIGRATE_URL);

if (!runIntegration) {
  console.warn('[pg-trgm] skipping — set DATABASE_URL, DATABASE_URL_MIGRATE to run.');
}

// #1199 node S-0: bootstrap (scripts/db/init.sql, verify-db.sh) installs pg_trgm so the search index migration can assert it.
describe.skipIf(!runIntegration)('pg_trgm bootstrap prerequisite', () => {
  let handle: DbHandle;

  beforeAll(() => {
    handle = createDb(MIGRATE_URL);
  });
  afterAll(async () => {
    await handle.pool.end();
  });

  it('is installed and answers trigram similarity', async () => {
    const extension = await handle.pool.query<{ extname: string }>(
      `select extname from pg_extension where extname = 'pg_trgm'`,
    );
    expect(extension.rows).toEqual([{ extname: 'pg_trgm' }]);
    const similarity = await handle.pool.query<{ ok: boolean }>(
      `select similarity('step_process', 'stepprocess') > 0.3 as ok`,
    );
    expect(similarity.rows).toEqual([{ ok: true }]);
  });
});
