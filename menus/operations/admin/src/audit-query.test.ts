import { describe, expect, it } from 'vitest';
import { ACTION_LABEL, parseAuditKeys } from './audit-query';

const keys = (over: Partial<Record<string, string | null>> = {}) => ({
  type: null, actor: null, action: null, source: null, fromAt: null, toAt: null, targetId: null, sort: null, page: null,
  ...over,
}) as Parameters<typeof parseAuditKeys>[0];

describe('parseAuditKeys (#50 page keys)', () => {
  it('accepts every key absent: filters unset, default page and sort', () => {
    expect(parseAuditKeys(keys())).toEqual({ ok: true, filters: { type: null, actor: null, action: null, source: null, fromAt: null, toAt: null, targetId: null }, sorting: [], page: null });
  });

  it('parses a valid pair of Z instants, the sort wire form and a 1-based page', () => {
    const parsed = parseAuditKeys(keys({ type: 'metric', actor: 'park.seo', action: 'update', source: 'user', fromAt: '2026-09-20T02:00:00.000Z', toAt: '2026-09-26T02:00:00.000Z', targetId: 'cycle_time', sort: 'actor:desc', page: '3' }));
    expect(parsed).toEqual({
      ok: true,
      filters: { type: 'metric', actor: 'park.seo', action: 'update', source: 'user', fromAt: '2026-09-20T02:00:00.000Z', toAt: '2026-09-26T02:00:00.000Z', targetId: 'cycle_time' },
      sorting: [{ id: 'actor', desc: true }],
      page: 3,
    });
  });

  it.each([
    ['one-sided fromAt', keys({ fromAt: '2026-09-20T02:00:00.000Z' })],
    ['one-sided toAt', keys({ toAt: '2026-09-26T02:00:00.000Z' })],
    ['naive instant', keys({ fromAt: '2026-09-20T02:00:00', toAt: '2026-09-26T02:00:00.000Z' })],
    ['fromAt at or after toAt', keys({ fromAt: '2026-09-26T02:00:00.000Z', toAt: '2026-09-20T02:00:00.000Z' })],
    ['unknown type', keys({ type: 'nope' })],
    ['unknown action', keys({ action: 'delete' })],
    ['unknown source', keys({ source: 'cron' })],
    ['empty actor', keys({ actor: '' })],
    ['actor bearing a query mark', keys({ actor: 'a?b' })],
    ['targetId without type', keys({ targetId: 'cycle_time' })],
    ['targetId over 80 chars', keys({ type: 'metric', targetId: 'x'.repeat(81) })],
    ['sort outside the five fields', keys({ sort: 'changes:asc' })],
    ['malformed sort wire form', keys({ sort: 'at:up' })],
    ['page 0', keys({ page: '0' })],
    ['non-numeric page', keys({ page: 'abc' })],
  ])('rejects %s instead of coercing', (_name, raw) => {
    expect(parseAuditKeys(raw)).toEqual({ ok: false });
  });
});

// §6: the words are copied from AuditTimeline, not exported from components. A new AuditAction must fail
// this table until a reviewer copies its word here too.
describe('ACTION_LABEL', () => {
  it('carries exactly the four timeline words, ko and en', () => {
    expect(ACTION_LABEL).toEqual({
      create: { ko: '생성', en: 'Created' },
      update: { ko: '변경', en: 'Updated' },
      retire: { ko: '유효 종료', en: 'Retired' },
      sync: { ko: '동기화', en: 'Synced' },
    });
  });
});
