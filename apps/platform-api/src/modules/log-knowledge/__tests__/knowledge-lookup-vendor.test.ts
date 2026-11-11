import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { knowledgeLookup } from '../knowledge-lookup.js';

const WS = '11111111-1111-4111-8111-111111111111';
const VENDOR = '44444444-4444-4444-8444-444444444444';
const dialect = new PgDialect();

describe('knowledgeLookup.getVendor (#1658)', () => {
  it.each([
    ['an existing vendor', [{ id: VENDOR, name: 'Synth Maker' }], { id: VENDOR, name: 'Synth Maker' }],
    ['a missing vendor', [], null],
  ])('answers %s', async (_name, rows, expected) => {
    const predicates: Parameters<PgDialect['sqlToQuery']>[0][] = [];
    const chain = Object.assign(Promise.resolve(rows), {
      from: () => chain,
      where: (predicate: Parameters<PgDialect['sqlToQuery']>[0]) => { predicates.push(predicate); return chain; },
    });
    const tx = { select: () => chain };
    expect(await knowledgeLookup.getVendor(tx as never, WS, VENDOR)).toEqual(expected);
    expect(predicates).toHaveLength(1);
    const query = dialect.sqlToQuery(predicates[0] as never);
    expect(query.params).toEqual([WS, VENDOR]);
  });
});
