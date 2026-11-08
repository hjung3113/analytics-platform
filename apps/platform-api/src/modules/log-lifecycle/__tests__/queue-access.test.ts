import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { attemptVisibleSql, requestVisibleSql, workerRequestVisibleSql } from '../repositories/access-visibility.js';

const viewer = { workspaceId: '11111111-1111-4111-8111-111111111111', actorId: '22222222-2222-4222-8222-222222222222' };
const dialect = new PgDialect();

describe('human queue access remains Round-only (#1504 merge)', () => {
  it.each([requestVisibleSql, attemptVisibleSql])('%s never exposes a private suite subject through the Round endpoints', (predicate) => {
    const query = dialect.sqlToQuery(predicate(viewer, sql`'33333333-3333-4333-8333-333333333333'::uuid`));
    expect(query.sql).not.toContain('acl_q.round_id is null or');
    expect(query.sql).toContain('knowledge.object_access_rule');
    expect(query.params).toContain(viewer.actorId);
  });
});


describe('worker queue access retains suite processing (#1479)', () => {
  it('accepts a suite subject while still binding knowledge access for Round subjects', () => {
    const query = dialect.sqlToQuery(workerRequestVisibleSql(viewer, sql`'33333333-3333-4333-8333-333333333333'::uuid`));
    expect(query.sql).toContain('worker_q.round_id is null');
    expect(query.sql).toContain('worker_q.suite_run_item_id is not null');
    expect(query.sql).toContain('knowledge.object_access_rule');
    expect(query.params).toContain(viewer.actorId);
  });
});
