import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { GroupedSelectionList } from '../GroupedSelectionList';

afterEach(cleanup);
const groups = [{ id: 'g', label: 'Group', items: [
  { id: 'a', label: 'Alpha', description: 'First description' },
  { id: 'b', label: 'Beta' },
  { id: 'c', label: 'Blocked', disabledReason: 'Unavailable' },
] }];
function Multiple() {
  const [value, onChange] = useState<string[]>([]);
  return <GroupedSelectionList mode="multiple" groups={groups} value={value} onChange={onChange}
    presets={[{ id: 'p', label: 'Preset', description: 'Adds Alpha', itemIds: ['a', 'c'] }]} aria-label="Choices" />;
}
describe('GroupedSelectionList', () => {
  it('adds presets without replacing selection, describes them, and clears all', () => {
    render(<Multiple />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Beta' }));
    expect(screen.getByRole('button', { name: 'Preset' })).toHaveAccessibleDescription('Adds Alpha');
    fireEvent.click(screen.getByRole('button', { name: 'Preset' }));
    expect(screen.getByRole('checkbox', { name: 'Alpha' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Beta' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Blocked' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '모두 해제' }));
    expect(screen.getByRole('button', { name: '모두 해제' })).toBeDisabled();
  });
  it('uses mixed state and toggles only enabled filtered group members', () => {
    render(<Multiple />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Alpha' }));
    expect(screen.getByRole('checkbox', { name: 'Group 모두 선택' })).toHaveAttribute('aria-checked', 'mixed');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Beta' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Group 모두 선택' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    expect(screen.getByRole('checkbox', { name: 'Alpha' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Beta' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Blocked' })).toBeDisabled();
  });
  // Each query matches exactly one field of one row, so a list that ignored the search would keep the other rows (#1842 review C2).
  const searchGroups = [
    { id: 'fruit', label: 'Fruit', items: [{ id: 'apple-id', label: 'Apple', description: 'Red round' }, { id: 'banana', label: 'Banana', description: 'Yellow' }] },
    { id: 'tools', label: 'Tools', items: [{ id: 'hammer', label: 'Hammer', description: 'Hits nails' }] },
  ];
  function SearchMultiple() {
    const [value, onChange] = useState<string[]>([]);
    return <GroupedSelectionList mode="multiple" groups={searchGroups} value={value} onChange={onChange} aria-label="Things" />;
  }
  const visibleRows = () => screen.queryAllByRole('checkbox').map(box => box.getAttribute('aria-label') ?? box.textContent ?? '').filter(Boolean);
  it.each([
    ['group label', 'Tools', ['Hammer'], ['Fruit']],
    ['item label', 'Banana', ['Banana'], ['Tools']],
    ['description', 'Hits nails', ['Hammer'], ['Fruit']],
    ['id', 'apple-id', ['Apple'], ['Tools']],
  ])('searches by %s: only matching rows and their groups stay', (_field, query, shown, hiddenGroups) => {
    render(<SearchMultiple />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: query } });
    for (const label of ['Apple', 'Banana', 'Hammer']) {
      if (shown.includes(label)) expect(screen.getByRole('checkbox', { name: label })).toBeInTheDocument();
      else expect(screen.queryByRole('checkbox', { name: label })).toBeNull();
    }
    for (const group of hiddenGroups) expect(screen.queryByRole('heading', { name: group })).toBeNull();
    expect(visibleRows().length).toBeGreaterThan(0);
  });
  it('shows the empty result and restores every row when the search is cleared', () => {
    render(<SearchMultiple />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no such thing' } });
    expect(screen.getByText('검색 결과 없음')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Apple' })).toBeNull();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    for (const label of ['Apple', 'Banana', 'Hammer']) expect(screen.getByRole('checkbox', { name: label })).toBeInTheDocument();
  });
  it('group «all» under a search selects only the visible rows; a hidden enabled row stays unselected', () => {
    render(<SearchMultiple />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Banana' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Fruit 모두 선택' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    expect(screen.getByRole('checkbox', { name: 'Banana' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Apple' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Fruit 모두 선택' })).toHaveAttribute('aria-checked', 'mixed');
  });
  it('shows the single selection label without presets, bulk controls or counts', async () => {
    function Single() {
      const [value, onChange] = useState<string | null>('a');
      return <GroupedSelectionList mode="single" groups={groups} value={value} onChange={onChange} aria-label="Choices" />;
    }
    render(<Single />);
    expect(screen.getByText('선택: Alpha')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '모두 해제' })).not.toBeInTheDocument();
    screen.getByRole('radio', { name: 'Alpha' }).focus();
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Alpha' }), { key: 'ArrowDown' });
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Beta' })).toBeChecked());
    expect(screen.getByRole('radio', { name: 'Blocked' })).toBeDisabled();
  });
  it('uses checkbox keyboard interaction', async () => {
    const user = userEvent.setup();
    render(<Multiple />);
    screen.getByRole('checkbox', { name: 'Alpha' }).focus();
    await user.keyboard(' ');
    expect(screen.getByRole('checkbox', { name: 'Alpha' })).toBeChecked();
  });
});
