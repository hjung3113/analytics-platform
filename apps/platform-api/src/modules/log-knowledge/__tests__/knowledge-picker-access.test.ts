import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { knowledgeLookup } from '../knowledge-lookup.js';

const WS = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const MODEL = '33333333-3333-4333-8333-333333333333';
const dialect = new PgDialect();

describe('knowledge pickers object access (#1504 merge)', () => {
  it.each(['models', 'software'] as const)('%s filters every page and count by the current viewer', async (kind) => {
    const predicates: Parameters<PgDialect['sqlToQuery']>[0][] = [];
    const chain = Object.assign(Promise.resolve([]), {
      from: () => chain,
      innerJoin: () => chain,
      where: (predicate: Parameters<PgDialect['sqlToQuery']>[0]) => { predicates.push(predicate); return chain; },
      orderBy: () => chain,
      limit: () => chain,
      offset: () => chain,
    });
    const tx = { select: () => chain };
    const result = kind === 'models'
      ? await knowledgeLookup.listModels(tx as never, WS, { q: null, page: 0, pageSize: 10 }, ACTOR)
      : await knowledgeLookup.listSoftware(tx as never, WS, MODEL, ACTOR);
    expect(result).toEqual(kind === 'models' ? { rows: [], total: 0 } : []);
    expect(predicates).toHaveLength(kind === 'models' ? 2 : 1);
    for (const predicate of predicates) {
      const query = dialect.sqlToQuery(predicate);
      expect(query.sql).toContain('knowledge.object_access_rule');
      expect(query.params).toContain(ACTOR);
      expect(query.params).toContain('deny');
      expect(query.params).toContain('allow');
    }
    if (kind === 'models') expect(new Set(predicates.map((predicate) => dialect.sqlToQuery(predicate).sql)).size).toBe(1);
  });
});
