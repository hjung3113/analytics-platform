export interface SafeDatabaseTarget {
  readonly host: 'localhost';
  readonly port: 5439;
  readonly database: string;
  readonly username: 'platform_app' | 'platform_migrate';
  readonly password: string;
}

export interface SafeRealDatabaseEnv {
  readonly app: SafeDatabaseTarget;
  readonly migrate: SafeDatabaseTarget;
  readonly database: string;
  readonly workspaceId: string;
}

const DATABASE_NAME = /^platform_[A-Za-z0-9][A-Za-z0-9_-]*$/;
const WORKSPACE_ID = /^(?:00000000-0000-0000-0000-000000000001|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

function parseTarget(value: string | undefined, variable: 'DATABASE_URL' | 'DATABASE_URL_MIGRATE', username: SafeDatabaseTarget['username']): SafeDatabaseTarget {
  if (!value) {
    throw new Error(`${variable} is required; create a local throwaway database with verify-db.sh create <name>.`);
  }
  if (value !== value.trim()) {
    throw new Error(`${variable} must be a postgres URL for the local throwaway database; surrounding whitespace is not allowed.`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variable} must be a postgres URL for localhost:5439 and a platform_<name> database.`);
  }

  if (url.protocol !== 'postgres:' || url.hostname !== 'localhost') {
    throw new Error(`${variable} must target localhost only; remote hosts and other URL schemes are refused.`);
  }
  if (url.port === '5434') {
    throw new Error(`${variable} targets development port 5434; real E2E requires throwaway Postgres on port 5439.`);
  }
  if (url.port !== '5439') {
    throw new Error(`${variable} must target throwaway Postgres on port 5439.`);
  }
  if (url.username !== username || !url.password) {
    throw new Error(`${variable} must use the ${username} role with a non-empty password.`);
  }
  if (url.search || url.hash) {
    throw new Error(`${variable} must not include query or fragment overrides.`);
  }

  const database = url.pathname.slice(1);
  if (!DATABASE_NAME.test(database) || database === 'platform') {
    throw new Error(`${variable} must name a throwaway platform_<name> database; the platform template is refused.`);
  }

  return { host: 'localhost', port: 5439, database, username, password: url.password };
}

export function requireSafeRealDatabaseEnv(env: NodeJS.ProcessEnv = process.env): SafeRealDatabaseEnv {
  const app = parseTarget(env.DATABASE_URL, 'DATABASE_URL', 'platform_app');
  const migrate = parseTarget(env.DATABASE_URL_MIGRATE, 'DATABASE_URL_MIGRATE', 'platform_migrate');
  if (app.database !== migrate.database) {
    throw new Error('DATABASE_URL and DATABASE_URL_MIGRATE must target the same platform_<name> database.');
  }

  const workspaceId = env.WORKSPACE_ID;
  if (!workspaceId || !WORKSPACE_ID.test(workspaceId)) {
    throw new Error('WORKSPACE_ID is required and must be a UUID.');
  }

  return { app, migrate, database: app.database, workspaceId };
}
