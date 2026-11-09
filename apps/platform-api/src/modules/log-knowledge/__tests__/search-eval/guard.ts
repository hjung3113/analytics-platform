// Refuses a target that is not a throwaway database (#1508 S-e): the runners write 100k-row fixtures and delete them.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** The port the pg driver will really connect to: query `port=` over the authority, then PGPORT, then 5432. */
export function effectivePgPort(url: string): number {
  const ConnectionParameters = require('pg/lib/connection-parameters') as new (config: { connectionString: string }) => { port: unknown };
  const { port } = new ConnectionParameters({ connectionString: url });
  if (typeof port !== 'number' || !Number.isInteger(port)) throw new Error('cannot resolve the PostgreSQL port of the database URL');
  return port;
}

export function guardDatabase(): { appUrl: string; migrateUrl: string } {
  const appUrl = process.env.DATABASE_URL ?? '';
  const migrateUrl = process.env.DATABASE_URL_MIGRATE ?? '';
  if (!appUrl || !migrateUrl) throw new Error('DATABASE_URL and DATABASE_URL_MIGRATE are required: run with PLATFORM_API_ENV_FILE set (see the script header)');
  if (process.env.NODE_ENV === 'production') throw new Error('refusing to run with NODE_ENV=production');
  for (const url of [appUrl, migrateUrl]) {
    if (effectivePgPort(url) === 5434) throw new Error('refusing the development database (port 5434)');
  }
  return { appUrl, migrateUrl };
}
