import { CornerUpLeft, MoreHorizontal } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { RETURN_CONTEXT_LABELS, useI18n } from '@ap/kernel';
import {
  Button, cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
  Popover, PopoverAnchor, PopoverContent,
} from '@ap/ui';
import { PANE_CHIP } from '../contextChip';
import { PaneBadge } from './PaneBadge';
import type { PaneSignal } from './paneActions';
import { boardText } from './text';

/** The menu name never gets narrower than this to make room for chips (docs/16 §4): what does not fit collapses into `+N 다름`. Equals the class `min-w-24` on the name. */
export const MENU_NAME_MIN_WIDTH = 96;
const HEAD_PADDING = 16;
const HEAD_GAP = 8;
const CHIP_GAP = 4;

/**
 * How many difference chips fit in the head. Measures the fixed groups (`data-head-fixed`), the head and an invisible copy of every
 * chip plus the `+N 다름` sample (`data-chip-measure`). Where nothing has a width yet (first paint, no layout) all chips show.
 */
function useVisibleChips(head: RefObject<HTMLDivElement | null>, count: number, signature: string): number {
  const [visible, setVisible] = useState(count);
  useLayoutEffect(() => {
    const element = head.current;
    if (!element) return;
    const measure = () => {
      const width = element.getBoundingClientRect().width;
      if (width <= 0 || count === 0) { setVisible(count); return; }
      const widthOf = (selector: string) => Array.from(element.querySelectorAll<HTMLElement>(selector)).map(item => item.getBoundingClientRect().width);
      const fixed = widthOf('[data-head-fixed]').reduce((sum, w) => sum + w, 0);
      const chips = widthOf('[data-chip-measure="chip"]');
      const [more = 0] = widthOf('[data-chip-measure="more"]');
      const available = width - HEAD_PADDING - fixed - MENU_NAME_MIN_WIDTH - HEAD_GAP * 3;
      let fit = 0;
      for (let k = count; k >= 1; k--) {
        const used = chips.slice(0, k).reduce((sum, w) => sum + w, 0) + CHIP_GAP * (k - 1) + (k < count ? more + CHIP_GAP : 0);
        if (used <= available) { fit = k; break; }
      }
      setVisible(fit);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    // The head alone is not enough: a fixed group or a measuring chip can change size (`이전 화면` appears, the language changes) with the head's width unchanged.
    for (const target of [element, ...element.querySelectorAll('[data-head-fixed], [data-chip-measure]')]) observer.observe(target);
    return () => observer.disconnect();
  }, [head, count, signature]);
  return Math.min(visible, count);
}

export type PaneHeaderProps = {
  number: number;
  selected: boolean;
  systemLabel: string | null;
  menuName: ReactNode;
  /** The pane holds a screen the board admits; only then do the Context signals and `⋯` show. */
  active: boolean;
  signal: PaneSignal | null;
  hasPrevious: boolean;
  /** Why `이 조건을 시트의 모든 칸에 적용` is off, or null when it is on. */
  applyAllOff: string | null;
  /** Why `복제` is off, or null when it is on. */
  duplicateOff: string | null;
  menuTrigger: RefObject<HTMLButtonElement | null>;
  onSelect: () => void;
  onBack: () => void;
  onApplyAll: () => void;
  onOpenFull: () => void;
  onReplace: () => void;
  onDuplicate: () => void;
  onClear: () => void;
  onEditContext: () => void;
  /**
   * Set by an item whose follow-up owns focus (a chained dialog, a cleared pane): run once, after the `⋯` menu has closed, in place of
   * returning focus to the trigger. Focus moved earlier would be pulled back by the open menu's focus trap.
   */
  afterMenuClose: RefObject<(() => void) | null>;
};

/**
 * The pane head (docs/16 §4, ADR-0051), one line: number badge · system chip · menu name · difference chips · `같음 N` · `⋯`.
 * Chips never wrap; what does not fit becomes one `+N 다름` chip opening the same popover. Any control selects the pane first
 * (the pane root also does, on focus and press).
 */
export function PaneHeader(props: PaneHeaderProps) {
  const { number, selected, systemLabel, menuName, active, signal, hasPrevious, applyAllOff, duplicateOff, menuTrigger, onSelect, afterMenuClose } = props;
  const { lang, tx } = useI18n();
  const text = boardText(lang);
  const head = useRef<HTMLDivElement>(null);
  const id = useId();
  const lastTrigger = useRef<HTMLElement | null>(null);
  const editing = useRef(false);
  const [popover, setPopover] = useState(false);
  const chips = signal?.compared ? signal.differing : [];
  const signature = chips.map(c => `${c.key}:${c.value}`).join('|');
  const visibleCount = useVisibleChips(head, chips.length, signature);
  const shown = chips.slice(0, visibleCount);
  const hidden = chips.length - shown.length;
  const sameCount = signal ? (signal.compared ? signal.same.length : signal.rows.length) : 0;
  const label = (key: (typeof chips)[number]['key']) => tx(RETURN_CONTEXT_LABELS[key]);
  const chipText = (chip: (typeof chips)[number]) => `${label(chip.key)} ${chip.value ?? text.unsetValue}`;
  const open = (event: { currentTarget: HTMLElement }) => { onSelect(); lastTrigger.current = event.currentTarget; setPopover(true); };

  return <div ref={head} data-pane-head className={cn('relative flex h-10 shrink-0 items-center gap-2 border-b border-border-subtle px-2', selected ? 'bg-surface-row-selected' : 'bg-surface-card')}>
    <Popover open={popover} onOpenChange={setPopover}>
      <PopoverAnchor asChild><span className="absolute inset-x-0 bottom-0" aria-hidden /></PopoverAnchor>
      <div data-head-fixed className="flex shrink-0 items-center gap-2">
        <button type="button" aria-label={text.selectPane(number)} aria-pressed={selected} onClick={onSelect}
          className="rounded-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring">
          <PaneBadge label={text.pane(number)} selected={selected} />
        </button>
        {systemLabel && <span data-pane-system className="shrink-0 rounded-xs border border-border-subtle px-1.5 text-caption text-text-secondary">{systemLabel}</span>}
      </div>
      <span className="min-w-24 flex-1 truncate text-sm font-medium text-text-primary">{menuName}</span>
      {(shown.length > 0 || hidden > 0) && <div data-pane-chips className="flex shrink-0 items-center gap-1">
        {shown.map(chip => <span key={chip.key} data-pane-chip={chip.key} className={PANE_CHIP}>{chipText(chip)}</span>)}
        {hidden > 0 && <button type="button" data-pane-chip="more" aria-haspopup="dialog" aria-expanded={popover} aria-label={text.contextMoreName(number, hidden)} onClick={open} className={cn(PANE_CHIP, 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring')}>{text.contextMore(hidden)}</button>}
      </div>}
      {chips.length > 0 && <div aria-hidden inert className="pointer-events-none invisible absolute left-0 top-0 flex gap-1">
        {chips.map(chip => <span key={chip.key} data-chip-measure="chip" className={PANE_CHIP}>{chipText(chip)}</span>)}
        <span data-chip-measure="more" className={PANE_CHIP}>{text.contextMore(chips.length)}</span>
      </div>}
      <div data-head-fixed className="flex shrink-0 items-center gap-1">
        {active && hasPrevious && <Button type="button" variant="ghost" size="icon-sm" aria-label={text.previousScreen} title={text.previousScreen}
          onClick={() => { onSelect(); props.onBack(); }}><CornerUpLeft className="size-3.5" aria-hidden /></Button>}
        {active && signal && sameCount > 0 && <Button type="button" variant="ghost" size="toolbar" aria-haspopup="dialog" aria-expanded={popover}
          aria-label={signal.compared ? text.contextSameName(number, sameCount) : text.contextCountName(number, sameCount)} onClick={open}>
          {signal.compared ? text.contextSame(sameCount) : text.contextCount(sameCount)}
        </Button>}
        {active && <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button ref={menuTrigger} type="button" variant="ghost" size="icon-sm" aria-label={text.paneActions(number)} title={text.paneActions(number)} onPointerDown={onSelect}><MoreHorizontal className="size-3.5" aria-hidden /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end"
            onCloseAutoFocus={event => {
              const next = afterMenuClose.current;
              if (next === null) return;
              afterMenuClose.current = null;
              event.preventDefault();
              next();
            }}>
            <DropdownMenuItem disabled={applyAllOff !== null} aria-describedby={applyAllOff !== null ? `${id}-apply-off` : undefined} onSelect={() => props.onApplyAll()}>
              <span className="grid">{text.applyToAll}{applyAllOff !== null && <span id={`${id}-apply-off`} className="text-tiny text-text-muted">{applyAllOff}</span>}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onOpenFull()}>{text.openFull}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { afterMenuClose.current = () => {}; props.onReplace(); }}>{text.replacePane}</DropdownMenuItem>
            <DropdownMenuItem disabled={duplicateOff !== null} aria-describedby={duplicateOff !== null ? `${id}-dup-off` : undefined} onSelect={() => props.onDuplicate()}>
              <span className="grid">{text.duplicatePane}{duplicateOff !== null && <span id={`${id}-dup-off`} className="text-tiny text-text-muted">{duplicateOff}</span>}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => props.onClear()}>{text.clear}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>}
      </div>
      <PopoverContent align="end" role="dialog" aria-label={text.contextPopover(number)} className="w-80"
        onCloseAutoFocus={event => {
          event.preventDefault();
          // `Context 바에서 편집` moves focus into the bar itself.
          if (editing.current) editing.current = false; else lastTrigger.current?.focus({ preventScroll: true });
        }}>
        {signal && signal.rows.length > 0
          ? <dl className="grid gap-1.5 text-xs">
            {signal.rows.map(row => <div key={row.key} data-popover-row={row.key} className="grid grid-cols-[6rem_1fr] gap-2">
              <dt className="text-text-muted">{label(row.key)}</dt>
              <dd className="min-w-0 break-words text-text-primary">{row.value ?? text.unsetValue}{row.differs && <span className={cn(PANE_CHIP, 'ml-1 h-5')}>{text.contextDiffers}</span>}</dd>
            </div>)}
          </dl>
          : <p className="text-xs text-text-muted">{text.contextEmpty}</p>}
        <Button type="button" variant="secondary" size="sm" className="mt-3 w-full" onClick={() => { editing.current = true; setPopover(false); props.onEditContext(); }}>{text.editInBar}</Button>
      </PopoverContent>
    </Popover>
  </div>;
}
