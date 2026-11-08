import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { gateHistoryOfRound, latestRequest, latestRoundId, projectGateState, projectIdOfRound, succeededAttempts } from '../repositories/gate.js';

const viewer = { workspaceId: '11111111-1111-4111-8111-111111111111', actorId: '22222222-2222-4222-8222-222222222222' };
const target = '33333333-3333-4333-8333-333333333333';
const dialect = new PgDialect();

describe('Gate reads apply knowledge object access (#1504 merge)', () => {
  it.each([latestRoundId, projectIdOfRound, succeededAttempts, latestRequest, gateHistoryOfRound, projectGateState])('%s binds the viewer in every protected read', async (read) => {
    const predicates: Parameters<PgDialect['sqlToQuery']>[0][] = [];
    const chain = Object.assign(Promise.resolve([]), {
      from: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      where: (predicate: Parameters<PgDialect['sqlToQuery']>[0]) => { predicates.push(predicate); return chain; },
      orderBy: () => chain,
      limit: () => chain,
    });
    const tx = { select: () => chain };
    await read(tx as never, viewer.workspaceId, target, viewer);
    expect(predicates.length).toBeGreaterThan(0);
    for (const predicate of predicates) {
      const query = dialect.sqlToQuery(predicate);
      expect(query.sql).toContain('knowledge.object_access_rule');
      expect(query.params).toContain(viewer.actorId);
    }
  });
});
