import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ActiveFilterBar, DatePicker, DetailPanelSectionNav, FieldLabel, ListFilterButton, ListSortButton, ListTabs, SearchInput } from '../index';

it('accepts caller copy across public list and field primitives (#2028 SHE-21)', () => {
  render(<>
    <SearchInput size="toolbar" value="abc" onValueChange={() => {}} messages={{ placeholder: 'Search', clear: 'Erase', disabled: 'Unavailable' }} />
    <FieldLabel tip="Context" messages={{ help: tip => `Help: ${tip}` }}>Field</FieldLabel>
    <ListFilterButton categories={[]} values={{}} onChange={() => {}} messages={{ filter: 'Filter', reset: 'Reset filters' }} />
    <ListSortButton options={[]} value="a" defaultValue="a" onChange={() => {}} messages={{ sort: 'Sort' }} />
    <ActiveFilterBar items={[{ key: 'a', label: 'A', onRemove: () => {} }]} onClearAll={() => {}} messages={{ label: 'Active filters', remove: label => `Remove ${label}`, reset: 'Clear filters' }} />
    <ListTabs tabs={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} maxVisible={1} messages={{ more: 'More tabs' }} />
    <DetailPanelSectionNav sections={[{ id: 'a', label: 'A', overflow: true }]} messages={{ more: 'More sections' }} />
    <DatePicker value="2026-11-14" onChange={vi.fn()} locale="en-US" messages={{ open: 'Open calendar', clear: 'Clear date', previous: 'Previous month', next: 'Next month' }} />
  </>);
  expect(screen.getByPlaceholderText('Search')).toBeInTheDocument();
  for (const name of ['Erase', 'Help: Context', 'Filter', 'Sort', 'Remove A', 'Clear filters', 'Open calendar']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /More sections/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /More tabs/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }));
  expect(screen.getByText('November 2026')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'November 14, 2026' })).toBeInTheDocument();
});

it('accepts translated rich action labels and inserted details summary (#2028 SHE-21)', async () => {
  const { actionsForSurface } = await import('../rich-content/editor-actions');
  const actions = actionsForSurface('voc-description', { label: label => `EN ${label}`, detailsSummary: 'More details' });
  expect(actions[0].label).toMatch(/^EN /);
  const insertContent = vi.fn(() => ({ run: vi.fn() }));
  const editor = { chain: () => ({ focus: () => ({ insertContent }) }) };
  actions.find(action => action.capability === 'details')!.run(editor as never);
  expect(insertContent).toHaveBeenCalledWith(expect.objectContaining({ content: expect.arrayContaining([expect.objectContaining({ type: 'detailsSummary', content: [{ type: 'text', text: 'More details' }] })]) }));
});
