// Pure tests for the rehearsal guard (#1100 a, C4). No database is reached: connections are injected fakes, and
// the assertions are about WHAT WOULD BE DISPATCHED. A refusal here is what keeps the destructive rehearsal
// (identity-cutover.rehearsal.test.ts) from running init.sql, password changes or renames on the wrong cluster.

import { describe, expect, it } from 'vitest';

import {
  assertEmptyExclusiveCluster,
  createStageGate,
  preflightRehearsal,
  rehearsalChildEnv,
  validateRehearsalAdminUrl,
} from './helpers/rehearsal-guard.js';

const GOOD = 'postgres://postgres:pw@localhost:5449/postgres';

describe('validateRehearsalAdminUrl', () => {
  it.each([
    ['dedicated local 5449', GOOD],
    ['loopback address', 'postgres://postgres:pw@127.0.0.1:5449/postgres'],
    ['postgresql scheme', 'postgresql://postgres:pw@localhost:5449/postgres'],
  ])('accepts %s', (_label, url) => {
    expect(validateRehearsalAdminUrl(url)).toBe(url);
  });

  it.each([
    ['empty', ''],
    ['shared 5439 cluster', 'postgres://postgres:pw@localhost:5439/postgres'],
    ['developer 5434', 'postgres://postgres:pw@localhost:5434/postgres'],
    ['default port', 'postgres://postgres:pw@localhost/postgres'],
    ['zero-padded port', 'postgres://postgres:pw@localhost:05449/postgres'],
    ['remote host', 'postgres://postgres:pw@db.example.com:5449/postgres'],
    ['lookalike host', 'postgres://postgres:pw@localhost.evil.test:5449/postgres'],
    ['not the postgres database', 'postgres://postgres:pw@localhost:5449/feedbackops'],
    ['not the postgres user', 'postgres://fops_migrate:pw@localhost:5449/postgres'],
    ['port query override', `${GOOD}?port=5434`],
    ['host query override', `${GOOD}?host=other`],
    ['hostaddr query override', `${GOOD}?hostaddr=10.0.0.1`],
    ['dbname query override', `${GOOD}?dbname=platform`],
    ['user query override', `${GOOD}?user=fops_app`],
    ['any query at all', `${GOOD}?sslmode=disable`],
    ['fragment', `${GOOD}#x`],
    ['other protocol', 'mysql://postgres:pw@localhost:5449/postgres'],
    ['multi-host', 'postgres://postgres:pw@localhost:5449,other:5434/postgres'],
  ])('refuses %s', (_label, url) => {
    expect(() => validateRehearsalAdminUrl(url)).toThrow(/rehearsal/i);
  });
});

describe('assertEmptyExclusiveCluster', () => {
  const clean = async (sql: string) => {
    if (/pg_roles/.test(sql)) return [];
    if (/pg_database/.test(sql)) return [];
    throw new Error(`unexpected query: ${sql}`);
  };

  it('accepts a cluster with only the bootstrap role and databases', async () => {
    await expect(assertEmptyExclusiveCluster(clean)).resolves.toBeUndefined();
  });

  it.each([
    ['a leftover fops_* role', 'pg_roles', [{ name: 'fops_app' }], /role/],
    ['a platform_* role', 'pg_roles', [{ name: 'platform_app' }], /role/],
    ['any other login role', 'pg_roles', [{ name: 'someone' }], /role/],
    ['the feedbackops database', 'pg_database', [{ name: 'feedbackops' }], /database/],
    ['the platform database', 'pg_database', [{ name: 'platform' }], /database/],
    ['any other database', 'pg_database', [{ name: 'shared_5439' }], /database/],
  ])('refuses %s', async (_label, catalog, rows, message) => {
    const read = async (sql: string) => (sql.includes(catalog) ? rows : []);
    await expect(assertEmptyExclusiveCluster(read)).rejects.toThrow(message);
  });
});

describe('preflightRehearsal', () => {
  it('validates the URL before connecting', async () => {
    const connects: string[] = [];
    const connect = (url: string) => {
      connects.push(url);
      return async () => [];
    };
    await expect(
      preflightRehearsal('postgres://postgres:pw@localhost:5439/postgres', connect),
    ).rejects.toThrow(/rehearsal/i);
    await expect(preflightRehearsal(`${GOOD}?port=5434`, connect)).rejects.toThrow(/rehearsal/i);
    expect(connects).toEqual([]);
  });

  it('a nonempty cluster is refused with only read-only statements issued', async () => {
    const issued: string[] = [];
    const connect = () => async (sql: string) => {
      issued.push(sql);
      return sql.includes('pg_roles') ? [{ name: 'fops_app' }] : [];
    };
    await expect(preflightRehearsal(GOOD, connect)).rejects.toThrow(/role/);
    expect(issued.length).toBeGreaterThan(0);
    for (const sql of issued) expect(sql.trim()).toMatch(/^select\b/i);
  });

  it('an empty dedicated cluster passes', async () => {
    await expect(preflightRehearsal(GOOD, () => async () => [])).resolves.toBe(GOOD);
  });
});

describe('createStageGate', () => {
  it('runs a stage only after its prerequisite passed', async () => {
    const gate = createStageGate();
    const ran: string[] = [];
    await gate.run('a', null, async () => {
      ran.push('a');
    });
    await gate.run('b', 'a', async () => {
      ran.push('b');
    });
    expect(ran).toEqual(['a', 'b']);
  });

  it('a failed stage blocks every later stage, which are reported as blocked instead of running', async () => {
    const gate = createStageGate();
    const ran: string[] = [];
    await expect(
      gate.run('init', null, async () => {
        throw new Error('init failed');
      }),
    ).rejects.toThrow('init failed');
    for (const [id, needs] of [
      ['password', 'init'],
      ['rename', 'password'],
    ] as const) {
      await expect(
        gate.run(id, needs, async () => {
          ran.push(id);
        }),
      ).rejects.toThrow(new RegExp(`blocked.*"${needs}"`));
    }
    expect(ran).toEqual([]);
  });

  it('a stage that is already satisfied up front (skipped by configuration) does not block its successor', async () => {
    const gate = createStageGate();
    gate.satisfy('optional');
    let ran = false;
    await gate.run('next', 'optional', async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });
});

describe('rehearsalChildEnv', () => {
  it('drops everything that could redirect psql, pg or drizzle-kit away from the validated URL', () => {
    const env = rehearsalChildEnv({
      PATH: '/bin',
      PGPASSWORD: 'keep',
      PGPORT: '5434',
      PGHOST: 'x',
      PGHOSTADDR: '10.0.0.1',
      PGUSER: 'u',
      PGDATABASE: 'd',
      PGSERVICE: 's',
      PGOPTIONS: '-c role=x',
      DRIZZLE_OUT: '/tmp/x',
      DATABASE_URL: 'postgres://app@localhost:5434/platform',
    });
    expect(env.PATH).toBe('/bin');
    expect(env.PGPASSWORD).toBe('keep');
    for (const key of [
      'PGPORT',
      'PGHOST',
      'PGHOSTADDR',
      'PGUSER',
      'PGDATABASE',
      'PGSERVICE',
      'PGOPTIONS',
      'DRIZZLE_OUT',
      'DATABASE_URL',
    ]) {
      expect(env).not.toHaveProperty(key);
    }
  });
});
