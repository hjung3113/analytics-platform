import { describe, expect, it } from 'vitest';

import { parseClientError } from '../client-errors.js';
import { parseUsageBatch, parseUsageRange, validSpaceId } from '../usage.js';

const entry = {
  name: 'entry',
  menuId: 'ops.usage',
  spaceId: null,
  path: '/ops/usage',
  at: 1,
  sessionId: 's',
};

describe('parseUsageBatch', () => {
  it('parses a main entry with via and a board dwell with stayId', () => {
    const parsed = parseUsageBatch({
      events: [
        { ...entry, via: 'sidebar', fromMenuId: null },
        { ...entry, name: 'dwell', dwellMs: 3, enteredAt: 1, source: 'board', stayId: 'x' },
      ],
    });
    expect(parsed?.map((e) => [e.name, e.source, e.via, e.stayId, e.dwellMs])).toEqual([
      ['entry', 'main', 'sidebar', null, null],
      ['dwell', 'board', null, 'x', 3],
    ]);
  });

  it.each([
    ['via outside the set', { ...entry, via: 'bookmark' }],
    ['via on a dwell', { ...entry, name: 'dwell', dwellMs: 1, enteredAt: 1, via: 'link' }],
    ['fromMenuId on a board entry', { ...entry, source: 'board', fromMenuId: 'a' }],
    ['numeric fromMenuId', { ...entry, fromMenuId: 5 }],
    ['userId key', { ...entry, userId: 'u' }],
    ['dwell keys on an entry', { ...entry, dwellMs: 1, enteredAt: 1 }],
    ['query in path', { ...entry, path: '/a?b=1' }],
    ['stayId on a main event', { ...entry, stayId: 's' }],
    ['space id with whitespace', { ...entry, spaceId: 'my space' }],
    ['fractional at', { ...entry, at: 1.5 }],
    ['negative dwellMs', { ...entry, name: 'dwell', dwellMs: -1, enteredAt: 1 }],
  ])('rejects %s', (_label, event) => {
    expect(parseUsageBatch({ events: [event] })).toBeNull();
  });

  it.each([
    ['an array body', [entry]],
    ['an extra body key', { events: [entry], x: 1 }],
    ['an empty batch', { events: [] }],
    ['21 events', { events: Array.from({ length: 21 }, () => entry) }],
    ['null', null],
  ])('rejects %s', (_label, body) => {
    expect(parseUsageBatch(body)).toBeNull();
  });
});

describe('parseUsageRange', () => {
  it('accepts preset=all and from<to', () => {
    expect(parseUsageRange({ preset: 'all' })).toEqual({ preset: 'all' });
    expect(parseUsageRange({ from: '0', to: '5' })).toEqual({ from: 0, to: 5 });
  });

  it.each([
    [{ from: '5', to: '5' }],
    [{ from: '1.5', to: '3' }],
    [{ from: '-1', to: '3' }],
    [{ from: '1', to: '9007199254740993' }],
    [{ preset: 'all', x: '1' }],
    [{ from: ['1', '2'], to: '3' }],
    [{}],
  ])('rejects %j', (query) => {
    expect(parseUsageRange(query)).toBeNull();
  });
});

describe('parseClientError', () => {
  const ok = {
    correlationId: 'client-1',
    menuId: 'm',
    spaceId: null,
    path: '/x',
    name: 'TypeError',
  };

  it('accepts exactly the five fields', () => {
    expect(parseClientError(ok)).toEqual(ok);
  });

  it.each([
    [{ ...ok, message: 'boom' }],
    [{ ...ok, path: '//evil' }],
    [{ ...ok, path: 'https://evil/x' }],
    [{ ...ok, name: 'two words' }],
    [{ ...ok, correlationId: 'srv-1' }],
  ])('rejects %j', (body) => {
    expect(parseClientError(body)).toBeNull();
  });
});

describe('validSpaceId (the server does not know the app’s spaces, ADR-0072)', () => {
  it.each(['analytics', 'log-dev', 'a-space-this-server-was-never-told-about'])(
    'accepts %s',
    (id) => {
      expect(validSpaceId(id)).toBe(true);
    },
  );

  it('accepts null for a global menu', () => {
    expect(validSpaceId(null)).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['whitespace', 'a b'],
    ['query mark', 'a?b'],
    ['hash', 'a#b'],
    ['ampersand', 'a&b'],
    ['over 80 characters', 'x'.repeat(81)],
    ['a number', 5],
    ['undefined', undefined],
    ['an object', {}],
  ])('rejects %s', (_label, value) => {
    expect(validSpaceId(value)).toBe(false);
  });
});
