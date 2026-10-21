import { act, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { MultiCombobox, type MultiComboboxProps } from '../multi-combobox.js';

const options = [
  { value: 'a', label: 'Alpha', description: 'First item' },
  { value: 'b', label: 'Beta', disabled: true },
  { value: 'c', label: 'Gamma' },
];
const text = {
  label: 'Items', listboxLabel: 'Available items', emptyText: 'No matches',
  selectedSummaryLabel: (n: number) => `Selected items ${n}`,
  moreLabel: 'Load more', clearAllLabel: 'Clear all',
  removeLabel: (label: string) => `Remove ${label}`,
  loadingText: 'Loading items', retryLabel: 'Retry',
};
function Harness({ maxSelected, maxSelectedText, ...props }: Partial<MultiComboboxProps> = {}) {
  const [values, setValues] = useState<readonly string[]>([]);
  const common = { ...text, options, values, onValuesChange: setValues, ...props, label: props.label ?? text.label };
  return maxSelected === undefined
    ? <MultiCombobox {...common} />
    : <MultiCombobox {...common} maxSelected={maxSelected} maxSelectedText={maxSelectedText ?? 'Selection limit'} />;
}
function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Items' }));
  return screen.getByRole('combobox');
}

describe('MultiCombobox', () => {
  it.each(['label', 'aria-labelledby'] as const)('names the dialog with %s and keeps both opening controls aligned across views', naming => {
    const accessibleName = naming === 'label' ? 'Items' : 'External items';
    const namingProps = naming === 'label' ? { label: 'Items' } : { 'aria-labelledby': 'external-items' };
    render(<><span id="external-items">External items</span>
      <MultiCombobox {...text} {...namingProps} options={options} values={['a', 'b', 'c']} onValuesChange={vi.fn()} /></>);
    const trigger = screen.getByRole('button', { name: accessibleName });
    const summaryTrigger = screen.getByRole('button', { name: 'Selected items 3' });
    fireEvent.click(summaryTrigger);
    const dialog = screen.getByRole('dialog', { name: accessibleName });
    expect(dialog.id).not.toBe('');
    for (const button of [trigger, summaryTrigger]) {
      expect(button).toHaveAttribute('aria-haspopup', 'dialog');
      expect(button).toHaveAttribute('aria-controls', dialog.id);
    }
    expect(within(dialog).getByRole('region', { name: 'Selected items 3' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Available items' }));
    expect(screen.getByRole('dialog', { name: accessibleName })).toBe(dialog);
    for (const button of [trigger, summaryTrigger]) {
      expect(button).toHaveAttribute('aria-controls', dialog.id);
      expect(button).toHaveAttribute('aria-expanded', 'true');
    }
    const input = within(dialog).getByRole('combobox', { name: accessibleName });
    expect(input).toHaveAttribute('aria-controls', within(dialog).getByRole('listbox').id);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', within(dialog).getByRole('option', { name: /Alpha/ }).id);
  });

  it('keeps focus on the next control after outside dismissal and restores the trigger on Escape', async () => {
    render(<><Harness /><input aria-label="Next field" /></>);
    open();
    const next = screen.getByRole('textbox', { name: 'Next field' });
    act(() => next.focus());
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    // FocusScope schedules close autofocus after unmount.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    expect(next).toHaveFocus();
    const input = open();
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Items' })).toHaveFocus());
  });

  it('avoids linear selection scans when rendering and navigating a large selected page', () => {
    const page = Array.from({ length: 128 }, (_, index) => ({ value: `item-${index}`, label: `Item ${index}` }));
    const values = page.map(option => option.value);
    const includes = vi.spyOn(values, 'includes');
    try {
      render(<MultiCombobox {...text} options={page} values={values} onValuesChange={vi.fn()} />);
      const input = open();
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(screen.getAllByRole('option', { selected: true })).toHaveLength(128);
      expect(includes).not.toHaveBeenCalled();
    } finally {
      includes.mockRestore();
    }
  });

  it('adds and removes controlled values without closing the popover', () => {
    render(<Harness />);
    const input = open();
    fireEvent.click(screen.getByRole('option', { name: /Alpha/ }));
    expect(screen.getByRole('option', { name: /Alpha/ })).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Alpha' }));
    expect(screen.getByRole('option', { name: /Alpha/ })).toHaveAttribute('aria-selected', 'false');
  });
  it('keeps off-page selections and shows every selected value independently of search', () => {
    const change = vi.fn();
    const props = { ...text, values: ['a', 'c', 'z'], onValuesChange: change, getLabel: (value: string) => value === 'z' ? 'Zeta' : 'Alpha saved' };
    const { rerender } = render(<MultiCombobox {...props} options={options} />);
    rerender(<MultiCombobox {...props} options={[options[2]!]} search="unmatched" />);
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Remove Alpha saved' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Selected items 3' }));
    const summary = screen.getByRole('region', { name: 'Selected items 3' });
    expect(within(summary).getByText('Zeta')).toBeInTheDocument();
    expect(within(summary).getByText('Gamma')).toBeInTheDocument();
    fireEvent.click(within(summary).getByRole('button', { name: 'Remove Zeta' }));
    expect(change).toHaveBeenLastCalledWith(['a', 'c']);
    fireEvent.click(within(summary).getByRole('button', { name: 'Clear all' }));
    expect(change).toHaveBeenLastCalledWith([]);
    fireEvent.click(screen.getByRole('button', { name: 'Available items' }));
    expect(screen.getByRole('option', { name: 'Gamma' })).toBeInTheDocument();
  });
  it('moves and scrolls active options, toggles with Enter/Space, removes with Backspace and returns focus on Escape', async () => {
    const scroll = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    try {
      render(<Harness />);
      const trigger = screen.getByRole('button', { name: 'Items' });
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });
      const input = screen.getByRole('combobox');
      const alpha = screen.getByRole('option', { name: /Alpha/ });
      const gamma = screen.getByRole('option', { name: 'Gamma' });
      expect(input).toHaveAttribute('aria-activedescendant', alpha.id);
      expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(input).toHaveAttribute('aria-activedescendant', gamma.id);
      expect(gamma).toHaveAttribute('aria-selected', 'false');
      expect(scroll.mock.instances.at(-1)).toBe(gamma);
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(gamma).toHaveAttribute('aria-selected', 'true');
      expect(input).toHaveFocus();
      fireEvent.keyDown(input, { key: ' ' });
      expect(gamma).toHaveAttribute('aria-selected', 'false');
      fireEvent.keyDown(input, { key: 'Home' });
      expect(input).toHaveAttribute('aria-activedescendant', alpha.id);
      fireEvent.keyDown(input, { key: 'End' });
      expect(input).toHaveAttribute('aria-activedescendant', gamma.id);
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      expect(input).toHaveAttribute('aria-activedescendant', alpha.id);
      fireEvent.keyDown(input, { key: 'Enter' });
      fireEvent.keyDown(input, { key: 'Backspace' });
      expect(alpha).toHaveAttribute('aria-selected', 'false');
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      await waitFor(() => expect(trigger).toHaveFocus());
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });

  it('keeps search focus while requesting and appending another page', () => {
    const load = vi.fn();
    const props = { ...text, options: [options[0]!], values: ['a'], onValuesChange: vi.fn(), hasMore: true, onLoadMore: load };
    const { rerender } = render(<MultiCombobox {...props} />);
    const input = open();
    const more = screen.getByRole('button', { name: 'Load more' });
    more.focus();
    fireEvent.click(more);
    expect(load).toHaveBeenCalledTimes(1);
    expect(input).toHaveFocus();
    rerender(<MultiCombobox {...props} loading />);
    expect(screen.getByRole('button', { name: 'Load more' })).toBeDisabled();
    expect(input).toHaveFocus();
    rerender(<MultiCombobox {...props} options={options} hasMore={false} />);
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(screen.getByRole('option', { name: /Alpha/ })).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveFocus();
  });

  it.each(['loading', 'error', 'empty'] as const)('shows the caller-supplied %s state', state => {
    const retry = vi.fn();
    render(<Harness options={[]} loading={state === 'loading'} error={state === 'error' ? 'Could not load' : undefined} onRetry={retry} />);
    open();
    if (state === 'loading') {
      expect(screen.getByRole('status')).toHaveTextContent('Loading items');
      expect(screen.getByRole('listbox')).toHaveAttribute('aria-busy', 'true');
    } else if (state === 'error') {
      expect(screen.getByRole('alert')).toHaveTextContent('Could not load');
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(retry).toHaveBeenCalledTimes(1);
    } else expect(screen.getByText('No matches')).toBeInTheDocument();
    if (state !== 'empty') expect(screen.queryByText('No matches')).not.toBeInTheDocument();
  });

  it('locally filters by label and preserves selection on a nonempty-search Backspace', () => {
    render(<Harness values={['a']} onValuesChange={vi.fn()} />);
    const input = open();
    fireEvent.change(input, { target: { value: 'gAm' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: 'Gamma' })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(screen.getByRole('button', { name: 'Remove Alpha' })).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'missing' } });
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });

  it('reports controlled search without applying a second local filter', () => {
    const changeSearch = vi.fn();
    const { rerender } = render(<Harness search="not a label" onSearchChange={changeSearch} />);
    const input = open();
    expect(screen.getAllByRole('option')).toHaveLength(3);
    fireEvent.change(input, { target: { value: 'next' } });
    expect(changeSearch).toHaveBeenLastCalledWith('next');
    expect(input).toHaveValue('not a label');
    rerender(<Harness search="next" onSearchChange={changeSearch} options={[options[2]!]} />);
    expect(input).toHaveValue('next');
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });

  it('exposes caller labels, error wiring and multiselection semantics', () => {
    render(<><span id="items-label">External label</span><p id="items-help">Help</p>
      <Harness label={undefined} aria-labelledby="items-label" aria-invalid="true" aria-describedby="items-help" /></>);
    const trigger = screen.getByRole('button', { name: 'External label' });
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    expect(trigger).toHaveAttribute('aria-describedby', 'items-help');
    fireEvent.click(trigger);
    const input = screen.getByRole('combobox', { name: 'External label' });
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', screen.getByRole('listbox').id);
    expect(screen.getByRole('listbox', { name: 'Available items' })).toHaveAttribute('aria-multiselectable', 'true');
    expect(screen.getByRole('option', { name: 'Beta' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('blocks disabled interaction and explains the selection limit while allowing removal', () => {
    const change = vi.fn();
    const { rerender } = render(<Harness disabled onValuesChange={change} />);
    expect(screen.getByRole('button', { name: 'Items' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Items' }));
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    rerender(<Harness values={['a']} maxSelected={1} maxSelectedText="Choose at most one" onValuesChange={change} />);
    open();
    expect(screen.getByRole('note')).toHaveTextContent('Choose at most one');
    fireEvent.click(screen.getByRole('option', { name: 'Gamma' }));
    fireEvent.click(screen.getByRole('option', { name: 'Beta' }));
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('option', { name: /Alpha/ }));
    expect(change).toHaveBeenCalledWith([]);
  });

});
