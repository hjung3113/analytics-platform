import * as React from 'react';
import { Info } from 'lucide-react';
import { cn } from '../utils/cn.js';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/shadcn/tooltip.js';

export interface InfoTipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type' | 'aria-label' | 'aria-describedby'> {
  /** The button's accessible name (e.g. 「설명」). */
  label: string;
  /** Static guidance only. State the reader must see (warnings, partial data, permission notices, state badges) stays visible text. */
  children: React.ReactNode;
  /** Id of the persistent `sr-only` description; a section can point its own `aria-describedby` at it. Default: generated. */
  descriptionId?: string;
}

/**
 * A 24px ⓘ button whose tooltip (hover or focus, Esc closes) carries a section's static guidance. The same text stays in one persistent
 * `sr-only` block (a `div`, so block descriptions nest validly) the button is described by, so screen readers get it without opening the tooltip (06 §13, #2300).
 */
export function InfoTip({ label, children, descriptionId, className, ...rest }: InfoTipProps) {
  const generatedId = React.useId();
  const id = descriptionId ?? generatedId;
  return <>
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button {...rest} type="button" aria-describedby={id} aria-label={label}
            className={cn('inline-flex size-6 shrink-0 items-center justify-center rounded-xs text-text-muted hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring', className)}>
            <Info className="size-3.5" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent portal size="sm" className="max-w-72">{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
    {/* One persistent description; the portaled tooltip shows the same text. */}
    <div id={id} className="sr-only">{children}</div>
  </>;
}
