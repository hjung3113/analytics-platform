import { describe, expect, it } from 'vitest';
import { parseFilterParams, validateFilters, type ColumnFilter } from '@ap/contracts';
import { AUDIT_FILTER_IDS, AUDIT_LEGACY_KEYS, auditFilterSpecs, auditValueCheck, toAuditQuery } from './audit-filters';

const page = { page: 3, pageSize: 25, sorting: [] };
const FROM = '2026-09-26T02:00:00.000Z';
const TO = '2026-09-26T03:00:00.000Z';

describe('toAuditQuery (P5: ColumnFilter[] → the typed port query)', () => {
  it('no conditions: only the page', () => {
    expect(toAuditQuery([], page)).toEqual({ page: 3, pageSize: 25 });
  });

  it.each<[string, ColumnFilter, object]>([
    ['actor', { id: 'actor', op: 'equals', value: 'Park.Seo' }, { actor: 'Park.Seo' }],
    ['action', { id: 'action', op: 'in', value: ['update'] }, { action: 'update' }],
    ['source', { id: 'source', op: 'in', value: ['system'] }, { source: 'system' }],
    ['targetType is the port `type`', { id: 'targetType', op: 'equals', value: 'Future.Type:v2' }, { type: 'Future.Type:v2' }],
    ['at between with both ends', { id: 'at', op: 'between', value: { from: FROM, to: TO } }, { fromAt: FROM, toAt: TO }],
    ['at between, open end (from only)', { id: 'at', op: 'between', value: { from: FROM } }, { fromAt: FROM }],
    ['at between, open start (to only)', { id: 'at', op: 'between', value: { to: TO } }, { toAt: TO }],
  ])('%s', (_name, filter, expected) => {
    expect(toAuditQuery([filter], page)).toEqual({ ...expected, page: 3, pageSize: 25 });
  });

  it('the requires pair: targetId travels with its type', () => {
    expect(toAuditQuery([{ id: 'targetType', op: 'equals', value: 'equipment' }, { id: 'targetId', op: 'equals', value: 'MEM-1' }], page))
      .toEqual({ type: 'equipment', targetId: 'MEM-1', page: 3, pageSize: 25 });
  });

  it('every condition together plus the sort', () => {
    const all: ColumnFilter[] = [
      { id: 'actor', op: 'equals', value: 'a' }, { id: 'action', op: 'in', value: ['sync'] }, { id: 'source', op: 'in', value: ['user'] },
      { id: 'targetType', op: 'equals', value: 't' }, { id: 'targetId', op: 'equals', value: 'i' }, { id: 'at', op: 'between', value: { from: FROM, to: TO } },
    ];
    expect(toAuditQuery(all, { page: 1, pageSize: 25, sorting: [{ id: 'actor', desc: true }] })).toEqual({
      actor: 'a', action: 'sync', source: 'user', type: 't', targetId: 'i', fromAt: FROM, toAt: TO, sort: { field: 'actor', desc: true }, page: 1, pageSize: 25,
    });
  });

  it.each<[string, ColumnFilter]>([
    ['an undeclared field', { id: 'reason', op: 'equals', value: 'x' }],
    ['a wrong op on actor', { id: 'actor', op: 'contains', value: 'x' }],
    ['two action values', { id: 'action', op: 'in', value: ['sync', 'update'] }],
    ['a numeric between on at', { id: 'at', op: 'between', value: [1, 2] }],
  ])('%s throws instead of being dropped', (_name, filter) => {
    expect(() => toAuditQuery([filter], page)).toThrow(RangeError);
  });
});

describe('audit filter specs (the editor can only express what the port accepts)', () => {
  const specs = auditFilterSpecs('ko');
  it('declare exact case-sensitive text, one-value enums, an instant window and the type requirement', () => {
    expect(Object.keys(specs)).toEqual([...AUDIT_FILTER_IDS]);
    expect(specs.actor).toMatchObject({ kind: 'text', ops: ['equals'], caseSensitive: true });
    expect(specs.action).toMatchObject({ kind: 'enum', ops: ['in'], multiple: false });
    expect(specs.source).toMatchObject({ kind: 'enum', ops: ['in'], multiple: false });
    expect(specs.at).toMatchObject({ kind: 'instant', ops: ['between'] });
    expect(specs.targetId).toMatchObject({ requires: ['targetType'] });
  });

  it('the codec refuses what the port cannot take: two actions, a contains actor, targetId without a type', () => {
    expect(parseFilterParams(['action:in:sync~update'], specs).ok).toBe(false);
    expect(parseFilterParams(['actor:contains:a'], specs).ok).toBe(false);
    expect(parseFilterParams(['targetId:equals:x'], specs).ok).toBe(false);
    expect(validateFilters([{ id: 'targetType', op: 'equals', value: 't' }, { id: 'targetId', op: 'equals', value: 'x' }], specs).ok).toBe(true);
  });
});

describe('legacy keys (P8)', () => {
  const legacy = (key: string, raw: string) => AUDIT_LEGACY_KEYS.find(entry => entry.key === key)!.toFilter(raw);
  it.each([
    ['type', 'equipment', { id: 'targetType', op: 'equals', value: 'equipment' }],
    ['actor', 'park.seo', { id: 'actor', op: 'equals', value: 'park.seo' }],
    ['action', 'update', { id: 'action', op: 'in', value: ['update'] }],
    ['source', 'user', { id: 'source', op: 'in', value: ['user'] }],
    ['fromAt', FROM, { id: 'at', op: 'between', value: { from: FROM } }],
    ['toAt', TO, { id: 'at', op: 'between', value: { to: TO } }],
    ['targetId', 'MEM-1', { id: 'targetId', op: 'equals', value: 'MEM-1' }],
  ])('%s=%s converts', (key, raw, expected) => {
    expect(legacy(key, raw)).toEqual(expected);
  });

  it.each([
    ['type', '9bogus'], ['type', 'bad type'], ['actor', 'a b'], ['actor', ''], ['action', 'explode'], ['source', 'robot'],
    ['fromAt', '2026-09-26T02:00:00'], ['fromAt', '2026-02-30T00:00:00.000Z'], ['toAt', 'soon'], ['targetId', 'a b'],
  ])('%s=%s is refused (null), never repaired', (key, raw) => {
    expect(legacy(key, raw)).toBeNull();
  });
});

describe('auditValueCheck (the port rules, before any query)', () => {
  it.each<[string, ColumnFilter]>([
    ['a type with a leading digit', { id: 'targetType', op: 'equals', value: '9bogus' }],
    ['a type with a space', { id: 'targetType', op: 'equals', value: 'voc x' }],
    ['a type over 80 chars', { id: 'targetType', op: 'equals', value: 'a'.repeat(81) }],
    ['an actor with a space', { id: 'actor', op: 'equals', value: 'a b' }],
    ['a target id with a query mark', { id: 'targetId', op: 'equals', value: 'a?b' }],
    ['an unknown action', { id: 'action', op: 'in', value: ['purge'] }],
    ['an unknown source', { id: 'source', op: 'in', value: ['cron'] }],
  ])('refuses %s', (_name, filter) => {
    expect(auditValueCheck(filter)).not.toBeNull();
  });
  it.each<ColumnFilter>([
    { id: 'targetType', op: 'equals', value: 'Future.Type:v2-x' },
    { id: 'actor', op: 'equals', value: 'Park.Seo' },
    { id: 'action', op: 'in', value: ['delete'] },
    { id: 'source', op: 'in', value: ['system'] },
    { id: 'at', op: 'between', value: { from: FROM } },
  ])('allows %j (a well-formed unknown type stays allowed)', filter => {
    expect(auditValueCheck(filter)).toBeNull();
  });
});
