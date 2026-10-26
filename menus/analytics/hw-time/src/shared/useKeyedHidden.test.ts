// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useKeyedHidden } from './useKeyedHidden';

afterEach(cleanup);

describe('useKeyedHidden', () => {
  it('keeps the hidden ids for their key and starts empty for another key', () => {
    const { result, rerender } = renderHook(({ key }) => useKeyedHidden(key), { initialProps: { key: 'a' } });
    act(() => { result.current[1](['x']); });
    expect(result.current[0]).toEqual(['x']);
    rerender({ key: 'b' });
    expect(result.current[0]).toEqual([]);
    act(() => { result.current[1](['y']); });
    expect(result.current[0]).toEqual(['y']);
    rerender({ key: 'a' });
    expect(result.current[0]).toEqual([]);
  });
});
