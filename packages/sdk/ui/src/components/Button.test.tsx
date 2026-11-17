import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Button } from './Button';

afterEach(cleanup);

it('rejects asChild with loading in the Vite development environment', () => {
  expect(() => render(<Button asChild loading><span>Save</span></Button>)).toThrow(/incompatible/);
});

// #1942: jsdom cannot compute :hover, so the class string is what is pinned — the hover background must differ from the rest background.
it.each([
  ['secondary', 'bg-surface-raised'],
  ['outline', 'bg-transparent'],
  ['ghost', null],
] as const)('%s hover background differs from its rest background', (variant, rest) => {
  const { getByRole } = render(<Button variant={variant}>x</Button>);
  const classes = getByRole('button').className.split(/\s+/);
  const hover = classes.find(c => c.startsWith('hover:bg-'));
  expect(hover).toBe('hover:bg-surface-row-hover');
  if (rest) expect(hover!.replace('hover:', '')).not.toBe(rest);
});

// Whole-page canvas shells must not turn controls on cards or floating content transparent.
it('limits secondary transparency to canvas bands rather than whole-page shells', () => {
  const { getByRole } = render(<Button variant="secondary">Save</Button>);
  expect(getByRole('button')).toHaveClass('bg-surface-raised', 'in-[.bg-surface-canvas:not([data-shell])]:bg-transparent');
  expect(getByRole('button')).not.toHaveClass('in-[.bg-surface-canvas]:bg-transparent');
});

it('does not add the canvas-band override to primary buttons', () => {
  const { getByRole } = render(<Button>Save</Button>);
  expect(getByRole('button')).not.toHaveClass('in-[.bg-surface-canvas:not([data-shell])]:bg-transparent');
});
