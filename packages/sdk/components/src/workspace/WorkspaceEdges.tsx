import { useState, type KeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button, cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';
import type { PanelEdge } from '../dock/schema';

export type WorkspaceEdgeItem = { id: string; title: string; summary: string; icon?: LucideIcon };

/** One tab stop per toolbar; arrow keys change focus, Enter/Space open a non-modal peek. */
export function WorkspaceEdges({ edge, items, label, peekId, onPeek }: {
  edge: PanelEdge; items: WorkspaceEdgeItem[]; label: string; peekId: string | null; onPeek: (id: string, trigger: HTMLElement) => void;
}) {
  const [focused, setFocused] = useState<string | null>(null);
  if (items.length === 0) return null;
  const selected = items.some(item => item.id === focused) ? focused : items[0]!.id;
  const vertical = edge === 'left';
  const keydown = (event: KeyboardEvent<HTMLDivElement>) => {
    const previous = vertical ? 'ArrowUp' : 'ArrowLeft';
    const next = vertical ? 'ArrowDown' : 'ArrowRight';
    if (![previous, next, 'Home', 'End'].includes(event.key)) return;
    const at = items.findIndex(item => item.id === focused);
    let index = (Math.max(0, at) + (event.key === previous ? -1 : 1) + items.length) % items.length;
    if (event.key === 'Home') index = 0;
    if (event.key === 'End') index = items.length - 1;
    const id = items[index]!.id;
    setFocused(id);
    Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-workspace-edge-panel]')).find(button => button.dataset.workspaceEdgePanel === id)?.focus();
    event.preventDefault(); event.stopPropagation();
  };
  return <TooltipProvider delayDuration={200}><div role="toolbar" aria-label={label} aria-orientation={vertical ? 'vertical' : 'horizontal'} data-workspace-edge={edge}
    className={vertical ? 'flex w-9 shrink-0 flex-col items-center gap-1 border-r border-border-subtle py-1' : 'flex min-w-0 shrink-0 gap-1 overflow-x-auto border-b border-border-subtle p-1'} onKeyDown={keydown}>
    {items.map(item => {
      const Icon = item.icon;
      const text = item.summary ? `${item.title} · ${item.summary}` : item.title;
      const open = peekId === item.id;
      const symbol = Icon ? <Icon className="size-4" aria-hidden /> : <span aria-hidden>{Array.from(item.title)[0]}</span>;
      const button = <Button type="button" variant="ghost" size={vertical ? 'icon-sm' : 'toolbar'}
        className={vertical ? 'shrink-0' : 'max-w-80 min-w-0 shrink-0'}
        data-workspace-edge-panel={item.id} aria-label={text} title={vertical ? undefined : text} aria-expanded={open} aria-pressed={open}
        tabIndex={selected === item.id ? 0 : -1} onFocus={() => { setFocused(item.id); }} onClick={event => { onPeek(item.id, event.currentTarget); }}>
        {vertical ? symbol : <span className="truncate">{text}</span>}
      </Button>;
      return vertical ? <Tooltip key={item.id}><TooltipTrigger asChild>{button}</TooltipTrigger><TooltipContent side="right">{item.title}</TooltipContent></Tooltip> : <span key={item.id} className={cn('flex min-w-0 border-b-2', open ? 'border-accent-primary' : 'border-transparent')}>{button}</span>;
    })}
  </div></TooltipProvider>;
}
