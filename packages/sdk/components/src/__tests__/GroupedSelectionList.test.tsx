import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@ap/kernel';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { GroupedSelectionList } from '../selection';

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
    render(<I18nProvider><Multiple /></I18nProvider>);
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
    render(<I18nProvider><Multiple /></I18nProvider>);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Alpha' }));
    expect(screen.getByRole('checkbox', { name: 'Group 모두 선택' })).toHaveAttribute('aria-checked', 'mixed');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Beta' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Group 모두 선택' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    expect(screen.getByRole('checkbox', { name: 'Alpha' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Beta' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Blocked' })).toBeDisabled();
  });
  it.each(['Group', 'Alpha', 'First description', 'a'])('searches %s', query => {
    render(<I18nProvider><Multiple /></I18nProvider>);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: query } });
    expect(screen.getByRole('checkbox', { name: 'Alpha' })).toBeInTheDocument();
  });
  it('shows the single selection label without presets, bulk controls or counts', async () => {
    function Single() {
      const [value, onChange] = useState<string | null>('a');
      return <GroupedSelectionList mode="single" groups={groups} value={value} onChange={onChange} aria-label="Choices" />;
    }
    render(<I18nProvider><Single /></I18nProvider>);
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
    render(<I18nProvider><Multiple /></I18nProvider>);
    screen.getByRole('checkbox', { name: 'Alpha' }).focus();
    await user.keyboard(' ');
    expect(screen.getByRole('checkbox', { name: 'Alpha' })).toBeChecked();
  });
});
