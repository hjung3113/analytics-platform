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
