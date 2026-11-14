import { cva } from 'class-variance-authority';
import { cn } from '../utils/cn';

const rows = cva('', {
  variants: {
    row: {
      menu: 'relative flex min-h-8 items-center gap-2 rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-row-hover hover:text-text-primary',
      inset: 'relative flex min-h-8 items-center gap-2 rounded-md py-1.5 pl-9 pr-3 text-sm text-text-secondary hover:bg-surface-row-hover hover:text-text-primary',
      // Not navigable (#1846): same frame, no hover or selected surface; the keyboard focus ring is the only state.
      inert: 'relative flex min-h-8 items-center gap-2 rounded-md px-3 py-1.5 text-sm text-text-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring',
      feature: 'flex min-h-8 items-center gap-2 rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-row-hover hover:text-text-primary',
    },
    collapsed: { true: 'justify-center px-0', false: '' },
    active: { true: 'bg-surface-row-selected font-semibold text-text-primary', false: '' },
  },
  defaultVariants: { row: 'menu', collapsed: false, active: false },
});

/** CVA sidebar grammar. Complete row strings preserve existing consumers' exact class output. */
export function navRowVariants({ active = false, collapsed = false, inset = false, feature = false, inert = false }: { active?: boolean; collapsed?: boolean; inset?: boolean; feature?: boolean; inert?: boolean } = {}) {
  return cn(rows({ row: inert ? 'inert' : feature ? 'feature' : inset ? 'inset' : 'menu', collapsed, active }));
}

export const navDrillAffordance = 'grid size-6 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover hover:text-text-primary';

export function NavCurrentMarker() {
  return <span data-current-marker aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-pill bg-accent-primary" />;
}
