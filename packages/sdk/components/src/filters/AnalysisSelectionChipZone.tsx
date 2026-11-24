import { Fragment, useCallback, useId, useLayoutEffect, useRef, useState, type RefCallback, type RefObject } from 'react';
import { X } from 'lucide-react';
import { useAnalysisSelectionChips, useI18n, useMessages, type AnalysisSelectionChip } from '@ap/kernel';
import { useAnalysisSelectionHoverTarget, useHostPlatformOptional } from '@ap/kernel/host';
import { Button, Checkbox, Input, Label, Popover, PopoverContent, PopoverTrigger, cn } from '@ap/ui';
import { COMPONENTS_MESSAGES } from '../messages';
import { useElementSize, useObservedElementSize } from '../state/useElementSize';

type Fit = { container: HTMLElement | null; summary: HTMLElement | null };
type ClearChip = (key: string) => void;
type ChipEditor = NonNullable<ReturnType<typeof useAnalysisSelectionChips>['editor']>;
type Selection = AnalysisSelectionChip['selection'];
type ClearButtonRef = RefCallback<HTMLButtonElement>;
type ChipInteraction = 'pointer' | 'focus';
type ClearFocus = { kind: 'clear'; key: string | null; index: number; from: string; to: string } | { kind: 'list'; index: number };
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
    </div> : <>
      <div className="grid gap-1">
        <Label htmlFor={`${id}-start`}>{m('analysisSelectionStart')}</Label>
        <Input id={`${id}-start`} value={draft.from} aria-invalid={rangeError || undefined} aria-describedby={rangeError ? errorId : undefined}
          onChange={event => update({ ...draft, from: event.target.value })} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`${id}-end`}>{m('analysisSelectionEnd')}</Label>
        <Input id={`${id}-end`} value={draft.to} aria-invalid={rangeError || undefined} aria-describedby={rangeError ? errorId : undefined}
          onChange={event => update({ ...draft, to: event.target.value })} />
      </div>
    </>}
    {rejected && <p id={errorId} role="alert" className="text-xs text-text-danger-label">
      {m(draft.shape === 'range' ? 'analysisSelectionInvalidRange' : 'analysisSelectionInvalidSet')}
    </p>}
    <Button type="submit" size="sm" className="justify-self-end">{m('analysisSelectionApply')}</Button>
  </form>;
}

function Chip({ chip, clear, editor, wrap, measuring, clearButtonRef }: {
  chip: AnalysisSelectionChip; clear: ClearChip; editor?: ChipEditor; wrap?: boolean; measuring?: boolean; clearButtonRef?: ClearButtonRef;
}) {
  const { lang } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const beginHover = useAnalysisSelectionHoverTarget(measuring ? undefined : chip.key);
  const labelId = useId();
  const editTrigger = useRef<HTMLButtonElement>(null);
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
    {editor && !measuring ? <Popover open={open} onOpenChange={next => setOpened(next ? { edit, selectionKey } : null)}>
      <PopoverTrigger asChild>
        <button ref={editTrigger} type="button" aria-labelledby={labelId} aria-describedby={chip.available ? undefined : `${labelId}-status`}
          className={cn('inline-flex min-h-6.5 min-w-0 items-center gap-1 rounded-full pl-2 pr-1 text-start hover:bg-surface-row-hover', focusClass)}>
          {description}
        </button>
      </PopoverTrigger>
      <PopoverContent aria-labelledby={labelId} align="start" className="max-h-[var(--radix-popover-content-available-height)] max-w-[var(--radix-popover-content-available-width)] overflow-y-auto"
        onCloseAutoFocus={event => { if (!editTrigger.current?.isConnected) event.preventDefault(); }}>
        <SelectionFields chip={chip} editor={editor} close={() => setOpened(null)} />
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

function InlineChips({ chips, clear, clearAll, editor, measuring, clearButtonRef }: {
  chips: readonly AnalysisSelectionChip[]; clear: ClearChip; clearAll: () => void; editor?: ChipEditor; measuring?: boolean; clearButtonRef?: ClearButtonRef;
}) {
  const m = useMessages(COMPONENTS_MESSAGES);
  return <>
    <Separator />
    {chips.map((chip, index) => <Fragment key={chip.key}>
      {index > 0 && <span aria-hidden className="text-text-muted">›</span>}
      <Chip chip={chip} clear={clear} editor={editor} measuring={measuring} clearButtonRef={clearButtonRef} />
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
  const focusedChip = useRef<HTMLButtonElement | null>(null);
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
  const focusChip = (surface: HTMLElement | null, index: number) => {
    const buttons = surface?.querySelectorAll<HTMLButtonElement>('[data-analysis-chip-clear]');
    const target = buttons?.[Math.min(index, buttons.length - 1)] ?? fallbackFocus?.current;
    target?.focus();
    focusedChip.current = target instanceof HTMLButtonElement && target.dataset.analysisChipClear ? target : null;
  };
  useLayoutEffect(() => {
    const stopTracking = (event: FocusEvent) => {
      if (event.target !== focusedChip.current) focusedChip.current = null;
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
  useLayoutEffect(() => {
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
        <Popover>
          <PopoverTrigger asChild>
            <button ref={trigger} type="button" className={linkClass}>+{chips.length - 1} ›</button>
          </PopoverTrigger>
          <PopoverContent ref={list} aria-label={label} align="end" className="max-h-[var(--radix-popover-content-available-height)] max-w-[var(--radix-popover-content-available-width)] overflow-y-auto" onCloseAutoFocus={event => {
            const request = clearFocus.current;
            if (request?.kind === 'list') clearFocus.current = null;
            if (trigger.current?.isConnected) return;
            event.preventDefault();
            if (document.activeElement === document.body) focusChip(zone.current, request?.kind === 'list' ? request.index : 0);
          }}>
            <ul className="grid gap-1">
              {chips.map(chip => <li key={chip.key} className="flex min-w-0 items-center gap-1">
                {chip.after !== null && <span aria-hidden className="text-text-muted">›</span>}
                <Chip chip={chip} clear={clear} editor={editor} wrap clearButtonRef={clearButtonRef} />
              </li>)}
            </ul>
            <button type="button" className={linkClass} onClick={clearAll}>{m('analysisSelectionClearAll')}</button>
          </PopoverContent>
        </Popover>
        <Chip key={last.key} chip={last} clear={clear} editor={editor} clearButtonRef={clearButtonRef} />
      </> : <InlineChips chips={chips} clear={clear} clearAll={clearAll} editor={editor} clearButtonRef={clearButtonRef} />}
    </div>
  </>;
}
