import { Fragment, useLayoutEffect, useRef, type RefObject } from 'react';
import { X } from 'lucide-react';
import { useAnalysisSelectionChips, useI18n, useMessages, type AnalysisSelectionChip } from '@ap/kernel';
import { Popover, PopoverContent, PopoverTrigger, cn } from '@ap/ui';
import { COMPONENTS_MESSAGES } from '../messages';
import { useElementSize, useObservedElementSize } from '../state/useElementSize';

type Fit = { container: HTMLElement | null; summary: HTMLElement | null };
type ClearChip = (key: string) => void;
type ClearFocus = { kind: 'one'; key: string; index: number } | { kind: 'all' } | { kind: 'list'; index: number };
const zoneClass = 'inline-flex shrink-0 items-center gap-2 pl-2 text-xs';
const focusClass = 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring';
const linkClass = cn('h-6.5 shrink-0 rounded-sm whitespace-nowrap text-xs font-medium text-accent-primary hover:underline', focusClass);

function Chip({ chip, clear, wrap, measuring }: { chip: AnalysisSelectionChip; clear: ClearChip; wrap?: boolean; measuring?: boolean }) {
  const { lang } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
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
  return <span className={cn('inline-flex min-w-0 items-center gap-1 rounded-full pl-2 text-xs font-medium',
    wrap ? 'min-h-6.5' : 'h-6.5',
    chip.available ? 'bg-accent-primary-soft text-accent-primary' : 'bg-accent-neutral-soft text-text-secondary')}>
    <span role="img" aria-label={source ?? dimension} title={source} className="size-3.5 shrink-0 rounded-sm border border-current" />
    <span className={wrap ? '[overflow-wrap:anywhere]' : 'max-w-40 truncate'} title={text}>{text}</span>
    {!chip.available && <span className="shrink-0">{m('analysisSelectionUnavailable')}</span>}
    <button type="button" disabled={measuring} className={cn('inline-flex size-6.5 shrink-0 items-center justify-center rounded-full hover:bg-surface-row-hover', focusClass)}
      data-analysis-chip-clear aria-label={m('analysisSelectionClear', { dimension })} onClick={() => clear(chip.key)}>
      <X className="size-3.5" aria-hidden />
    </button>
  </span>;
}

function Separator() {
  return <span aria-hidden className="text-text-muted">|</span>;
}

function InlineChips({ chips, clear, clearAll, measuring }: {
  chips: readonly AnalysisSelectionChip[]; clear: ClearChip; clearAll: () => void; measuring?: boolean;
}) {
  const m = useMessages(COMPONENTS_MESSAGES);
  return <>
    <Separator />
    {chips.map((chip, index) => <Fragment key={chip.key}>
      {index > 0 && <span aria-hidden className="text-text-muted">›</span>}
      <Chip chip={chip} clear={clear} measuring={measuring} />
    </Fragment>)}
    <button type="button" disabled={measuring} className={linkClass} onClick={clearAll}>{m('analysisSelectionClearAll')}</button>
  </>;
}

/** Shows the active screen's analysis selections. The optional fit elements supply the row's budget and the summary's intrinsic width. */
export function AnalysisSelectionChipZone({ fit, fallbackFocus }: {
  fit?: Fit; fallbackFocus?: RefObject<HTMLElement | null>;
}) {
  const { chips, clear, clearAll } = useAnalysisSelectionChips();
  const m = useMessages(COMPONENTS_MESSAGES);
  const zone = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const clearFocus = useRef<ClearFocus | null>(null);
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
  };
  useLayoutEffect(() => {
    const request = clearFocus.current;
    if (!request || request.kind === 'list') return;
    if (chips.some(chip => request.kind === 'all' || chip.key === request.key)) return;
    const index = request.kind === 'one' ? request.index : 0;
    const openList = list.current;
    // A new width measurement can unfold the row after focus has moved within the list.
    clearFocus.current = openList ? { kind: 'list', index } : null;
    focusChip(openList ?? zone.current, index);
  });
  const onClear = (key: string) => {
    const index = chips.findIndex(chip => chip.key === key);
    if (clear(key)) clearFocus.current = { kind: 'one', key, index };
  };
  const onClearAll = () => { if (clearAll()) clearFocus.current = { kind: 'all' }; };
  if (!last) return null;
  const label = m('analysisSelectionGroup');
  return <>
    {canFold && <div aria-hidden inert className="invisible absolute inset-x-0 top-0 h-0 overflow-hidden">
      <div ref={probe.ref} data-analysis-chip-probe className="w-max">
        <div className={zoneClass}><InlineChips chips={chips} clear={onClear} clearAll={onClearAll} measuring /></div>
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
                <Chip chip={chip} clear={onClear} wrap />
              </li>)}
            </ul>
            <button type="button" className={linkClass} onClick={onClearAll}>{m('analysisSelectionClearAll')}</button>
          </PopoverContent>
        </Popover>
        <Chip key={last.key} chip={last} clear={onClear} />
      </> : <InlineChips chips={chips} clear={onClear} clearAll={onClearAll} />}
    </div>
  </>;
}
