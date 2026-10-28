// Guards for the destructive cutover rehearsal (#1100 a). Pure: URL and catalog inspection only; every connection
// is injected, so the refusals can be tested without a database. The rehearsal creates, renames and drops
// cluster-wide roles, so it must prove its target BEFORE running any SQL and stop every later stage if it cannot.

export type Read = (sql: string) => Promise<Array<{ name: string }>>;
export type Connect = (url: string) => Read;

const REHEARSAL_URL =
  /^postgres(?:ql)?:\/\/postgres(?::[^@/?#]*)?@(?:localhost|127\.0\.0\.1):5449\/postgres$/;

// Exactly the exclusive rehearsal cluster: local host, port 5449, database postgres, user postgres, no query
// string (libpq lets query parameters override host, port, user and dbname), no fragment, no host list.
export function validateRehearsalAdminUrl(url: string): string {
  if (!REHEARSAL_URL.test(url)) {
    throw new Error(
      'rehearsal refused: CUTOVER_REHEARSAL_ADMIN_URL must be postgres://postgres:<pw>@localhost:5449/postgres (or 127.0.0.1) with no query string or fragment',
    );
  }
  return url;
}

// Read-only. A usable rehearsal cluster holds nothing but the bootstrap superuser and the stock databases.
export async function assertEmptyExclusiveCluster(read: Read): Promise<void> {
  const roles = await read(
    "select rolname as name from pg_roles where rolname <> 'postgres' and rolname !~ '^pg_' order by 1",
  );
  if (roles.length > 0) {
    throw new Error(
      `rehearsal refused: the cluster is not empty, it already has role(s) ${roles.map((r) => r.name).join(', ')}`,
    );
  }
  const databases = await read(
    "select datname as name from pg_database where datname not in ('postgres', 'template0', 'template1') order by 1",
  );
  if (databases.length > 0) {
    throw new Error(
      `rehearsal refused: the cluster is not empty, it already has database(s) ${databases.map((d) => d.name).join(', ')}`,
    );
  }
}

// URL first, then the read-only emptiness check; nothing here mutates.
export async function preflightRehearsal(url: string, connect: Connect): Promise<string> {
  validateRehearsalAdminUrl(url);
  await assertEmptyExclusiveCluster(connect(url));
  return url;
}

// Child processes (psql, bash, drizzle-kit) must connect where the validated URL points.
const REDIRECTING = [
  'PGHOST',
  'PGHOSTADDR',
  'PGPORT',
  'PGUSER',
  'PGDATABASE',
  'PGSERVICE',
  'PGSERVICEFILE',
  'PGOPTIONS',
  'DRIZZLE_OUT',
  'DATABASE_URL',
  'DATABASE_URL_MIGRATE',
];
export function rehearsalChildEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...env };
  for (const key of REDIRECTING) delete out[key];
  return out;
}

// Sequential stages: a stage runs only when its prerequisite passed. A failed or blocked stage never lets a later
// one reach init.sql, a password change or a rename.
export function createStageGate() {
  const passed = new Set<string>();
  return {
    satisfy(id: string) {
      passed.add(id);
    },
    async run(id: string, needs: string | null, fn: () => Promise<void>): Promise<void> {
      if (needs !== null && !passed.has(needs)) {
        throw new Error(`stage "${id}" is blocked: prerequisite stage "${needs}" did not pass`);
      }
      await fn();
      passed.add(id);
    },
  };
}
