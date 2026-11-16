import { useContext, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import type { Capability, ContextKey, GlobalContext } from '@ap/contracts';
import { CONTEXT_LABELS, useEquipmentAxes, useEquipmentFacts, useI18n, useMessages } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { FacetedSetDialog, type FacetedSetItem, type FacetedSetValue } from '@ap/components';
import { Button, cn } from '@ap/ui';
import { ChevronDown, X } from 'lucide-react';
import { CONTEXT_CHIP, CONTEXT_CHIP_TONE } from './contextChip';
import { MeasuringContext } from './ContextBarLayout';
import { SHELL_MESSAGES } from '../messages';
import { useSessionKey } from '../frame/sessionKey';

export const TARGET_KEYS = ['roomNames', 'line', 'prcGroup', 'condition', 'selection'] as const;
const RESULT_COLUMN_LIMIT = 4;
const globalFacet = (id: string) => `global:${id}`;
const axisFacet = (id: string) => `axis:${id}`;
const ownPicks = (rule: FacetedSetValue['rule'], id: string) => Object.hasOwn(rule, id) ? rule[id] : undefined;

/** One shell matching path; the dialog's indexed evaluator is not a public export. */
function targetCounts(items: readonly FacetedSetItem[], { rule, fixed }: FacetedSetValue) {
  const entries = Object.entries(rule);
  const matchedIds = new Set<string>();
  for (const item of items) {
    if (entries.every(([id, values]) => {
      const raw = Object.hasOwn(item.facets, id) ? item.facets[id] : undefined;
      const valuesInItem = typeof raw === 'string' ? [raw] : raw ?? [];
      return values.some(value => valuesInItem.includes(value));
    })) matchedIds.add(item.id);
  }
  return { count: matchedIds.size, outside: fixed?.filter(id => !matchedIds.has(id)).length ?? 0 };
}
type Props = {
  global: GlobalContext;
  cap: Record<ContextKey, Capability>;
  onChange(patch: Partial<GlobalContext>): void;
  presetAxes?: readonly string[];
  invalid?: boolean;
  reasonId?: string;
  /** Keep the dialog above relocating/measurement copies of the live bar button. */
  children?(button: ReactNode, open: boolean): ReactNode;
};

export function TargetPicker(props: Props) {
  const { paneId, route } = useHostPlatform();
  const sessionKey = useSessionKey();
  return <TargetPickerSession key={JSON.stringify([sessionKey, paneId, route?.menu.id, props.global.scopeId, props.presetAxes])} {...props} />;
}

function TargetPickerSession({ global: g, cap, onChange, presetAxes, invalid, reasonId, children }: Props) {
  const { adapter, route } = useHostPlatform();
  const { t, tx } = useI18n();
  const m = useMessages(SHELL_MESSAGES);
  const axes = useEquipmentAxes();
  const facts = useEquipmentFacts(g.scopeId ?? '');
  const items = useMemo<FacetedSetItem[]>(() => (facts.data?.items ?? []).map(item => ({ id: item.equipmentId, facets: {
    ...Object.fromEntries(Object.entries(item.axes).map(([id, values]) => [axisFacet(id), values])),
    [globalFacet('roomNames')]: item.room,
    [globalFacet('lineNames')]: ownPicks(item.axes, 'lineNames') ?? [],
    [globalFacet('prcGroups')]: ownPicks(item.axes, 'prcGroups') ?? [],
  } })), [facts.data]);
  const facets = [
    ...(cap.roomNames === 'apply' ? [{ id: globalFacet('roomNames'), label: t('roomNames') }] : []),
    ...(cap.line === 'apply' ? [{ id: globalFacet('lineNames'), label: tx(CONTEXT_LABELS.line) }] : []),
    ...(cap.prcGroup === 'apply' ? [{ id: globalFacet('prcGroups'), label: tx(CONTEXT_LABELS.prcGroup) }] : []),
    ...(cap.condition === 'apply' ? axes.filter(axis => !presetAxes || presetAxes.includes(axis.id)).map(axis => ({ id: axisFacet(axis.id), label: tx(axis.label) })) : []),
  ];
  const picks: Record<string, readonly string[]> = Object.create(null);
  for (const [id, values] of Object.entries(g.condition ?? {})) picks[axisFacet(id)] = values;
  if (g.roomNames) picks[globalFacet('roomNames')] = g.roomNames;
  if (g.lineNames) picks[globalFacet('lineNames')] = g.lineNames;
  if (g.prcGroups) picks[globalFacet('prcGroups')] = g.prcGroups;
  // Only editable keys participate. Explicit-empty opens as all; cancellation never writes.
  const rule: FacetedSetValue['rule'] = Object.fromEntries(facets.flatMap(facet => {
    const values = ownPicks(picks, facet.id);
    return values?.length ? [[facet.id, values]] : [];
  }));
  const fixed = cap.selection === 'apply' && g.selection?.length ? g.selection : null;
  // Canonical content, rather than parent-owned array/object identity, owns the expensive scan.
  const countIdentity = JSON.stringify({
    rule: Object.fromEntries(Object.keys(rule).sort().map(id => [id, [...new Set(rule[id])].sort()])),
    fixed: fixed ? [...new Set(fixed)].sort() : null,
  });
  const { count: matchCount, outside } = useMemo(() => targetCounts(items, JSON.parse(countIdentity) as FacetedSetValue), [items, countIdentity]);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  const restoreFocus = useRef(false);
  const close = (next: boolean) => { restoreFocus.current = !next; setOpen(next); };
  useEffect(() => {
    if (open || !restoreFocus.current) return;
    const timer = setTimeout(() => { opener.current?.focus(); restoreFocus.current = false; }, 0);
    return () => clearTimeout(timer);
  }, [open]);
  const clear = () => {
    onChange({ roomNames: null, lineNames: null, prcGroups: null, condition: null, selection: null, membershipBasis: null });
    opener.current?.focus();
  };
  // All selected means "no condition" (ADR-0164), but a key the menu requires cannot be absent:
  // there it is written as every authorized value of that facet, so applying "all rooms" keeps the query runnable.
  const required = route?.menu.query?.required?.context ?? [];
  const picked = (value: FacetedSetValue, facetId: string, key: ContextKey) => {
    const values = ownPicks(value.rule, facetId);
    if (values?.length) return [...values];
    if (!required.includes(key)) return null;
    const universe = [...new Set(items.flatMap(item => { const raw = item.facets[facetId]; return typeof raw === 'string' ? [raw] : raw ?? []; }))].sort();
    return universe.length ? universe : null;
  };
  const apply = (value: FacetedSetValue) => {
    const patch: Partial<GlobalContext> = {};
    if (cap.roomNames === 'apply') patch.roomNames = picked(value, globalFacet('roomNames'), 'roomNames');
    if (cap.line === 'apply') patch.lineNames = picked(value, globalFacet('lineNames'), 'line');
    if (cap.prcGroup === 'apply') patch.prcGroups = picked(value, globalFacet('prcGroups'), 'prcGroup');
    if (cap.condition === 'apply') {
      // Preset-excluded axes remain carried, just like unsupported Context fields.
      const condition = { ...g.condition };
      for (const axis of axes.filter(axis => !presetAxes || presetAxes.includes(axis.id))) {
        const values = ownPicks(value.rule, axisFacet(axis.id));
        if (values?.length) condition[axis.id] = [...values]; else delete condition[axis.id];
      }
      patch.condition = Object.keys(condition).length ? condition : null;
    }
    if (cap.selection === 'apply') patch.selection = value.fixed?.length ? [...value.fixed] : null;
    if (('condition' in patch || 'prcGroups' in patch) && { ...g, ...patch }.condition === null && { ...g, ...patch }.prcGroups === null) patch.membershipBasis = null;
    onChange(patch);
    close(false);
  };
  const explicitEmpty = facets.some(facet => ownPicks(picks, facet.id)?.length === 0) || (cap.selection === 'apply' && g.selection?.length === 0);
  const count = facts.status === 'done' ? m('targetCount', { count: matchCount }) : m('targetCountUnavailable');
  const summary = facets.flatMap(facet => {
    const values = ownPicks(rule, facet.id);
    return values ? [`${facet.label}: ${values.join(', ')}`] : [];
  }).join(' · ');
  let text = t('all');
  if (Object.keys(rule).length) text = `${m('targetRule', { count })} · ${summary}`;
  if (fixed) text = m('targetFixed', { count: m('targetCount', { count: fixed.length }) });
  if (explicitEmpty) text = `${text} · ${t('explicitEmpty')}`;
  if (g.membershipBasis === 'asOf') text += ` · ${t('membershipAsOf')}`;
  const chosen = TARGET_KEYS.some(key => {
    const field = { roomNames: g.roomNames, line: g.lineNames, prcGroup: g.prcGroups, condition: g.condition, selection: g.selection };
    return field[key] !== null;
  });
  const button = <span className="inline-flex min-w-0 items-center gap-1">
    <TargetButton onMount={node => { opener.current = node; }} type="button" className={cn(CONTEXT_CHIP, CONTEXT_CHIP_TONE, 'max-w-[22rem]')} aria-label={`${m('targetLabel')} ${text}`} aria-invalid={invalid || undefined} aria-describedby={invalid ? reasonId : undefined} title={text} onClick={event => { opener.current = event.currentTarget; setOpen(true); }}>
      <span className="text-text-muted">{m('targetLabel')}</span><span className="truncate font-medium tabular">{text}</span><ChevronDown className="size-3.5 shrink-0" aria-hidden />
    </TargetButton>
    {chosen && <Button type="button" variant="ghost" size="toolbar" aria-label={m('targetClear')} onClick={clear}><X className="size-3.5" aria-hidden /></Button>}
    {facts.status === 'done' && outside > 0 && <span className="text-xs text-text-warning-label">{m('selectionOutsideCondition', { count: outside })}</span>}
  </span>;
  return <>{children ? children(button, open) : button}<FacetedSetDialog open={open} onOpenChange={close} title={m('targetLabel')} facets={facets} items={items} value={{ rule, fixed }} onApply={apply} allowFixed={cap.selection === 'apply'} resultColumns={facets.slice(0, RESULT_COLUMN_LIMIT).map(facet => facet.id)} itemKindLabel={m('targetEquipment')} formatCount={count => m('targetCount', { count })} status={facts.status === 'done' ? 'ready' : facts.status} onRetry={facts.retry} errorDetail={adapter.listEquipmentFacts ? m('targetFactsError') : m('targetFactsMissing')} note={g.membershipBasis === 'asOf' ? m('targetAsOfNote') : undefined} /></>;
}

function TargetButton({ onMount, ...props }: ComponentProps<'button'> & { onMount(node: HTMLButtonElement): void }) {
  const measuring = useContext(MeasuringContext);
  return <button {...props} ref={node => { if (node && !measuring) onMount(node); }} />;
}
