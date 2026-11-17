import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { GroupedSelectionList } from './GroupedSelectionList';

it('reports the applied preset after changing selection, without reporting manual toggles', () => {
  const events: string[] = [];
  const onApply = vi.fn(() => events.push('preset'));
  render(<GroupedSelectionList mode="multiple" aria-label="Permissions" value={[]} onChange={() => events.push('selection')} groups={[{ id: 'a', label: 'A', items: [{ id: 'read', label: 'Read' }] }]} presets={[{ id: 'one', label: 'Preset', description: 'Read permissions', itemIds: ['read'], onApply }]} />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Read' }));
  expect(onApply).not.toHaveBeenCalled();
  events.length = 0;
  fireEvent.click(screen.getByRole('button', { name: 'Preset' }));
  expect(events).toEqual(['selection', 'preset']);
});
