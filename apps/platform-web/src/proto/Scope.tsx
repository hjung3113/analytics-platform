// THROWAWAY #595 — never merge.
// Managed System picker: variant A draws it in the sidebar's scope slot ("업무 시스템"), variant B in the screen header's right side.
import { ChevronDown } from 'lucide-react';
import { cn, DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@ap/ui';
import { ALL_SYSTEMS, MANAGED_SYSTEMS, setEntry, useEntry } from './state';

export function ScopeDropdown({ layout, collapsed = false }: { layout: 'sidebar' | 'bar'; collapsed?: boolean }) {
  const { ms } = useEntry();
  const bar = layout === 'bar';
  const trigger = <DropdownMenuTrigger asChild>
    <button type="button" aria-label={`업무 시스템: ${ms}`}
      className={cn('flex items-center gap-2 rounded-md border border-border-control px-2 text-left text-sm hover:bg-surface-row-hover', bar ? 'h-8' : 'min-h-10 w-full py-2')}>
      {bar ? <><span className="text-text-muted">업무 시스템:</span><span className="font-medium">{ms}</span></>
        : <><span className="grid size-5 shrink-0 place-items-center rounded bg-accent-primary-soft text-xs font-semibold text-accent-primary" aria-hidden>{ms.slice(0, 1)}</span>
          <span className={cn('min-w-0 flex-1 truncate font-medium', collapsed && 'sr-only')}>{ms}</span></>}
      {!collapsed && <ChevronDown className="size-3 shrink-0 text-text-muted" aria-hidden />}
    </button>
  </DropdownMenuTrigger>;
  return <div className={bar ? 'shrink-0' : 'shrink-0 border-b border-border-subtle p-2'}>
    {!bar && !collapsed && <p className="mx-1 mb-1 text-caption font-semibold text-text-muted">업무 시스템</p>}
    <DropdownMenu>
      {trigger}
      <DropdownMenuContent align={bar ? 'end' : 'start'} className="w-64">
        <DropdownMenuLabel>업무 시스템 (Managed System)</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={ms} onValueChange={v => setEntry({ ms: v })}>
          <DropdownMenuRadioItem value={ALL_SYSTEMS}><span className="flex-1">{ALL_SYSTEMS}</span><span className="text-tiny text-text-secondary">관리자</span></DropdownMenuRadioItem>
          {MANAGED_SYSTEMS.map(name => <DropdownMenuRadioItem key={name} value={name}>{name}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}
