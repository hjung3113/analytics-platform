// DB-free checks of the standalone runners' database guard (#1508 S-e): the effective pg port, not the URL authority.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { effectivePgPort, guardDatabase } from './guard.js';

const OK = 'postgres://u:p@localhost:5439/platform';

describe('search evaluation database guard', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('resolves the port the way pg does', () => {
    expect(effectivePgPort('postgres://u:p@localhost:5439/platform?port=5434')).toBe(5434);
    expect(effectivePgPort('postgres://u:p@localhost:5434/platform')).toBe(5434);
    expect(effectivePgPort('postgres://u:p@localhost:05434/platform')).toBe(5434);
    vi.stubEnv('PGPORT', '5434');
    expect(effectivePgPort('postgres://u:p@localhost/platform')).toBe(5434);
  });

  it.each([
    ['authority port', 'postgres://u:p@localhost:5434/platform'],
    ['query port override', 'postgres://u:p@localhost:5439/platform?port=5434'],
    ['zero-padded port', 'postgres://u:p@localhost:05434/platform'],
  ])('refuses 5434 via %s in either URL', (_n, bad) => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATABASE_URL', bad);
    vi.stubEnv('DATABASE_URL_MIGRATE', OK);
    expect(() => guardDatabase()).toThrow(/5434/);
    vi.stubEnv('DATABASE_URL', OK);
    vi.stubEnv('DATABASE_URL_MIGRATE', bad);
    expect(() => guardDatabase()).toThrow(/5434/);
  });

  it('refuses 5434 given only by PGPORT', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PGPORT', '5434');
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost/platform');
    vi.stubEnv('DATABASE_URL_MIGRATE', OK);
    expect(() => guardDatabase()).toThrow(/5434/);
  });

  it('refuses production and accepts a throwaway target', () => {
    vi.stubEnv('DATABASE_URL', OK);
    vi.stubEnv('DATABASE_URL_MIGRATE', OK);
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => guardDatabase()).toThrow(/production/);
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PGPORT', '');
    expect(guardDatabase().appUrl).toBe(OK);
  });
});
