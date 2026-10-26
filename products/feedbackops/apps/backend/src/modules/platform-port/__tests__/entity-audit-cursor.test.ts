import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  decodeEntityAuditCursor,
  encodeEntityAuditCursor,
  splitEntityAuditBody,
} from '../entity-audit-cursor.js';

const ref = { type: 'voc', id: randomUUID() };
const last = { at: '2026-03-01T10:00:00.123Z', id: randomUUID() };
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const valid = { v: 1, type: ref.type, ref: ref.id, at: last.at, id: last.id };

describe('entityAudit cursor codec', () => {
  it('round-trips for the same ref', () => {
    expect(decodeEntityAuditCursor(ref, encodeEntityAuditCursor(ref, last))).toEqual(last);
  });

  it('issues base64url text', () => {
    expect(encodeEntityAuditCursor(ref, last)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['the conformance garbage', '__conformance_invalid_cursor'],
    ['an empty string', ''],
    ['a number', 7],
    ['null', null],
    ['base64 with + and /', 'ab+/cd'],
    ['non-JSON bytes', Buffer.from('not json').toString('base64url')],
    ['an extra key', b64({ ...valid, extra: 1 })],
    ['a missing id', b64({ v: 1, type: ref.type, ref: ref.id, at: last.at })],
    ['an at that is not ms ISO', b64({ ...valid, at: '2026-03-01T00:00:00Z' })],
    ['a non-uuid id', b64({ ...valid, id: 'not-a-uuid' })],
    ['another type', encodeEntityAuditCursor({ type: 'task', id: ref.id }, last)],
    ['another ref id', encodeEntityAuditCursor({ type: ref.type, id: randomUUID() }, last)],
  ])('decodes %s to null', (_name, raw) => {
    expect(decodeEntityAuditCursor(ref, raw)).toBeNull();
  });
});

describe('splitEntityAuditBody', () => {
  it('splits an own cursor off the ref', () => {
    expect(splitEntityAuditBody({ type: 'voc', id: 'x', scopeId: null, cursor: 'c' })).toEqual({
      ref: { type: 'voc', id: 'x', scopeId: null },
      cursor: 'c',
      hasCursor: true,
    });
  });

  it('keeps a body without a cursor as is', () => {
    const body = { type: 'voc', id: 'x', scopeId: null };
    expect(splitEntityAuditBody(body)).toEqual({ ref: body, cursor: undefined, hasCursor: false });
  });

  it('keeps an explicit undefined/null cursor as present', () => {
    expect(splitEntityAuditBody({ type: 'voc', cursor: null })).toMatchObject({
      cursor: null,
      hasCursor: true,
    });
  });

  it.each([[null], [[1, 2]], ['text']])('passes %j through', (body) => {
    expect(splitEntityAuditBody(body)).toEqual({ ref: body, cursor: undefined, hasCursor: false });
  });
});
