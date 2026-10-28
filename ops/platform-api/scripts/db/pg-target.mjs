// Effective PostgreSQL target validation for the admin-only database tools (#1100 a). Pure: no network, no database.
//
// A connection URL is only trusted after it has been reduced to one canonical form that every consumer (psql,
// pg, drizzle-kit) resolves identically. libpq lets URL query parameters (host, hostaddr, port, user, dbname,
// options, service, ...) override the URL authority, and the environment (PGPORT, PGHOST, PGHOSTADDR, ...) fill
// or override what the URL omits. A check on the authority alone therefore does not describe where a tool connects.
//
// Rules: protocol postgres/postgresql; one explicit non-empty host without commas, slashes or percent escapes; a
// port that is explicit or comes from PGPORT, normalized to a plain integer in 1..65535 (05434 is 5434); an
// explicit user and database; no fragment; the only query parameters are an SSL allowlist, each at most once. Any
// other parameter (target, role or startup overrides such as host, hostaddr, port, user, dbname, options,
// service, passfile) is refused rather than guessed at.
//
// CLI (the URL is read from the environment variable named by argv[3], never from argv):
//   node pg-target.mjs canonical <ENV_VAR>        prints the canonical URL, exit 2 with a diagnosis otherwise
//   node pg-target.mjs part <ENV_VAR> <host|port|user|db>   prints one effective part of the canonical URL

import { pathToFileURL } from 'node:url';

export const SSL_MODES = ['disable', 'require', 'verify-ca', 'verify-full'];
const SSL_PARAMS = ['sslmode', 'sslrootcert', 'sslcert', 'sslkey'];

export class TargetError extends Error {}

function effectivePort(raw, source) {
  if (!/^\d{1,6}$/.test(raw)) throw new TargetError(`${source} is not a plain port number`);
  const port = Number(raw);
  if (port < 1 || port > 65535) throw new TargetError(`${source} is outside 1..65535`);
  return port;
}

export function parsePgTarget(input, env = process.env) {
  if (typeof input !== 'string' || input === '')
    throw new TargetError('the connection URL is empty');
  let u;
  try {
    u = new URL(input);
  } catch {
    throw new TargetError('the connection URL is not parseable');
  }
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') {
    throw new TargetError('the connection URL must use postgres:// or postgresql://');
  }
  if (u.hash !== '') throw new TargetError('the connection URL must not carry a fragment');
  const host = u.hostname;
  if (host === '' || /[,/%\\\s]/.test(host)) {
    throw new TargetError(
      'the connection URL needs one plain host (no list, socket path or escape)',
    );
  }
  const portText = u.port !== '' ? u.port : (env.PGPORT ?? '') !== '' ? env.PGPORT : '5432';
  const port = effectivePort(portText, u.port !== '' ? 'the URL port' : 'PGPORT');
  const user = decodeURIComponent(u.username);
  if (user === '') throw new TargetError('the connection URL must name its user explicitly');
  const db = decodeURIComponent(u.pathname.slice(1));
  if (db === '' || db.includes('/'))
    throw new TargetError('the connection URL must name its database explicitly');

  const seen = new Set();
  const query = [];
  for (const [key, value] of u.searchParams) {
    if (!SSL_PARAMS.includes(key)) {
      throw new TargetError(
        `query parameter "${key}" can change the connection target, role or startup; only ${SSL_PARAMS.join(', ')} are accepted`,
      );
    }
    if (seen.has(key)) throw new TargetError(`query parameter "${key}" is repeated`);
    seen.add(key);
    if (key === 'sslmode' && !SSL_MODES.includes(value)) {
      throw new TargetError(
        `sslmode must be one of ${SSL_MODES.join(', ')} (psql and pg disagree on the other modes)`,
      );
    }
    if (value === '') throw new TargetError(`query parameter "${key}" is empty`);
    query.push([key, value]);
  }

  const userinfo = `${u.username}${u.password !== '' ? `:${u.password}` : ''}`;
  const search =
    query.length > 0 ? `?${query.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}` : '';
  const canonical = `${u.protocol}//${userinfo}@${host.toLowerCase()}:${port}/${encodeURIComponent(db)}${search}`;
  return { host: host.toLowerCase(), port, user, db, canonical };
}

function cli(argv) {
  const [command, envName, field] = argv;
  const fail = (message) => {
    process.stderr.write(`${message}\n`);
    process.exit(2);
  };
  if (!envName)
    fail('usage: pg-target.mjs canonical <ENV_VAR> | part <ENV_VAR> <host|port|user|db>');
  let target;
  try {
    target = parsePgTarget(process.env[envName] ?? '');
  } catch (error) {
    fail(error instanceof TargetError ? error.message : 'the connection URL is not usable');
  }
  if (command === 'canonical') process.stdout.write(target.canonical);
  else if (command === 'part' && ['host', 'port', 'user', 'db'].includes(field))
    process.stdout.write(String(target[field]));
  else fail('usage: pg-target.mjs canonical <ENV_VAR> | part <ENV_VAR> <host|port|user|db>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  cli(process.argv.slice(2));
