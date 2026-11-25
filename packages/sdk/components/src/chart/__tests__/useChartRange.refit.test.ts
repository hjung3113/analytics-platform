import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useChartRange } from '../useChartRange';

// #2742 C8: a ranked category axis keeps a still-valid draft across a refit; every other refit still clears it.
it('keeps the draft on a refit with keepDraft and clears it otherwise', () => {
  const { result } = renderHook(() => useChartRange());
  act(() => result.current.actions.setDraft({ from: 'b', to: 'c' }));
  act(() => result.current.actions.refit({ from: 'a', to: 'b' }, null, null, true));
  expect(result.current.state.rangeDraft).toEqual({ from: 'b', to: 'c' });
  act(() => result.current.actions.refit(null, null, null));
  expect(result.current.state.rangeDraft).toBeNull();
});
