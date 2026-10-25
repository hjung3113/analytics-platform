import { describe, expect, it } from 'vitest';
import { ContractError, emptyGlobal, parseQuery, type GlobalContext } from '@ap/contracts';
import { dropResetKeys, withPaneContext } from './paneContext';

const menu = { pageKeys: ['page', 'tab'], contextResetKeys: ['page'] };
const w1 = 'from=2026-09-01T00:00:00&to=2026-09-02T00:00:00';
const w2: GlobalContext = { ...emptyGlobal, from: '2026-08-01T00:00:00', to: '2026-08-02T00:00:00' };

describe('dropResetKeys', () => {
  it('drops the reset keys when the Context changed, keeps them when it did not or the menu declares none', () => {
    const pairs: [string, string][] = [['page', '3'], ['tab', 'x']];
    const before = parseQuery(`?${w1}`).global;
    expect(dropResetKeys(menu, pairs, before, w2)).toEqual([['tab', 'x']]);
    expect(dropResetKeys(menu, pairs, before, before)).toEqual(pairs);
    expect(dropResetKeys({ contextResetKeys: undefined }, pairs, before, w2)).toEqual(pairs);
    expect(dropResetKeys(null, pairs, before, w2)).toEqual(pairs);
  });
});

describe('withPaneContext', () => {
  it('replaces the Context, keeps page keys and extras, and drops only the reset keys', () => {
    const next = withPaneContext(menu, `?${w1}&page=3&tab=x&other=1`, w2);
    const parsed = parseQuery(next, menu.pageKeys);
    expect(parsed.global).toEqual(w2);
    expect(parsed.page).toEqual([['tab', 'x']]);
    expect(parsed.extras).toEqual([['other', '1']]);
  });

  it('keeps the reset keys when the Context is already the same', () => {
    const same = parseQuery(`?${w1}`).global;
    expect(parseQuery(withPaneContext(menu, `?${w1}&page=3`, same), menu.pageKeys).page).toEqual([['page', '3']]);
  });

  it('works from an empty query and throws ContractError for one that does not parse', () => {
    expect(parseQuery(withPaneContext(menu, '', w2), menu.pageKeys).global).toEqual(w2);
    expect(() => withPaneContext(menu, '?from=nope&to=nope', w2)).toThrow(ContractError);
  });
});

describe('withPaneContext with Condition presets (ADR-0083)', () => {
  it('copies the whole Condition and keeps the pane\'s preset key', () => {
    const presetMenu = { pageKeys: ['view'], contextResetKeys: undefined };
    const condition = { maker: ['M'], team: ['T'] };
    const next = withPaneContext(presetMenu, `?${w1}&view=b`, { ...w2, condition });
    const parsed = parseQuery(next, presetMenu.pageKeys);
    expect(parsed.global.condition).toEqual(condition);
    expect(parsed.page).toEqual([['view', 'b']]);
  });
});
