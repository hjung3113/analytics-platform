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
  it.each(['constructor', 'toString', '__proto__'])('an unrelated patch keeps the reset key when a level is named %s', (name) => {
    const named = { drill: { levels: [{ key: name, label }], resetKeys: ['row'] } };
    const patch = { sort: 'name' };
    expect(drillLevelChanged(named, [[name, 'x']], patch)).toBe(false);
    expect(dropDrillResetKeys(named, [[name, 'x']], patch)).toBe(patch);
  });
  it.each(['constructor', 'toString', '__proto__'])('a real level change clears a reset key named %s as an own entry', (name) => {
    const named = { drill: { levels: [{ key: 'a', label }], resetKeys: [name] } };
    const next = dropDrillResetKeys(named, [['a', 'x']], { a: 'z' });
    expect(Object.keys(next).sort()).toEqual(['a', name].sort());
    expect(Object.entries(next).find(([k]) => k === name)?.[1]).toBeNull();
  });
  it.each(['constructor', 'toString', '__proto__'])('an explicit own value for a reset key named %s wins', (name) => {
    const named = { drill: { levels: [{ key: 'a', label }], resetKeys: [name] } };
    const patch = Object.defineProperty({ a: 'z' } as Record<string, string | null>, name, { value: 'r1', enumerable: true, configurable: true, writable: true });
    const next = dropDrillResetKeys(named, [['a', 'x']], patch);
    expect(Object.entries(next).find(([k]) => k === name)?.[1]).toBe('r1');
  });
  it('a menu without resetKeys drops nothing', () => {
    const patch = { a: 'z' };
    expect(dropDrillResetKeys(bare, [['a', 'x']], patch)).toBe(patch);
  });
});
