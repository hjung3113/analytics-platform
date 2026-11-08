import { describe, expect, it } from 'vitest';

import {
  KNOWLEDGE_SEARCH_LIMIT_MAX,
  knowledgeSearchRequestSchema,
  knowledgeSearchResponseSchema,
  knowledgeSearchSuggestRequestSchema,
  knowledgeSearchSuggestResponseSchema,
} from './knowledge-search.ts';

const id = '00000000-0000-4000-8000-000000000001';
const item = {
  itemId: id,
  itemNo: 1,
  title: 't',
  excerpt: 'e',
  typeCode: 'anomaly',
  revisionNo: 1,
  publicationState: 'published',
  verificationState: 'not_checked',
  processingState: 'open',
  publishedAt: '2026-11-09T00:00:00.000Z',
  owner: { modelId: id, modelCode: 'M', modelName: 'M', softwareId: null, softwareLabel: null },
  reasons: ['observed_same_direction'],
  stage: 1,
  expectedOnly: false,
  relatedCount: 0,
};
const response = {
  version: 'v0',
  interpretation: { original: 'a', tokens: ['a'], direction: null },
  items: [item],
  opposite: null,
  oppositeHasMore: false,
  hasMore: false,
  nextCursor: null,
  capped: false,
  indexLag: { lagSeconds: null, backfill: { state: 'done', percent: 100 } },
};

describe('knowledge search contract (#1507)', () => {
  it('accepts a minimal request and a full one', () => {
    expect(knowledgeSearchRequestSchema.safeParse({}).success).toBe(true);
    expect(
      knowledgeSearchRequestSchema.safeParse({
        q: 'a',
        ownerFilter: { modelId: id, includeSoftware: true },
        relation: { source: 'A/B', predicate: 'after', target: 'A/C' },
        kind: 'observed',
        includeOpposite: true,
        cursor: 'abc',
        limit: KNOWLEDGE_SEARCH_LIMIT_MAX,
      }).success,
    ).toBe(true);
  });

  it.each([
    [{ limit: KNOWLEDGE_SEARCH_LIMIT_MAX + 1 }],
    [{ relation: { source: 'A', predicate: 'requires', target: 'B' } }],
    [{ relation: { source: ' A', predicate: 'before', target: 'B' } }],
    [{ kind: 'some' }],
    [{ extra: 1 }],
    [{ ownerFilter: { modelId: 'x' } }],
  ])('refuses %j', (bad) => {
    expect(knowledgeSearchRequestSchema.safeParse(bad).success).toBe(false);
  });

  it('suggest needs a non-empty q', () => {
    expect(knowledgeSearchSuggestRequestSchema.safeParse({ q: '' }).success).toBe(false);
    expect(knowledgeSearchSuggestRequestSchema.safeParse({ q: 'a' }).success).toBe(true);
  });

  it('the response carries `capped` and has no field for a total', () => {
    expect(knowledgeSearchResponseSchema.safeParse(response).success).toBe(true);
    expect(knowledgeSearchResponseSchema.safeParse({ ...response, total: 3 }).success).toBe(false);
    expect(knowledgeSearchResponseSchema.safeParse({ ...response, indexLag: { ...response.indexLag, backfill: { state: 'running', percent: 101 } } }).success).toBe(false);
  });

  it('suggestions are at most 12', () => {
    const s = { kind: 'title', text: 'x' };
    expect(knowledgeSearchSuggestResponseSchema.safeParse({ version: 'v0', suggestions: Array(12).fill(s) }).success).toBe(true);
    expect(knowledgeSearchSuggestResponseSchema.safeParse({ version: 'v0', suggestions: Array(13).fill(s) }).success).toBe(false);
  });
});
