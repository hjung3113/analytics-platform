import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { RETURN_CONTEXT_LABELS, PlatformLink, type ReturnOrigin, invalidValueSentence, useDrill, useI18n } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import {
  Button, cn,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from '@ap/ui';
import { drillDestinationOf, focusPageFallback, paneRootOf, requestReturnFocus } from './pageFocus';
import { StateMessage } from './StateView';

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

function SiblingMenu({ label, value, items, onSwitch, scopeRef }: {
  label: string; value: string; items: readonly DrillSibling[]; onSwitch: (value: string) => void;
  /** The path bar, which stays mounted when this trigger does not; it keeps the lookup inside the owning pane (#497 D1). */
  scopeRef: { readonly current: HTMLElement | null };
}) {
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const switched = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button ref={trigger} type="button" aria-label={ko ? `${label} 바꾸기` : `Change ${label}`}
        className="inline-flex size-6 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-sunken hover:text-text-primary">
        <ChevronDown className="size-3.5" aria-hidden />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent onCloseAutoFocus={event => { if (switched.current) { event.preventDefault(); switched.current = false; focusDrillDestination(trigger.current ?? scopeRef.current); } }} align="start" className="w-56">
      <DropdownMenuRadioGroup value={value} onValueChange={next => { switched.current = next !== value; onSwitch(next); }}>
        {items.map(item => <DropdownMenuRadioItem key={item.value} value={item.value} className={focusRing}>
          <span className="t-mono">{item.value}</span>
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
  const { lang, tx } = useI18n();
  const ko = lang === 'ko';
  const wentUp = useRef(false);
  const nav = useRef<HTMLElement>(null);
  if (drill.depth === 0) return null;

  const collapsed = drill.trail.length >= 4;
  const hidden = collapsed ? drill.trail.slice(0, drill.trail.length - 2) : [];
  const visible = collapsed ? drill.trail.slice(drill.trail.length - 2) : drill.trail;

  const chipFor = (index: number) => {
    const step = drill.trail[index];
    if (!step) return null;
    const name = tx(step.label);
    const options = siblings?.[step.key];
    const current = index === drill.depth - 1;
    return <span key={step.key} className="inline-flex items-center">
      <button type="button" aria-current={current ? 'step' : undefined} onClick={() => drill.goTo(index + 1)}
        className={cn('rounded-md px-2 py-1', current ? 'bg-accent-primary-soft font-medium text-text-primary' : 'text-text-secondary hover:bg-surface-sunken')}>
        {name}: {step.value}
      </button>
      {options && options.length > 0 && <SiblingMenu label={name} value={step.value} items={options} onSwitch={value => drill.enter(step.key, value)} scopeRef={nav} />}
    </span>;
  };

  const hasSummary = !(summary === undefined || summary === null || summary === false);
  const navigation = <nav ref={nav} aria-label={ko ? '드릴 경로' : 'Drill path'} className={hasSummary ? 'flex min-w-0 flex-wrap items-center gap-1 text-xs' : 'flex flex-wrap items-center gap-1 text-xs'}>
    <button type="button" onClick={() => drill.goTo(0)} className="rounded-md px-2 py-1 text-text-secondary hover:bg-surface-sunken">{ko ? '전체' : 'All'}</button>
    {hidden.length > 0 && <>
      <ChevronRight className="size-3 text-text-muted" aria-hidden />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={ko ? '가운데 단계' : 'Middle steps'} className="rounded-md px-2 py-1 text-text-secondary hover:bg-surface-sunken">…</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent onCloseAutoFocus={event => { if (wentUp.current) { event.preventDefault(); wentUp.current = false; focusDrillDestination(nav.current); } }} align="start" className="w-56">
          {hidden.map((step, index) => <DropdownMenuItem key={step.key} className={focusRing} onSelect={() => { wentUp.current = true; drill.goTo(index + 1); }}>
            {tx(step.label)}: {step.value}
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

/** Path bar, then the current step's body. A format error or a missing value replaces the body and substitutes nothing. */
export function DrillLayout(props: DrillLayoutProps) {
  const { siblings, notFound, children, fill } = props;
  // Forward `summary` only when the caller passed it, so DrillPath can tell "no summary prop" from "summary not ready yet".
  const pathProps: DrillPathProps = 'summary' in props ? { siblings, summary: props.summary } : { siblings };
  const drill = useDrill();
  const { invalid } = drill;
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const body = invalid
    ? <StateMessage tone="danger" icon={<AlertTriangle className="size-4" aria-hidden />}
      title={invalidValueSentence(lang, 'drillGap', invalid.label, invalid.value)}
      body={ko ? '다른 값으로 바꾸지 않습니다.' : 'Nothing was substituted.'}
      action={<Button size="sm" variant="secondary" onClick={() => drill.goTo(drill.depth)}>{ko ? '잘못된 단계 지우기' : 'Clear the invalid step'}</Button>} />
    : notFound
      ? <StateMessage tone="warning" icon={<AlertTriangle className="size-4" aria-hidden />}
        title={ko ? `이 조건에서 없는 값: ${notFound.value}` : `No value in this context: ${notFound.value}`}
        body={ko ? '다른 값으로 바꾸지 않습니다.' : 'Nothing was substituted.'} />
      : children;
  if (fill) return <div className="flex min-h-0 flex-1 flex-col gap-2">
    <DrillPath {...pathProps} />
    <div className="flex min-h-0 flex-1 flex-col">{body}</div>
  </div>;
  return <div className="space-y-4">
    <DrillPath {...pathProps} />
    {body}
  </div>;
}

/** What every return control shares (06 §22): the origin and the click handler that asks for return focus and names the reverted Context. Internal to this package. */
export function useReturnNavigation({ announceReverted = true }: { announceReverted?: boolean } = {}): { origin: ReturnOrigin; onNavigate: () => void } {
  const { returnOrigin, pageNavigation, toast } = useHostPlatform();
  const { tx, t } = useI18n();
  const origin = returnOrigin();
  const onNavigate = () => {
    requestReturnFocus(pageNavigation, origin.href);
    if (announceReverted && origin.revertedContext.length) toast(t('returnContextReverted', { items: origin.revertedContext.map(key => tx(RETURN_CONTEXT_LABELS[key])).join(', ') }));
  };
  return { origin, onNavigate };
}

/** Return control (06 §22). The accessible name is the visible label, trail values included. */
export function ReturnLink() {
  const { tx } = useI18n();
  const { origin, onNavigate } = useReturnNavigation();
  const trail = origin.trail.map(step => step.value).join(' › ');
  const text = trail ? `← ${tx(origin.menuLabel)} (${trail})` : `← ${tx(origin.menuLabel)}`;
  return <Button asChild variant="secondary" size="sm"><PlatformLink via="return" href={origin.href} onNavigate={onNavigate}>{text}</PlatformLink></Button>;
}
