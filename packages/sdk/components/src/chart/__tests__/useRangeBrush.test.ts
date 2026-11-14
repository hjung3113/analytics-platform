import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { expect, it, vi } from 'vitest';
import { useRangeBrush } from '../useRangeBrush';

const key = (k: string, shiftKey = true) => ({ key: k, shiftKey, preventDefault: vi.fn() }) as unknown as KeyboardEvent;

it('orders a drag, extends from the range start within the view, and clears once', () => {
  const onChange = vi.fn();
  const { result } = renderHook(() => useRangeBrush({ onChange }));
  act(() => result.current.select(80, 20));
  expect(result.current.range).toEqual([20, 80]);
  let handled = false;
  act(() => { handled = result.current.keyDown(key('ArrowRight'), [0, 100]); });
  expect(handled).toBe(true);
  expect(result.current.range).toEqual([20, 85]);
  expect(result.current.mode).toBe(true);
  // Never past the view end, never shorter than minSpan.
  for (let i = 0; i < 10; i++) act(() => { result.current.keyDown(key('ArrowRight'), [0, 100]); });
  expect(result.current.range).toEqual([20, 100]);
  for (let i = 0; i < 30; i++) act(() => { result.current.keyDown(key('ArrowLeft'), [0, 100]); });
  expect(result.current.range).toEqual([20, 21]);
  act(() => result.current.clear());
  expect(result.current.range).toBeNull();
  expect(result.current.mode).toBe(false);
  const calls = onChange.mock.calls.length;
  act(() => result.current.clear());
  expect(onChange).toHaveBeenCalledTimes(calls);
});

// Review F2: a range whose start the view no longer shows restarts at the view start instead of inverting.
it('restarts at the view start when the range start lies outside the view', () => {
  const onChange = vi.fn();
  const { result } = renderHook(() => useRangeBrush({ defaultValue: [200, 250], onChange }));
  act(() => { result.current.keyDown(key('ArrowRight'), [0, 100]); });
  expect(result.current.range).toEqual([0, 5]);
  expect(onChange).toHaveBeenLastCalledWith([0, 5]);
});

it('leaves keys other than Shift+←/→ to the surface', () => {
  const { result } = renderHook(() => useRangeBrush());
  for (const event of [key('ArrowRight', false), key('ArrowUp'), key('Escape')]) expect(result.current.keyDown(event, [0, 100])).toBe(false);
  expect(result.current.range).toBeNull();
});

it('follows a controlled value and reports changes without keeping its own', () => {
  const onChange = vi.fn();
  const { result, rerender } = renderHook(({ value }) => useRangeBrush({ value, onChange }), { initialProps: { value: [10, 20] as const as readonly [number, number] | null } });
  act(() => result.current.select(30, 40));
  expect(onChange).toHaveBeenLastCalledWith([30, 40]);
  expect(result.current.range).toEqual([10, 20]);
  rerender({ value: null });
  expect(result.current.range).toBeNull();
});
