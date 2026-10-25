import { describe, expect, it } from 'vitest';
import { operatorRoute } from './operator-route';

const inbox = operatorRoute({
  foPath: '/vocs',
  foFixed: { view: 'inbox' },
  menuId: 'fo-inbox',
  keys: { selected: 'focus', 'filter.severity': 'severity', q: 'q' },
});

describe('operatorRoute', () => {
  it('round-trips FO → page → FO', () => {
    const to = '/vocs?view=inbox&selected=abc&filter.severity=high&q=pump';
    const target = inbox.target(to);
    expect(target).toEqual({ menuId: 'fo-inbox', page: { focus: 'abc', severity: 'high', q: 'pump' } });
    expect(inbox.toFoSearch(target!.page!)).toEqual({ view: 'inbox', selected: 'abc', 'filter.severity': 'high', q: 'pump' });
  });

  it('keeps a "?" inside a value', () => {
    expect(inbox.target('/vocs?view=inbox&q=a?b')).toEqual({ menuId: 'fo-inbox', page: { q: 'a?b' } });
  });

  it('maps the bare fixed path with no page keys', () => {
    expect(inbox.target('/vocs?view=inbox')).toEqual({ menuId: 'fo-inbox', page: {} });
  });

  it.each([
    ['an FO key outside the table', '/vocs?view=inbox&sort=created_at:asc'],
    ['a fixed key with another value', '/vocs?view=triage'],
    ['a missing fixed key', '/vocs?q=a'],
    ['another path', '/tasks?view=inbox'],
    ['a fragment', '/vocs?view=inbox#x'],
    ['a repeated key', '/vocs?view=inbox&q=a&q=b'],
    ['an unknown key after a "?" inside a value', '/vocs?view=inbox&q=a?b&sort=x'],
  ])('is null for %s', (_name, to) => {
    expect(inbox.target(to)).toBeNull();
  });

  it('toFoSearch ignores unknown page keys and empty values', () => {
    expect(inbox.toFoSearch({ focus: 'x', q: '', tab: 'open' })).toEqual({ view: 'inbox', selected: 'x' });
  });

  it('preset maps an FO fragment to page keys and skips fixed and unknown keys', () => {
    expect(inbox.preset({ view: 'inbox', 'filter.severity': 'high', bogus: '1' })).toEqual({ severity: 'high' });
  });
});

describe('operatorRoute.rejectedKey', () => {
  const accepts = (foKey: string, value: string) => !(foKey === 'selected' && value === 'bad') && !(foKey === 'q' && value.length > 3);
  const page = (record: Record<string, string>) => (key: string) => record[key] ?? null;

  it('names the first table-order page key whose value the check refuses, under its page key', () => {
    expect(inbox.rejectedKey(page({ focus: 'bad', q: 'long!' }), accepts)).toEqual({ key: 'focus', value: 'bad' });
    expect(inbox.rejectedKey(page({ q: 'long!' }), accepts)).toEqual({ key: 'q', value: 'long!' });
  });

  it('is null when every present value is accepted; absent and empty values are not checked', () => {
    expect(inbox.rejectedKey(page({ focus: 'ok', q: 'abc' }), accepts)).toBeNull();
    expect(inbox.rejectedKey(page({}), () => false)).toBeNull();
    expect(inbox.rejectedKey(page({ focus: '' }), () => false)).toBeNull();
  });

  it('ignores page keys outside the table', () => {
    expect(inbox.rejectedKey(page({ other: 'x' }), () => false)).toBeNull();
  });
});

describe('foAbsent', () => {
  const route = operatorRoute({ foPath: '/c', foFixed: {}, menuId: 'm', keys: { selected: 'focus', managedSystem: 'managedSystem' }, foAbsent: { managedSystem: 'all' } });

  it('keeps the link and leaves the page key absent for the value that means no value', () => {
    expect(route.target('/c?managedSystem=all&selected=x')).toEqual({ menuId: 'm', page: { focus: 'x' } });
    expect(route.target('/c?managedSystem=abc')).toEqual({ menuId: 'm', page: { managedSystem: 'abc' } });
  });

  it('never writes the value back', () => {
    expect(route.toFoSearch({ focus: 'x' })).toEqual({ selected: 'x' });
  });
});

