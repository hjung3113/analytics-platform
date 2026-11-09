import { describe, expect, it } from 'vitest';

import { classifyFailure, summarizeFailures } from './failure-class.js';

describe('load failure classes (#1599)', () => {
  it('names the reason of each failure the runner can see', () => {
    expect(classifyFailure(Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' }))).toBe('statement_timeout');
    expect(classifyFailure(new Error('canceling statement due to statement timeout'))).toBe('statement_timeout');
    expect(classifyFailure(new Error('timeout exceeded when trying to connect'))).toBe('pool_acquire');
    expect(classifyFailure(new Error('Connection terminated unexpectedly'))).toBe('connection');
    expect(classifyFailure(Object.assign(new Error('x'), { code: 'ECONNRESET' }))).toBe('connection');
    expect(classifyFailure(Object.assign(new Error('terminating connection'), { code: '57P01' }))).toBe('connection');
    expect(classifyFailure(new Error('could not resize shared memory segment "/PostgreSQL.1" to 2097152 bytes: No space left on device'))).toBe('shared_memory');
    expect(classifyFailure(new Error('could not write to file "base/pgsql_tmp/pgsql_tmp1.0": No space left on device'))).toBe('other');
    expect(classifyFailure({ ok: false, message: 'cursor does not belong to this query' })).toBe('refused');
    expect(classifyFailure(new Error('relation does not exist'))).toBe('other');
    expect(classifyFailure('plain string')).toBe('other');
  });
  it('counts every class, zeros included, and keeps the first message per class', () => {
    const s = summarizeFailures([
      { cls: 'statement_timeout', message: 'first' },
      { cls: 'statement_timeout', message: 'second' },
      { cls: 'pool_acquire', message: 'pool' },
    ]);
    expect(s.counts).toEqual({ statement_timeout: 2, pool_acquire: 1, connection: 0, shared_memory: 0, refused: 0, other: 0 });
    expect(s.samples).toEqual({ statement_timeout: 'first', pool_acquire: 'pool' });
  });
});
