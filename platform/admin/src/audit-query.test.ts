import { describe, expect, it } from 'vitest';
import { ACTION_LABEL, SOURCE_LABEL, TYPE_LABEL, auditKeyProblem, parseAuditKeys } from './audit-query';

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

  it('accepts the annotation type and the delete action a chart-note deletion writes (#399)', () => {
    expect(parseAuditKeys(keys({ type: 'annotation', action: 'delete' }))).toMatchObject({ ok: true, filters: { type: 'annotation', action: 'delete' } });
  });

  it.each(['equipment', 'voc', 'managed_system', 'Future.Type:v2-x', 'a'.repeat(80)])('accepts the opaque target type %s unchanged', type => {
    expect(parseAuditKeys(keys({ type }))).toMatchObject({ ok: true, filters: { type } });
  });

  it('accepts targetId with a type and still rejects targetId alone', () => {
    expect(parseAuditKeys(keys({ type: 'voc', targetId: '0b1c2d3e-0000-4000-8000-000000000001' }))).toMatchObject({ ok: true });
    expect(auditKeyProblem(keys({ targetId: 'x' }))).toEqual({ key: 'targetId', reason: 'needs-type' });
  });

  it.each<[string, { fromAt?: string; toAt?: string }, 'fromAt' | 'toAt']>([
    ['fromAt only', { fromAt: '2026-09-20T02:00:00.000Z' }, 'fromAt'],
    ['toAt only', { toAt: '2026-09-26T02:00:00.000Z' }, 'toAt'],
  ])('accepts an open %s and keeps that value', (_name, over, key) => {
    const parsed = parseAuditKeys(keys(over));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.filters[key]).toBe(over[key]);
    expect(parsed.filters[key === 'fromAt' ? 'toAt' : 'fromAt']).toBeNull();
  });

  it.each([
    ['naive instant', keys({ fromAt: '2026-09-20T02:00:00', toAt: '2026-09-26T02:00:00.000Z' })],
    ['fromAt at or after toAt', keys({ fromAt: '2026-09-26T02:00:00.000Z', toAt: '2026-09-20T02:00:00.000Z' })],
    ['fromAt equal to toAt', keys({ fromAt: '2026-09-26T02:00:00.000Z', toAt: '2026-09-26T02:00:00.000Z' })],
    ['type with a leading digit', keys({ type: '1voc' })],
    ['empty type', keys({ type: '' })],
    ['type with a space', keys({ type: 'voc x' })],
    ['type with an ampersand', keys({ type: 'voc&x' })],
    ['type with a hash', keys({ type: 'voc#x' })],
    ['type over 80 chars', keys({ type: 'a'.repeat(81) })],
    ['non-ASCII type', keys({ type: 'vocé' })],
    ['unknown action', keys({ action: 'purge' })],
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

// UX-01: a time key's failure says why — malformed wire form vs a date that does not exist.
describe('auditKeyProblem time reasons (#305)', () => {
  it('splits a nonexistent calendar value from an unreadable format', () => {
    expect(auditKeyProblem(keys({ fromAt: '2026-02-30T00:00:00Z' }))).toEqual({ key: 'fromAt', reason: 'calendar' });
    expect(auditKeyProblem(keys({ toAt: '2026-13-01T00:00:00Z' }))).toEqual({ key: 'toAt', reason: 'calendar' });
    expect(auditKeyProblem(keys({ fromAt: '2026-02-30T00:00:00' }))).toEqual({ key: 'fromAt', reason: 'invalid' });
    expect(auditKeyProblem(keys({ toAt: '2026-02-30' }))).toEqual({ key: 'toAt', reason: 'invalid' });
  });

  it('keeps valid and out-of-order values outside the new reasons', () => {
    expect(auditKeyProblem(keys({ fromAt: '2026-09-20T02:00:00.000Z', toAt: '2026-09-26T02:00:00.000Z' }))).toBeNull();
    expect(auditKeyProblem(keys({ fromAt: '2026-09-26T02:00:00.000Z', toAt: '2026-09-20T02:00:00.000Z' }))).toEqual({ key: 'toAt', reason: 'order' });
  });
});

describe('audit filter validators follow their displayed keys', () => {
  it.each([
    ...Object.keys(TYPE_LABEL).map(value => ['type', value] as const),
    ...Object.keys(ACTION_LABEL).map(value => ['action', value] as const),
    ...Object.keys(SOURCE_LABEL).map(value => ['source', value] as const),
  ])('accepts the labeled %s value %s', (key, value) => {
    expect(auditKeyProblem(keys({ [key]: value }))).toBeNull();
  });
});

// §6: the words are copied from AuditTimeline, not exported from components. A new AuditAction must fail
// this table until a reviewer copies its word here too.
describe('ACTION_LABEL', () => {
  it('carries exactly the five timeline words, ko and en', () => {
    expect(ACTION_LABEL).toEqual({
      create: { ko: '생성', en: 'Created' },
      update: { ko: '변경', en: 'Updated' },
      retire: { ko: '사용중지', en: 'Retired' },
      sync: { ko: '동기화', en: 'Synced' },
      delete: { ko: '삭제', en: 'Deleted' },
    });
  });
});
