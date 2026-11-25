import { createContext, useCallback, useContext, useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info, Pin, PinOff } from 'lucide-react';
import { useI18n, useMessages } from '@ap/kernel';
import { COMPONENTS_MESSAGES } from '../messages';
import { Button, cn, Popover, PopoverAnchor, PopoverContent, PopoverTrigger, TransientOverlayScope } from '@ap/ui';
import type { PageFilterSummaryItem } from '../filters/PageFilterBar';
import { PageFilterExpandedContext } from '../filters/pageFilterPresentation';
import { useCompactPageDensity } from '../pageDensity';

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
  line?: ContextLinePage;
} | null>(null);

const MESSAGES = {
  page: COMPONENTS_MESSAGES.workspacePageConditions,
  more: { ko: '나머지 조건', en: 'Remaining conditions' },
  pin: { ko: '편집기 고정', en: 'Pin editor' },
  unpin: { ko: '편집기 고정 해제', en: 'Unpin editor' },
};

type LineProps = {
  query: readonly PageFilterSummaryItem[];
  queryOpen: boolean;
  queryEditorId: string;
  onQueryChip: (event: MouseEvent<HTMLButtonElement>) => void;
  queryHandle: ReactNode;
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

/** Shell bridge: use the compact line only when the page's workspace toolbar has registered. */
export function WorkspaceQueryBarRow({ render, line }: {
  render?: (active: boolean, pinText: { pin: string; unpin: string }) => ReactNode;
  line?: LineProps;
} = {}) {
  const workspace = useContext(WorkspaceQueryBarContext);
  const m = useMessages(MESSAGES);
  const compact = useCompactPageDensity();
  if (render) return render(workspace?.line?.active === true, { pin: m('pin'), unpin: m('unpin') });
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

function ContextLine({ query, page, queryOpen, queryEditorId, onQueryChip, queryHandle, actions, chip, selection, pinnedTarget, status, setParameterTarget, setToolbarTarget }: LineProps & {
  page: ContextLinePage;
  status: ReactNode;
  setParameterTarget: (node: HTMLDivElement | null) => void;
  setToolbarTarget: (node: HTMLDivElement | null) => void;
}) {
  const m = useMessages(MESSAGES);
  const { t } = useI18n();
  const compact = useCompactPageDensity();
  const editorId = useId();
  const [editor, setEditor] = useState<'closed' | 'popover' | 'pinned'>('closed');
  const [host] = useState(() => typeof document === 'undefined' ? null : document.createElement('div'));
  const opener = useRef<HTMLElement | null>(null);
  const pageTrigger = useRef<HTMLButtonElement>(null);
  const moreTrigger = useRef<HTMLButtonElement>(null);
  const moreContent = useRef<HTMLDivElement>(null);
  const visibleChips = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<{ from: HTMLElement; kind: 'chip' | 'overflow'; index: number; expectedFit: number } | null>(null);
  const pin = useRef<HTMLButtonElement>(null);
  const outside = useRef(false);
  const shown = editor !== 'closed';
  const hasPageEditor = Boolean(page.extension);
  const hasNotes = page.notes.length > 0;
  const noticeLabel = t('pageNotesCount', { count: page.notes.length });
  const chips: Chip[] = [...query.map(item => ({ ...item, tone: 'query' as const })), ...page.summary.map(item => ({ ...item, tone: 'page' as const }))];
  const beforeFit = useCallback((expectedFit: number | null) => {
    pendingFocus.current = null;
    const active = document.activeElement;
    if (expectedFit === null || !(active instanceof HTMLElement)) return;
    if (active === moreTrigger.current || moreContent.current?.contains(active)) {
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
  const focusOpener = () => {
    const target = opener.current?.isConnected ? opener.current : pageTrigger.current ?? moreTrigger.current;
    target?.focus({ preventScroll: true });
  };
  const openPage = (event: MouseEvent<HTMLButtonElement>) => {
    if (shown) {
      setEditor('closed');
      return;
    }
    opener.current = event.currentTarget;
    outside.current = false;
    setEditor('popover');
  };
  const adopt = (node: HTMLDivElement | null) => { if (host && node && host.parentElement !== node) node.appendChild(host); };
  const editorBody = <>
    <div className="mb-2 flex justify-end">
      <Button ref={pin} type="button" variant="ghost" size="toolbar" title={m(editor === 'pinned' ? 'unpin' : 'pin')}
        onClick={() => setEditor(editor === 'pinned' ? 'popover' : 'pinned')}>
        {editor === 'pinned' ? <PinOff className="size-4" aria-hidden /> : <Pin className="size-4" aria-hidden />}
        {m(editor === 'pinned' ? 'unpin' : 'pin')}
      </Button>
    </div>
    <div ref={adopt} />
  </>;
  useLayoutEffect(() => {
    if (editor === 'pinned') pin.current?.focus({ preventScroll: true });
  }, [editor, pinnedTarget]);

  return <>
    <div data-workspace-query-row className={cn('flex h-10 min-w-0 items-center gap-2 overflow-x-auto border-b border-border-chrome', compact ? 'px-4' : 'px-3')}>
      {queryHandle}
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
              aria-haspopup="dialog" aria-expanded={queryChip ? queryOpen : shown}
              aria-controls={queryChip ? queryEditorId : editorId}
              onClick={queryChip ? onQueryChip : openPage}><ChipText item={item} /></button>;
          })}
          {remaining > 0 && <Popover>
            <PopoverTrigger asChild><button ref={moreTrigger} type="button" className={overflowClass} title={m('more')}>+{remaining}</button></PopoverTrigger>
            <PopoverContent ref={moreContent} align="start" aria-label={m('more')} onCloseAutoFocus={event => {
              if (!moreTrigger.current?.isConnected) event.preventDefault();
            }} className="max-h-[var(--radix-popover-content-available-height)] max-w-[var(--radix-popover-content-available-width)] overflow-y-auto">
              <ul className="grid gap-1">
                {chips.slice(fit).map(item => <li key={chipKey(item)}>
                  <span role="group" aria-label={`${item.label} ${item.value}`} className={cn(chip[item.tone], 'h-auto min-h-8 whitespace-normal [overflow-wrap:anywhere] py-1')}>
                    <span className="text-text-secondary">{item.label}</span><span className="min-w-0 font-medium text-text-primary">{item.value}</span>
                  </span>
                </li>)}
              </ul>
            </PopoverContent>
          </Popover>}
        </div>
      </div>
      {hasPageEditor && <Popover open={editor === 'popover'} onOpenChange={open => { if (!open) setEditor('closed'); }}>
        <PopoverAnchor asChild><span className="flex shrink-0">
          <button ref={pageTrigger} type="button" className={cn(chip.page, FOCUS)} title={pageLabel}
            aria-label={pageState ? `${pageLabel} · ${pageState}` : pageLabel} aria-haspopup="dialog" aria-expanded={shown} aria-controls={editorId}
            onClick={openPage}>{pageLabel}{pageState && <span className="max-w-32 truncate text-text-secondary">{pageState}</span>}</button>
        </span></PopoverAnchor>
        <PopoverContent align="start" id={editorId} aria-label={pageLabel} className="w-auto max-w-3xl max-h-[var(--radix-popover-content-available-height)] overflow-auto"
          // Child controls can move focus into a body portal while the editor is still in use.
          onFocusOutside={event => {
            if (event.target instanceof Element && event.target.closest('[data-radix-popper-content-wrapper], [role="dialog"], [role="alertdialog"]')) event.preventDefault();
          }}
          onInteractOutside={event => {
            if (event.defaultPrevented) return;
            const target = event.target;
            if (target instanceof Node && opener.current?.contains(target)) event.preventDefault();
            else outside.current = true;
          }}
          onCloseAutoFocus={event => {
            event.preventDefault();
            if (editor === 'closed' && !outside.current) focusOpener();
          }}>
          {editor === 'popover' && editorBody}
        </PopoverContent>
      </Popover>}
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
    {editor === 'pinned' && pinnedTarget && createPortal(<section role="region" id={editorId} aria-label={pageLabel} data-context-editor-pinned
      className={cn('border-b border-border-chrome bg-surface-band py-2', compact ? 'px-4' : 'px-3')} onKeyDown={event => {
        if (event.key !== 'Escape' || event.defaultPrevented || !event.currentTarget.contains(event.target as Node)) return;
        event.preventDefault();
        event.stopPropagation();
        setEditor('closed');
        focusOpener();
      }}>{editorBody}</section>, pinnedTarget)}
    {editor === 'closed' && <div hidden ref={adopt} />}
    {host && createPortal(<WorkspacePageFilterSummaryContext.Provider value={page.publishSummary}>
      <PageFilterExpandedContext.Provider value><TransientOverlayScope active={shown}>{page.extension}</TransientOverlayScope></PageFilterExpandedContext.Provider>
    </WorkspacePageFilterSummaryContext.Provider>, host)}
  </>;
}
