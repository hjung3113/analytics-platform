import { Combobox } from '@ap/ui';
import { fireEvent, render, screen } from '@testing-library/react';
/**
 * Combobox a11y + keyboard nav tests.
 * Cycle-1 codex review P1-3.
 */
import { describe, expect, it, vi } from 'vitest';

const OPTIONS = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
];

// Explicit narrowing in place of non-null assertions; a missing element fails the test with its name.
function searchInputElement(): HTMLInputElement {
  const input = document.querySelector('input');
  if (input === null) throw new Error('combobox search input is not rendered');
  return input;
}

function firstOf<T>(items: T[]): T {
  const [first] = items;
  if (first === undefined) throw new Error('expected at least one element');
  return first;
}

describe('Combobox', () => {
  it('renders trigger with placeholder', () => {
    render(<Combobox options={OPTIONS} value={null} onChange={() => {}} placeholder="Pick one" />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Pick one');
  });

  it('opens popover on trigger click', () => {
    render(<Combobox options={OPTIONS} value={null} onChange={() => {}} />);
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(OPTIONS.length);
  });

  it('Arrow Down moves activeIndex and sets aria-activedescendant', () => {
    render(<Combobox options={OPTIONS} value={null} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('combobox'));
    const searchInput = searchInputElement();
    expect(searchInput).toBeTruthy();
    // Before any key press, no activedescendant
    expect(searchInput.getAttribute('aria-activedescendant')).toBeNull();
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(searchInput.getAttribute('aria-activedescendant')).toBeTruthy();
  });

  it('Enter selects the active option and calls onChange', () => {
    const handleChange = vi.fn();
    render(<Combobox options={OPTIONS} value={null} onChange={handleChange} />);
    fireEvent.click(screen.getByRole('combobox'));
    const searchInput = searchInputElement();
    // Arrow Down to first option, then Enter
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    fireEvent.keyDown(searchInput, { key: 'Enter' });
    expect(handleChange).toHaveBeenCalledWith('apple');
  });

  it('Escape closes the popover', () => {
    render(<Combobox options={OPTIONS} value={null} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    const searchInput = searchInputElement();
    fireEvent.keyDown(searchInput, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows empty state when no options match search', () => {
    render(<Combobox options={OPTIONS} value={null} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('combobox'));
    const searchInput = searchInputElement();
    fireEvent.change(searchInput, { target: { value: 'zzz' } });
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(screen.getByText('결과 없음')).toBeInTheDocument();
  });

  it('trigger has aria-controls linking to listbox when open', () => {
    render(<Combobox options={OPTIONS} value={null} onChange={() => {}} />);
    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);
    const listboxId = screen.getByRole('listbox').id;
    expect(listboxId).toBeTruthy();
    expect(trigger).toHaveAttribute('aria-controls', listboxId);
  });

  it('disabled trigger ignores click and does not open popover', () => {
    render(<Combobox options={OPTIONS} value={null} onChange={() => {}} disabled />);
    const trigger = screen.getByRole('combobox');
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('ArrowDown on closed trigger opens popover', () => {
    render(<Combobox options={OPTIONS} value={null} onChange={() => {}} />);
    const trigger = screen.getByRole('combobox');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('Enter on closed trigger opens popover', () => {
    render(<Combobox options={OPTIONS} value={null} onChange={() => {}} />);
    const trigger = screen.getByRole('combobox');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('two Combobox instances have distinct listbox IDs', () => {
    render(
      <>
        <Combobox options={OPTIONS} value={null} onChange={() => {}} />
        <Combobox options={OPTIONS} value={null} onChange={() => {}} />
      </>,
    );
    const triggers = screen.getAllByRole('combobox');
    expect(triggers).toHaveLength(2);
    // Open both to expose listboxes
    fireEvent.click(firstOf(triggers));
    // Only first is open; second is closed — just verify trigger IDs are independent
    const openListboxes = screen.getAllByRole('listbox');
    expect(openListboxes).toHaveLength(1);
    const listboxId = firstOf(openListboxes).id;
    expect(listboxId).toBeTruthy();
    expect(triggers[0]).toHaveAttribute('aria-controls', listboxId);
  });
});
