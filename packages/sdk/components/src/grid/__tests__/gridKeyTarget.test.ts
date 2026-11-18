import { describe, expect, it } from 'vitest';
import { gridKeyTarget } from '../gridKeyTarget';

const bounds = { rows: 50, columns: 4 };
const at = { row: 10, column: 1 };

describe('gridKeyTarget (#2549)', () => {
  it.each([
    [{ key: 'ArrowLeft' }, { row: 10, column: 0 }],
    [{ key: 'ArrowRight' }, { row: 10, column: 2 }],
    [{ key: 'ArrowUp' }, { row: 9, column: 1 }],
    [{ key: 'ArrowDown' }, { row: 11, column: 1 }],
    [{ key: 'Home' }, { row: 10, column: 0 }],
    [{ key: 'End' }, { row: 10, column: 3 }],
    [{ key: 'Home', ctrlKey: true }, { row: 0, column: 0 }],
    [{ key: 'End', ctrlKey: true }, { row: 49, column: 3 }],
    [{ key: 'PageUp' }, { row: 2, column: 1 }],
    [{ key: 'PageDown' }, { row: 18, column: 1 }],
  ])('%o moves to %o', (key, target) => {
    expect(gridKeyTarget(key, at, bounds, 8)).toEqual(target);
  });
  it('clamps to the grid and reports a grid key that cannot move as stay', () => {
    expect(gridKeyTarget({ key: 'PageUp' }, { row: 3, column: 0 }, bounds, 8)).toEqual({ row: 0, column: 0 });
    expect(gridKeyTarget({ key: 'PageDown' }, { row: 45, column: 0 }, bounds, 8)).toEqual({ row: 49, column: 0 });
    expect(gridKeyTarget({ key: 'ArrowUp' }, { row: 0, column: 0 }, bounds, 8)).toBe('stay');
    expect(gridKeyTarget({ key: 'End' }, { row: 4, column: 3 }, bounds, 8)).toBe('stay');
  });
  it('leaves other keys and modified arrows to the caller', () => {
    expect(gridKeyTarget({ key: 'Enter' }, at, bounds, 8)).toBeNull();
    expect(gridKeyTarget({ key: 'ArrowDown', ctrlKey: true }, at, bounds, 8)).toBeNull();
    expect(gridKeyTarget({ key: 'ArrowDown', shiftKey: true }, at, bounds, 8)).toBeNull();
    expect(gridKeyTarget({ key: 'Home', metaKey: true }, at, bounds, 8)).toBeNull();
    expect(gridKeyTarget({ key: 'ArrowDown' }, at, { rows: 0, columns: 4 }, 8)).toBeNull();
  });
});
