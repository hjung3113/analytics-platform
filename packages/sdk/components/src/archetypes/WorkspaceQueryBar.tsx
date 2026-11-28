import { createContext, useCallback, useContext, useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info, Pin, PinOff } from 'lucide-react';
import { useI18n, useMessages } from '@ap/kernel';
import { useReadOnlyPreviewDisclosureDismissal, useReadOnlyPreviewGestures } from '@ap/kernel/host';
import { COMPONENTS_MESSAGES } from '../messages';
import { Button, cn, Popover, PopoverAnchor, PopoverContent, PopoverTrigger, TransientOverlayScope } from '@ap/ui';
import type { PageFilterSummaryItem } from '../filters/PageFilterBar';
import { PageFilterExpandedContext } from '../filters/pageFilterPresentation';
import { useCompactPageDensity } from '../pageDensity';
import { focusPageFallback } from '../state/pageFocus';

type PublishSummary = (summary: readonly PageFilterSummaryItem[]) => () => void;
/** Only the page editor publishes its filter summaries; panel-local filters never reach this line. */
export const WorkspacePageFilterSummaryContext = createContext<PublishSummary | null>(null);

type ContextLinePage = {
  active: boolean;
  extension: ReactNode;
  notes: readonly ReactNode[];
  noticeStatus: ReactNode;
  summary: readonly PageFilterSummaryItem[];
  pending: string;
  issues: string;
  publishSummary: PublishSummary;
  registerToolbar: () => () => void;
};

/** Page-owned controls reach the shell's query-bar region without a reverse package dependency. */
export const WorkspaceQueryBarContext = createContext<{
  status: ReactNode;
  parameterTarget: HTMLDivElement | null;
  setParameterTarget: (target: HTMLDivElement | null) => void;
  toolbarTarget: HTMLDivElement | null;
  setToolbarTarget: (target: HTMLDivElement | null) => void;
  legacyFolded?: boolean;
  live?: { pinnedTarget: HTMLDivElement | null };
  line?: ContextLinePage;
} | null>(null);

const MESSAGES = {
  page: COMPONENTS_MESSAGES.workspacePageConditions,
  more: { ko: '나머지 조건', en: 'Remaining conditions' },
  moreCount: { ko: '조건 {count}개 더 보기', en: '{count} more conditions' },
  moreOne: { ko: '조건 1개 더 보기', en: '1 more condition' },
  pin: { ko: '편집기 고정', en: 'Pin editor' },
  unpin: { ko: '편집기 고정 해제', en: 'Unpin editor' },
};

type QueryEditor =
  | { queryOpen: boolean; queryEditorId: string; onQueryChip: (event: MouseEvent<HTMLButtonElement>) => void; queryHandle: ReactNode; liveEditor?: undefined }
  | { liveEditor: { label: string; handle: { expand: string; collapse: string }; content: ReactNode; icon: ReactNode; handleRef: React.RefObject<HTMLButtonElement | null> } };

type LineProps = QueryEditor & {
  query: readonly PageFilterSummaryItem[];
  selection?: ReactNode;
  pinnedTarget?: HTMLDivElement | null;
  actions: ReactNode;
  chip: { query: string; page: string };
};

const EMPTY_LINE: LineProps = {
  query: [], queryOpen: false, queryEditorId: '', onQueryChip: () => {},
  queryHandle: null, actions: null, chip: { query: '', page: '' },
};

type Chip = PageFilterSummaryItem & { tone: 'query' | 'page' };
const chipKey = (item: Chip) => `${item.tone}:${item.key}`;
const LANE = 'flex min-w-0 items-center gap-1';
const FOCUS = 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring';

function ChipText({ item }: { item: PageFilterSummaryItem }) {
  return <span className="min-w-0 truncate"><span className="text-text-secondary">{item.label}</span>{' '}<span className="font-medium text-text-primary">{item.value}</span></span>;
}

/** Read the real chip widths and reserve the correct width for the eventual +n count. */
function useChipFit(count: number, keys: string, beforeFit: (expectedFit: number | null) => void) {
  const lane = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(count);
  const committedFit = useRef(fit);
  useLayoutEffect(() => { committedFit.current = fit; }, [fit]);
  useLayoutEffect(() => {
    const container = lane.current;
    const measure = probe.current;
    if (!container || !measure) return;
    const update = () => {
      const nodes = Array.from(measure.children);
      const width = container.getBoundingClientRect().width;
      const gap = parseFloat(getComputedStyle(measure).columnGap) || 0;
      let used = 0;
      let visible = 0;
      for (const [index, node] of nodes.slice(0, count).entries()) {
        used += node.getBoundingClientRect().width + (index > 0 ? gap : 0);
        const remaining = count - index - 1;
        const more = remaining > 0 ? nodes[count + String(remaining).length - 1]!.getBoundingClientRect().width + gap : 0;
        if (used + more <= width) visible = index + 1;
      }
      beforeFit(visible === committedFit.current ? null : visible);
      setFit(visible);
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(container);
    for (const node of measure.children) observer.observe(node);
    return () => observer.disconnect();
  }, [beforeFit, count, keys]);
  return { lane, probe, measuredFit: fit };
}

/** Shell bridge for the live page line and the registered apply workspace line. */
export function WorkspaceQueryBarRow({ render, line }: {
  render?: (active: boolean, pinText: { pin: string; unpin: string }, live?: { pinnedTarget: HTMLDivElement | null }) => ReactNode;
  line?: LineProps;
} = {}) {
  const workspace = useContext(WorkspaceQueryBarContext);
  const m = useMessages(MESSAGES);
  const compact = useCompactPageDensity();
  if (render) return render(workspace?.line?.active === true, { pin: m('pin'), unpin: m('unpin') }, workspace?.live);
  if (!workspace) return null;
  if (!workspace.line?.active) {
    if (line || workspace.legacyFolded === false) return null;
    return <div data-workspace-query-row className={compact ? 'px-4 pb-2' : 'px-3 pb-2'}>
      <div className="flex min-w-0 items-center gap-2 break-keep">
        {workspace.status}
        <div ref={workspace.setParameterTarget} className="min-w-0" />
      </div>
    </div>;
  }
  return <ContextLine {...(line ?? EMPTY_LINE)} page={workspace.line} status={workspace.status}
    setParameterTarget={workspace.setParameterTarget} setToolbarTarget={workspace.setToolbarTarget} />;
}

function ContextLine(props: LineProps & {
  page: ContextLinePage;
  status: ReactNode;
  setParameterTarget: (node: HTMLDivElement | null) => void;
  setToolbarTarget: (node: HTMLDivElement | null) => void;
}) {
  const { query, page, actions, chip, selection, pinnedTarget, liveEditor, status, setParameterTarget, setToolbarTarget } = props;
  const m = useMessages(MESSAGES);
  const { t } = useI18n();
  const previewGestures = useReadOnlyPreviewGestures();
  const compact = useCompactPageDensity();
  const pageEditor = useLineEditor();
  const live = useLineEditor();
  const { trigger: pageTrigger } = pageEditor;
  const queryExpanded = props.liveEditor ? live.shown : props.queryOpen;
  const queryId = props.liveEditor ? live.id : props.queryEditorId;
  const moreTrigger = useRef<HTMLButtonElement>(null);
  const previewMoreTrigger = useRef<HTMLSpanElement>(null);
  const moreContent = useRef<HTMLDivElement>(null);
  const visibleChips = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<{ from: HTMLElement; kind: 'chip' | 'overflow'; index: number; expectedFit: number } | null>(null);
  const hasPageEditor = Boolean(page.extension);
  const hasNotes = page.notes.length > 0;
  const noticeLabel = t('pageNotesCount', { count: page.notes.length });
  const chips: Chip[] = [...query.map(item => ({ ...item, tone: 'query' as const })), ...page.summary.map(item => ({ ...item, tone: 'page' as const }))];
  const beforeFit = useCallback((expectedFit: number | null) => {
    pendingFocus.current = null;
    const active = document.activeElement;
    if (expectedFit === null || !(active instanceof HTMLElement)) return;
    if (active === moreTrigger.current || active === previewMoreTrigger.current || moreContent.current?.contains(active)) {
      pendingFocus.current = { from: active, kind: 'overflow', index: (visibleChips.current?.children.length ?? 1) - 1, expectedFit };
    } else if (active.hasAttribute('data-context-chip') && visibleChips.current?.contains(active)) {
      pendingFocus.current = { from: active, kind: 'chip', index: 0, expectedFit };
    }
  }, []);
  const { lane, probe, measuredFit } = useChipFit(chips.length, JSON.stringify(chips.map(chipKey)), beforeFit);
  const fit = Math.min(chips.length, measuredFit);
  useLayoutEffect(() => {
    const previous = pendingFocus.current;
    // A key change can schedule the new fit during this commit's layout effects.
    if (!previous || previous.expectedFit !== measuredFit) return;
    pendingFocus.current = null;
    if (previous.from.isConnected || document.activeElement !== document.body) return;
    if (previewGestures) {
      focusPageFallback(lane.current);
      return;
    }
    const exposed = visibleChips.current?.children[previous.index];
    const next = previous.kind === 'overflow' && exposed instanceof HTMLButtonElement ? exposed : moreTrigger.current;
    const fallback = pageTrigger.current ?? lane.current?.parentElement?.querySelector('button');
    (next ?? fallback)?.focus({ preventScroll: true });
  });
  const remaining = chips.length - fit;
  const overflowClass = cn(chip.query, 'shrink-0 tabular-nums', FOCUS);
  const overflowDigits = chips.length ? String(chips.length).length : 0;
  const chipClass = (item: Chip) => cn(chip[item.tone], 'max-w-48 min-w-0 shrink-0', FOCUS);
  const pageLabel = m('page');
  const pageState = [page.pending, page.issues].filter(Boolean).join(' · ');
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowHandedOffFocus = useRef(false);
  const dismissPreviewDisclosure = useCallback((target: Node) => {
    if (!previewMoreTrigger.current?.contains(target) && !moreContent.current?.contains(target)) setOverflowOpen(false);
  }, []);
  useReadOnlyPreviewDisclosureDismissal(overflowOpen ? dismissPreviewDisclosure : null);
  useLayoutEffect(() => {
    if (remaining > 0) return;
    setOverflowOpen(false);
    overflowHandedOffFocus.current = false;
  }, [remaining]);
  const openFromOverflow = (editor: ReturnType<typeof useLineEditor>) => {
    overflowHandedOffFocus.current = editor.toggle(moreTrigger.current);
    setOverflowOpen(false);
  };
  const pageName = pageState ? `${pageLabel} · ${pageState}` : pageLabel;
  const controlledOverflow = Boolean(liveEditor || previewGestures);
  const overflowLabel = m(remaining === 1 ? 'moreOne' : 'moreCount', { count: remaining });
  const overflow = remaining > 0 && <Popover open={controlledOverflow ? overflowOpen : undefined} onOpenChange={controlledOverflow ? setOverflowOpen : undefined}>
    <PopoverTrigger asChild>{previewGestures
      // The fieldset disables native buttons, and its capture handler dispatches only registered display gestures.
      ? <span role="button" tabIndex={0} className={cn(overflowClass, 'cursor-pointer')} aria-label={overflowLabel} ref={node => {
          previewMoreTrigger.current = node;
          if (node) previewGestures.set(node, (_target, key) => {
            if (key !== undefined && key !== 'Enter' && key !== ' ') return false;
            setOverflowOpen(open => !open);
            return true;
          });
        }}>+{remaining}</span>
      : <button ref={moreTrigger} type="button" className={overflowClass} title={m('more')}
          aria-label={liveEditor ? overflowLabel : undefined}>+{remaining}</button>}
    </PopoverTrigger>
    <PopoverContent ref={moreContent} align="start" aria-label={m('more')} onKeyDownCapture={event => {
      const trigger = previewMoreTrigger.current;
      if (!trigger || event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
      // Bypass the popover's focus loop and let Tab advance from the trigger in either direction.
      event.stopPropagation();
      overflowHandedOffFocus.current = true;
      trigger.focus({ preventScroll: true });
      setOverflowOpen(false);
    }} onCloseAutoFocus={event => {
      const trigger = previewMoreTrigger.current ?? moreTrigger.current;
      if (!trigger?.isConnected || overflowHandedOffFocus.current) event.preventDefault();
      overflowHandedOffFocus.current = false;
    }} className="max-h-[var(--radix-popover-content-available-height)] max-w-[var(--radix-popover-content-available-width)] overflow-y-auto">
      <ul className="grid gap-1">
        {chips.slice(fit).map(item => {
          const editor = item.tone === 'query' ? live : pageEditor;
          const label = `${item.label} ${item.value}`;
          const className = cn(chip[item.tone], 'h-auto min-h-8 whitespace-normal [overflow-wrap:anywhere] py-1');
          const text = <><span className="text-text-secondary">{item.label}</span><span className="min-w-0 font-medium text-text-primary">{item.value}</span></>;
          return <li key={chipKey(item)}>
            {!previewGestures && liveEditor && (item.tone === 'query' || hasPageEditor)
              ? <button type="button" title={label} aria-label={label} aria-haspopup="dialog" aria-expanded={editor.shown} aria-controls={editor.id}
                  className={className} onClick={() => openFromOverflow(editor)}>{text}</button>
              : <span role="group" aria-label={label} className={className}>{text}</span>}
          </li>;
        })}
      </ul>
    </PopoverContent>
  </Popover>;
  return <>
    <div data-workspace-query-row className={cn('flex h-10 min-w-0 items-center gap-2 overflow-x-auto border-b border-border-chrome', compact ? 'px-4' : 'px-3')}>
      {liveEditor ? <LineEditor editor={live} label={liveEditor.label} handle={live.shown ? liveEditor.handle.collapse : liveEditor.handle.expand}
        className={chip.query} content={liveEditor.content} pinnedTarget={pinnedTarget} fallback={moreTrigger} handleRef={liveEditor.handleRef}>
        {liveEditor.icon}
      </LineEditor> : props.queryHandle}
      <div ref={lane} data-context-chip-lane className="relative flex min-w-min flex-1 items-center overflow-hidden">
        {/* Keep enough inline space to show +n even when every chip folds. */}
        {overflowDigits > 0 && <span aria-hidden className={cn(overflowClass, 'invisible')}>+{'0'.repeat(overflowDigits)}</span>}
        <div aria-hidden inert className="invisible absolute inset-x-0 top-0 h-0 overflow-hidden">
          <div ref={probe} data-context-chip-measure className={cn(LANE, 'w-max')}>
            {chips.map(item => <span key={chipKey(item)} className={chipClass(item)}><ChipText item={item} /></span>)}
            {Array.from({ length: overflowDigits }, (_, index) =>
              <span key={index} className={overflowClass}>+{'0'.repeat(index + 1)}</span>)}
          </div>
        </div>
        <div ref={visibleChips} className={cn(LANE, 'absolute inset-0')}>
          {chips.slice(0, fit).map(item => {
            const key = chipKey(item);
            const label = `${item.label} ${item.value}`;
            const queryChip = item.tone === 'query';
            if (!queryChip && !hasPageEditor) return <span key={key} role="group" aria-label={label} title={label} className={chipClass(item)}><ChipText item={item} /></span>;
            return <button key={key} data-context-chip type="button" className={chipClass(item)} title={label}
              aria-label={!queryChip && pageState ? `${label} · ${pageState}` : label}
              aria-haspopup="dialog" aria-expanded={queryChip ? queryExpanded : pageEditor.shown}
              aria-controls={queryChip ? queryId : pageEditor.id}
              onClick={event => {
                if (!queryChip) pageEditor.toggle(event.currentTarget);
                else if (props.liveEditor) live.toggle(event.currentTarget);
                else props.onQueryChip(event);
              }}><ChipText item={item} /></button>;
          })}
          {previewGestures ? <TransientOverlayScope active detached>{overflow}</TransientOverlayScope> : overflow}
        </div>
      </div>
      {hasPageEditor && <LineEditor editor={pageEditor} label={pageLabel} handle={pageName} className={chip.page}
        pinnedTarget={pinnedTarget} fallback={moreTrigger} content={
          <WorkspacePageFilterSummaryContext.Provider value={page.publishSummary}>
            <PageFilterExpandedContext.Provider value>{page.extension}</PageFilterExpandedContext.Provider>
          </WorkspacePageFilterSummaryContext.Provider>
        }>
        {pageLabel}{pageState && <span className="max-w-32 truncate text-text-secondary">{pageState}</span>}
      </LineEditor>}
      <div ref={setParameterTarget} className="shrink-0 empty:hidden [&_[data-page-condition-triggers]]:flex-nowrap [&_[data-page-condition-triggers]]:py-0" />
      {selection}
      {!hasNotes && status}
      <div ref={setToolbarTarget} data-workspace-toolbar-slot className="flex shrink-0 items-center empty:hidden" />
      {hasNotes && <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={cn(chip.query, 'shrink-0', FOCUS)} title={noticeLabel} aria-label={noticeLabel}>
            <Info className="size-4" aria-hidden />{page.notes.length}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" aria-label={noticeLabel} className="w-auto max-w-md max-h-[var(--radix-popover-content-available-height)] overflow-y-auto">
          {page.noticeStatus}
          <ul data-page-notes className="space-y-2">{page.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
        </PopoverContent>
      </Popover>}
      {actions}
    </div>
  </>;
}

function useLineEditor() {
  const id = useId();
  const [state, setState] = useState<'closed' | 'popover' | 'pinned'>('closed');
  const opener = useRef<HTMLButtonElement | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const outside = useRef(false);
  const shown = state !== 'closed';
  const toggle = (button: HTMLButtonElement | null) => {
    if (shown) {
      setState('closed');
      return false;
    }
    opener.current = button;
    outside.current = false;
    setState('popover');
    return true;
  };
  return { id, state, setState, opener, trigger, outside, shown, toggle };
}

function LineEditor({ editor, label, handle, className, content, children, pinnedTarget, fallback, handleRef }: {
  editor: ReturnType<typeof useLineEditor>;
  label: string;
  handle: string;
  className: string;
  content: ReactNode;
  children: ReactNode;
  pinnedTarget?: HTMLDivElement | null;
  fallback: React.RefObject<HTMLButtonElement | null>;
  handleRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const { id, state, setState, opener, trigger, outside, shown, toggle } = editor;
  const m = useMessages(MESSAGES);
  const compact = useCompactPageDensity();
  const pin = useRef<HTMLButtonElement>(null);
  const [host] = useState(() => typeof document === 'undefined' ? null : document.createElement('div'));
  const focusOpener = () => {
    const target = opener.current?.isConnected ? opener.current : trigger.current ?? fallback.current;
    target?.focus({ preventScroll: true });
  };
  const adopt = (node: HTMLDivElement | null) => { if (host && node && host.parentElement !== node) node.appendChild(host); };
  const body = <>
    <div className="mb-2 flex justify-end">
      <Button ref={pin} type="button" variant="ghost" size="toolbar" title={m(state === 'pinned' ? 'unpin' : 'pin')}
        onClick={() => setState(state === 'pinned' ? 'popover' : 'pinned')}>
        {state === 'pinned' ? <PinOff className="size-4" aria-hidden /> : <Pin className="size-4" aria-hidden />}
        {m(state === 'pinned' ? 'unpin' : 'pin')}
      </Button>
    </div>
    <div ref={adopt} />
  </>;
  useLayoutEffect(() => {
    if (state === 'pinned') pin.current?.focus({ preventScroll: true });
  }, [state, pinnedTarget]);
  return <>
    <Popover open={state === 'popover'} onOpenChange={open => { if (!open) setState('closed'); }}>
      <PopoverAnchor asChild><span className="flex shrink-0">
        <button ref={node => {
          trigger.current = node;
          if (handleRef) handleRef.current = node;
        }} type="button" className={cn(className, FOCUS)} title={handle}
          aria-label={handle} aria-haspopup="dialog" aria-expanded={shown} aria-controls={id}
          onClick={event => toggle(event.currentTarget)}>{children}</button>
      </span></PopoverAnchor>
      <PopoverContent align="start" id={id} aria-label={label} className="w-auto max-w-3xl max-h-[var(--radix-popover-content-available-height)] overflow-auto"
        onFocusOutside={event => {
          if (event.target instanceof Element && event.target.closest('[data-radix-popper-content-wrapper], [role="dialog"], [role="alertdialog"]')) event.preventDefault();
        }}
        onInteractOutside={event => {
          if (event.defaultPrevented) return;
          const target = event.target;
          // Retained controls render in a sibling React portal, so Radix sees their nested dialogs as outside.
          const dialog = target instanceof Element ? target.closest('[role="dialog"][id]') : null;
          const ownedDialog = dialog && host && Array.from(host.querySelectorAll('[aria-haspopup="dialog"][aria-expanded="true"]'))
            .some(control => control.getAttribute('aria-controls') === dialog.id);
          if (ownedDialog || (target instanceof Node && (opener.current?.contains(target) || trigger.current?.contains(target)))) event.preventDefault();
          else outside.current = true;
        }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          if (state === 'closed' && !outside.current) focusOpener();
        }}>
        {state === 'popover' && body}
      </PopoverContent>
    </Popover>
    {state === 'pinned' && pinnedTarget && createPortal(<section role="region" id={id} aria-label={label} data-context-editor-pinned
      className={cn('border-b border-border-chrome bg-surface-band py-2', compact ? 'px-4' : 'px-3')} onKeyDown={event => {
        if (event.key !== 'Escape' || event.defaultPrevented || !event.currentTarget.contains(event.target as Node)) return;
        event.preventDefault();
        event.stopPropagation();
        setState('closed');
        focusOpener();
      }}>{body}</section>, pinnedTarget)}
    {state === 'closed' && <div hidden ref={adopt} />}
    {host && createPortal(<TransientOverlayScope active={shown}>{content}</TransientOverlayScope>, host)}
  </>;
}
