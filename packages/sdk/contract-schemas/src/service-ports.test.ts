import { PEOPLE_LOOKUP_MAX as C_PEOPLE_MAX, PREFERENCE_KEYS_MAX as C_KEYS, PREFERENCE_KEY_PATTERN, PREFERENCE_REQUEST_MAX_BYTES as C_REQ, PREFERENCE_VALUE_MAX_BYTES as C_VALUE } from '@ap/contracts';
import { describe, expect, it } from 'vitest';
import {
  PEOPLE_LOOKUP_MAX,
  PREFERENCE_KEYS_MAX,
  PREFERENCE_REQUEST_MAX_BYTES,
  PREFERENCE_VALUE_MAX_BYTES,
  SCHEMA_FILES,
  createNoticeInputSchema,
  deleteNoticeInputSchema,
  jsonValueSchema,
  noticeSchema,
  peopleLookupRequestSchema,
  peopleLookupResponseSchema,
  preferenceKeySchema,
  preferencesImportSchema,
  preferencesPatchSchema,
  preferencesSnapshotSchema,
  saveNoticeInputSchema,
  toJsonSchema,
  updateNoticeInputSchema,
} from './index.ts';
import { PREFERENCE_KEY_SOURCE } from './service-ports.ts';
import type { JsonValue } from './index.ts';
import * as publicApi from './index.ts';

const text = { ko: '제목', en: 'Title' };
const draft = { title: text, content: text, scopeId: null, until: '2026-10-30T00:00:00' };
const notice = { ...draft, id: 'N-1', version: 'v1' };

describe('port schemas are public and registered as artifacts', () => {
  it('every server-consumable schema is exported and has a JSON artifact', () => {
    const exported = Object.entries(publicApi).filter(([name]) => name.endsWith('Schema') && name !== 'apiResponseSchema' && name !== 'toJsonSchema' && !/^(outcome|assessment|trust|menuQuery|endpointDeclaration)/.test(name));
    expect(exported.length).toBeGreaterThanOrEqual(14);
    const registered = new Set(Object.values(SCHEMA_FILES));
    for (const [name, schema] of exported) expect(registered.has(schema as never), name).toBe(true);
    for (const file of ['jsonValue', 'preferenceKey', 'preferencesSnapshot', 'preferencesPatch', 'preferencesImport', 'groupMember', 'peopleLookupRequest', 'peopleLookupResponse', 'notice', 'noticeListPage', 'createNoticeInput', 'updateNoticeInput', 'saveNoticeInput', 'deleteNoticeInput']) {
      expect(Object.keys(SCHEMA_FILES), file).toContain(file);
    }
  });

  it('limits and key grammar equal the contracts constants', () => {
    expect([PREFERENCE_KEYS_MAX, PREFERENCE_VALUE_MAX_BYTES, PREFERENCE_REQUEST_MAX_BYTES, PEOPLE_LOOKUP_MAX]).toEqual([C_KEYS, C_VALUE, C_REQ, C_PEOPLE_MAX]);
    expect(PREFERENCE_KEY_SOURCE).toBe(PREFERENCE_KEY_PATTERN.source);
  });
});

describe('preferences', () => {
  it.each(['favorites', 'recents', 'lastScope', 'lang', 'columns:equipment.list'])('accepts key %s', (key) => {
    expect(preferenceKeySchema.safeParse(key).success).toBe(true);
  });

  it.each(['favorites:user-1', 'columns:', 'columns:a b', 'board:layout', 'userId'])('rejects key %s (no identity, no board payload)', (key) => {
    expect(preferenceKeySchema.safeParse(key).success).toBe(false);
  });

  it('accepts recursive JSON values and null; rejects non-finite numbers', () => {
    const deep = { a: [1, 'x', null, { b: [true, { c: 'd' }] }] };
    expect(jsonValueSchema.safeParse(deep).success).toBe(true);
    expect(preferencesPatchSchema.safeParse({ set: { favorites: deep, lang: null } }).success).toBe(true);
    expect(jsonValueSchema.safeParse(Number.NaN).success).toBe(false);
    expect(jsonValueSchema.safeParse(undefined).success).toBe(false);
  });

  it('JSON depth is at most 32 like the mock and ADR-0098: 32 passes, 33 and a very deep input are rejected without throwing', () => {
    const nest = (levels: number): JsonValue => {
      let value: JsonValue = 'leaf';
      for (let i = 0; i < levels; i += 1) value = [value];
      return value;
    };
    expect(jsonValueSchema.safeParse(nest(32)).success).toBe(true);
    expect(jsonValueSchema.safeParse(nest(33)).success).toBe(false);
    expect(preferencesPatchSchema.safeParse({ set: { favorites: nest(32) } }).success).toBe(true);
    expect(preferencesPatchSchema.safeParse({ set: { favorites: nest(33) } }).success).toBe(false);
    expect(preferencesImportSchema.safeParse({ values: { favorites: nest(33) } }).success).toBe(false);
    expect(preferencesSnapshotSchema.safeParse({ values: { favorites: nest(33) }, importedAt: null }).success).toBe(false);
    const object32: JsonValue = Array.from({ length: 32 }).reduce<JsonValue>((value) => ({ k: value }), 'leaf');
    expect(jsonValueSchema.safeParse(object32).success).toBe(true);
    expect(jsonValueSchema.safeParse({ k: object32 }).success).toBe(false);
    for (const levels of [10_000, 200_000]) {
      const deep = nest(levels);
      expect(() => jsonValueSchema.safeParse(deep)).not.toThrow();
      expect(jsonValueSchema.safeParse(deep).success).toBe(false);
      expect(() => preferencesPatchSchema.safeParse({ set: { favorites: deep } })).not.toThrow();
      expect(preferencesPatchSchema.safeParse({ set: { favorites: deep } }).success).toBe(false);
    }
  });

  it('snapshot: values and importedAt are required, importedAt may be null', () => {
    expect(preferencesSnapshotSchema.safeParse({ values: {}, importedAt: null }).success).toBe(true);
    expect(preferencesSnapshotSchema.safeParse({ values: {}, importedAt: '2026-10-28T09:00:00Z' }).success).toBe(true);
    expect(preferencesSnapshotSchema.safeParse({ values: {} }).success).toBe(false);
    expect(preferencesSnapshotSchema.safeParse({ importedAt: null }).success).toBe(false);
  });

  it('patch: set, remove, both, neither are shapes; overlapping keys are rejected at runtime', () => {
    expect(preferencesPatchSchema.safeParse({}).success).toBe(true);
    expect(preferencesPatchSchema.safeParse({ set: { lang: 'ko' }, remove: ['recents'] }).success).toBe(true);
    expect(preferencesPatchSchema.safeParse({ set: { lang: 'ko' }, remove: ['lang'] }).success).toBe(false);
    expect(preferencesPatchSchema.safeParse({ remove: ['lang', 'lang'] }).success).toBe(false);
  });

  it.each([
    ['userId', { userId: 'u2', set: {} }],
    ['actor', { set: {}, actor: 'u2' }],
  ])('patch rejects an unknown identity key %s, and so does the artifact', (_name, body) => {
    expect(preferencesPatchSchema.safeParse(body).success).toBe(false);
    expect(toJsonSchema(preferencesPatchSchema)).toMatchObject({ additionalProperties: false });
  });

  it('import rejects identity keys and an oversized value or request', () => {
    expect(preferencesImportSchema.safeParse({ values: { lang: 'ko' } }).success).toBe(true);
    expect(preferencesImportSchema.safeParse({ values: {}, userId: 'u2' }).success).toBe(false);
    expect(preferencesImportSchema.safeParse({ values: { favorites: 'x'.repeat(PREFERENCE_VALUE_MAX_BYTES) } }).success).toBe(false);
    const many = Object.fromEntries(Array.from({ length: PREFERENCE_KEYS_MAX + 1 }, (_, i) => [`columns:k${i}`, 1]));
    expect(preferencesImportSchema.safeParse({ values: many }).success).toBe(false);
  });

  it('patch: set and remove together hold at most PREFERENCE_KEYS_MAX keys; the size message is the one the server maps to too_large', () => {
    const keys = (n: number, p: string) => Array.from({ length: n }, (_, i) => `columns:${p}${i}`);
    const set = (n: number) => Object.fromEntries(keys(n, 's').map((k) => [k, 1]));
    expect(preferencesPatchSchema.safeParse({ set: set(100), remove: keys(100, 'r') }).success).toBe(true);
    expect(preferencesPatchSchema.safeParse({ remove: keys(PREFERENCE_KEYS_MAX, 'r') }).success).toBe(true);
    const over = preferencesPatchSchema.safeParse({ set: set(1), remove: keys(PREFERENCE_KEYS_MAX, 'r') });
    expect(over.success).toBe(false);
    expect(over.error?.issues.map((issue) => issue.message)).toEqual([`at most ${PREFERENCE_KEYS_MAX} keys`]);
    expect(preferencesPatchSchema.safeParse({ set: set(100), remove: keys(101, 'r') }).success).toBe(false);
  });

  it('the artifact carries the representable constraints', () => {
    const patch = toJsonSchema(preferencesPatchSchema) as { properties: Record<string, Record<string, unknown>> };
    expect(patch.properties['remove']).toMatchObject({ type: 'array', uniqueItems: true });
    expect(patch.properties['set']).toMatchObject({ type: 'object', maxProperties: PREFERENCE_KEYS_MAX, propertyNames: { pattern: PREFERENCE_KEY_SOURCE } });
  });
});

describe('people lookup', () => {
  it('takes explicit distinct opaque ids up to the cap and returns only GroupMember fields', () => {
    expect(peopleLookupRequestSchema.safeParse({ ids: ['u1', 'u2'] }).success).toBe(true);
    expect(peopleLookupRequestSchema.safeParse({ ids: ['u1', 'u1'] }).success).toBe(false);
    expect(peopleLookupRequestSchema.safeParse({ ids: [''] }).success).toBe(false);
    expect(peopleLookupRequestSchema.safeParse({ ids: Array.from({ length: PEOPLE_LOOKUP_MAX + 1 }, (_, i) => `u${i}`) }).success).toBe(false);
    expect(peopleLookupRequestSchema.safeParse({ ids: [], query: 'kim' }).success).toBe(false);
    const member = { userId: 'u1', displayName: 'Kim', affiliation: 'Fab A' };
    expect(peopleLookupResponseSchema.safeParse({ items: [member] }).success).toBe(true);
    expect(peopleLookupResponseSchema.safeParse({ items: [{ ...member, role: 'admin' }] }).success).toBe(false);
  });
});

describe('notices', () => {
  it('Notice requires every field; scopeId is nullable', () => {
    expect(noticeSchema.safeParse(notice).success).toBe(true);
    expect(noticeSchema.safeParse({ ...notice, scopeId: 'MEM' }).success).toBe(true);
    for (const key of Object.keys(notice)) expect(noticeSchema.safeParse({ ...notice, [key]: undefined }).success, key).toBe(false);
    expect(noticeSchema.safeParse({ ...notice, until: '2026-10-30' }).success).toBe(false);
  });

  it('create rejects a supplied id, author, time or version; update needs id and expectedVersion', () => {
    const create = { ...draft, idempotencyKey: 'k1' };
    expect(createNoticeInputSchema.safeParse(create).success).toBe(true);
    for (const extra of [{ id: 'N-1' }, { author: 'u1' }, { createdAt: '2026-10-28T00:00:00Z' }, { version: 'v1' }]) {
      expect(createNoticeInputSchema.safeParse({ ...create, ...extra }).success).toBe(false);
    }
    const update = { ...create, id: 'N-1', expectedVersion: 'v1' };
    expect(updateNoticeInputSchema.safeParse(update).success).toBe(true);
    expect(updateNoticeInputSchema.safeParse(create).success).toBe(false);
    expect(updateNoticeInputSchema.safeParse({ ...update, author: 'u1' }).success).toBe(false);
    expect(saveNoticeInputSchema.safeParse(create).success).toBe(true);
    expect(saveNoticeInputSchema.safeParse(update).success).toBe(true);
    expect(saveNoticeInputSchema.safeParse({ ...create, id: 'N-1' }).success).toBe(false);
  });

  it('delete needs id, expectedVersion and idempotencyKey', () => {
    expect(deleteNoticeInputSchema.safeParse({ id: 'N-1', expectedVersion: 'v1', idempotencyKey: 'k' }).success).toBe(true);
    expect(deleteNoticeInputSchema.safeParse({ id: 'N-1', idempotencyKey: 'k' }).success).toBe(false);
    expect(deleteNoticeInputSchema.safeParse({ id: 'N-1', expectedVersion: 'v1', idempotencyKey: 'k', author: 'u' }).success).toBe(false);
  });

  it('artifacts forbid unknown identity keys', () => {
    for (const schema of [noticeSchema, createNoticeInputSchema, updateNoticeInputSchema, deleteNoticeInputSchema]) {
      expect(toJsonSchema(schema)).toMatchObject({ additionalProperties: false });
    }
  });
});
