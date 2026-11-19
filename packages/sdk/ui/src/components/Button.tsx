import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '../utils/cn.js';

/**
 * Pack 17 shadcn-CVA Button. Per ADR-0021.
 *
 * Variant aliases: `primary` → `default`, `subtle` → `ghost` (preserved for back-compat from ADR-0016 Button).
 *
 * `loading` is incompatible with `asChild`. When both are true, throws in dev and logs a warning + degrades
 * silently in prod (renders the child WITHOUT the loading affordance). Radix Slot enforces single-child
 * contract that conflicts with spinner injection.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-surface-canvas transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-accent-primary text-text-on-accent hover:bg-accent-primary/90',
        secondary:
          'bg-surface-raised on-canvas-band:bg-transparent text-text-primary border border-border-subtle hover:bg-surface-row-hover',
        destructive: 'bg-accent-danger text-text-on-accent hover:bg-accent-danger/90',
        outline:
          'border border-border-default bg-transparent text-text-primary hover:bg-surface-row-hover',
        ghost: 'text-text-primary hover:bg-surface-row-hover',
        navigation: 'text-text-secondary hover:bg-surface-row-hover hover:text-text-primary',
        link: 'text-accent-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-10 px-4',
        lg: 'h-12 px-6',
        toolbar: 'h-8 shrink-0 gap-1.5 px-2',
        'icon-sm': 'h-8 w-8 p-0',
        'icon-xs': 'h-7 w-7 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

type ShadcnVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
type LegacyVariant = 'primary' | 'subtle';
type ButtonVariant = ShadcnVariant | LegacyVariant;
type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;

const VARIANT_ALIAS: Record<LegacyVariant, ShadcnVariant> = {
  primary: 'default',
  subtle: 'ghost',
};

function resolveVariant(v?: ButtonVariant): ShadcnVariant {
  if (!v) return 'default';
  if (v === 'primary' || v === 'subtle') return VARIANT_ALIAS[v];
  return v;
}

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  spacing?: 'default' | 'compact';
  padding?: 'default' | 'compact';
  wrapText?: boolean;
  loading?: boolean;
  asChild?: boolean;
  /** Visible explanation when the button is disabled (including while loading). */
  disabledReason?: React.ReactNode;
  children?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (buttonProps, ref) => {
    const hasDisabledReasonProp = Object.prototype.hasOwnProperty.call(buttonProps, 'disabledReason');
    const {
      className,
      variant,
      size,
      spacing = 'default',
      padding = 'default',
      wrapText = false,
      loading,
      asChild = false,
      disabled,
      disabledReason,
      'aria-describedby': describedBy,
      children,
      ...props
    } = buttonProps;
    const reasonId = React.useId();
    const showDisabledReason =
      (disabled === true || loading === true) &&
      disabledReason !== undefined &&
      disabledReason !== null &&
      disabledReason !== false &&
      disabledReason !== '';
    const buttonDescribedBy = [describedBy, showDisabledReason ? reasonId : undefined]
      .filter((id): id is string => id !== undefined && id !== '')
      .join(' ');
    const withReason = (button: React.ReactElement) =>
      hasDisabledReasonProp ? (
        <span className="inline-flex min-w-0 flex-col items-start gap-1">
          {button}
          {showDisabledReason && (
            <span id={reasonId} className="max-w-full break-words text-xs text-text-muted">
              {disabledReason}
            </span>
          )}
        </span>
      ) : (
        button
      );

    if (asChild && loading) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(
          'Button: `loading` is incompatible with `asChild` — Slot enforces single-child contract.',
        );
      }
      console.warn(
        'Button: `loading` is incompatible with `asChild`; rendering child without loading affordance.',
      );
      const Comp = Slot;
      return withReason(
        <Comp
          ref={ref as never}
          className={cn(
            buttonVariants({ variant: resolveVariant(variant), size }),
            spacing === 'compact' && 'gap-1.5',
            padding === 'compact' && 'px-2',
            wrapText && 'h-auto min-h-8 py-1 whitespace-normal',
            className,
          )}
          aria-describedby={buttonDescribedBy || undefined}
          {...props}
        >
          {children as React.ReactElement}
        </Comp>,
      );
    }

    const Comp = asChild ? Slot : 'button';
    return withReason(
      <Comp
        ref={ref as never}
        className={cn(
          buttonVariants({ variant: resolveVariant(variant), size }),
          spacing === 'compact' && 'gap-1.5',
          padding === 'compact' && 'px-2',
          wrapText && 'h-auto min-h-8 py-1 whitespace-normal',
          className,
        )}
        aria-busy={loading ? 'true' : undefined}
        disabled={disabled || loading}
        aria-describedby={buttonDescribedBy || undefined}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>,
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
