import { Fragment, useCallback, useId, useLayoutEffect, useRef, useState, type RefCallback, type RefObject } from 'react';
import { X } from 'lucide-react';
import { useAnalysisSelectionChips, useI18n, useMessages, type AnalysisSelectionChip } from '@ap/kernel';
import { useAnalysisSelectionHoverTarget, useHostPlatformOptional } from '@ap/kernel/host';
import { Button, Checkbox, Input, Label, Popover, PopoverContent, PopoverTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, cn } from '@ap/ui';
import { COMPONENTS_MESSAGES } from '../messages';
import { useElementSize, useObservedElementSize } from '../state/useElementSize';

type Fit = { container: HTMLElement | null; summary: HTMLElement | null };
type ClearChip = (key: string) => void;
type ChipEditor = NonNullable<ReturnType<typeof useAnalysisSelectionChips>['editor']>;
type Selection = AnalysisSelectionChip['selection'];
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

function Chip({ chip, clear, editor, wrap, measuring, clearButtonRef, editFocus }: {
  chip: AnalysisSelectionChip; clear: ClearChip; editor?: ChipEditor; wrap?: boolean; measuring?: boolean;
  clearButtonRef?: ClearButtonRef; editFocus?: EditFocusHandlers;
}) {
  const { lang } = useI18n();
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
  const title = chip.source.title[lang];
  const source = /\{[^{}]+\}/.test(title) ? undefined : title;
  const selection = chip.selection;
  let value = '';
  if (selection.shape === 'range') value = `${selection.from} – ${selection.to}`;
  else {
    const [first, ...others] = selection.values;
    value = others.length > 0 ? m('analysisSelectionMoreValues', { first, count: others.length }) : first ?? '';
  }
  const text = `${dimension} ${value}`;
  const description = <>
    <span role="img" aria-label={source ?? dimension} title={source} className="size-3.5 shrink-0 rounded-sm border border-current" />
    <span id={labelId} className={wrap ? '[overflow-wrap:anywhere]' : 'max-w-40 truncate'} title={text}>{text}</span>
    {!chip.available && <span id={`${labelId}-status`} className="shrink-0">{m('analysisSelectionUnavailable')}</span>}
  </>;
  return <span className={cn('inline-flex min-w-0 items-center rounded-full text-xs font-medium',
    wrap ? 'min-h-6.5' : 'h-6.5',
    chip.available ? 'bg-accent-primary-soft text-accent-primary' : 'bg-accent-neutral-soft text-text-secondary')}
    onPointerEnter={event => { if (event.pointerType !== 'touch') enter('pointer'); }}
    onPointerLeave={() => leave('pointer')} onFocus={() => enter('focus')} onBlur={() => leave('focus')}>
    {editor && !measuring ? <Popover open={open} onOpenChange={next => {
      if (next) committed.current = false;
      setOpened(next ? { edit, selectionKey } : null);
    }}>
      <PopoverTrigger asChild>
        <button ref={editTriggerRef} type="button" data-analysis-chip-edit={chip.key} aria-labelledby={labelId} aria-describedby={chip.available ? undefined : `${labelId}-status`}
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
    <button ref={clearButtonRef} type="button" disabled={measuring} className={cn('inline-flex size-6.5 shrink-0 items-center justify-center rounded-full hover:bg-surface-row-hover', focusClass)}
      data-analysis-chip-clear={chip.key} aria-label={m('analysisSelectionClear', { dimension })} onClick={() => clear(chip.key)}>
      <X className="size-3.5" aria-hidden />
    </button>
  </span>;
}

function Separator() {
  return <span aria-hidden className="text-text-muted">|</span>;
}

function InlineChips({ chips, clear, clearAll, editor, measuring, clearButtonRef, editFocus }: {
  chips: readonly AnalysisSelectionChip[]; clear: ClearChip; clearAll: () => void; editor?: ChipEditor; measuring?: boolean; clearButtonRef?: ClearButtonRef;
  editFocus?: EditFocusHandlers;
}) {
  const m = useMessages(COMPONENTS_MESSAGES);
  return <>
    <Separator />
    {chips.map((chip, index) => <Fragment key={chip.key}>
      {index > 0 && <span aria-hidden className="text-text-muted">›</span>}
      <Chip chip={chip} clear={clear} editor={editor} measuring={measuring} clearButtonRef={clearButtonRef} editFocus={editFocus} />
    </Fragment>)}
    <button type="button" disabled={measuring} className={linkClass} onClick={clearAll}>{m('analysisSelectionClearAll')}</button>
  </>;
}

/** Shows the active screen's analysis selections. The optional fit elements supply the row's budget and the summary's intrinsic width. */
export function AnalysisSelectionChipZone({ fit, fallbackFocus }: {
  fit?: Fit; fallbackFocus?: RefObject<HTMLElement | null>;
}) {
  const { chips, clear, clearAll, editor } = useAnalysisSelectionChips(onClearCommit);
  const platform = useHostPlatformOptional();
  const url = platform?.url;
  const m = useMessages(COMPONENTS_MESSAGES);
  const zone = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const clearFocus = useRef<ClearFocus | null>(null);
  const editFocus = useRef<EditFocus | null>(null);
  const focusedChip = useRef<HTMLButtonElement | null>(null);
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
  const last = chips[chips.length - 1];
  const canFold = chips.length > 1 && fit !== undefined;
  const row = useObservedElementSize(fit?.container ?? null, { enabled: canFold });
  const summary = useObservedElementSize(fit?.summary ?? null, { enabled: canFold });
  const probe = useElementSize(canFold);
  const folded = canFold && row !== null && summary !== null && probe.width !== null && summary.width + probe.width > row.width;
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
  }, [platform?.adapter, platform?.session, platform?.revision, platform?.paneId, platform?.route?.menu, platform?.pathname, platform?.global.scopeId]);
  useLayoutEffect(() => () => { editFocus.current = null; }, [editor?.replace]);
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
  if (!last) return null;
  const label = m('analysisSelectionGroup');
  return <>
    {canFold && <div aria-hidden inert className="invisible absolute inset-x-0 top-0 h-0 overflow-hidden">
      <div ref={probe.ref} data-analysis-chip-probe className="w-max">
        <div className={zoneClass}><InlineChips chips={chips} clear={clear} clearAll={clearAll} measuring /></div>
      </div>
    </div>}
    <div ref={zone} role="group" aria-label={label} className={zoneClass}>
      {folded ? <>
        <Separator />
        <Popover open={listOpen} onOpenChange={setListOpen}>
          <PopoverTrigger asChild>
            <button ref={listTriggerRef} type="button" className={linkClass}>+{chips.length - 1} ›</button>
          </PopoverTrigger>
          <PopoverContent ref={list} aria-label={label} align="end" className="max-h-[var(--radix-popover-content-available-height)] max-w-[var(--radix-popover-content-available-width)] overflow-y-auto" onCloseAutoFocus={event => {
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
                <Chip chip={chip} clear={clear} editor={editor} wrap clearButtonRef={clearButtonRef} editFocus={editFocusHandlers} />
              </li>)}
            </ul>
            <button type="button" className={linkClass} onClick={clearAll}>{m('analysisSelectionClearAll')}</button>
          </PopoverContent>
        </Popover>
        <Chip key={last.key} chip={last} clear={clear} editor={editor} clearButtonRef={clearButtonRef} editFocus={editFocusHandlers} />
      </> : <InlineChips chips={chips} clear={clear} clearAll={clearAll} editor={editor} clearButtonRef={clearButtonRef} editFocus={editFocusHandlers} />}
    </div>
  </>;
}
