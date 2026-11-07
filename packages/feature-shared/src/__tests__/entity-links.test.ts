import { describe, expect, it } from 'vitest';

import {
  entityLinkRelationTypeSchema,
  isNoManagedSystemEntityLinkPair,
  isRegisteredEntityLinkPair,
  registeredEntityLinkPairs,
  listEntityLinksQuerySchema,
  listEntityLinksResponseSchema,
  registeredEntityLinkPairSchema,
  taskReporterSummarySchema,
} from '../entity-links.js';

describe('listEntityLinksQuerySchema pagination', () => {
  it('defaults inventory pagination to 50 and accepts the maximum page size with a cursor', () => {
    expect(listEntityLinksQuerySchema.parse({ scope: 'workspace' }).limit).toBe(50);
    expect(
      listEntityLinksQuerySchema.parse({ scope: 'workspace', limit: '100', cursor: 'opaque' }),
    ).toMatchObject({ limit: 100, cursor: 'opaque' });
  });

  it.each(['0', '101', '1.5'])('rejects invalid page size %s', (limit) => {
    expect(listEntityLinksQuerySchema.safeParse({ scope: 'workspace', limit }).success).toBe(false);
  });

  it('pages endpoint relation reads too: default 50, cap 100, cursor accepted', () => {
    const endpoint = {
      source_type: 'voc',
      source_id: '11111111-1111-4111-8111-111111111111',
    };
    expect(listEntityLinksQuerySchema.parse(endpoint).limit).toBe(50);
    expect(
      listEntityLinksQuerySchema.parse({ ...endpoint, limit: '10', cursor: 'opaque' }),
    ).toMatchObject({ limit: 10, cursor: 'opaque' });
    expect(listEntityLinksQuerySchema.safeParse({ ...endpoint, limit: '101' }).success).toBe(
      false,
    );
  });
});

describe('listEntityLinksResponseSchema pagination', () => {
  it('accepts first-page status counts while keeping endpoint relation responses compatible', () => {
    expect(
      listEntityLinksResponseSchema.parse({
        items: [],
        page: {
          has_more: true,
          cursor: 'opaque',
          status_counts: { active: 3, stale: 1, detached: 0, revoked: 0 },
        },
      }).page?.status_counts,
    ).toEqual({ active: 3, stale: 1, detached: 0, revoked: 0 });
    expect(listEntityLinksResponseSchema.parse({ items: [] })).toEqual({ items: [] });
  });
});

describe('taskReporterSummarySchema', () => {
  it('accepts a Task reporter summary without a public update timestamp', () => {
    expect(
      taskReporterSummarySchema.parse({
        target_type: 'task',
        public_title: 'Reporter-safe Task title',
        reporter_facing_status: '진행 중',
      }),
    ).toEqual({
      target_type: 'task',
      public_title: 'Reporter-safe Task title',
      reporter_facing_status: '진행 중',
    });
  });

  it('rejects unknown fields so forbidden Task internals cannot enter the summary', () => {
    expect(() =>
      taskReporterSummarySchema.parse({
        target_type: 'task',
        public_title: 'Reporter-safe Task title',
        reporter_facing_status: '진행 중',
        priority: 'urgent',
        due_date: '2099-12-31',
      }),
    ).toThrow();
  });
});

describe('Survey response Entity Link registry', () => {
  it.each([
    { source_type: 'survey_response', target_type: 'finding', relation_type: 'generated_finding' },
    { source_type: 'survey_response', target_type: 'finding', relation_type: 'evidence_of' },
  ] as const)('registers the allowed survey-response pair: %o', (pair) => {
    expect(registeredEntityLinkPairSchema.parse(pair)).toEqual(pair);
  });

  it.each([
    { source_type: 'survey_response', target_type: 'finding', relation_type: 'created_finding' },
    { source_type: 'finding', target_type: 'survey_response', relation_type: 'generated_finding' },
    { source_type: 'survey_response', target_type: 'voc', relation_type: 'evidence_of' },
  ])('rejects an unregistered survey-response pair: %o', (pair) => {
    expect(() => registeredEntityLinkPairSchema.parse(pair)).toThrow();
  });

  it('does not add generated_voc to the relation vocabulary', () => {
    expect(entityLinkRelationTypeSchema.options).not.toContain('generated_voc');

    // @ts-expect-error generated_voc must never become an Entity Link relation.
    const forbiddenRelation: import('../entity-links.js').EntityLinkRelationType = 'generated_voc';
    expect(forbiddenRelation).toBe('generated_voc');
  });
});

describe('no-Managed-System tuples (ADR-0123)', () => {
  it('registers the 수동 검증 첨부 → Round pair exactly once and lists it as no-Managed-System', () => {
    const pair = { source_type: 'manual_validation_attachment', target_type: 'validation_round', relation_type: 'evidence_of' };
    expect(registeredEntityLinkPairs.filter((p) => isNoManagedSystemEntityLinkPair(p))).toEqual([pair]);
    expect(isRegisteredEntityLinkPair(pair)).toBe(true);
    expect(registeredEntityLinkPairSchema.safeParse(pair).success).toBe(true);
    expect(registeredEntityLinkPairs).toHaveLength(14);
  });

  it.each([
    ['the reverse direction', { source_type: 'validation_round', target_type: 'manual_validation_attachment', relation_type: 'evidence_of' }],
    ['another relation', { source_type: 'manual_validation_attachment', target_type: 'validation_round', relation_type: 'related_to' }],
    ['a Managed-System end paired with a Round', { source_type: 'voc', target_type: 'validation_round', relation_type: 'evidence_of' }],
  ])('does not register %s', (_label, pair) => {
    expect(isRegisteredEntityLinkPair(pair)).toBe(false);
    expect(isNoManagedSystemEntityLinkPair(pair as never)).toBe(false);
  });

  it('keeps every pre-existing pair out of the no-Managed-System list', () => {
    const existing = registeredEntityLinkPairs.filter((p) => !isNoManagedSystemEntityLinkPair(p));
    expect(existing).toHaveLength(13);
  });
});
