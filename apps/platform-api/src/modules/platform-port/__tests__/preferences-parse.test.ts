import { describe, expect, it } from 'vitest';

import type { Db } from '../../../db/client.js';
import { createPlatformPreferencesService } from '../preferences.js';

// Every case here is judged before the first query, so the handle is never touched; a rejected request that reached it would throw.
const untouched = new Proxy(
  {},
  {
    get: () => {
      throw new Error('the database was reached');
    },
  },
) as Db;
const service = createPlatformPreferencesService({ db: untouched });
const actor = { actor_id: 'a', workspace_id: 'w', role_level: 'user' };

const deep = (levels: number) => {
  let value: unknown = 1;
  for (let i = 0; i < levels; i += 1) value = [value];
  return value;
};
const keys = (n: number) =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`columns:k${i}`, i]));

describe('preferences request judgement', () => {
  it.each([
    ['not an object', null],
    ['a forged identity field', { userId: 'x', set: { lang: 'ko' } }],
    ['a key outside the grammar', { set: { 'favorites:other': 1 } }],
    ['a key in set and remove', { set: { lang: 'ko' }, remove: ['lang'] }],
    ['a value nested too deep', { set: { recents: deep(40) } }],
    ['a NUL character jsonb cannot store', { set: { lang: 'a\u0000b' } }],
    ['a NUL in a nested object key', { set: { 'columns:probe': { 'bad\u0000key': 1 } } }],
    [
      'a NUL in an object key inside an array',
      { set: { 'columns:probe': [{ a: { 'x\u0000': 1 } }] } },
    ],
  ])('patch: %s is error, never too_large', async (_name, body) => {
    expect((await service.patch(actor, body)).outcome).toBe('error');
  });

  it.each([
    ['more than 200 keys', { set: keys(201) }],
    ['a value over 65536 bytes', { set: { recents: 'x'.repeat(65_540) } }],
    [
      'a request over 262144 bytes',
      {
        set: Object.fromEntries(
          Array.from({ length: 5 }, (_, i) => [`columns:b${i}`, 'y'.repeat(60_000)]),
        ),
      },
    ],
  ])('patch: %s is too_large', async (_name, body) => {
    expect((await service.patch(actor, body)).outcome).toBe('too_large');
  });

  it.each([
    ['a forged identity field', { values: { lang: 'ko' }, actorId: 'x' }],
    ['a NUL character jsonb cannot store', { values: { lang: ['\u0000'] } }],
    ['a NUL in a nested object key', { values: { 'columns:probe': { 'bad\u0000key': 1 } } }],
    [
      'a NUL in an object key inside an array',
      { values: { 'columns:probe': [{ a: { 'x\u0000': 1 } }] } },
    ],
    ['a missing values map', {}],
  ])('import: %s is error', async (_name, body) => {
    expect((await service.import(actor, body)).outcome).toBe('error');
  });

  it('import: more than 200 keys is too_large', async () => {
    expect((await service.import(actor, { values: keys(201) })).outcome).toBe('too_large');
  });

  it.each([
    ['a lone high surrogate value', { set: { lang: 'a\ud800b' } }],
    ['a lone low surrogate value', { set: { lang: '\udc00' } }],
    ['a high surrogate at the end of a nested array string', { set: { recents: [['x\ud83d']] } }],
    ['a lone surrogate in an object key', { set: { 'columns:probe': { 'bad\ud800key': 1 } } }],
    [
      'a lone surrogate in an object key inside an array',
      { set: { 'columns:probe': [{ a: { '\udc00x': 1 } }] } },
    ],
    ['a reversed pair', { set: { lang: '\ude00\ud83d' } }],
  ])('patch: %s is error before the database', async (_name, body) => {
    expect((await service.patch(actor, body)).outcome).toBe('error');
  });

  it.each([
    ['a lone surrogate value', { values: { lang: ['\ud800'] } }],
    ['a lone surrogate in a nested object key', { values: { 'columns:probe': { '\udfff': 1 } } }],
  ])('import: %s is error before the database', async (_name, values) => {
    expect((await service.import(actor, values)).outcome).toBe('error');
  });

  it('a valid surrogate pair passes the guard (it reaches the database)', async () => {
    await expect(
      service.patch(actor, { set: { lang: '😀', 'columns:e': { '😀k': ['😀'] } } }),
    ).rejects.toThrow('the database was reached');
    await expect(service.import(actor, { values: { lang: '😀' } })).rejects.toThrow(
      'the database was reached',
    );
  });

  it('patch: set and remove together count against the 200-key request bound', async () => {
    const remove = Array.from({ length: 200 }, (_, i) => `columns:r${i}`);
    expect((await service.patch(actor, { set: { lang: 'ko' }, remove })).outcome).toBe('too_large');
    expect(
      (await service.patch(actor, { set: keys(100), remove: remove.slice(0, 101) })).outcome,
    ).toBe('too_large');
  });

  it('patch: exactly 200 set and remove keys together pass the bound (it reaches the database)', async () => {
    await expect(
      service.patch(actor, {
        set: keys(100),
        remove: Array.from({ length: 100 }, (_, i) => `columns:r${i}`),
      }),
    ).rejects.toThrow('the database was reached');
  });
});
