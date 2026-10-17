import { cloneElement, type ReactElement } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';

export type RowActionIconProps = {
  icon: LucideIcon;
  /** Accessible name — keep it the same as the text form's, the tooltip is never the only name (06 §26). */
  label: string;
  /** Visible text the icon replaces; shown on hover and keyboard focus. */
  tooltip: string;
  variant?: 'ghost' | 'secondary';
  onClick?: () => void;
  /** A link element (`PlatformLink`, `<a>`): it keeps its own `href`/`target`, and gets the icon and `label`. */
  link?: ReactElement<{ 'aria-label'?: string }>;
  disabled?: boolean;
  'aria-describedby'?: string;
};

/** Icon-only form of a `rowAction` control, for the compact pinned action column (ADR-0037). */
export function RowActionIcon({ icon: Icon, label, tooltip, variant = 'ghost', onClick, link, disabled, 'aria-describedby': describedBy }: RowActionIconProps) {
  const icon = <Icon className="size-4" aria-hidden />;
  const control = link
    ? <Button asChild size="toolbar" variant={variant}>{cloneElement(link, { 'aria-label': label }, icon)}</Button>
    : <Button size="toolbar" variant={variant} aria-label={label} aria-describedby={describedBy} disabled={disabled} onClick={onClick}>{icon}</Button>;
  return <TooltipProvider delayDuration={200}><Tooltip>
    <TooltipTrigger asChild>{control}</TooltipTrigger>
    <TooltipContent>{tooltip}</TooltipContent>
  </Tooltip></TooltipProvider>;
}
