import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SearchInput } from '../SearchInput';
afterEach(cleanup);
it('renders toolbar search with an explicit name and one clear control', () => {
  const change = vi.fn();
  render(<SearchInput size="toolbar" aria-label="Find nodes" clearLabel="Clear search" placeholder="Search" value="needle" onValueChange={change} />);
  const input = screen.getByRole('searchbox', { name: 'Find nodes' });
  expect(input.className).toContain('h-8');
  expect(input.className).toContain('[&::-webkit-search-cancel-button]:appearance-none');
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
  expect(change).toHaveBeenCalledWith('');
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(change).toHaveBeenCalledTimes(2);
});

it('takes an optional input ref and a key handler that runs first; preventDefault skips the built-in Escape clear', () => {
  const change = vi.fn();
  const ref = { current: null as HTMLInputElement | null };
  const keys = vi.fn((event: { key: string; preventDefault(): void }) => { if (event.key === 'Escape') event.preventDefault(); });
  render(<SearchInput size="toolbar" aria-label="Find nodes" value="needle" onValueChange={change} inputRef={ref} onKeyDown={keys} />);
  const input = screen.getByRole('searchbox', { name: 'Find nodes' });
  expect(ref.current).toBe(input);
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(keys).toHaveBeenCalledTimes(1);
  expect(change).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  expect(keys).toHaveBeenCalledTimes(2);
});
