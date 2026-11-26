import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../dropdown-menu.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../select.js';
import { Combobox } from '../combobox.js';

afterEach(cleanup);

// #3142: a highlighted menu row sits on `bg-surface-popover`. `surface-card` resolves to the same white (tokens.css), so a highlight
// painted with it is invisible. Keyboard and pointer highlight use the shared row hover (DESIGN.md: «hover는 공유 row-hover»).
const SAME_AS_POPOVER = /(^|:)bg-surface-(card|popover)$/;
const highlightClasses = (element: Element) => Array.from(element.classList).filter(name => /(^|:)bg-/.test(name) && name !== 'bg-transparent');

describe('highlighted rows are visible on the popover surface (#3142)', () => {
  it('menu items', () => {
    render(<DropdownMenu defaultOpen><DropdownMenuTrigger>Open</DropdownMenuTrigger><DropdownMenuContent>
      <DropdownMenuItem>One</DropdownMenuItem><DropdownMenuItem>Two</DropdownMenuItem>
    </DropdownMenuContent></DropdownMenu>);
    for (const item of screen.getAllByRole('menuitem')) {
      expect(highlightClasses(item).filter(name => SAME_AS_POPOVER.test(name))).toEqual([]);
      expect(item.className).toContain('focus:bg-surface-row-hover');
      // The faint row hover alone is ~1.06:1 on white: keyboard focus adds the inset focus ring, as MultiCombobox's active option does.
      expect(item.className).toContain('focus-visible:ring-focus-ring');
    }
  });

  it('select options', () => {
    render(<Select open defaultValue="a"><SelectTrigger aria-label="Fruit"><SelectValue /></SelectTrigger><SelectContent>
      <SelectItem value="a">Apple</SelectItem><SelectItem value="b">Banana</SelectItem>
    </SelectContent></Select>);
    for (const option of screen.getAllByRole('option')) {
      expect(highlightClasses(option).filter(name => SAME_AS_POPOVER.test(name))).toEqual([]);
      expect(option.className).toContain('focus:bg-surface-row-hover');
      expect(option.className).toContain('focus-visible:ring-focus-ring');
    }
  });

  it('combobox options, including the active one', () => {
    render(<Combobox options={[{ value: 'a', label: 'Apple' }, { value: 'b', label: 'Banana' }]} value={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('combobox'));
    const listbox = screen.getByRole('listbox');
    fireEvent.keyDown(document.activeElement ?? listbox, { key: 'ArrowDown' });
    for (const option of within(listbox).getAllByRole('option')) {
      expect(highlightClasses(option).filter(name => SAME_AS_POPOVER.test(name))).toEqual([]);
    }
    const active = within(listbox).getAllByRole('option').find(option => option.className.includes('ring-2'));
    expect(active?.className).toContain('bg-surface-row-hover');
  });
});
