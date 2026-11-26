import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SearchInput } from '../SearchInput';

afterEach(cleanup);

// #3142: the clear button unmounts once the value is empty; without moving focus to the box the keyboard user lands on <body>.
it('returns focus to the box after clearing, also with a caller input ref', () => {
  const callerRef = { current: null as HTMLInputElement | null };
  function Box() {
    const [value, setValue] = useState('원본');
    return <SearchInput size="toolbar" aria-label="패널 검색" clearLabel="지우기" value={value} onValueChange={setValue} inputRef={callerRef} />;
  }
  render(<Box />);
  const input = screen.getByRole('searchbox', { name: '패널 검색' });
  const clear = screen.getByRole('button', { name: '지우기' });
  clear.focus();
  fireEvent.click(clear);
  expect(input).toHaveValue('');
  expect(screen.queryByRole('button', { name: '지우기' })).toBeNull();
  expect(input).toHaveFocus();
  expect(callerRef.current).toBe(input);
});

it('passes the box to a function ref and keeps its React 19 cleanup', () => {
  const calls: (HTMLInputElement | null)[] = [];
  const cleanup = vi.fn();
  const withCleanup = vi.fn((element: HTMLInputElement | null) => { calls.push(element); return cleanup; });
  const plain = vi.fn();
  const { unmount } = render(<><SearchInput size="toolbar" aria-label="첫째" value="a" onValueChange={() => {}} inputRef={withCleanup} />
    <SearchInput size="toolbar" aria-label="둘째" value="b" onValueChange={() => {}} inputRef={plain} /></>);
  expect(calls).toEqual([screen.getByRole('searchbox', { name: '첫째' })]);
  expect(plain).toHaveBeenLastCalledWith(screen.getByRole('searchbox', { name: '둘째' }));
  unmount();
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(calls).toHaveLength(1);
  expect(plain).toHaveBeenLastCalledWith(null);
});
