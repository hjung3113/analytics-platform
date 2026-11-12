import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TargetSecret } from '../../../bundle/secrets.js';
import { TargetJudgmentTimeout, type ConnectorLeg } from '../../types.js';
import { createMssqlConnector } from '../mssql.js';

// Optional, never in CI: set MSSQL_TEST_URL to a throwaway SQL Server (ADO connection string) whose account may create
// and drop a synthetic schema. Example: docker run --memory 2g --rm -d -p 1433:1433 mcr.microsoft.com/mssql/server
const URL = process.env.MSSQL_TEST_URL ?? '';
const schema = `syn_mssql_${process.pid}`;

interface AdminPool { connect(): Promise<unknown>; close(): Promise<unknown>; request(): { batch(text: string): Promise<unknown> } }
describe.skipIf(!URL)('mssql connector against a real SQL Server', () => {
  let admin: AdminPool;
  const secret = { kind: 'sql', connection: new TargetSecret(URL) } as const;
  const target = { kind: 'sql', dialect: 'mssql', connectionFile: '/synthetic/secret', applicationName: `syn-mssql-${process.pid}` } as const;
  let connector: ReturnType<typeof createMssqlConnector> | undefined;
  const collect = async (leg: ConnectorLeg, over: Partial<{ deadlineMs: number; rowCap: number }> = {}) => {
    const rows: unknown[] = [];
    for await (const row of (connector ??= createMssqlConnector(target, secret)).query(leg, { signal: new AbortController().signal, deadlineMs: 10000, rowCap: 50, ...over })) rows.push(row);
    return rows;
  };
  beforeAll(async () => {
    const sql = createRequire(import.meta.url)('mssql') as { ConnectionPool: { new (config: unknown): AdminPool; parseConnectionString(text: string): unknown } };
    admin = new sql.ConnectionPool(sql.ConnectionPool.parseConnectionString(URL));
    await admin.connect();
    await admin.request().batch(`CREATE SCHEMA ${schema}`);
    await admin.request().batch(`CREATE TABLE ${schema}.rows (site nvarchar(20), room nvarchar(20), seq int, at datetime2(7), amount decimal(38,10))`);
    await admin.request().batch(`INSERT INTO ${schema}.rows SELECT 'SITE-A', CONCAT('RA', n % 2 + 1), n, '2026-11-01T12:34:56.1234567', 1234567890123456789012345678.0123456789 FROM (SELECT TOP 40 ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n FROM sys.all_objects) AS numbers`);
    await admin.request().batch(`CREATE PROCEDURE ${schema}.read_rows @site nvarchar(20), @rooms nvarchar(400) AS SELECT site, room, seq FROM ${schema}.rows WHERE site = @site AND room IN (SELECT value FROM STRING_SPLIT(@rooms, ',')) ORDER BY seq`);
    await admin.request().batch(`CREATE PROCEDURE ${schema}.slow_rows AS BEGIN WAITFOR DELAY '00:00:05'; SELECT 1 AS v; END`);
  });
  afterAll(async () => {
    if (!admin) return;
    for (const statement of [`DROP PROCEDURE IF EXISTS ${schema}.slow_rows`, `DROP PROCEDURE IF EXISTS ${schema}.read_rows`, `DROP TABLE IF EXISTS ${schema}.rows`, `DROP SCHEMA IF EXISTS ${schema}`]) await admin.request().batch(statement);
    await admin.close();
  });
  const base = { targetId: 'syn', site: 'SITE-A', rooms: ['RA1'] };
  it('reads a statement with expanded list placeholders, exact decimals and wall-clock text', async () => {
    const rows = await collect({ ...base, call: { statement: `SELECT TOP 1 room, at, amount FROM ${schema}.rows WHERE site = :site AND room IN (:rooms) ORDER BY seq`, params: { site: 'scope.site', rooms: 'scope.rooms' } }, bindings: { params: { site: 'SITE-A', rooms: ['RA1', 'RA2'] } } });
    expect(rows).toEqual([{ room: 'RA2', at: '2026-11-01 12:34:56.1234567', amount: '1234567890123456789012345678.0123456789' }]);
  });
  it('reads a procedure through RPC with a listJoin argument', async () => {
    const rows = await collect({ ...base, call: { procedure: `${schema}.read_rows`, args: { site: 'scope.site', rooms: 'scope.rooms' }, listJoin: { rooms: ',' } }, bindings: { args: { site: 'SITE-A', rooms: ['RA1'] } } }, { rowCap: 3 });
    expect(rows).toEqual([2, 4, 6].map((seq) => ({ site: 'SITE-A', room: 'RA1', seq })));
  });
  it('stops at rowCap by cancelling the request; the pool keeps serving', async () => {
    const leg: ConnectorLeg = { ...base, call: { statement: `SELECT seq FROM ${schema}.rows ORDER BY seq`, params: {} }, bindings: { params: {} } };
    expect(await collect(leg, { rowCap: 2 })).toHaveLength(2);
    expect(await collect(leg, { rowCap: 50 })).toHaveLength(40);
  });
  it('a request over the judgment limit is a TargetJudgmentTimeout', async () => {
    const leg: ConnectorLeg = { ...base, call: { procedure: `${schema}.slow_rows`, args: {} }, bindings: { args: {} } };
    await expect(collect(leg, { deadlineMs: 500 })).rejects.toEqual(new TargetJudgmentTimeout());
  });
});
