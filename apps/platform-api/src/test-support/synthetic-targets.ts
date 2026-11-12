// Synthetic upstream targets for the routed menu-query tests (#1839, ADR-0153). Synthetic values
// only: no in-house system names, hosts or vocabulary. Two kinds, matching the two connectors:
// - an HTTP target that speaks a non-contract JSON API (it neither verifies the identity token nor
//   answers a 06 §19 envelope), recording every request it receives;
// - a SQL target: a throwaway schema in the integration database with one row table, readable by
//   the app role, dropped afterwards.

import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import pg from 'pg';

/** One synthetic source row. `site`/`room` are Scope values; `seq` is unique per target. */
export interface SyntheticRow {
  site: string;
  room: string;
  seq: number;
  at: string;
  value: number;
}

export interface RecordedRequest {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: string;
}

export interface SyntheticHttpTarget {
  baseUrl: string;
  requests: RecordedRequest[];
  /** Replace the answer for later requests (failure, delay, out-of-scope rows …). */
  respondWith(handler: SyntheticHttpHandler): void;
  close(): Promise<void>;
}

export type SyntheticHttpHandler = (
  request: RecordedRequest,
) => Promise<{ status: number; body: unknown; delayMs?: number }> | { status: number; body: unknown; delayMs?: number };

/** Answers `{ items: rows filtered by ?site= and repeated ?room= }` — a typical non-contract list API. */
export function rowsApi(rows: readonly SyntheticRow[]): SyntheticHttpHandler {
  return (request) => {
    const url = new URL(request.url, 'http://synthetic.invalid');
    const site = url.searchParams.get('site');
    const rooms = url.searchParams.getAll('room');
    const items = rows.filter((row) => (site === null || row.site === site) && (rooms.length === 0 || rooms.includes(row.room)));
    return { status: 200, body: { items } };
  };
}

export async function startSyntheticHttpTarget(handler: SyntheticHttpHandler): Promise<SyntheticHttpTarget> {
  let current = handler;
  const requests: RecordedRequest[] = [];
  const server: Server = createServer((req, res) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const recorded: RecordedRequest = {
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      };
      requests.push(recorded);
      const { status, body, delayMs } = await current(recorded);
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (res.destroyed) return;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    respondWith(next) {
      current = next;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export interface SyntheticSqlTarget {
  /** Schema-qualified table name to use in a declared statement. */
  table: string;
  drop(): Promise<void>;
}

/**
 * Creates `<schema>.rows(site, room, seq, at, value)` with the migrate role and grants SELECT to
 * `readerRole`. `at` is `timestamp` (wall clock, no zone) so the connector's text form is pinned.
 */
export async function createSyntheticSqlTarget({
  migrateUrl,
  schema,
  readerRole,
  rows,
}: {
  migrateUrl: string;
  schema: string;
  readerRole: string;
  rows: readonly SyntheticRow[];
}): Promise<SyntheticSqlTarget> {
  if (!/^[a-z_][a-z0-9_]{0,40}$/.test(schema) || !/^[a-z_][a-z0-9_]{0,62}$/.test(readerRole)) {
    throw new Error('synthetic SQL target: schema and role must be plain lower-case identifiers');
  }
  const client = new pg.Client({ connectionString: migrateUrl });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(
      `CREATE TABLE ${schema}.rows (site text NOT NULL, room text NOT NULL, seq integer NOT NULL, at timestamp NOT NULL, value integer NOT NULL)`,
    );
    for (const row of rows) {
      await client.query(`INSERT INTO ${schema}.rows (site, room, seq, at, value) VALUES ($1, $2, $3, $4, $5)`, [
        row.site,
        row.room,
        row.seq,
        row.at,
        row.value,
      ]);
    }
    await client.query(`GRANT USAGE ON SCHEMA ${schema} TO ${readerRole}`);
    await client.query(`GRANT SELECT ON ${schema}.rows TO ${readerRole}`);
  } finally {
    await client.end();
  }
  return {
    table: `${schema}.rows`,
    async drop() {
      const dropper = new pg.Client({ connectionString: migrateUrl });
      await dropper.connect();
      try {
        await dropper.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      } finally {
        await dropper.end();
      }
    },
  };
}

/** Synthetic Scope values: two sites on one target (N→1), one site split by room over two targets (1→N). */
export const SYNTHETIC_SITES = { shared1: 'SITE-A', shared2: 'SITE-B', split: 'SITE-C' } as const;
export const SYNTHETIC_ROOMS = { a1: 'RA1', b1: 'RB1', c1: 'RC1', c2: 'RC2', c3: 'RC3' } as const;

/** Deterministic rows for the fixture targets. */
export function syntheticRows(site: string, room: string, count: number, seqStart = 1): SyntheticRow[] {
  return Array.from({ length: count }, (_, i) => ({
    site,
    room,
    seq: seqStart + i,
    at: `2026-11-0${(i % 9) + 1}T0${i % 10}:00:00`,
    value: (seqStart + i) * 10,
  }));
}
