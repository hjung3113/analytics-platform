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

export const TARGET_KEYS = ['roomNames', 'line', 'prcGroup', 'condition', 'selection'] as const;
const RESULT_COLUMN_LIMIT = 4;
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
  const { session, paneId, route } = useHostPlatform();
  const [identity, setIdentity] = useState({ session, generation: 0 });
  if (identity.session !== session) setIdentity({ session, generation: identity.generation + 1 });
  return <TargetPickerSession key={JSON.stringify([identity.generation, paneId, route?.menu.id, props.global.scopeId, props.presetAxes])} {...props} />;
}

function TargetPickerSession({ global: g, cap, onChange, presetAxes, invalid, reasonId, children }: Props) {
  const { adapter } = useHostPlatform();
  const { t, tx } = useI18n();
  const m = useMessages(SHELL_MESSAGES);
  const axes = useEquipmentAxes();
  const facts = useEquipmentFacts(g.scopeId ?? '');
  const items = useMemo<FacetedSetItem[]>(() => (facts.data?.items ?? []).map(item => ({ id: item.equipmentId, facets: { ...item.axes, roomNames: item.room } })), [facts.data]);
  const facets = [
    ...(cap.roomNames === 'apply' ? [{ id: 'roomNames', label: t('roomNames') }] : []),
    ...(cap.line === 'apply' ? [{ id: 'lineNames', label: tx(CONTEXT_LABELS.line) }] : []),
    ...(cap.prcGroup === 'apply' ? [{ id: 'prcGroups', label: tx(CONTEXT_LABELS.prcGroup) }] : []),
    ...(cap.condition === 'apply' ? axes.filter(axis => !presetAxes || presetAxes.includes(axis.id)).map(axis => ({ id: axis.id, label: tx(axis.label) })) : []),
  ];
  const picks: Record<string, readonly string[]> = { ...g.condition };
  if (g.roomNames) picks.roomNames = g.roomNames;
  if (g.lineNames) picks.lineNames = g.lineNames;
  if (g.prcGroups) picks.prcGroups = g.prcGroups;
  // Only editable keys participate. Explicit-empty opens as all; cancellation never writes.
  const rule = Object.fromEntries(facets.flatMap(facet => picks[facet.id]?.length ? [[facet.id, picks[facet.id]]] : []));
  const fixed = cap.selection === 'apply' && g.selection?.length ? g.selection : null;
  const matches = items.filter(item => Object.entries(rule).every(([id, values]) => {
    const raw = item.facets[id];
    const valuesInItem = typeof raw === 'string' ? [raw] : raw ?? [];
    return values.some(value => valuesInItem.includes(value));
  }));
  const matchedIds = new Set(matches.map(item => item.id));
  const outside = fixed?.filter(id => !matchedIds.has(id)).length ?? 0;
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
  const apply = (value: FacetedSetValue) => {
    const patch: Partial<GlobalContext> = {};
    if (cap.roomNames === 'apply') patch.roomNames = value.rule.roomNames?.length ? [...value.rule.roomNames] : null;
    if (cap.line === 'apply') patch.lineNames = value.rule.lineNames?.length ? [...value.rule.lineNames] : null;
    if (cap.prcGroup === 'apply') patch.prcGroups = value.rule.prcGroups?.length ? [...value.rule.prcGroups] : null;
    if (cap.condition === 'apply') {
      // Preset-excluded axes remain carried, just like unsupported Context fields.
      const condition = { ...g.condition };
      for (const axis of axes.filter(axis => !presetAxes || presetAxes.includes(axis.id))) {
        const values = value.rule[axis.id];
        if (values?.length) condition[axis.id] = [...values]; else delete condition[axis.id];
      }
      patch.condition = Object.keys(condition).length ? condition : null;
    }
    if (cap.selection === 'apply') patch.selection = value.fixed?.length ? [...value.fixed] : null;
    if (('condition' in patch || 'prcGroups' in patch) && { ...g, ...patch }.condition === null && { ...g, ...patch }.prcGroups === null) patch.membershipBasis = null;
    onChange(patch);
    close(false);
  };
  const explicitEmpty = facets.some(facet => picks[facet.id]?.length === 0) || (cap.selection === 'apply' && g.selection?.length === 0);
  const count = facts.status === 'done' ? m('targetCount', { count: matches.length }) : m('targetCountUnavailable');
  const summary = facets.filter(facet => rule[facet.id]).map(facet => `${facet.label}: ${rule[facet.id].join(', ')}`).join(' · ');
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
