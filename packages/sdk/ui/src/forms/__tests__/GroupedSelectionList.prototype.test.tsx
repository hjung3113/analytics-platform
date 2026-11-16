import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { GroupedSelectionList, type GroupedSelectionListProps } from '../GroupedSelectionList';

afterEach(cleanup);
const groups = [
  { id: 'first', label: 'First', items: [{ id: 'a', label: 'Alpha', description: 'Alpha explanation' }, { id: 'blocked', label: 'Blocked', disabledReason: 'Session only' }] },
  { id: 'second', label: 'Second', items: [{ id: 'b', label: 'Beta' }] },
];
function Picker({ layout = 'stacked' }: { layout?: GroupedSelectionListProps['layout'] }) {
  const [value, onChange] = useState(['a']);
  return <GroupedSelectionList mode="multiple" aria-label="Choices" groups={groups} value={value} onChange={onChange}
    density="compact" hideDisabled selectionSummary="chips" presetPreview layout={layout}
    presets={[{ id: 'both', label: 'Both', description: 'Add available choices', itemIds: ['a', 'b', 'blocked'] }]} />;
}
describe('permission picker prototypes', () => {
  it('folds disabled rows without losing their searchable explanation', () => {
    render(<Picker />);
    expect(screen.queryByRole('checkbox', { name: 'Blocked' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '숨긴 1개(선택 불가)' }));
    expect(screen.getByRole('checkbox', { name: 'Blocked' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Blocked' })).toHaveAccessibleDescription('Session only');
  });
  it('removes chips independently of search and keeps compact descriptions accessible', () => {
    render(<Picker />);
    expect(screen.getByRole('checkbox', { name: 'Alpha' })).toHaveAccessibleDescription('Alpha explanation');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Beta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Alpha 선택 해제' }));
    expect(screen.getByRole('status')).toHaveTextContent('선택 0개');
  });
  it('previews only enabled additions under each preset and applies additively', () => {
    render(<Picker />);
    const preview = screen.getByRole('button', { name: 'Both' }).parentElement!;
    expect(within(preview).getByText('추가할 항목: Beta')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Both' }));
    expect(screen.getByRole('checkbox', { name: 'Alpha' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Beta' })).toBeChecked();
    expect(within(preview).getByText('모두 선택됨')).toBeVisible();
  });
  it('uses container columns only when explicitly requested', () => {
    render(<Picker layout="columns" />);
    expect(screen.getByRole('group', { name: 'Choices' })).toHaveClass('@min-sm:grid-cols-2');
  });
  it('switches category panes, exposes counts and supports keyboard switches', async () => {
    const user = userEvent.setup();
    render(<Picker layout="category-pane" />);
    expect(screen.getByRole('button', { name: 'First 1/1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('switch', { name: 'Beta' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Second 0/1' }));
    const row = screen.getByRole('switch', { name: 'Beta' });
    row.focus();
    await user.keyboard(' ');
    expect(row).toBeChecked();
    expect(screen.getByRole('button', { name: 'Second 1/1' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Alpha' } });
    expect(screen.getByRole('switch', { name: 'Alpha' })).toBeVisible();
  });
});
