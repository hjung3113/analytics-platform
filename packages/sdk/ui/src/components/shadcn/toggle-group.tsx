import * as React from 'react';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn.js';

const toggleGroupItemVariants = cva(
  // Disabled items dim and drop hover like Button and Tabs, so a blocked choice does not look pickable (#2674).
  'inline-flex items-center justify-center text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-transparent hover:bg-surface-row-hover hover:text-text-primary data-[state=on]:bg-surface-card data-[state=on]:text-text-primary',
        outline:
          'border border-border-subtle bg-transparent hover:bg-surface-row-hover hover:text-text-primary data-[state=on]:bg-surface-card data-[state=on]:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2',
      },
      size: {
        default: 'h-10 px-3',
        sm: 'h-9 px-2.5',
        lg: 'h-11 px-5',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

type ToggleGroupContext = VariantProps<typeof toggleGroupItemVariants> & {
  appearance?: ToggleGroupAppearance;
};
const ToggleGroupContext = React.createContext<ToggleGroupContext>({
  size: 'default',
  variant: 'default',
});

type ToggleGroupAppearance = 'default' | 'filter' | 'swatch';
type ToggleGroupProps = React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleGroupItemVariants> & {
    appearance?: ToggleGroupAppearance;
    /**
     * `type="single"` only: arrow, Home and End move the selection with the focus, as a radio group does (the group exposes
     * radio semantics, #2552). Default `true`; `false` keeps focus-only arrows (Space or Enter selects). Ignored for `multiple`.
     */
    arrowSelects?: boolean;
  };

type RovingStep = -1 | 1 | 'first' | 'last';

/** The move Radix's roving group makes for this key (same orientation, direction and modifier rules), or null when it makes none. */
function rovingStep(event: React.KeyboardEvent, orientation: ToggleGroupProps['orientation'], rtl: boolean): RovingStep | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  if (event.key === 'Home') return 'first';
  if (event.key === 'End') return 'last';
  if (orientation !== 'vertical' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    return (event.key === 'ArrowRight') !== rtl ? 1 : -1;
  }
  if (orientation !== 'horizontal' && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) return event.key === 'ArrowDown' ? 1 : -1;
  return null;
}

function rovingTarget(items: readonly HTMLElement[], current: HTMLElement, step: RovingStep, loop: boolean): HTMLElement | undefined {
  if (step === 'first') return items[0];
  if (step === 'last') return items[items.length - 1];
  const at = items.indexOf(current);
  if (at < 0) return undefined;
  const next = at + step;
  if (loop) return items[(next + items.length) % items.length];
  return items[Math.min(items.length - 1, Math.max(0, next))];
}

const TOGGLE_GROUP_APPEARANCE_CLASSES: Record<Exclude<ToggleGroupAppearance, 'default'>, string> = {
  filter: 'rounded-md border border-border-subtle bg-surface-card on-canvas-band:bg-transparent p-0.5',
  // A row of color circles. No track: the selected item carries one ring and no border (#2762).
  swatch: 'justify-start gap-2',
};

/** Circle item: one selection ring, never a border plus a ring. The padding leaves a transparent gap so the ring reads on any color and any surface; keyboard focus moves the ring out by an offset so focus and selection stay apart. The consumer paints the color on a child. */
const SWATCH_ITEM_CLASS = 'inline-flex ring-offset-surface-canvas size-8 shrink-0 items-center justify-center rounded-full bg-transparent p-0.5 hover:bg-transparent data-[state=on]:bg-transparent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 data-[state=on]:ring-2 data-[state=on]:ring-focus-ring disabled:pointer-events-none disabled:opacity-50';

type ToggleGroupItemAppearance = 'default' | 'selected-filter';
interface ToggleGroupItemProps
  extends React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> {
  appearance?: ToggleGroupItemAppearance;
}

const TOGGLE_GROUP_ITEM_APPEARANCE_CLASSES: Record<
  Exclude<ToggleGroupItemAppearance, 'default'>,
  string
> = {
  'selected-filter':
    'data-[state=on]:border-border-selected data-[state=on]:bg-surface-row-selected data-[state=on]:text-text-primary data-[state=on]:font-semibold',
};

export const ToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  ToggleGroupProps
>(({ className, variant, size, appearance = 'default', arrowSelects = true, children, onKeyDown, onKeyDownCapture, ...props }, ref) => {
  // Key events whose roving move this group made itself; the bubbling handler must not call the consumer a second time.
  const handled = React.useRef(new WeakSet<Event>());
  const selects = props.type === 'single' && arrowSelects && props.rovingFocus !== false;
  return (
    <ToggleGroupPrimitive.Root
      ref={ref}
      className={cn(
        'flex items-center justify-center gap-1',
        appearance !== 'default' && TOGGLE_GROUP_APPEARANCE_CLASSES[appearance],
        className,
      )}
      // Radix moves the focus from the item's keydown before the root's bubbling handler could cancel it. A single group that
      // selects with the focus (radio group pattern, #2552) makes the move here instead, before the item: the consumer's
      // onKeyDown runs first and can cancel it, then focus and selection move together. preventDefault skips Radix's own move.
      onKeyDownCapture={event => {
        onKeyDownCapture?.(event);
        if (!selects || event.defaultPrevented) return;
        const root = event.currentTarget;
        const current = event.target;
        if (!(current instanceof HTMLElement) || !current.matches('[data-radix-collection-item]') || !root.contains(current)) return;
        const step = rovingStep(event, props.orientation, getComputedStyle(root).direction === 'rtl');
        if (step === null) return;
        handled.current.add(event.nativeEvent);
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        const items = Array.from(root.querySelectorAll<HTMLElement>('[data-radix-collection-item]'))
          .filter(item => !item.hasAttribute('disabled') && !item.hasAttribute('data-disabled'));
        const target = rovingTarget(items, current, step, props.loop ?? true);
        if (target === undefined || target === current) return;
        target.focus();
        if (target.getAttribute('aria-checked') !== 'true') target.click();
      }}
      onKeyDown={event => {
        if (!handled.current.has(event.nativeEvent)) onKeyDown?.(event);
      }}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size, appearance }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
});
ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName;

export const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  ToggleGroupItemProps & VariantProps<typeof toggleGroupItemVariants>
>(({ className, children, variant, size, appearance = 'default', ...props }, ref) => {
  const context = React.useContext(ToggleGroupContext);
  const resolvedVariant = context.variant || variant;
  const swatch = context.appearance === 'swatch';
  const defaultSegment = !swatch && context.appearance !== 'filter' && appearance === 'default' && (resolvedVariant ?? 'default') === 'default';
  return (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={cn(
        swatch ? SWATCH_ITEM_CLASS : toggleGroupItemVariants({
          variant: resolvedVariant,
          size: context.size || size,
        }),
        context.appearance === 'filter' && 'rounded-inset-md',
        defaultSegment && 'rounded-inset-md border border-transparent',
        defaultSegment && TOGGLE_GROUP_ITEM_APPEARANCE_CLASSES['selected-filter'],
        !swatch && appearance !== 'default' && TOGGLE_GROUP_ITEM_APPEARANCE_CLASSES[appearance],
        className,
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
});
ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName;
