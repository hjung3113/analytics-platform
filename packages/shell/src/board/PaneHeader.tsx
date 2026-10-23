import { ChevronDown, ChevronUp, Maximize2, Minimize2, CornerUpLeft, MoreHorizontal } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { RETURN_CONTEXT_LABELS, useI18n } from '@ap/kernel';
import { useWorkspaceCommands } from '@ap/components/dock';
import {
  Button, buttonVariants, cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
  Popover, PopoverAnchor, PopoverContent,
} from '@ap/ui';
import { PANE_CHIP } from '../contextChip';
import { PaneBadge } from './PaneBadge';
import type { PaneSignal } from './paneActions';
import { boardText } from './text';

/** Default menu name minimum (docs/16 §4), matching min-w-24 on the name. */
export const MENU_NAME_MIN_WIDTH = 96;
/** Overflow with differing chips gives those chips space first, matching min-w-16 on the name. */
const MENU_NAME_MIN_WIDTH_SQUEEZED = 64;
const HEAD_PADDING = 16;
const HEAD_GAP = 8;
const CHIP_GAP = 4;

/** What `fitChips` measures: widths of the head's parts, and the width the head has. */
type ChipFit = { width: number; padding: number; fixed: number; chips: readonly number[]; more: number; same: number; sameCount: number; nameMin: number; nameMinSqueezed: number };

/**
 * How many difference chips fit in `width`. Overflow squeezes the menu name minimum; same conditions fold into the overflow count whenever the
 * full row does not fit. `tight`: not even the folded row (system chip, `+N`, actions) fits.
 */
export function fitChips(input: ChipFit): { visible: number; overflow: boolean; tight: boolean } {
  const { width, padding, fixed, chips, more, same, sameCount, nameMin, nameMinSqueezed } = input;
  const count = chips.length;
  const available = width - padding - fixed - nameMin - HEAD_GAP * (count > 0 ? 3 : 2);
  const allChips = chips.reduce((sum, w) => sum + w, 0) + CHIP_GAP * Math.max(0, count - 1);
  if (allChips + (sameCount > 0 ? same + HEAD_GAP : 0) <= available) return { visible: count, overflow: false, tight: false };
  if (count === 0) return { visible: 0, overflow: false, tight: true };
  const overflowAvailable = available + nameMin - nameMinSqueezed;
  for (let k = sameCount > 0 ? count : count - 1; k >= 0; k--) {
    const used = chips.slice(0, k).reduce((sum, w) => sum + w, 0)
      + CHIP_GAP * Math.max(0, k - 1)
      + more + (k > 0 ? CHIP_GAP : 0);
    if (used <= overflowAvailable) return { visible: k, overflow: true, tight: false };
  }
  return { visible: 0, overflow: true, tight: true };
}

/** Dock strip: the least width a tab takes while its name is cut to 64px (badge, name, X, padding), and a background tab that keeps its badge only. */
const TAB_FLOOR = 136;
const TAB_FLOOR_COMPACT = 46;
const TAB_NAME_MIN = 64;
const DOCK_PADDING = 4;
/** The strip's icon buttons are 28px (docs/16 §4.4); the grid head keeps `icon-sm`. */
const DOCK_ICON = 'size-7';
export type DockStrip = { width: number; tabs: number };

/**
 * What the strip's tabs need at the least, measured on the tabs themselves (the constants above are the spec's, used where the DOM has no size):
 * a tab keeps its badge, its action and its name down to 64px; a background tab in `compact` keeps its badge and padding only. A tab whose name is
 * hidden (it is compact now) says nothing about its full floor, so the constant stands in.
 */
function tabFloors(strip: HTMLElement | null, compact: boolean): number[] {
  const width = (item: Element) => item.getBoundingClientRect().width;
  return Array.from(strip?.querySelectorAll<HTMLElement>('.dv-tab') ?? []).map(tab => {
    const active = tab.classList.contains('dv-active-tab');
    const fallback = active || !compact ? TAB_FLOOR : TAB_FLOOR_COMPACT;
    const own = width(tab);
    if (own <= 0) return fallback;
    if (compact && !active) {
      const badge = tab.querySelector('[data-pane-badge]');
      const style = getComputedStyle(tab);
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      return badge && width(badge) > 0 && padding > 0 ? width(badge) + padding : fallback;
    }
    const name = tab.querySelector('[data-dock-tab-shrinkable]');
    const nameWidth = name ? width(name) : 0;
    return name && nameWidth <= 0 ? fallback : own - Math.max(0, nameWidth - TAB_NAME_MIN);
  });
}

/**
 * How many difference chips fit in the head. Measurements happen after layout, and a zero-width first paint shows all chips. In the dock the
 * head is the active pane's slot in its group's strip, so the room is the strip minus what the tabs need, narrowed in the order of docs/16 §4:
 * tab names to their minimum (CSS), background tabs to their badge (`compact`), chips into `+N`, last the slot on a row of its own (`wrap`).
 */
function useVisibleChips(head: RefObject<HTMLDivElement | null>, count: number, signature: string, sameCount: number, nameMin: number, nameMinSqueezed: number, strip: DockStrip | null) {
  const [layout, setLayout] = useState({ visible: count, overflow: false, compact: false, wrap: false });
  const inDock = strip !== null;
  const stripWidth = strip?.width ?? 0;
  const tabs = strip?.tabs ?? 0;
  useLayoutEffect(() => {
    const element = head.current;
    if (!element) return;
    const measure = () => {
      const width = inDock ? stripWidth : element.getBoundingClientRect().width;
      if (width <= 0 || (count === 0 && !inDock)) { setLayout({ visible: count, overflow: false, compact: false, wrap: false }); return; }
      const widthOf = (selector: string) => Array.from(element.querySelectorAll<HTMLElement>(selector)).map(item => item.getBoundingClientRect().width);
      const fixed = widthOf('[data-head-fixed]').reduce((sum, w) => sum + w, 0);
      const [more = 0] = widthOf('[data-chip-measure="more"]');
      const [same = 0] = widthOf('[data-chip-measure="same"]');
      const input = { padding: inDock ? DOCK_PADDING : HEAD_PADDING, fixed, chips: widthOf('[data-chip-measure="chip"]'), more, same, sameCount, nameMin, nameMinSqueezed };
      if (!inDock) {
        const fit = fitChips({ ...input, width });
        setLayout({ visible: fit.visible, overflow: fit.overflow, compact: false, wrap: false });
        return;
      }
      const stripElement = element.closest<HTMLElement>('.dv-tabs-and-actions-container');
      const roomFor = (compact: boolean) => {
        const floors = tabFloors(stripElement, compact);
        // The strip lists as many tabs as the group has; a count that disagrees (first paint) falls back to the spec's constants.
        const used = floors.length === tabs ? floors.reduce((sum, w) => sum + w, 0)
          : compact ? TAB_FLOOR + TAB_FLOOR_COMPACT * Math.max(0, tabs - 1) : TAB_FLOOR * tabs;
        return width - used;
      };
      let compact = false;
      let wrap = false;
      let fit = fitChips({ ...input, width: roomFor(false) });
      if (fit.overflow || fit.tight) {
        compact = tabs > 1;
        fit = fitChips({ ...input, width: roomFor(true) });
        if (fit.tight) { wrap = true; fit = fitChips({ ...input, width }); }
      }
      setLayout(previous => (previous.visible === fit.visible && previous.overflow === fit.overflow && previous.compact === compact && previous.wrap === wrap ? previous : { visible: fit.visible, overflow: fit.overflow, compact, wrap }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    // The head alone is not enough: a fixed group or a measuring chip can change size (`이전 화면` appears, the language changes) with the head's width unchanged.
    for (const target of [element, ...element.querySelectorAll('[data-head-fixed], [data-chip-measure]'), ...(inDock ? element.closest('.dv-tabs-and-actions-container')?.querySelectorAll('.dv-tab') ?? [] : [])]) observer.observe(target);
    return () => observer.disconnect();
  }, [head, count, signature, sameCount, nameMin, nameMinSqueezed, inDock, stripWidth, tabs]);
  return { visible: Math.min(layout.visible, count), overflow: count > 0 && layout.overflow, compact: layout.compact, wrap: layout.wrap };
}

export type PaneHeaderProps = {
  /**
   * `dock`: the head is the active pane's slot in its tab group's strip (docs/16 §4). The pane's number and menu name are on its tab, so the head
   * keeps the system chip, the Context chips, `이전 화면`, the maximize toggle and one `⋯` menu (the pane's content actions, then `dockMenu`'s layout actions).
   */
  variant?: 'grid' | 'dock';
  /** Dock only: the group's strip, for narrowing the head against its tabs. */
  strip?: DockStrip;
  /** Dock only: the layout group of the `⋯` menu (maximize or restore, split, move). It gets the ref that runs after the menu has closed. */
  dockMenu?: (afterMenuClose: RefObject<(() => void) | null>) => ReactNode;
  /** Dock renderer, empty pane: offers `칸 닫기` in the `⋯` menu. */
  onClosePane?: () => void;
  sizing?: boolean;
  collapsed?: boolean;
  maximized?: boolean;
  canMaximize?: boolean;
  collapseOff?: string | null;
  onCollapse?: () => void;
  onMaximize?: () => void;
  presentationHidden?: boolean;
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
 * The pane head (docs/16 §4, ADR-0051), one line: number badge · system chip · menu name · difference chips · same-condition summary · actions
 * (in the dock the badge and name are on the tab and the head is a group named `칸 N 머리`).
 * Differing chips get space before the same-condition summary; a row that does not fit folds the summary into +N and opens the full popover.
 * Any control selects the pane first
 * (the pane root also does, on focus and press).
 */
export function PaneHeader(props: PaneHeaderProps) {
  const { number, selected, systemLabel, menuName, active, signal, hasPrevious, applyAllOff, duplicateOff, menuTrigger, onSelect, afterMenuClose } = props;
  const dock = props.variant === 'dock';
  const { lang, tx } = useI18n();
  const text = boardText(lang);
  const head = useRef<HTMLDivElement>(null);
  const id = useId();
  const lastTrigger = useRef<HTMLElement | null>(null);
  const editing = useRef(false);
  const [popover, setPopover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const ownerHidden = useRef(false);
  const cancelMenuFocus = useRef(false);
  const bodyHidden = props.collapsed && !props.maximized;
  useLayoutEffect(() => {
    ownerHidden.current = props.presentationHidden ?? false;
  }, [props.presentationHidden]);
  useLayoutEffect(() => {
    if (!props.presentationHidden && !bodyHidden) return;
    // Cancel the outgoing overlays once; the collapsed header remains interactive.
    cancelMenuFocus.current = true;
    setPopover(false);
    setMenuOpen(false);
    afterMenuClose.current = null;
    lastTrigger.current = null;
    editing.current = false;
  }, [props.presentationHidden, bodyHidden, afterMenuClose]);
  const chips = signal?.compared ? signal.differing : [];
  const signature = chips.map(c => `${c.key}:${c.value}`).join('|');
  const sameCount = signal ? (signal.compared ? signal.same.length : signal.rows.length) : 0;
  // The dock fits the summary button whether or not there are differing chips; the grid only has one to fit next to chips.
  const { visible: visibleCount, overflow, compact, wrap } = useVisibleChips(head, chips.length, signature, dock ? (active ? sameCount : 0) : signal?.compared ? signal.same.length : 0, dock ? 0 : MENU_NAME_MIN_WIDTH, dock ? 0 : MENU_NAME_MIN_WIDTH_SQUEEZED, dock ? props.strip ?? null : null);
  const shown = chips.slice(0, visibleCount);
  const hiddenDifferences = chips.length - shown.length;
  const hidden = overflow ? hiddenDifferences + (signal?.compared ? signal.same.length : 0) : 0;
  const label = (key: (typeof chips)[number]['key']) => tx(RETURN_CONTEXT_LABELS[key]);
  const chipText = (chip: (typeof chips)[number]) => `${label(chip.key)} ${chip.value ?? text.unsetValue}`;
  const open = (event: { currentTarget: HTMLElement }) => { onSelect(); lastTrigger.current = event.currentTarget; setPopover(true); };

  const dockProps = dock ? {
    role: 'group', 'aria-label': text.paneHead(number), 'data-dock-selected': selected ? '' : undefined, 'data-dock-compact': compact ? '' : undefined, 'data-dock-wrap': wrap ? '' : undefined,
  } : {};
  const hasContentMenu = active || props.onClosePane;
  // A menu workspace in this pane draws no toolbar and offers its commands here (ADR-0067 decision 3).
  const workspaceCommands = useWorkspaceCommands();
  const presetCommands = workspaceCommands.filter(command => command.kind === 'radio');
  const otherCommands = workspaceCommands.filter(command => command.kind !== 'radio');
  return <div ref={head} data-pane-head {...dockProps}
    className={cn('relative flex items-center gap-2', dock ? 'h-full min-w-0 pr-1' : cn('h-10 shrink-0 border-b border-border-subtle px-2', selected ? 'bg-surface-row-selected' : 'bg-surface-card'))}>
    <Popover open={popover} onOpenChange={setPopover}>
      <PopoverAnchor asChild><span className="absolute inset-x-0 bottom-0" aria-hidden /></PopoverAnchor>
      <div data-head-fixed className="flex shrink-0 items-center gap-2">
        {!dock && <button type="button" aria-label={text.selectPane(number)} aria-pressed={selected} onClick={onSelect}
          className="rounded-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring">
          <PaneBadge label={text.pane(number)} selected={selected} />
        </button>}
        {systemLabel && <span data-pane-system className="shrink-0 rounded-xs border border-border-subtle px-1.5 text-caption text-text-secondary">{systemLabel}</span>}
      </div>
      {dock ? null
        : <span className={cn('flex-1 truncate text-sm font-medium text-text-primary', overflow && chips.length > 0 ? 'min-w-16' : 'min-w-24')}>{menuName}</span>}
      {(shown.length > 0 || hidden > 0) && <div data-pane-chips className="flex shrink-0 items-center gap-1">
        {shown.map(chip => <span key={chip.key} data-pane-chip={chip.key} className={PANE_CHIP}>{chipText(chip)}</span>)}
        {hidden > 0 && <button type="button" data-pane-chip="more" aria-haspopup="dialog" aria-expanded={popover} aria-label={text.contextMoreName(number, hidden)} onClick={open} className={cn(PANE_CHIP, 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring')}>{text.contextMore(hidden)}</button>}
      </div>}
      {(chips.length > 0 || (dock && active && sameCount > 0)) && <div aria-hidden inert className="pointer-events-none invisible absolute left-0 top-0 flex gap-1">
        {chips.map(chip => <span key={chip.key} data-chip-measure="chip" className={PANE_CHIP}>{chipText(chip)}</span>)}
        {chips.length > 0 && <span data-chip-measure="more" className={PANE_CHIP}>{text.contextMore(chips.length + (signal?.compared ? sameCount : 0))}</span>}
        {active && sameCount > 0 && <span className={buttonVariants({ variant: 'ghost', size: 'toolbar' })} data-chip-measure="same">
          {signal?.compared ? text.contextSame(sameCount) : text.contextCount(sameCount)}
        </span>}
      </div>}
      {active && signal && sameCount > 0 && hidden === 0 && <Button type="button" variant="ghost" size="toolbar" aria-haspopup="dialog" aria-expanded={popover}
        aria-label={signal.compared ? text.contextSameName(number, sameCount) : text.contextCountName(number, sameCount)} onClick={open}>
        {signal.compared ? text.contextSame(sameCount) : text.contextCount(sameCount)}
      </Button>}
      <div data-head-fixed="actions" className="flex shrink-0 items-center gap-1">
        {active && hasPrevious && <Button type="button" variant="ghost" size="icon-sm" className={dock ? DOCK_ICON : undefined} aria-label={text.previousScreen} title={text.previousScreen}
          onClick={() => { onSelect(); props.onBack(); }}><CornerUpLeft className="size-3.5" aria-hidden /></Button>}
        {props.sizing && <>
          <Button type="button" variant="ghost" size="icon-sm" aria-expanded={!props.collapsed} aria-label={props.collapsed ? text.expandPane(number) : text.collapsePane(number)}
            disabled={props.collapseOff != null} aria-describedby={props.collapseOff ? `${id}-collapse-off` : undefined} onClick={props.onCollapse}>
            {props.collapsed ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronUp className="size-3.5" aria-hidden />}
          </Button>
          {props.collapseOff && <span id={`${id}-collapse-off`} className="sr-only">{props.collapseOff}</span>}
          {props.canMaximize && <Button type="button" variant="ghost" size="icon-sm" data-pane-maximize aria-label={props.maximized ? text.restoreSize : text.maximizePane(number)} onClick={props.onMaximize}>
            {props.maximized ? <Minimize2 className="size-3.5" aria-hidden /> : <Maximize2 className="size-3.5" aria-hidden />}
          </Button>}
        </>}
        {dock && <Button type="button" variant="ghost" size="icon-sm" className={DOCK_ICON} data-pane-maximize aria-label={props.maximized ? text.restoreSize : text.maximizePane(number)} title={props.maximized ? text.restoreSize : text.maximizePane(number)} onClick={props.onMaximize}>
          {props.maximized ? <Minimize2 className="size-3.5" aria-hidden /> : <Maximize2 className="size-3.5" aria-hidden />}
        </Button>}
        {(hasContentMenu || dock) && <DropdownMenu open={menuOpen} onOpenChange={open => { if (open) cancelMenuFocus.current = false; setMenuOpen(open); }}>
          <DropdownMenuTrigger asChild>
            <Button ref={menuTrigger} type="button" variant="ghost" size="icon-sm" className={dock ? DOCK_ICON : undefined} data-dock-group-menu={dock ? '' : undefined} aria-label={text.paneActions(number)} title={text.paneActions(number)} onPointerDown={onSelect}><MoreHorizontal className="size-3.5" aria-hidden /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end"
            onCloseAutoFocus={event => {
              if (ownerHidden.current || cancelMenuFocus.current) { event.preventDefault(); cancelMenuFocus.current = false; afterMenuClose.current = null; return; }
              const next = afterMenuClose.current;
              if (next === null) return;
              afterMenuClose.current = null;
              event.preventDefault();
              next();
            }}>
            {!active && props.onClosePane && <DropdownMenuItem onSelect={() => { afterMenuClose.current = () => {}; props.onClosePane?.(); }}>{text.closePane(number)}</DropdownMenuItem>}
            {active && <>
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
            </>}
            {workspaceCommands.length > 0 && <>
              {hasContentMenu && <DropdownMenuSeparator />}
              <DropdownMenuLabel>{text.screenLayout}</DropdownMenuLabel>
              {presetCommands.length > 0 && <DropdownMenuRadioGroup value={presetCommands.find(command => command.checked)?.id ?? ''} onValueChange={id => { presetCommands.find(command => command.id === id)?.run(); }}>
                {presetCommands.map(command => <DropdownMenuRadioItem key={command.id} value={command.id} disabled={command.disabled}>{command.label}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>}
              {otherCommands.map(command => <DropdownMenuItem key={command.id} disabled={command.disabled} onSelect={() => command.run()}>{command.label}</DropdownMenuItem>)}
            </>}
            {dock && props.dockMenu && <>
              {(hasContentMenu || workspaceCommands.length > 0) && <DropdownMenuSeparator />}
              {props.dockMenu(afterMenuClose)}
            </>}
          </DropdownMenuContent>
        </DropdownMenu>}
      </div>
      <PopoverContent align="end" role="dialog" aria-label={text.contextPopover(number)} className="w-80"
        onCloseAutoFocus={event => {
          event.preventDefault();
          if (ownerHidden.current) return;
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
