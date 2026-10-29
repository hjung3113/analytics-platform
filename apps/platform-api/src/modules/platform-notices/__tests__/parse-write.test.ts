import { describe, expect, it } from 'vitest';

import { parseNoticeWrite } from '../parse-write.js';

const KEY = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const OTHER_KEY = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';
const ID = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';
const draft = {
  title: { ko: '제목', en: 'Title' },
  content: { ko: '내용', en: 'Content' },
  scopeId: null,
  until: '2026-12-31T23:59:59',
};
const create = { ...draft, idempotencyKey: KEY };
const update = { ...draft, id: ID, expectedVersion: 'v3', idempotencyKey: KEY };
const del = { id: ID, expectedVersion: 'v3', idempotencyKey: KEY };

const parse = (
  operation: 'save' | 'delete',
  body: unknown,
  headers: {
    idempotencyKey?: string | string[] | undefined;
    ifMatch?: string | string[] | undefined;
  } = {},
) => parseNoticeWrite(operation, body, headers);

const paths = (result: ReturnType<typeof parse>) =>
  result.ok ? [] : result.fieldErrors.map((e) => `${e.path.join('.')}:${e.code}`);

describe('parseNoticeWrite', () => {
  it('accepts a create and an update/delete whose headers match the body', () => {
    expect(parse('save', create, { idempotencyKey: KEY })).toMatchObject({
      ok: true,
      input: { kind: 'create', idempotencyKey: KEY },
    });
    expect(parse('save', update, { idempotencyKey: KEY, ifMatch: 'v3' })).toMatchObject({
      ok: true,
      input: { kind: 'update', id: ID, expectedVersion: 'v3' },
    });
    expect(parse('delete', del, { idempotencyKey: KEY, ifMatch: 'v3' })).toMatchObject({
      ok: true,
      input: { kind: 'delete', id: ID, expectedVersion: 'v3' },
    });
  });

  it('canonicalizes a validated upper-case key after the raw header/body equality judgment', () => {
    const UPPER = KEY.toUpperCase();
    for (const [operation, body, ifMatch] of [
      ['save', create, undefined],
      ['save', update, 'v3'],
      ['delete', del, 'v3'],
    ] as const) {
      const result = parse(
        operation,
        { ...body, idempotencyKey: UPPER },
        {
          idempotencyKey: UPPER,
          ifMatch,
        },
      );
      expect(result).toMatchObject({ ok: true, input: { idempotencyKey: KEY } });
    }
    // the receipt fingerprint never contains the key, so aliases of one request hash alike
    const lower = parse('save', create, { idempotencyKey: KEY });
    const upper = parse('save', { ...create, idempotencyKey: UPPER }, { idempotencyKey: UPPER });
    expect(lower.ok && upper.ok && lower.fingerprintInput).toEqual(
      upper.ok ? upper.fingerprintInput : null,
    );
    // raw header/body case difference stays the approved exact-equality error
    expect(parse('save', create, { idempotencyKey: UPPER })).toMatchObject({
      ok: false,
      outcome: 'error',
    });
  });

  it.each([
    ['null', null],
    ['array', []],
    ['string', 'x'],
    ['malformed sentinel', Symbol('malformed')],
  ])('rejects a %s body as invalid at the root', (_name, body) => {
    const result = parse('save', body, { idempotencyKey: KEY });
    expect(result).toMatchObject({ ok: false, outcome: 'invalid' });
    expect(paths(result)).toEqual([':malformed']);
  });

  it.each([
    ['author', { ...create, author: 'x' }],
    ['createdAt', { ...create, createdAt: '2026-01-01T00:00:00Z' }],
    ['id on a create-shaped body without version', { ...create, id: ID }],
  ])('rejects a forged field: %s', (_name, body) => {
    const result = parse('save', body, { idempotencyKey: KEY, ifMatch: undefined });
    expect(result).toMatchObject({ ok: false, outcome: 'invalid' });
  });

  it('reports a missing or non-UUID body key at idempotencyKey', () => {
    const { idempotencyKey: _k, ...noKey } = create;
    expect(paths(parse('save', noKey, { idempotencyKey: KEY }))).toContain(
      'idempotencyKey:required',
    );
    expect(
      paths(
        parse(
          'save',
          { ...create, idempotencyKey: 'not-a-uuid' },
          { idempotencyKey: 'not-a-uuid' },
        ),
      ),
    ).toEqual(['idempotencyKey:invalid']);
  });

  it.each([undefined, '', 'not-a-uuid', [KEY, KEY]])(
    'reports a missing or malformed Idempotency-Key header (%j) at idempotencyKey',
    (header) => {
      const result = parse('save', create, { idempotencyKey: header });
      expect(result).toMatchObject({ ok: false, outcome: 'invalid' });
      expect(paths(result)).toEqual(['idempotencyKey:invalid']);
    },
  );

  it('answers error, not invalid, when header and body keys differ', () => {
    expect(parse('save', create, { idempotencyKey: OTHER_KEY })).toMatchObject({
      ok: false,
      outcome: 'error',
    });
  });

  it.each([
    ['If-Match absent on update', update, undefined],
    ['If-Match absent on delete', del, undefined],
    ['If-Match differs on update', update, 'v4'],
    ['If-Match present on create', create, 'v1'],
  ])('answers error on %s', (_name, body, ifMatch) => {
    const operation = body === del ? 'delete' : 'save';
    expect(parse(operation, body, { idempotencyKey: KEY, ifMatch })).toMatchObject({
      ok: false,
      outcome: 'error',
    });
  });

  it('rejects any non-null scopeId: no authoritative site grant exists', () => {
    const result = parse('save', { ...create, scopeId: 'MEM' }, { idempotencyKey: KEY });
    expect(paths(result)).toEqual(['scopeId:unknown_scope']);
  });

  it.each([
    '2026-02-30T00:00:00',
    '2026-13-01T00:00:00',
    '2026-04-31T10:00:00',
    '2025-02-29T10:00:00',
    '2026-01-01T24:00:00',
    '2026-01-01T00:60:00',
    '2026-01-01T00:00:60',
    '0000-01-01T00:00:00',
  ])('rejects the impossible calendar value %s', (until) => {
    expect(paths(parse('save', { ...create, until }, { idempotencyKey: KEY }))).toEqual([
      'until:invalid',
    ]);
  });

  it.each(['2028-02-29T23:59:59', '2026-01-01T00:00:00'])(
    'accepts the real calendar value %s',
    (until) => {
      expect(parse('save', { ...create, until }, { idempotencyKey: KEY }).ok).toBe(true);
    },
  );

  it('rejects NUL anywhere in title or content', () => {
    const result = parse(
      'save',
      { ...create, title: { ko: 'a\u0000b', en: 'ok' }, content: { ko: 'ok', en: 'x\u0000' } },
      { idempotencyKey: KEY },
    );
    expect(paths(result)).toEqual(['title.ko:invalid', 'content.en:invalid']);
  });

  it('rejects a lone surrogate', () => {
    const result = parse(
      'save',
      { ...create, title: { ko: '\ud800', en: 'ok' } },
      { idempotencyKey: KEY },
    );
    expect(paths(result)).toEqual(['title.ko:invalid']);
  });

  it('enforces the schema bounds (title 200, content 10000, until shape)', () => {
    expect(
      parse('save', { ...create, title: { ko: 'x'.repeat(201), en: '' } }, { idempotencyKey: KEY })
        .ok,
    ).toBe(false);
    expect(
      parse(
        'save',
        { ...create, content: { ko: 'x'.repeat(10_000), en: 'y'.repeat(10_000) } },
        { idempotencyKey: KEY },
      ).ok,
    ).toBe(true);
    expect(
      parse(
        'save',
        { ...create, content: { ko: 'x'.repeat(10_001), en: '' } },
        { idempotencyKey: KEY },
      ).ok,
    ).toBe(false);
    expect(parse('save', { ...create, until: '2026-12-31' }, { idempotencyKey: KEY }).ok).toBe(
      false,
    );
  });

  it('keeps the original body key out of the fingerprint input', () => {
    const result = parse('save', create, { idempotencyKey: KEY });
    expect(result.ok && 'idempotencyKey' in result.fingerprintInput).toBe(false);
  });
});
