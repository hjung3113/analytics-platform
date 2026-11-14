import { useLayoutEffect, useRef, type RefObject } from 'react';
import { X } from 'lucide-react';
import { Button } from '../components/Button.js';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/shadcn/tooltip.js';
import { cn } from '../utils/cn.js';

export interface ActiveFilterBarProps {
  messages?: Partial<{ label: string; remove: (label: string) => string; reset: string }>;
  items: { key: string; label: string; onRemove: () => void }[];
  onClearAll: () => void;
  className?: string;
  /** Field to focus when the last filter or all filters are removed. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function ActiveFilterBar({ items, onClearAll, className, messages, returnFocusRef }: ActiveFilterBarProps) {
  const bar = useRef<HTMLFieldSetElement>(null);
  const clear = useRef<HTMLButtonElement>(null);
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  const pending = useRef<{ key: string | null; nextKey?: string; fallback: HTMLElement | null; trigger: HTMLElement } | null>(null);
  const rememberFocus = (trigger: HTMLButtonElement, key: string | null, nextKey?: string) => {
    if (document.activeElement !== trigger) return;
    const candidates = [...document.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]')];
    const fallback = candidates.filter(element => element.tabIndex >= 0 && !element.matches(':disabled')
      && !element.closest('[hidden], [inert], [aria-hidden="true"]') && !!bar.current
      && !!(element.compareDocumentPosition(bar.current) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1) ?? null;
    pending.current = { key, nextKey, fallback, trigger };
  };
  useLayoutEffect(() => {
    const move = pending.current;
    if (!move || (move.key === null ? items.length > 0 : items.some(item => item.key === move.key))) return;
    pending.current = null;
    if (document.activeElement !== document.body && document.activeElement !== move.trigger) return;
    const target = items.length === 0 ? returnFocusRef?.current ?? move.fallback
      : (move.nextKey ? removeButtons.current.get(move.nextKey) : null) ?? clear.current;
    if (target?.isConnected) target.focus();
  }, [items, returnFocusRef]);
  if (items.length === 0) return null;
  return (
    <TooltipProvider>
      <fieldset
        ref={bar}
        aria-label={messages?.label ?? '적용된 필터'}
        className={cn('flex flex-wrap items-center gap-2 text-xs', className)}
      >
        {items.map(({ key, label, onRemove }, index) => (
          <span
            key={key}
            className="inline-flex items-center gap-1 rounded-md bg-accent-primary/10 pl-2 text-accent-primary"
          >
            {label}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="subtle"
                  size="icon-xs"
                  className="text-current hover:bg-accent-primary/10"
                  aria-label={messages?.remove?.(label) ?? `${label} 필터 제거`}
                  ref={element => { if (element) removeButtons.current.set(key, element); else removeButtons.current.delete(key); }}
                  onClick={event => { rememberFocus(event.currentTarget, key, items[index + 1]?.key); onRemove(); }}
                >
                  <X className="size-3" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent size="sm">{messages?.remove?.(label) ?? `${label} 필터 제거`}</TooltipContent>
            </Tooltip>
          </span>
        ))}
        <button
          type="button"
          ref={clear}
          onClick={event => { rememberFocus(event.currentTarget, null); onClearAll(); }}
          className="rounded-sm text-xs text-accent-primary hover:underline focus-visible:outline focus-visible:outline-focus-ring"
        >
          {messages?.reset ?? '필터 초기화'}
        </button>
      </fieldset>
    </TooltipProvider>
  );
}
