import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
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
