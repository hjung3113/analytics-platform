import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  expect(getByRole('button')).toHaveClass('bg-surface-raised', 'on-canvas-band:bg-transparent');
  expect(getByRole('button')).not.toHaveClass('in-[.bg-surface-canvas]:bg-transparent');
});

// #2456 review C1: the rich editor wrapper paints canvas but is not a band; its floating selection toolbar sits on a popover.
it('treats a page band and the editor toolbar as bands but not the rich editor wrapper', () => {
  const { getByRole } = render(<Button variant="secondary">Bold</Button>);
  expect(getByRole('button')).toHaveClass('on-canvas-band:bg-transparent');
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../styles/compat.css'), 'utf8');
  const band = css.match(/@custom-variant on-canvas-band \(&:where\((.+) \*\)\);/)![1];
  const nearestBand = (html: string) => {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host.querySelector('button')!.closest(band);
  };
  expect(nearestBand('<div class="rich-editor bg-surface-canvas"><div class="bg-surface-popover"><button>B</button></div></div>')).toBeNull();
  expect(nearestBand('<div class="rich-editor bg-surface-canvas"><div class="bg-surface-canvas"><button>B</button></div></div>')).not.toBeNull();
  expect(nearestBand('<div data-shell class="bg-surface-canvas"><section class="bg-surface-card"><button>B</button></section></div>')).toBeNull();
  expect(nearestBand('<div data-shell class="bg-surface-canvas"><header class="bg-surface-canvas"><button>B</button></header></div>')).not.toBeNull();
});

it('does not add the canvas-band override to primary buttons', () => {
  const { getByRole } = render(<Button>Save</Button>);
  expect(getByRole('button')).not.toHaveClass('on-canvas-band:bg-transparent');
});
