import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { GroupedSelectionList, type GroupedSelectionListProps } from '../GroupedSelectionList';

afterEach(cleanup);
const groups = [
  { id: 'g', label: 'Group', items: [
    { id: 'a', label: 'Alpha', description: 'First description' },
    { id: 'b', label: 'Beta' },
    { id: 'c', label: 'Blocked', description: 'Blocked description', disabledReason: 'Session only' },
  ] },
  { id: 's', label: 'Session', items: [{ id: 'd', label: 'Delta', disabledReason: 'Session only' }] },
];
const many = [{ id: 'm', label: 'Many', items: Array.from({ length: 9 }, (_, index) => ({ id: `i${index}`, label: `Item ${index}` })) }];
type MultipleOptions = Partial<Extract<GroupedSelectionListProps, { mode: 'multiple' }>>;
function Multiple({ initial = [], ...options }: MultipleOptions & { initial?: string[] }) {
  const [value, onChange] = useState<string[]>(initial);
  return <GroupedSelectionList mode="multiple" groups={groups} value={value} onChange={onChange} aria-label="Choices"
    presets={[{ id: 'p', label: 'Preset', description: 'Adds Alpha and Beta', itemIds: ['a', 'b', 'c'] }]} {...options} />;
}

describe('GroupedSelectionList opt-in options (#2405)', () => {
  it('folds unavailable rows behind a toggle that names the reason, and unfolds them with the reason as text', () => {
    render(<Multiple hideDisabled messages={{ hiddenItems: count => `Session-only ${count}` }} />);
    expect(screen.queryByRole('checkbox', { name: 'Blocked' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Session' })).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Session-only 2' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('checkbox', { name: 'Blocked' })).toBeDisabled();
    expect(screen.getAllByText('Session only')).toHaveLength(2);
  });
  it('keeps a selected unavailable row in place and counts only folded rows', () => {
    render(<Multiple hideDisabled initial={['c']} />);
    expect(screen.getByRole('checkbox', { name: 'Blocked' })).toBeChecked();
    expect(screen.getByRole('button', { name: '선택할 수 없는 항목 1개' })).toBeInTheDocument();
  });
  it('counts folded rows within the search and does not claim «no results» when only folded rows match', () => {
    render(<Multiple hideDisabled />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'delta' } });
    expect(screen.queryByText('검색 결과 없음')).toBeNull();
    expect(screen.getByRole('button', { name: '선택할 수 없는 항목 1개' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    expect(screen.getByText('검색 결과 없음')).toBeVisible();
    expect(screen.queryByRole('button', { name: /선택할 수 없는 항목/ })).toBeNull();
  });
  it('compact rows keep one tab stop: the ⓘ tip is out of the Tab order and the checkbox carries description and reason', () => {
    render(<Multiple density="compact" />);
    const alpha = screen.getByRole('checkbox', { name: 'Alpha' });
    expect(alpha).toHaveAccessibleDescription('First description');
    expect(screen.getByRole('button', { name: 'Alpha 설명' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('checkbox', { name: 'Blocked' })).toHaveAccessibleDescription('Blocked description Session only');
    expect(screen.getAllByText('Session only', { selector: 'p' })[0]).toBeVisible();
    expect(screen.queryByText('First description', { selector: 'p' })).toBeNull();
  });
  it('compact rows show the description on keyboard focus of the row control and close it with Escape, without changing the selection', async () => {
    const user = userEvent.setup();
    render(<Multiple density="compact" />);
    const alpha = screen.getByRole('checkbox', { name: 'Alpha' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    while (document.activeElement !== alpha) await user.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('First description');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(alpha).toHaveFocus();
    expect(alpha).not.toBeChecked();
    await user.tab();
    expect(screen.getByRole('checkbox', { name: 'Beta' })).toHaveFocus();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
  it('lists the selection as removable chips and folds past six into «+N» without an inner scroll', () => {
    function Chips() {
      const [value, onChange] = useState(many[0]!.items.map(item => item.id));
      return <GroupedSelectionList mode="multiple" groups={many} value={value} onChange={onChange} aria-label="Choices" selectionSummary="chips" />;
    }
    render(<Chips />);
    const chips = screen.getByRole('group', { name: '선택 9개' });
    expect(within(chips).getAllByRole('button', { name: /선택 해제$/ })).toHaveLength(6);
    expect(chips.className).not.toMatch(/overflow|max-h/);
    fireEvent.click(within(chips).getByRole('button', { name: '+3' }));
    expect(within(chips).getAllByRole('button', { name: /선택 해제$/ })).toHaveLength(9);
    fireEvent.click(within(chips).getByRole('button', { name: 'Item 8 선택 해제' }));
    expect(screen.getByRole('checkbox', { name: 'Item 8' })).not.toBeChecked();
    fireEvent.click(within(screen.getByRole('group', { name: '선택 8개' })).getByRole('button', { name: '접기' }));
    expect(screen.getByRole('button', { name: '+2' })).toHaveAttribute('aria-expanded', 'false');
  });
  it('previews every item a preset would add, and says when nothing is left to add', () => {
    render(<Multiple presetPreview />);
    const preset = screen.getByRole('button', { name: 'Preset' });
    expect(preset).toHaveAccessibleDescription('Adds Alpha and Beta +2개 Alpha · Beta');
    fireEvent.click(preset);
    expect(preset).toHaveAccessibleDescription('Adds Alpha and Beta 추가할 항목 없음');
  });
  it('without the options keeps the original rows, header and visible disabled rows', () => {
    render(<Multiple />);
    expect(screen.getByRole('checkbox', { name: 'Blocked' })).toBeDisabled();
    expect(screen.getByText('First description', { selector: 'p' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /설명$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /선택할 수 없는 항목/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Preset' })).toHaveAccessibleDescription('Adds Alpha and Beta');
  });
  it('folds unavailable rows in single mode too', () => {
    render(<GroupedSelectionList mode="single" groups={groups} value={null} onChange={() => {}} aria-label="One" hideDisabled />);
    expect(screen.queryByRole('radio', { name: 'Delta' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '선택할 수 없는 항목 2개' }));
    expect(screen.getByRole('radio', { name: 'Delta' })).toBeDisabled();
  });
});
