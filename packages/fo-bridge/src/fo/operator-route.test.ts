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
