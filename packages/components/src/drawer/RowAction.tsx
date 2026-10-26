import { cloneElement, type ReactElement } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, buttonVariants } from '@ap/ui';

const TEXT_LINK = {
  primary: 'text-xs font-medium text-accent-primary hover:underline',
  secondary: 'text-xs text-text-secondary hover:underline',
} as const;

export type RowActionProps = {
  /** True in the 72px pinned action column (ADR-0037): the control shows `icon` and the tooltip is enabled. */
  compact: boolean;
  icon: LucideIcon;
  /** Accessible name — the same in both forms, the tooltip is never the only name (06 §26). */
  label: string;
  /** Visible text of the full form; the compact form shows it in the tooltip on hover and keyboard focus. */
  text: string;
  variant?: 'ghost' | 'secondary';
  onClick?: () => void;
  /** A link element (`PlatformLink`, `<a>`): it keeps its own `href`/`target`; this component sets its name, class and content. */
  link?: ReactElement<{ 'aria-label'?: string; className?: string }>;
  /** Full form as a text link instead of a toolbar button (`primary` accent, `secondary` muted); the compact form always uses the toolbar button styling. */
  textLink?: 'primary' | 'secondary';
  disabled?: boolean;
  'aria-describedby'?: string;
};

/**
 * One row-action control for the pinned action column. It renders the same element tree in both forms, so the DOM node
 * (and the focus on it) survives the compact ↔ full switch when the dock opens or closes (ADR-0037, #399).
 */
export function RowAction({ compact, icon: Icon, label, text, variant = 'ghost', onClick, link, textLink, disabled, 'aria-describedby': describedBy }: RowActionProps) {
  const className = !compact && textLink ? TEXT_LINK[textLink] : buttonVariants({ variant, size: 'toolbar' });
  const named = compact || label !== text ? label : undefined;
  const content = compact ? <Icon className="size-4" aria-hidden /> : text;
  const control = link
    ? cloneElement(link, { className, 'aria-label': named }, content)
    : <button className={className} aria-label={named} aria-describedby={describedBy} disabled={disabled} onClick={onClick}>{content}</button>;
  return <TooltipProvider delayDuration={200}><Tooltip>
    <TooltipTrigger asChild>{control}</TooltipTrigger>
    {compact && <TooltipContent>{text}</TooltipContent>}
  </Tooltip></TooltipProvider>;
}
