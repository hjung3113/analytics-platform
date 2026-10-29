import { describe, expect, it } from 'vitest';
import { operatorRoute } from './operator-route';

const inbox = operatorRoute({
  screenPath: '/vocs',
  screenFixed: { view: 'inbox' },
  menuId: 'inbox',
  keys: { selected: 'focus', 'filter.severity': 'severity', q: 'q' },
});

describe('operatorRoute', () => {
  it('round-trips screen → page → screen', () => {
    const to = '/vocs?view=inbox&selected=abc&filter.severity=high&q=pump';
    const target = inbox.target(to);
    expect(target).toEqual({ menuId: 'inbox', page: { focus: 'abc', severity: 'high', q: 'pump' } });
    expect(inbox.toFoSearch(target!.page!)).toEqual({ view: 'inbox', selected: 'abc', 'filter.severity': 'high', q: 'pump' });
  });

  it('keeps a "?" inside a value', () => {
    expect(inbox.target('/vocs?view=inbox&q=a?b')).toEqual({ menuId: 'inbox', page: { q: 'a?b' } });
  });

  it('maps the bare fixed path with no page keys', () => {
    expect(inbox.target('/vocs?view=inbox')).toEqual({ menuId: 'inbox', page: {} });
  });

  it.each([
    ['a screen key outside the table', '/vocs?view=inbox&sort=created_at:asc'],
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

  it('preset maps a screen fragment to page keys and skips fixed and unknown keys', () => {
    expect(inbox.preset({ view: 'inbox', 'filter.severity': 'high', bogus: '1' })).toEqual({ severity: 'high' });
  });
});

describe('operatorRoute.rejectedKey', () => {
  const accepts = (screenKey: string, value: string) => !(screenKey === 'selected' && value === 'bad') && !(screenKey === 'q' && value.length > 3);
  const page = (record: Record<string, string>) => (key: string) => record[key] ?? null;

  it('names the first table-order page key whose value the check refuses, under its page key', () => {
    expect(inbox.rejectedKey(page({ focus: 'bad', q: 'long!' }), accepts)).toEqual({ key: 'focus', value: 'bad' });
    expect(inbox.rejectedKey(page({ q: 'long!' }), accepts)).toEqual({ key: 'q', value: 'long!' });
  });

  it('is null when every present value is accepted; an absent value is not checked', () => {
    expect(inbox.rejectedKey(page({ focus: 'ok', q: 'abc' }), accepts)).toBeNull();
    expect(inbox.rejectedKey(page({}), () => false)).toBeNull();
  });

  it('checks a present empty value too: the check refuses it, or accepts it as its schema does', () => {
    expect(inbox.rejectedKey(page({ focus: '' }), () => false)).toEqual({ key: 'focus', value: '' });
    expect(inbox.rejectedKey(page({ q: '' }), accepts)).toBeNull();
  });

  it('ignores page keys outside the table', () => {
    expect(inbox.rejectedKey(page({ other: 'x' }), () => false)).toBeNull();
  });
});

describe('screenAbsent', () => {
  const route = operatorRoute({ screenPath: '/c', screenFixed: {}, menuId: 'm', keys: { selected: 'focus', managedSystem: 'managedSystem' }, screenAbsent: { managedSystem: 'all' } });

  it('keeps the link and maps the value that means no value', () => {
    expect(route.target('/c?managedSystem=all&selected=x')).toEqual({ menuId: 'm', page: { focus: 'x', managedSystem: null } });
    expect(route.target('/c?managedSystem=abc')).toEqual({ menuId: 'm', page: { managedSystem: 'abc' } });
  });

  it('maps the value that means no value to an explicit clear (null), which toFoSearch never writes back', () => {
    const target = route.target('/c?managedSystem=all');
    expect(target!.page).toEqual({ managedSystem: null });
    expect(route.toFoSearch(target!.page!)).toEqual({});
  });
});


describe('detailPath', () => {
  const route = operatorRoute({ screenPath: '/c', screenFixed: {}, menuId: 'm', keys: { selected: 'focus' }, detailPath: { key: 'selected', pattern: /^[a-f0-9]+$/ } });

  it('reads /c/<id> as selected=<id>', () => {
    expect(route.target('/c/ab12')).toEqual({ menuId: 'm', page: { focus: 'ab12' } });
  });

  it.each([
    ['a non-matching segment', '/c/xyz'], ['a deeper path', '/c/ab12/edit'], ['an empty segment', '/c/'],
    ['a repeated selected', '/c/ab12?selected=cd'], ['an unknown key', '/c/ab12?tab=x'], ['a fragment', '/c/ab12#x'],
  ])('is null for %s', (_name, to) => {
    expect(route.target(to)).toBeNull();
  });

  it('is off when the table declares no detailPath', () => {
    expect(inbox.target('/vocs/ab12?view=inbox')).toBeNull();
  });
});

describe('hash', () => {
  const route = operatorRoute({ screenPath: '/s', screenFixed: {}, menuId: 'm', keys: { selected: 'focus' }, hash: { fragment: 'coverage', key: 'section' } });

  it('accepts the declared fragment as the page key and writes it back through toFoHash', () => {
    const target = route.target('/s#coverage');
    expect(target).toEqual({ menuId: 'm', page: { section: 'coverage' } });
    expect(route.toFoHash(target!.page!)).toBe('#coverage');
    expect(route.toFoSearch(target!.page!)).toEqual({});
  });

  it('keeps the query next to the fragment', () => {
    expect(route.target('/s?selected=x#coverage')).toEqual({ menuId: 'm', page: { focus: 'x', section: 'coverage' } });
  });

  it.each([['another fragment', '/s#other'], ['an empty fragment', '/s#'], ['a longer fragment', '/s#coverage2'], ['a nested fragment', '/s#coverage#x'], ['an unknown key', '/s?tab=a#coverage']])('is null for %s', (_name, to) => {
    expect(route.target(to)).toBeNull();
  });

  it('lists the hash key among the page keys, and toFoHash is empty without the fragment', () => {
    expect([...route.pageKeys]).toEqual(['focus', 'section']);
    expect(route.toFoHash({})).toBe('');
    expect(route.toFoHash({ section: 'other' })).toBe('');
    expect(route.toFoHash({ section: null })).toBe('');
  });

  it('rejectedKey refuses any hash-key value except the fragment', () => {
    const accepts = () => true;
    expect(route.rejectedKey(key => (key === 'section' ? 'coverage' : null), accepts)).toBeNull();
    expect(route.rejectedKey(key => (key === 'section' ? 'other' : null), accepts)).toEqual({ key: 'section', value: 'other' });
    expect(route.rejectedKey(key => (key === 'section' ? '' : null), accepts)).toEqual({ key: 'section', value: '' });
  });

  it('is off for a table without hash', () => {
    expect(inbox.toFoHash({ section: 'coverage' })).toBe('');
    expect(inbox.target('/vocs?view=inbox#coverage')).toBeNull();
  });
});

describe('preset with hash', () => {
  const route = operatorRoute({ screenPath: '/s', screenFixed: {}, menuId: 'm', keys: { selected: 'focus' }, hash: { fragment: 'coverage', key: 'section' } });
  const settings = operatorRoute({ screenPath: '/s', screenFixed: {}, menuId: 'm', keys: {}, hash: { fragment: 'coverage', key: 'section' } });

  it('keeps the declared fragment under the hash key', () => {
    expect(settings.preset({ section: 'coverage' })).toEqual({ section: 'coverage' });
    expect(route.preset({ selected: 'x', section: 'coverage' })).toEqual({ focus: 'x', section: 'coverage' });
  });

  it('ignores any other fragment value', () => {
    expect(settings.preset({ section: 'other' })).toEqual({});
    expect(route.preset({ selected: 'x', section: '' })).toEqual({ focus: 'x' });
  });

  it('is unchanged for a table without hash', () => {
    expect(inbox.preset({ section: 'coverage' })).toEqual({});
  });
});
