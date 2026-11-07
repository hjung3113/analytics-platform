import type { ReactElement } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/shadcn/tooltip';

export function IconHelp({ label, children }: { label: string; children: ReactElement }) {
  return <TooltipProvider><Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent portal side="bottom" size="sm">{label}</TooltipContent></Tooltip></TooltipProvider>;
}
