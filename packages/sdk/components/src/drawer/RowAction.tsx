import { cloneElement, useState, type ReactElement, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, Popover, PopoverContent, PopoverTrigger, buttonVariants } from '@ap/ui';

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
  /** Optional body action list; the same control opens a Popover and retains its density/focus identity. */
  menu?: ReactNode;
  disabled?: boolean;
  'aria-describedby'?: string;
};

/**
 * One row-action control for the pinned action column. It renders the same element tree in both forms, so the DOM node
 * (and the focus on it) survives the compact ↔ full switch when the dock opens or closes (ADR-0037, #399).
 */
export function RowAction({ compact, icon: Icon, label, text, variant = 'ghost', onClick, link, textLink, menu, disabled, 'aria-describedby': describedBy }: RowActionProps) {
  const [open, setOpen] = useState(false);
  const className = !compact && textLink ? TEXT_LINK[textLink] : buttonVariants({ variant, size: 'toolbar' });
  const named = compact || label !== text ? label : undefined;
  const content = compact ? <Icon className="size-4" aria-hidden /> : text;
  const control = link
    ? cloneElement(link, { className, 'aria-label': named }, content)
    : <button type={menu ? 'button' : undefined} title={menu && compact ? label : undefined} className={className} aria-label={named} aria-describedby={describedBy} disabled={disabled} onClick={onClick}>{content}</button>;
  const trigger = <TooltipProvider delayDuration={200}><Tooltip>
    <TooltipTrigger asChild>{menu ? <PopoverTrigger asChild>{control}</PopoverTrigger> : control}</TooltipTrigger>
    {compact && <TooltipContent>{text}</TooltipContent>}
  </Tooltip></TooltipProvider>;
  return menu ? <Popover open={open} onOpenChange={setOpen}>
    {trigger}
    <PopoverContent align="end" role="group" aria-label={label} className="min-w-56" padding="compact">
      <div className="grid gap-2 p-1" onClick={() => setOpen(false)}>{menu}</div>
    </PopoverContent>
  </Popover> : trigger;
}
