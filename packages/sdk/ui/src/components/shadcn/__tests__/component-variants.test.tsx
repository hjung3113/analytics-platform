/// <reference types="@testing-library/jest-dom" />
import { render, screen } from '@testing-library/react';
import { Badge } from '../badge.js';
import { Popover, PopoverContent } from '../popover.js';
import { RadioGroup, RadioGroupItem } from '../radio-group.js';

describe('shadcn component variants', () => {
  it('uses a sunken fill, subtle border and matching hover fill for a secondary Badge', () => {
    render(<Badge variant="secondary">식각</Badge>);
    expect(screen.getByText('식각')).toHaveClass(
      'bg-surface-sunken', 'border-border-subtle', 'hover:bg-surface-sunken/80',
    );
  });

  it('applies compact spacing to a RadioGroup', () => {
    render(
      <RadioGroup value="direct" spacing="compact">
        <RadioGroupItem value="direct" />
      </RadioGroup>,
    );
    const group = screen.getByRole('radiogroup');
    expect(group).toHaveClass('gap-1');
    expect(group).not.toHaveClass('gap-2');
  });

  it.each([
    ['compact padding', 'compact', 'p-1'],
    ['zero padding', 'none', 'p-0'],
  ] as const)('applies PopoverContent %s variant', (_name, padding, expectedClass) => {
    render(
      <Popover open>
        <PopoverContent padding={padding}>Options</PopoverContent>
      </Popover>,
    );
    expect(screen.getByRole('dialog')).toHaveClass(expectedClass);
  });

  it('lets a caller padding class replace the PopoverContent default p-4', () => {
    render(
      <Popover open>
        <PopoverContent className="p-3">Options</PopoverContent>
      </Popover>,
    );
    const content = screen.getByRole('dialog');
    expect(content).toHaveClass('p-3');
    expect(content).not.toHaveClass('p-4');
  });
});
