import { CornerUpLeft, Maximize2, Minimize2, MoreHorizontal } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { RETURN_CONTEXT_LABELS, useI18n } from '@ap/kernel';
import {
  Button, cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
  Popover, PopoverAnchor, PopoverContent,
} from '@ap/ui';
import { PANE_CHIP } from '../contextChip';
import { PaneBadge } from './PaneBadge';
import type { PaneSignal } from './paneActions';
import { boardPrototypeCopy } from './boardPrototype';
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
function useVisibleChips(head: RefObject<HTMLDivElement | null>, region: RefObject<HTMLDivElement | null>, count: number, signature: string, mode: 'standard' | 'priority' | 'value' | 'wrap'): number {
  const [visible, setVisible] = useState(count);
  useLayoutEffect(() => {
    const element = head.current;
    if (!element) return;
    const measure = () => {
      const width = mode === 'wrap' ? region.current?.getBoundingClientRect().width ?? 0 : element.getBoundingClientRect().width;
      if (width <= 0 || count === 0) { setVisible(count); return; }
      const measureRow = element.querySelector<HTMLElement>('[data-chip-measure-row]');
      if (measureRow) measureRow.style.width = `${Math.max(0, mode === 'wrap' ? width : width - HEAD_PADDING)}px`;
      const widthOf = (selector: string) => Array.from(element.querySelectorAll<HTMLElement>(selector)).map(item => item.getBoundingClientRect().width);
      const fixed = widthOf('[data-head-fixed]').reduce((sum, w) => sum + w, 0);
      const chips = widthOf('[data-chip-measure="chip"]');
      const [more = 0] = widthOf('[data-chip-measure="more"]');
      if (mode === 'wrap') {
        const fits = (limit: number) => {
          const widths = [...chips.slice(0, limit), ...(limit < count ? [more] : [])];
          let rows = 1;
          let used = 0;
          for (const chipWidth of widths) {
            if (used > 0 && used + CHIP_GAP + chipWidth > width) { rows++; used = 0; }
            if (rows > 2) return false;
            used += (used > 0 ? CHIP_GAP : 0) + chipWidth;
          }
          return rows <= 2;
        };
        let fit = 0;
        for (let k = count; k >= 0; k--) if (fits(k)) { fit = k; break; }
        setVisible(fit);
        return;
      }
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
    const targets = [element, ...(region.current ? [region.current] : []), ...element.querySelectorAll('[data-head-fixed], [data-chip-measure]')];
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [head, region, count, signature, mode]);
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
  /** Prototype-only chip arrangement. */
  chipMode?: 'priority' | 'value' | 'wrap';
  maximizable?: boolean;
  maximized?: boolean;
  onToggleMaximize?: () => void;
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
 * The pane head (docs/16 §4, ADR-0051), one line by default: number badge · system chip · menu name · difference chips · `같음 N` · `⋯`.
 * Prototype modes may prioritize or wrap chips; anything not shown becomes one `+N` chip opening the same popover. Any control selects the
 * pane first (the pane root also does, on focus and press).
 */
export function PaneHeader(props: PaneHeaderProps) {
  const { number, selected, systemLabel, menuName, active, signal, hasPrevious, applyAllOff, duplicateOff, chipMode, maximizable, maximized, onToggleMaximize, menuTrigger, onSelect, afterMenuClose } = props;
  const { lang, tx } = useI18n();
  const text = boardText(lang);
  const prototypeText = boardPrototypeCopy(lang);
  const head = useRef<HTMLDivElement>(null);
  const chipRegion = useRef<HTMLDivElement>(null);
  const id = useId();
  const lastTrigger = useRef<HTMLElement | null>(null);
  const editing = useRef(false);
  const [popover, setPopover] = useState(false);
  const sourceChips = chipMode === 'priority' ? signal?.rows.filter(row => row.differs) ?? [] : signal?.compared ? signal.differing : [];
  const chips = sourceChips;
  const label = (key: (typeof chips)[number]['key']) => tx(RETURN_CONTEXT_LABELS[key]);
  const signature = chips.map(c => `${label(c.key)}:${c.value}:${c.differs}`).join('|');
  const visibleCount = useVisibleChips(head, chipRegion, chips.length, signature, chipMode ?? 'standard');
  const shown = chips.slice(0, visibleCount);
  const hidden = chipMode === 'priority' && signal ? signal.rows.length - shown.length : chips.length - shown.length;
  const sameCount = signal ? (signal.compared ? signal.same.length : signal.rows.length) : 0;
  const chipText = (chip: (typeof chips)[number]) => `${label(chip.key)} ${chip.value ?? text.unsetValue}`;
  const open = (event: { currentTarget: HTMLElement }) => { onSelect(); lastTrigger.current = event.currentTarget; setPopover(true); };

  const identity = <div data-head-fixed className="flex shrink-0 items-center gap-2">
    <button type="button" aria-label={text.selectPane(number)} aria-pressed={selected} onClick={onSelect}
      className="rounded-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring">
      <PaneBadge label={text.pane(number)} selected={selected} />
    </button>
    {systemLabel && <span data-pane-system className="shrink-0 rounded-xs border border-border-subtle px-1.5 text-caption text-text-secondary">{systemLabel}</span>}
  </div>;
  const name = <span className="min-w-24 flex-1 truncate text-sm font-medium text-text-primary">{menuName}</span>;
  const actions = <div data-head-fixed className="flex shrink-0 items-center gap-1">
    {active && hasPrevious && <Button type="button" variant="ghost" size="icon-sm" aria-label={text.previousScreen} title={text.previousScreen}
      onClick={() => { onSelect(); props.onBack(); }}><CornerUpLeft className="size-3.5" aria-hidden /></Button>}
    {maximizable && <Button type="button" variant="ghost" size="icon-sm" aria-label={maximized ? prototypeText.restorePane(number) : prototypeText.maximizePane(number)}
      title={maximized ? prototypeText.restorePane(number) : prototypeText.maximizePane(number)} onClick={() => { onSelect(); onToggleMaximize?.(); }}>
      {maximized ? <Minimize2 className="size-3.5" aria-hidden /> : <Maximize2 className="size-3.5" aria-hidden />}
    </Button>}
    {active && chipMode !== 'priority' && signal && sameCount > 0 && <Button type="button" variant="ghost" size="toolbar" aria-haspopup="dialog" aria-expanded={popover}
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
  </div>;
  const chipNodes = <>
    {shown.map(chip => {
      const accessibleText = chipText(chip);
      const visibleText = chipMode === 'value' ? chip.value ?? text.unsetValue : accessibleText;
      const className = chipMode === 'value' ? cn(PANE_CHIP, 'max-w-24 min-w-0 shrink truncate') : PANE_CHIP;
      return <span key={chip.key} data-pane-chip={chip.key} title={chipMode === 'value' ? accessibleText : undefined} className={className}>{visibleText}</span>;
    })}
    {hidden > 0 && <button type="button" data-pane-chip="more" aria-haspopup="dialog" aria-expanded={popover}
      aria-label={chipMode ? prototypeText.moreConditions(number, hidden) : text.contextMoreName(number, hidden)} onClick={open}
      className={cn(PANE_CHIP, 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring')}>
      {chipMode ? `+${hidden}` : text.contextMore(hidden)}
    </button>}
  </>;

  return <div ref={head} data-pane-head className={cn('relative shrink-0 border-b border-border-subtle px-2', chipMode === 'wrap' ? 'flex flex-col items-stretch gap-1 py-1' : 'flex h-10 items-center gap-2', selected ? 'bg-surface-row-selected' : 'bg-surface-card')}>
    <Popover open={popover} onOpenChange={setPopover}>
      <PopoverAnchor asChild><span className="absolute inset-x-0 bottom-0" aria-hidden /></PopoverAnchor>
      {chipMode === 'wrap'
        ? <>
          <div className="flex min-w-0 items-center gap-2">{identity}{name}{actions}</div>
          {(shown.length > 0 || hidden > 0) && <div ref={chipRegion} data-pane-chips className="flex max-h-14 min-w-0 flex-wrap content-start items-start gap-1 overflow-hidden">{chipNodes}</div>}
        </>
        : <>
          {identity}{name}
          {(shown.length > 0 || hidden > 0) && <div ref={chipRegion} data-pane-chips className="flex shrink-0 items-center gap-1">{chipNodes}</div>}
          {actions}
        </>}
      {chips.length > 0 && <div aria-hidden inert data-chip-measure-row className={cn('pointer-events-none invisible absolute left-0 top-0 flex gap-1', chipMode === 'wrap' && 'flex-wrap content-start')}>
        {chips.map(chip => {
          const accessibleText = chipText(chip);
          const visibleText = chipMode === 'value' ? chip.value ?? text.unsetValue : accessibleText;
          const className = chipMode === 'value' ? cn(PANE_CHIP, 'max-w-24 min-w-0 shrink truncate') : PANE_CHIP;
          return <span key={chip.key} data-chip-measure="chip" className={className}>{visibleText}</span>;
        })}
        <span data-chip-measure="more" className={PANE_CHIP}>+{chipMode === 'priority' ? signal?.rows.length ?? chips.length : chips.length}</span>
      </div>}
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
