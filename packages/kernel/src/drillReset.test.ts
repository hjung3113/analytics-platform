import { describe, expect, it } from 'vitest';
import { dropDrillResetKeys, drillLevelChanged } from './drillReset';

const label = { ko: '단계', en: 'Step' };
const menu = { drill: { levels: [{ key: 'a', label }, { key: 'b', label }], resetKeys: ['row'] } };
const bare = { drill: { levels: menu.drill.levels } };

type Case = [name: string, current: [string, string | null][], patch: Record<string, string | null>, dropped: boolean];

const cases: Case[] = [
  ['enter-shaped: new step, later levels cleared', [['a', 'x']], { b: 'y' }, true],
  ['enter-shaped from the summary', [], { a: 'x', b: null }, true],
  ['goTo-shaped: nulls the deeper levels', [['a', 'x'], ['b', 'y']], { b: null }, true],
  ['sibling switch on the same level', [['a', 'x']], { a: 'z', b: null }, true],
  ['direct level patch', [['a', 'x']], { a: 'z' }, true],
  ['no-op level patch', [['a', 'x']], { a: 'x' }, false],
  ['re-entering the same step', [['a', 'x'], ['b', 'y']], { b: 'y' }, false],
  ['goTo to the current depth', [['a', 'x']], { b: null }, false],
  ['empty string equals absent', [], { a: '' }, false],
  ['empty string current equals null patch', [['a', '']], { a: null }, false],
  ['patch without a level key', [['a', 'x']], { sort: 'asc' }, false],
];

describe('drillLevelChanged', () => {
  it.each(cases)('%s', (_name, current, patch, changed) => {
    expect(drillLevelChanged(menu, current, patch)).toBe(changed);
  });
  it('a menu without drill reports no change', () => {
    expect(drillLevelChanged({}, [], { a: 'x' })).toBe(false);
    expect(drillLevelChanged(null, [], { a: 'x' })).toBe(false);
  });
});

describe('dropDrillResetKeys', () => {
  it.each(cases)('%s', (_name, current, patch, dropped) => {
    expect(dropDrillResetKeys(menu, current, patch)).toEqual(dropped ? { ...patch, row: null } : patch);
  });
  it('a reset key the patch sets explicitly keeps the patch value', () => {
    expect(dropDrillResetKeys(menu, [['a', 'x']], { a: 'z', row: 'r1' })).toEqual({ a: 'z', row: 'r1' });
  });
  it('a menu without resetKeys drops nothing', () => {
    const patch = { a: 'z' };
    expect(dropDrillResetKeys(bare, [['a', 'x']], patch)).toBe(patch);
  });
});
