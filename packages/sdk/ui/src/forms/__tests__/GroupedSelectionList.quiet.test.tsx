import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { GroupedSelectionList } from '../GroupedSelectionList';
afterEach(cleanup);
it('keeps the count visible without a live announcement when opted out', () => {
  const onChange = vi.fn();
  const { container } = render(<GroupedSelectionList mode="multiple" aria-label="Choices" announceSelection={false}
    value={[]} onChange={onChange} groups={[{ id: 'g', label: 'Group', items: [{ id: 'a', label: 'Alpha' }] }]} />);
  expect(screen.getByText('선택 0개')).toBeVisible();
  expect(container.querySelector('[role="status"], [aria-live]')).toBeNull();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Alpha' }));
  expect(onChange).toHaveBeenCalledWith(['a']);
});
