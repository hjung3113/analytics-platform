import { Fragment, useCallback, useId, useLayoutEffect, useRef, useState, type RefCallback, type RefObject } from 'react';
import { Ellipsis, X } from 'lucide-react';
import { PlatformLink, useAnalysisSelectionChips, useI18n, useMessages, usePlatformOptional, type AnalysisSelectionChip } from '@ap/kernel';
import { useAnalysisSelectionHoverTarget, useHostPlatformOptional } from '@ap/kernel/host';
import { Button, Checkbox, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Input, Label, Popover, PopoverContent, PopoverTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, cn } from '@ap/ui';
import { useReturnNavigation } from '../archetypes/DrillLayout';
import { usePublishedNextAnalysis } from '../chart/NextAnalysisBridge';
import { NextAnalysisMenuItem, useNextAnalysisItems, type DirectNextAnalysisAction } from '../chart/NextAnalysisItems';
import { COMPONENTS_MESSAGES } from '../messages';
import { useElementSize, useObservedElementSize } from '../state/useElementSize';

export type AnalysisSelectionChipZoneFit = { container: HTMLElement | null; summary: HTMLElement | null };
type ClearChip = (key: string) => void;
type ChipEditor = NonNullable<ReturnType<typeof useAnalysisSelectionChips>['editor']>;
type Selection = AnalysisSelectionChip['selection'];
type ReturnActionFocus = (key: string, options: { fromList: boolean }) => boolean;
type ClearButtonRef = RefCallback<HTMLButtonElement>;
type ChipInteraction = 'pointer' | 'focus';
type ClearFocus = { kind: 'clear'; key: string | null; index: number; from: string; to: string } | { kind: 'list'; index: number };
type EditFocus = { kind: 'commit'; key: string } | { kind: 'focused'; key: string; button: HTMLButtonElement };
type EditFocusHandlers = {
  trackButton: (button: HTMLButtonElement) => () => void;
  onCommit: (key: string, options: { fromList: boolean }) => void;
  restore: () => void;
};
const zoneClass = 'inline-flex shrink-0 items-center gap-2 pl-2 text-xs';
const focusClass = 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring';
const linkClass = cn('h-6.5 shrink-0 rounded-sm whitespace-nowrap text-xs font-medium text-accent-primary hover:underline', focusClass);

function SelectionFields({ chip, editor, close }: { chip: AnalysisSelectionChip; editor: ChipEditor; close: () => void }) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const [draft, setDraft] = useState(chip.selection);
  const [rejected, setRejected] = useState(false);
  const id = useId();
  const errorId = `${id}-error`;
  const update = (next: Selection) => { setDraft(next); setRejected(false); };
  const report = editor.availability.get(chip.key);
  const available = report && !('from' in report) ? new Set(report) : undefined;
  const candidates = new Set(available);
  if (chip.selection.shape === 'set') for (const value of chip.selection.values) candidates.add(value);
  if (draft.shape === 'set') for (const value of draft.values) candidates.add(value);
  const rangeError = draft.shape === 'range' && rejected;
  const rangeCandidates = report && 'from' in report ? report.candidates : undefined;
  return <form className="grid gap-2" onSubmit={event => {
    event.preventDefault();
    if (!editor.replace(chip.key, draft, close)) setRejected(true);
  }}>
    {draft.shape === 'set' ? <div className="grid max-h-64 gap-2 overflow-y-auto p-1">
      {[...candidates].map(value => <Label key={value} className="flex items-center">
        <Checkbox checked={draft.values.includes(value)} onCheckedChange={checked => {
          const values = checked === true ? [...draft.values, value] : draft.values.filter(item => item !== value);
          update({ shape: 'set', values });
        }} />
        <span className="ml-2 min-w-0 wrap-anywhere">{value}{available && !available.has(value) && <> <span className="text-text-secondary">{m('analysisSelectionUnavailable')}</span></>}</span>
      </Label>)}
    </div> : (['from', 'to'] as const).map(endpoint => {
      const fieldId = `${id}-${endpoint}`;
      const label = m(endpoint === 'from' ? 'analysisSelectionStart' : 'analysisSelectionEnd');
      const value = draft[endpoint];
      const change = (next: string) => update({ ...draft, [endpoint]: next });
      const validation = { 'aria-invalid': rangeError || undefined, 'aria-describedby': rangeError ? errorId : undefined };
      return <div className="grid gap-1" key={endpoint}>
        <Label htmlFor={fieldId}>{label}</Label>
        {rangeCandidates?.length ? <Select value={value} onValueChange={change}>
          <SelectTrigger id={fieldId} {...validation}><SelectValue placeholder={label} /></SelectTrigger>
          <SelectContent>
            {!rangeCandidates.some(candidate => candidate.value === value) && <SelectItem value={value} disabled>{value}</SelectItem>}
            {rangeCandidates.map(candidate => <SelectItem key={candidate.value} value={candidate.value}>{candidate.label}</SelectItem>)}
          </SelectContent>
        </Select> : <Input id={fieldId} value={value} {...validation} onChange={event => change(event.target.value)} />}
      </div>;
    })}
    {rejected && <p id={errorId} role="alert" className="text-xs text-text-danger-label">
      {m(draft.shape === 'range' ? 'analysisSelectionInvalidRange' : 'analysisSelectionInvalidSet')}
    </p>}
    <Button type="submit" size="sm" className="justify-self-end">{m('analysisSelectionApply')}</Button>
  </form>;
}

const chipButtonClass = cn('inline-flex size-6.5 shrink-0 items-center justify-center rounded-full hover:bg-surface-row-hover', focusClass);

function ChipActionItems({ chip, panelId, onSelect }: { chip: AnalysisSelectionChip; panelId: string; onSelect: (action: DirectNextAnalysisAction) => void }) {
  const output = { panelId, key: chip.key };
  const { publication, workspace } = usePublishedNextAnalysis(output);
  const items = useNextAnalysisItems({ output, selection: chip.selection, workspace: workspace ?? null, pointDrill: publication?.pointDrill });
  return <>{[...items, ...(publication?.actions ?? [])].map(action => <NextAnalysisMenuItem
    key={'onSelect' in action ? action.id : action.label} action={action} onSelect={onSelect} />)}</>;
}

function ChipActions({ chip, text, clear, returnFocus }: {
  chip: AnalysisSelectionChip; text: string; clear: ClearChip; returnFocus?: () => boolean;
}) {
  const platform = usePlatformOptional();
  const { t } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const actionClaimsFocus = useRef(false);
  const openingPath = useRef<string | undefined>(undefined);
  const path = () => platform?.location.read()?.split('?')[0];
  return <DropdownMenu modal={false} onOpenChange={open => {
    if (!open) return;
    actionClaimsFocus.current = false;
    openingPath.current = path();
  }}>
    <DropdownMenuTrigger asChild>
      <button data-analysis-chip-action={chip.key} type="button" className={chipButtonClass} aria-label={m('analysisSelectionActions', { chip: text })}><Ellipsis className="size-3.5" aria-hidden /></button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" onCloseAutoFocus={event => {
      // The action or the destination owns focus after this menu dismisses.
      if (actionClaimsFocus.current || openingPath.current !== path()) event.preventDefault();
    }}>
      {platform && chip.source && <ChipActionItems chip={chip} panelId={chip.source.panelId} onSelect={action => {
        actionClaimsFocus.current = action.claimsFocus === true;
        action.onSelect(returnFocus);
      }} />}
      <DropdownMenuItem onSelect={() => clear(chip.key)}>{t('clear')}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}

function ArrivalLink({ href, chipKey, linkRef, menu }: { href: string; chipKey: string; linkRef?: RefCallback<HTMLAnchorElement>; menu?: string }) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const { onNavigate } = useReturnNavigation();
  const label = menu === undefined ? m('analysisSelectionArrivalBack') : m('analysisSelectionArrivalNamedBack', { menu });
  return <PlatformLink ref={linkRef} data-analysis-chip-arrival={chipKey} via="return" className={chipButtonClass}
    href={href} aria-label={label} onNavigate={onNavigate}>←</PlatformLink>;
}

function Chip({ chip, clear, editor, wrap, measuring, clearButtonRef, arrivalLinkRef, editFocus, returnActionFocus }: {
  chip: AnalysisSelectionChip; clear: ClearChip; editor?: ChipEditor; wrap?: boolean; measuring?: boolean;
  clearButtonRef?: ClearButtonRef; arrivalLinkRef?: RefCallback<HTMLAnchorElement>; editFocus?: EditFocusHandlers; returnActionFocus?: ReturnActionFocus;
}) {
  const { lang, tx } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const beginHover = useAnalysisSelectionHoverTarget(measuring ? undefined : chip.key);
  const labelId = useId();
  const editTrigger = useRef<HTMLButtonElement>(null);
  const committed = useRef(false);
  const trackButton = editFocus?.trackButton;
  const editTriggerRef = useCallback<RefCallback<HTMLButtonElement>>(button => {
    if (!button) return;
    editTrigger.current = button;
    const detach = trackButton?.(button);
    return () => {
      detach?.();
      editTrigger.current = null;
    };
  }, [trackButton]);
  const edit = editor?.replace;
  const selectionKey = JSON.stringify(chip.selection);
  const [opened, setOpened] = useState<{ edit: typeof edit; selectionKey: string } | null>(null);
  const open = opened !== null && opened.edit === edit && opened.selectionKey === selectionKey;
  if (opened && !open) setOpened(null);
  useLayoutEffect(() => { if (open) return beginHover(); }, [open, beginHover]);
  const releases = useRef(new Map<ChipInteraction, () => void>());
  useLayoutEffect(() => {
    const interactions = releases.current;
    return () => {
      for (const release of interactions.values()) release();
      interactions.clear();
    };
  }, [beginHover]);
  const enter = (interaction: ChipInteraction) => {
    if (releases.current.has(interaction)) return;
    const release = beginHover();
    if (release) releases.current.set(interaction, release);
  };
  const leave = (interaction: ChipInteraction) => {
    releases.current.get(interaction)?.();
    releases.current.delete(interaction);
  };
  const dimension = chip.label?.[lang] ?? chip.dimension;
  const title = chip.source?.title[lang];
  const source = title && !/\{[^{}]+\}/.test(title) ? title : undefined;
  const selection = chip.selection;
  let value = '';
  if (selection.shape === 'range') value = `${selection.from} – ${selection.to}`;
  else {
    const [first, ...others] = selection.values;
    value = others.length > 0 ? m('analysisSelectionMoreValues', { first, count: others.length }) : first ?? '';
  }
  const text = `${dimension} ${value}`;
  const origin = chip.arrival?.origin;
  const menu = origin && tx(origin.menuLabel);
  const arrivalPrefix = menu === undefined ? m('analysisSelectionArrivalPrefix') : m('analysisSelectionArrivalNamedPrefix', { menu });
  const notApplied = chip.applied === false;
  const muted = notApplied || !chip.available;
  const statusId = `${labelId}-status`;
  const status = notApplied ? m('analysisSelectionNotApplied') : m('analysisSelectionUnavailable');
  const description = <>
    {chip.source && <span role="img" aria-label={source ?? dimension} title={source} className="size-3.5 shrink-0 rounded-sm border border-current" />}
    <span id={labelId} className="inline-flex min-w-0 gap-1">
      {chip.arrival && <span className="shrink-0 whitespace-nowrap">{arrivalPrefix}</span>}
      <span className={wrap ? '[overflow-wrap:anywhere]' : 'max-w-40 truncate'} title={text}>{text}</span>
    </span>
    {muted && <span id={notApplied ? undefined : statusId} className="shrink-0">{status}</span>}
    {notApplied && <span id={statusId} className="sr-only">{m('analysisSelectionNotAppliedDescription')}</span>}
  </>;
  return <span className={cn('inline-flex min-w-0 items-center rounded-full text-xs font-medium',
    wrap ? 'min-h-6.5' : 'h-6.5',
    muted ? 'bg-accent-neutral-soft text-text-secondary' : 'bg-accent-primary-soft text-accent-primary')}
    onPointerEnter={event => { if (event.pointerType !== 'touch') enter('pointer'); }}
    onPointerLeave={() => leave('pointer')} onFocus={() => enter('focus')} onBlur={() => leave('focus')}>
    {chip.arrival && (measuring ? <span className={chipButtonClass}>←</span> :
      <ArrivalLink href={chip.arrival.href} chipKey={chip.key} linkRef={arrivalLinkRef} menu={menu} />)}
    {editor && !measuring ? <Popover open={open} onOpenChange={next => {
      if (next) committed.current = false;
      setOpened(next ? { edit, selectionKey } : null);
    }}>
      <PopoverTrigger asChild>
        <button ref={editTriggerRef} type="button" data-analysis-chip-edit={chip.key} aria-labelledby={labelId} aria-describedby={muted ? statusId : undefined}
          className={cn('inline-flex min-h-6.5 min-w-0 items-center gap-1 rounded-full pl-2 pr-1 text-start hover:bg-surface-row-hover', focusClass)}>
          {description}
        </button>
      </PopoverTrigger>
      <PopoverContent aria-labelledby={labelId} align="start" className="max-h-[var(--radix-popover-content-available-height)] max-w-[var(--radix-popover-content-available-width)] overflow-y-auto"
        onCloseAutoFocus={event => {
          if (committed.current || !editTrigger.current?.isConnected) event.preventDefault();
          if (committed.current) editFocus?.restore();
        }}>
        <SelectionFields chip={chip} editor={editor} close={() => {
          committed.current = true;
          editFocus?.onCommit(chip.key, { fromList: wrap === true });
          setOpened(null);
        }} />
      </PopoverContent>
    </Popover> : <span className="inline-flex min-w-0 items-center gap-1 pl-2 pr-1">{description}</span>}
    <button ref={clearButtonRef} type="button" disabled={measuring} className={chipButtonClass}
      data-analysis-chip-clear={chip.key} aria-label={m('analysisSelectionClear', { dimension })} aria-describedby={notApplied ? statusId : undefined} onClick={() => clear(chip.key)}>
      <X className="size-3.5" aria-hidden />
    </button>
    {measuring ? <span className={chipButtonClass} /> : <ChipActions chip={chip} text={text} clear={clear} returnFocus={returnActionFocus && (() => returnActionFocus(chip.key, { fromList: wrap === true }))} />}
  </span>;
}

function Separator() {
  return <span aria-hidden className="text-text-muted">|</span>;
}

function InlineChips({ chips, clear, clearAll, editor, measuring, clearButtonRef, arrivalLinkRef, editFocus, returnActionFocus }: {
  chips: readonly AnalysisSelectionChip[]; clear: ClearChip; clearAll: () => void; editor?: ChipEditor; measuring?: boolean; clearButtonRef?: ClearButtonRef;
  arrivalLinkRef?: RefCallback<HTMLAnchorElement>; editFocus?: EditFocusHandlers; returnActionFocus?: ReturnActionFocus;
}) {
  const m = useMessages(COMPONENTS_MESSAGES);
  return <>
    <Separator />
    {chips.map((chip, index) => <Fragment key={chip.key}>
      {index > 0 && <span aria-hidden className="text-text-muted">›</span>}
      <Chip chip={chip} clear={clear} editor={editor} measuring={measuring} clearButtonRef={clearButtonRef} arrivalLinkRef={arrivalLinkRef} editFocus={editFocus} returnActionFocus={returnActionFocus} />
    </Fragment>)}
    <button type="button" disabled={measuring} className={linkClass} onClick={clearAll}>{m('analysisSelectionClearAll')}</button>
  </>;
}

function focusActionTrigger(surface: HTMLElement | null, key: string): boolean {
  const button = Array.from(surface?.querySelectorAll<HTMLButtonElement>('[data-analysis-chip-action]') ?? [])
    .find(candidate => candidate.dataset.analysisChipAction === key);
  button?.focus({ preventScroll: true });
  return button !== undefined;
}

/** Shows the active screen's analysis selections. The optional fit elements supply the row's budget and the summary's intrinsic width. */
export function AnalysisSelectionChipZone({ fit, fallbackFocus }: {
  fit?: AnalysisSelectionChipZoneFit; fallbackFocus?: RefObject<HTMLElement | null>;
}) {
  const { chips: modelChips, clear, clearAll, editor } = useAnalysisSelectionChips(onClearCommit);
  const chips = [...modelChips].sort((a, b) => Number(Boolean(b.arrival)) - Number(Boolean(a.arrival)));
  const platform = useHostPlatformOptional();
  const url = platform?.url;
  const m = useMessages(COMPONENTS_MESSAGES);
  const zone = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pendingActionFocus = useRef<string | null>(null);
  const clearFocus = useRef<ClearFocus | null>(null);
  const editFocus = useRef<EditFocus | null>(null);
  const focusedChip = useRef<HTMLButtonElement | null>(null);
  const detachedArrivalKey = useRef<string | undefined>(undefined);
  const [listOpen, setListOpen] = useState(false);
  const trackEditButton = useCallback((button: HTMLButtonElement) => {
    return () => {
      const request = editFocus.current;
      if (request?.kind === 'focused' && request.button === button && button.ownerDocument.activeElement !== button) editFocus.current = null;
    };
  }, []);
  const listTriggerRef = useCallback<RefCallback<HTMLButtonElement>>(button => {
    if (!button) return;
    trigger.current = button;
    const detach = trackEditButton(button);
    return () => {
      detach();
      trigger.current = null;
    };
  }, [trackEditButton]);
  const clearButtonRef = useCallback<ClearButtonRef>(button => {
    if (!button) return;
    return () => {
      // Capture focus before React removes the button. A prior blur cancels the handoff.
      if (focusedChip.current === button && button.ownerDocument.activeElement !== button) focusedChip.current = null;
    };
  }, []);
  const arrivalLinkRef = useCallback<RefCallback<HTMLAnchorElement>>(link => {
    if (!link) return;
    return () => {
      // React detaches the ref before removing the focused link from the DOM.
      if (link.ownerDocument.activeElement === link) detachedArrivalKey.current = link.dataset.analysisChipArrival;
    };
  }, []);
  const firstArrival = chips[0]?.arrival ? chips[0] : undefined;
  const foldedChip = firstArrival ?? chips[chips.length - 1];
  const canFold = chips.length > 1 && fit !== undefined;
  const row = useObservedElementSize(fit?.container ?? null, { enabled: canFold });
  const summary = useObservedElementSize(fit?.summary ?? null, { enabled: canFold });
  const probe = useElementSize(canFold);
  const folded = canFold && row !== null && summary !== null && probe.width !== null && summary.width + probe.width > row.width;
  const previousFolded = useRef(folded);
  if (listOpen && !folded) setListOpen(false);
  const focusChip = (surface: HTMLElement | null, index: number) => {
    const buttons = surface?.querySelectorAll<HTMLButtonElement>('[data-analysis-chip-clear]');
    const target = buttons?.[Math.min(index, buttons.length - 1)] ?? fallbackFocus?.current;
    target?.focus();
    focusedChip.current = target instanceof HTMLButtonElement && target.dataset.analysisChipClear ? target : null;
  };
  useLayoutEffect(() => {
    const stopTracking = (event: FocusEvent) => {
      if (event.target !== focusedChip.current) focusedChip.current = null;
      const request = editFocus.current;
      if (request?.kind === 'focused' && event.target !== request.button) editFocus.current = null;
      if (clearFocus.current?.kind !== 'list' && event.target instanceof Node
        && !zone.current?.contains(event.target) && !list.current?.contains(event.target)) clearFocus.current = null;
    };
    document.addEventListener('focusin', stopTracking);
    return () => {
      document.removeEventListener('focusin', stopTracking);
    };
  }, []);
  useLayoutEffect(() => () => {
    clearFocus.current = null;
    focusedChip.current = null;
    pendingActionFocus.current = null;
    detachedArrivalKey.current = undefined;
  }, [platform?.adapter, platform?.session, platform?.revision, platform?.paneId, platform?.route?.menu, platform?.pathname, platform?.global.scopeId]);
  useLayoutEffect(() => () => { editFocus.current = null; }, [editor?.replace]);
  const returnActionFocus: ReturnActionFocus = (key, { fromList }) => {
    if (!fromList || !trigger.current) {
      if (focusActionTrigger(zone.current, key)) return true;
    }
    if (list.current) return focusActionTrigger(list.current, key);
    if (!trigger.current) return false;
    pendingActionFocus.current = key;
    setListOpen(true);
    return true;
  };
  function restoreEditFocus() {
    const request = editFocus.current;
    if (!request) return;
    const region = zone.current;
    const button = Array.from(region?.querySelectorAll<HTMLButtonElement>('[data-analysis-chip-edit]') ?? [])
      .find(candidate => candidate.dataset.analysisChipEdit === request.key) ?? trigger.current;
    editFocus.current = null;
    if (!button) return;
    const { activeElement, body } = button.ownerDocument;
    if (activeElement !== body && activeElement !== button) return;
    editFocus.current = { kind: 'focused', key: request.key, button };
    button.focus();
  }
  const editFocusHandlers: EditFocusHandlers = {
    trackButton: trackEditButton,
    onCommit: (key, { fromList }) => {
      // Empty-set edits already enter the clear hand-off before the editor's commit callback.
      const clearRequest = clearFocus.current;
      if (clearRequest?.kind === 'clear' && clearRequest.key === key) return;
      editFocus.current = { kind: 'commit', key };
      if (fromList) setListOpen(false);
    },
    restore: restoreEditFocus,
  };
  useLayoutEffect(() => {
    const arrivalKey = detachedArrivalKey.current;
    detachedArrivalKey.current = undefined;
    const branchChanged = previousFolded.current !== folded;
    previousFolded.current = folded;
    if (branchChanged && arrivalKey !== undefined && document.activeElement === document.body) {
      const replacement = Array.from(zone.current?.querySelectorAll<HTMLAnchorElement>('[data-analysis-chip-arrival]') ?? [])
        .find(link => link.dataset.analysisChipArrival === arrivalKey);
      replacement?.focus({ preventScroll: true });
    }
    const editRequest = editFocus.current;
    if (editRequest?.kind === 'focused' && !editRequest.button.isConnected && document.activeElement === document.body) {
      if (chips.some(chip => chip.key === editRequest.key)) restoreEditFocus();
      else editFocus.current = null;
    }
    const previous = focusedChip.current;
    if (previous && !previous.isConnected && document.activeElement === document.body) {
      const replacement = Array.from(zone.current?.querySelectorAll<HTMLButtonElement>('[data-analysis-chip-clear]') ?? [])
        .find(button => button.dataset.analysisChipClear === previous.dataset.analysisChipClear);
      focusedChip.current = replacement ?? null;
      replacement?.focus();
    }
    const request = clearFocus.current;
    if (!request || request.kind === 'list') return;
    if (url !== request.to || chips.some(chip => request.key === null || chip.key === request.key)) {
      if (url !== request.from) clearFocus.current = null;
      return;
    }
    const { index } = request;
    const openList = list.current;
    // A new width measurement can unfold the row after focus has moved within the list.
    clearFocus.current = openList ? { kind: 'list', index } : null;
    focusChip(openList ?? zone.current, index);
  });
  function onClearCommit(key: string | null, { from, to }: { from: string; to: string }) {
    const index = key === null ? 0 : chips.findIndex(chip => chip.key === key);
    clearFocus.current = { kind: 'clear', key, index, from, to };
  }
  if (!foldedChip) return null;
  const label = m('analysisSelectionGroup');
  const visibleChip = <Chip key={foldedChip.key} chip={foldedChip} clear={clear} editor={editor} clearButtonRef={clearButtonRef} arrivalLinkRef={arrivalLinkRef} editFocus={editFocusHandlers} returnActionFocus={returnActionFocus} />;
  return <>
    {canFold && <div aria-hidden inert className="invisible absolute inset-x-0 top-0 h-0 overflow-hidden">
      <div ref={probe.ref} data-analysis-chip-probe className="w-max">
        <div className={zoneClass}><InlineChips chips={chips} clear={clear} clearAll={clearAll} measuring /></div>
      </div>
    </div>}
    <div ref={zone} role="group" aria-label={label} className={zoneClass}>
      {folded ? <>
        <Separator />
        {firstArrival && visibleChip}
        <Popover open={listOpen} onOpenChange={setListOpen}>
          <PopoverTrigger asChild>
            <button ref={listTriggerRef} type="button" className={linkClass}>+{chips.length - 1} ›</button>
          </PopoverTrigger>
          <PopoverContent ref={list} aria-label={label} align="end" className="max-h-[var(--radix-popover-content-available-height)] max-w-[var(--radix-popover-content-available-width)] overflow-y-auto" onOpenAutoFocus={event => {
            const key = pendingActionFocus.current;
            pendingActionFocus.current = null;
            if (key !== null && focusActionTrigger(list.current, key)) event.preventDefault();
          }} onCloseAutoFocus={event => {
            if (editFocus.current) { event.preventDefault(); return; }
            const request = clearFocus.current;
            if (request?.kind === 'list') clearFocus.current = null;
            if (trigger.current?.isConnected) return;
            event.preventDefault();
            if (document.activeElement === document.body) focusChip(zone.current, request?.kind === 'list' ? request.index : 0);
          }}>
            <ul className="grid gap-1">
              {chips.map(chip => <li key={chip.key} className="flex min-w-0 items-center gap-1">
                {chip.after !== null && <span aria-hidden className="text-text-muted">›</span>}
                <Chip chip={chip} clear={clear} editor={editor} wrap clearButtonRef={clearButtonRef} arrivalLinkRef={arrivalLinkRef} editFocus={editFocusHandlers} returnActionFocus={returnActionFocus} />
              </li>)}
            </ul>
            <button type="button" className={linkClass} onClick={clearAll}>{m('analysisSelectionClearAll')}</button>
          </PopoverContent>
        </Popover>
        {!firstArrival && visibleChip}
      </> : <InlineChips chips={chips} clear={clear} clearAll={clearAll} editor={editor} clearButtonRef={clearButtonRef} arrivalLinkRef={arrivalLinkRef} editFocus={editFocusHandlers} returnActionFocus={returnActionFocus} />}
    </div>
  </>;
}
