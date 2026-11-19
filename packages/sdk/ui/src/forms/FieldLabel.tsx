import { HelpCircle } from 'lucide-react';
import type * as React from 'react';
import { Label } from '../components/shadcn/label.js';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/shadcn/tooltip.js';
import { cn } from '../utils/cn.js';

export interface FieldLabelProps extends React.ComponentPropsWithoutRef<typeof Label> {
  messages?: { help?: (tip: string) => string };
  appearance?: 'default' | 'section';
  required?: boolean;
  requiredMark?: 'asterisk' | 'text';
  /** Localized text for `requiredMark="text"`; defaults to the Korean SDK copy. */
  requiredText?: string;
  tone?: 'default' | 'secondary';
  tip?: string;
  children: React.ReactNode;
}

const APPEARANCE_CLASSES = {
  default: '',
  section: 'text-xs font-semibold uppercase tracking-wide text-text-muted',
} as const;

const TONE_CLASSES = {
  default: '',
  secondary: 'text-text-secondary',
} as const;

export function FieldLabel({
  messages,
  appearance = 'default',
  required,
  requiredMark = 'asterisk',
  requiredText = '· 필수',
  tone = 'default',
  tip,
  children,
  className,
  ...props
}: FieldLabelProps) {
  return (
    <Label className={cn(APPEARANCE_CLASSES[appearance], TONE_CLASSES[tone], className)} {...props}>
      {children}
      {required === true && (
        requiredMark === 'asterisk' ? (
          <span className="ml-1 text-text-danger-label" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="ml-1 text-xs font-normal text-text-muted" aria-hidden="true">
            {requiredText}
          </span>
        )
      )}
      {tip !== undefined && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={messages?.help?.(tip) ?? `도움말: ${tip}`}
                className="ml-1 inline-flex cursor-default items-center rounded-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring"
                data-testid="field-label-tip-trigger"
              >
                <HelpCircle size={12} className="text-text-muted" aria-hidden="true" />
                <span className="sr-only">{tip}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>{tip}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </Label>
  );
}

FieldLabel.displayName = 'FieldLabel';
