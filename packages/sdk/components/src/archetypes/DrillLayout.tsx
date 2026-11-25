import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { createContext, useContext, useRef, type ReactNode } from 'react';
import { RETURN_CONTEXT_LABELS, PlatformLink, type ReturnOrigin, invalidValueSentence, useDrill, useI18n, useMessages, usePlatform, type DrillTrailStep } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import {
  Button, cn,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from '@ap/ui';
import { COMPONENTS_MESSAGES } from '../messages';
import { drillDestinationOf, focusPageFallback, paneRootOf, requestReturnFocus } from '../state/pageFocus';
import { StateMessage } from '../StateView';

/** One sibling choice. `hint` is already display text; this layer does not know the domain. */
export type DrillSibling = { value: string; hint?: string };
/** Sibling lists keyed by drill level. Omit a key, or pass an empty list, to hide its menu. */
export type DrillSiblings = Readonly<Record<string, readonly DrillSibling[]>>;

export type DrillPathProps = {
  siblings?: DrillSiblings;
  /** One line beside the path bar, hidden at level 0. A string is ellipsized and its full text goes into `title`; a ReactNode keeps its own title. */
  summary?: ReactNode;
};
export type DrillLayoutProps = DrillPathProps & {
  /** A step value the query recognized as absent. Ignored while `useDrill().invalid` is set. */
  notFound?: { key: string; value: string };
  children?: ReactNode;
  /** Fill the parent's height: the wrapper becomes a `flex min-h-0 flex-1 flex-col` column and the body region takes the rest (`min-h-0 flex-1`). Off = unchanged output. */
  fill?: boolean;
};

// Looked up inside the pane that owns `source` (a board pane, ADR-0049), else the document: a sibling pane or main must not take the focus.
function focusDrillDestination(source: HTMLElement | null) {
  const pane = paneRootOf(source);
  const scope: ParentNode = pane ?? document;
  const target = drillDestinationOf(scope);
  if (target) target.focus({ preventScroll: true });
  else if (pane) focusPageFallback(source);
}

const focusRing = 'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring';

function SiblingMenu({ label, value, valueLabel, items, onSwitch, scopeRef }: {
  label: string; value: string; valueLabel?: string; items: readonly DrillSibling[]; onSwitch: (value: string) => void;
  /** The path bar, which stays mounted when this trigger does not; it keeps the lookup inside the owning pane (#497 D1). */
  scopeRef: { readonly current: HTMLElement | null };
}) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const switched = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const stepLabel = valueLabel !== undefined ? `${label}: ${valueLabel}` : label;
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button ref={trigger} type="button" aria-label={m('drillChangeStep', { label: stepLabel })}
        className="inline-flex size-6 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-sunken hover:text-text-primary">
        <ChevronDown className="size-3.5" aria-hidden />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent onCloseAutoFocus={event => { if (switched.current) { event.preventDefault(); switched.current = false; focusDrillDestination(trigger.current ?? scopeRef.current); } }} align="start" className="w-56">
      <DropdownMenuRadioGroup value={value} onValueChange={next => { switched.current = next !== value; onSwitch(next); }}>
        {items.map(item => <DropdownMenuRadioItem key={item.value} value={item.value} className={focusRing}>
          <span className="t-mono">{item.value === value ? valueLabel ?? value : item.value}</span>
          {item.hint !== undefined && <span className="ml-2 text-text-secondary tabular">{item.hint}</span>}
        </DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}

/**
 * Path bar for the current menu's drill (06 §12.7, ADR-0025). Nothing at depth 0.
 * Five or more chips (depth 4+) collapse to All, a middle-step menu, and the last two chips.
 */
export function DrillPath(props: DrillPathProps) {
  const { siblings, summary } = props;
  const drill = useDrill();
  const { route } = usePlatform();
  const { t, tx, lang } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const wentUp = useRef(false);
  const nav = useRef<HTMLElement>(null);
  if (drill.depth === 0) return null;

  const collapsed = drill.trail.length >= 4;
  const hidden = collapsed ? drill.trail.slice(0, drill.trail.length - 2) : [];
  const visible = collapsed ? drill.trail.slice(drill.trail.length - 2) : drill.trail;

  const stepValue = (step: DrillTrailStep) => {
    const value = step.valueLabel ?? step.value;
    const basis = route?.menu.drill?.levels.find(level => level.key === step.key)?.bases?.find(basis => basis.id === step.basis);
    if (!basis) return value;
    return `${value} · ${typeof basis.label === 'function' ? basis.label(lang) : basis.label}`;
  };

  const chipFor = (index: number) => {
    const step = drill.trail[index];
    if (!step) return null;
    const name = tx(step.label);
    const options = siblings?.[step.key];
    const current = index === drill.depth - 1;
    return <span key={step.key} className="inline-flex items-center">
      <button type="button" aria-current={current ? 'step' : undefined} onClick={() => drill.goTo(index + 1)}
        className={cn('rounded-md px-2 py-1', step.basis && 'break-keep', current ? 'bg-accent-primary-soft font-medium text-text-primary' : 'text-text-secondary hover:bg-surface-sunken')}>
        {name}: {stepValue(step)}
      </button>
      {options && options.length > 0 && <SiblingMenu label={name} value={step.value} valueLabel={step.valueLabel} items={options} onSwitch={value => drill.enter(step.key, value)} scopeRef={nav} />}
    </span>;
  };

  const hasSummary = !(summary === undefined || summary === null || summary === false);
  const navigation = <nav ref={nav} aria-label={m('drillPathNav')} className={hasSummary ? 'flex min-w-0 flex-wrap items-center gap-1 text-xs' : 'flex flex-wrap items-center gap-1 text-xs'}>
    <button type="button" onClick={() => drill.goTo(0)} className="rounded-md px-2 py-1 text-text-secondary hover:bg-surface-sunken">{t('all')}</button>
    {hidden.length > 0 && <>
      <ChevronRight className="size-3 text-text-muted" aria-hidden />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={m('drillMiddleSteps')} className="rounded-md px-2 py-1 text-text-secondary hover:bg-surface-sunken">…</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent onCloseAutoFocus={event => { if (wentUp.current) { event.preventDefault(); wentUp.current = false; focusDrillDestination(nav.current); } }} align="start" className="w-56">
          {hidden.map((step, index) => <DropdownMenuItem key={step.key} className={cn(focusRing, step.basis && 'break-keep')} onSelect={() => { wentUp.current = true; drill.goTo(index + 1); }}>
            {tx(step.label)}: {stepValue(step)}
          </DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </>}
    {visible.map(step => {
      const index = drill.trail.indexOf(step);
      return <span key={step.key} className="inline-flex items-center">
        <ChevronRight className="size-3 text-text-muted" aria-hidden />
        {chipFor(index)}
      </span>;
    })}
  </nav>;
  // The wrapper follows the presence of the prop, not its value: a summary that arrives after the query must not remount the nav (focus would drop to body).
  if (!('summary' in props)) return navigation;
  return <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
    {navigation}
    {hasSummary && <div title={typeof summary === 'string' ? summary : undefined} className="min-w-0 flex-1 basis-48 truncate text-xs text-text-secondary">{summary}</div>}
  </div>;
}

/**
 * Path bar, then the current step's body. A format error or a missing value replaces the body and substitutes nothing.
 * The Registry throws if a drill level key is missing from the menu's `contextResetKeys`.
 */
export function DrillLayout(props: DrillLayoutProps) {
  const { siblings, notFound, children, fill } = props;
  // Forward `summary` only when the caller passed it, so DrillPath can tell "no summary prop" from "summary not ready yet".
  const pathProps: DrillPathProps = 'summary' in props ? { siblings, summary: props.summary } : { siblings };
  const drill = useDrill();
  const { invalid } = drill;
  const { lang } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const missingStep = notFound && drill.levels.find(step => step.key === notFound.key && step.value === notFound.value);
  const body = invalid
    ? <StateMessage tone="danger" icon={<AlertTriangle className="size-4" aria-hidden />}
      title={invalidValueSentence(lang, 'drillGap', invalid.label, invalid.valueLabel ?? invalid.value)}
      body={m('drillNothingSubstituted')}
      action={<Button size="sm" variant="secondary" onClick={() => drill.goTo(drill.depth)}>{m('drillClearInvalidStep')}</Button>} />
    : notFound
      ? <StateMessage tone="warning" icon={<AlertTriangle className="size-4" aria-hidden />}
        title={m('drillNoValueInContext', { value: missingStep?.valueLabel ?? notFound.value })}
        body={m('drillNothingSubstituted')} />
      : children;
  const notice = drill.rejectedBasis && <div className="break-keep"><StateMessage tone="warning" compact
    icon={<AlertTriangle className="size-4" aria-hidden />}
    title={m('drillBasisRejected')} /></div>;
  if (fill) return <div className="flex min-h-0 flex-1 flex-col gap-2">
    <DrillPath {...pathProps} />
    {notice}
    <div className="flex min-h-0 flex-1 flex-col">{body}</div>
  </div>;
  return <div className="space-y-4">
    <DrillPath {...pathProps} />
    {notice}
    {body}
  </div>;
}

/** Shared origin, display trail and navigation behavior for return controls (06 §22). Internal to this package. */
export function useReturnNavigation({ announceReverted = true }: { announceReverted?: boolean } = {}): { origin: ReturnOrigin; displayTrail: string; onNavigate: () => void } {
  const { returnOrigin, pageNavigation, toast } = useHostPlatform();
  const { tx, t } = useI18n();
  const origin = returnOrigin();
  const showTrail = !origin.accepted || origin.recorded;
  const displayTrail = showTrail ? origin.trail.map(step => step.valueLabel ?? step.value).join(' › ') : '';
  const onNavigate = () => {
    requestReturnFocus(pageNavigation, origin.href);
    if (announceReverted && origin.revertedContext.length) toast(t('returnContextReverted', { items: origin.revertedContext.map(key => tx(RETURN_CONTEXT_LABELS[key])).join(', ') }));
  };
  return { origin, displayTrail, onNavigate };
}

export const ReturnRowShown = createContext(false);

/** Return control (06 §22). The accessible name is the visible label, trail values included. */
export function ReturnLink() {
  const { tx, t } = useI18n();
  const { origin, displayTrail, onNavigate } = useReturnNavigation();
  const rowShown = useContext(ReturnRowShown);
  const label = origin.accepted && !origin.recorded ? t('returnLinkPrevious') : `← ${tx(origin.menuLabel)}`;
  const text = displayTrail ? `${label} (${displayTrail})` : label;
  if (rowShown) return <></>;
  return <Button asChild variant="secondary" size="sm"><PlatformLink via="return" href={origin.href} onNavigate={onNavigate}>{text}</PlatformLink></Button>;
}
