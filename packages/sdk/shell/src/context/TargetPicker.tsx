import { lazy, Suspense, useContext, useEffect, useId, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { CUSTOM_GROUP_AXIS, type Capability, type ContextKey, type CustomGroupTarget, type GlobalContext, type SavedViewEntry, type ViewGroupEntry } from '@ap/contracts';
import { CONTEXT_LABELS, customGroupMembers, useEquipmentAxes, useEquipmentFacts, useI18n, useMessages } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import type { FacetedSetFacet, FacetedSetItem, FacetedSetValue } from '@ap/components';
import { Button, Input, Label, cn } from '@ap/ui';
import { VisibilityOptionsPicker } from '@ap/components';
import { ChevronDown, X } from 'lucide-react';
import { CONTEXT_CHIP, CONTEXT_CHIP_TONE } from './contextChip';
import { MeasuringContext } from './ContextBarLayout';
import { SHELL_MESSAGES } from '../messages';
import { MembershipBasis } from './MembershipBasis';
import { useSessionKey } from '../frame/sessionKey';
import { useCustomGroupOptions, type CustomGroupOptions, type GroupOption } from './customGroupOptions';

const TargetPickerDialog = lazy(() => import('./TargetPickerDialog'));

export const TARGET_KEYS = ['roomNames', 'line', 'prcGroup', 'condition', 'selection'] as const;
const globalFacet = (id: string) => `global:${id}`;
const axisFacet = (id: string) => `axis:${id}`;
const ownPicks = (rule: FacetedSetValue['rule'], id: string) => Object.hasOwn(rule, id) ? rule[id] : undefined;
type PendingGroupSave = { fingerprint: string; entry: SavedViewEntry };
type GroupSaveState = 'closed' | 'editing' | 'pending' | 'error' | 'saved';
type GroupSaveSlotProps = {
  value: FacetedSetValue;
  ready: boolean;
  invalid: boolean;
  onSaved(selection: { facetId: string; value: string }): void;
  disabledReason?: string;
  shareOptions: readonly { value: string; label: string }[];
  onSave(input: { name: string; share: string; value: FacetedSetValue }): Promise<{ selected: { facetId: string; value: string } }>;
};
const EMPTY_GROUP_IDS: readonly string[] = [];
function savedRuleAxis(facetId: string): string | null {
  if (facetId.startsWith('axis:')) return facetId.slice('axis:'.length);
  const global = facetId.slice('global:'.length);
  return facetId.startsWith('global:') && ['roomNames', 'lineNames', 'prcGroups'].includes(global) ? global : null;
}

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
export type TargetPickerRequest = { key: string; opener: HTMLButtonElement };

type Props = {
  global: GlobalContext;
  cap: Record<ContextKey, Capability>;
  onChange(patch: Partial<GlobalContext>): void;
  presetAxes?: readonly string[];
  invalid?: boolean;
  compact?: boolean;
  disabled?: boolean;
  reasonId?: string;
  openRequest?: TargetPickerRequest;
  onRequestHandled?(): void;
  /** The chosen groups resolved by an owner that outlives this picker (the query bar); without it the picker resolves them itself. */
  groups?: CustomGroupOptions;
  /** Keep the dialog above relocating/measurement copies of the live bar button. */
  children?(button: ReactNode, open: boolean, openEditor?: () => void): ReactNode;
};

export function TargetPicker(props: Props) {
  const { paneId, route, revision } = useHostPlatform();
  const sessionKey = useSessionKey();
  return <TargetPickerSession key={JSON.stringify([sessionKey, revision, paneId, route?.menu.id, props.global.scopeId, props.presetAxes])} {...props} />;
}

function TargetPickerSession({ global: g, cap, onChange, presetAxes, invalid, compact, disabled, reasonId, openRequest, onRequestHandled, groups, children }: Props) {
  const { adapter, route, savedViewStore, session, revision, scope, url } = useHostPlatform();
  const { t, tx } = useI18n();
  const m = useMessages(SHELL_MESSAGES);
  const axes = useEquipmentAxes();
  const dialogId = useId();
  const facts = useEquipmentFacts(g.scopeId ?? '');
  const [shareGroups, setShareGroups] = useState<readonly ViewGroupEntry[]>([]);
  const groupFacet = globalFacet(CUSTOM_GROUP_AXIS);
  const selectedGroupIds = g.condition?.[CUSTOM_GROUP_AXIS] ?? EMPTY_GROUP_IDS;
  const canEditCondition = cap.condition === 'apply';
  const canSaveGroup = Boolean(savedViewStore && g.scopeId && scope.status === 'valid' && scope.validatedFor === session && canEditCondition);
  const ownGroups = useCustomGroupOptions({ scopeId: g.scopeId, selectedGroupIds, canEditCondition: canEditCondition && !groups });
  const groupSource = groups ?? ownGroups;
  const { optionsById } = groupSource;
  useEffect(() => {
    if (!canSaveGroup || !savedViewStore) { setShareGroups([]); return; }
    let live = true;
    savedViewStore.listGroups().then(entries => { if (live) setShareGroups(entries); }, () => { if (live) setShareGroups([]); });
    return () => { live = false; };
  }, [canSaveGroup, savedViewStore, session, revision, g.scopeId]);

  const groupOptions = useMemo(() => [...optionsById.values()], [optionsById]);
  const readableGroups = useMemo(() => groupOptions.filter((group): group is GroupOption & { target: CustomGroupTarget } => group.target !== undefined), [groupOptions]);
  const items = useMemo<FacetedSetItem[]>(() => {
    const memberships = readableGroups.map(group => [group.id, new Set(customGroupMembers(group.target, facts.data?.items ?? []))] as const);
    return (facts.data?.items ?? []).map(item => ({ id: item.equipmentId, facets: {
    ...Object.fromEntries(Object.entries(item.axes).map(([id, values]) => [axisFacet(id), values])),
    [globalFacet('roomNames')]: item.room,
    [globalFacet('lineNames')]: ownPicks(item.axes, 'lineNames') ?? [],
    [globalFacet('prcGroups')]: ownPicks(item.axes, 'prcGroups') ?? [],
    [groupFacet]: memberships.filter(([, ids]) => ids.has(item.equipmentId)).map(([id]) => id),
  } }));
  }, [facts.data, readableGroups, groupFacet]);
  const editableAxes = axes.filter(axis => !presetAxes || presetAxes.includes(axis.id));
  const facets: FacetedSetFacet[] = [
    ...(canEditCondition ? [{ id: groupFacet, label: m('targetGroupFacet'), values: groupOptions.map(group => group.id), preservePicks: groupOptions.map(group => group.id), defaultSelection: 'none' as const }] : []),
    ...(cap.roomNames === 'apply' ? [{ id: globalFacet('roomNames'), label: t('roomNames') }] : []),
    ...(cap.line === 'apply' ? [{ id: globalFacet('lineNames'), label: tx(CONTEXT_LABELS.line) }] : []),
    ...(cap.prcGroup === 'apply' ? [{ id: globalFacet('prcGroups'), label: tx(CONTEXT_LABELS.prcGroup) }] : []),
    // Categories stay flat in one row; a declared dependsOn never nests them (#2600).
    ...(cap.condition === 'apply' ? editableAxes.map(axis => ({ id: axisFacet(axis.id), label: tx(axis.label) })) : []),
  ];
  const picks: Record<string, readonly string[]> = Object.create(null);
  for (const [id, values] of Object.entries(g.condition ?? {})) picks[id === CUSTOM_GROUP_AXIS ? groupFacet : axisFacet(id)] = values;
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
  const [basis, setBasis] = useState(g.membershipBasis);
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  const open = openUrl === url;
  if (openUrl !== null && !open) setOpenUrl(null);
  const [opened, setOpened] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  const requestedOpener = useRef<HTMLButtonElement | null>(null);
  const [initialFacet, setInitialFacet] = useState<string>();
  const requestedFacets: Record<string, string | undefined> = {
    roomNames: globalFacet('roomNames'), line: globalFacet('lineNames'), prcGroup: globalFacet('prcGroups'),
    condition: facets.find(facet => facet.id.startsWith('axis:'))?.id ?? groupFacet,
  };
  const requestedFacet = openRequest ? requestedFacets[openRequest.key] : undefined;
  useEffect(() => {
    if (!openRequest || disabled) return;
    requestedOpener.current = openRequest.opener;
    setInitialFacet(requestedFacet);
    setBasis(g.membershipBasis);
    setOpened(true);
    setOpenUrl(url);
    onRequestHandled?.();
  }, [openRequest, disabled, requestedFacet, onRequestHandled, g.membershipBasis, url]);
  const restoreFocus = useRef(false);
  const close = (next: boolean) => {
    restoreFocus.current = !next;
    if (next) {
      setBasis(g.membershipBasis);
      setOpened(true);
    }
    setOpenUrl(next ? url : null);
  };
  const openEditor = () => {
    requestedOpener.current = null;
    setInitialFacet(undefined);
    close(true);
  };
  useEffect(() => {
    if (open || !restoreFocus.current) return;
    const timer = setTimeout(() => {
      (requestedOpener.current?.isConnected ? requestedOpener.current : opener.current)?.focus();
      requestedOpener.current = null;
      restoreFocus.current = false;
    }, 0);
    return () => clearTimeout(timer);
  }, [open]);
  const clear = () => {
    onChange({ roomNames: null, lineNames: null, prcGroups: null, condition: null, selection: null, membershipBasis: null });
    opener.current?.focus();
  };
  // All selected means "no condition" (ADR-0164), but a key the menu requires cannot be absent:
  // there it is written as every authorized value of that facet, so applying "all rooms" keeps the query runnable.
  const required = route?.menu.query?.mode === 'apply' ? route.menu.query.required?.context ?? [] : [];
  const picked = (value: FacetedSetValue, facetId: string, key: ContextKey) => {
    const values = ownPicks(value.rule, facetId);
    if (values?.length) return [...values];
    if (!required.includes(key)) return null;
    const universe = [...new Set(items.flatMap(item => { const raw = item.facets[facetId]; return typeof raw === 'string' ? [raw] : raw ?? []; }))].sort();
    return universe.length ? universe : null;
  };
  const targetPatch = (value: FacetedSetValue) => {
    const patch: Partial<GlobalContext> = {};
    if (cap.roomNames === 'apply') patch.roomNames = picked(value, globalFacet('roomNames'), 'roomNames');
    if (cap.line === 'apply') patch.lineNames = picked(value, globalFacet('lineNames'), 'line');
    if (cap.prcGroup === 'apply') patch.prcGroups = picked(value, globalFacet('prcGroups'), 'prcGroup');
    if (cap.condition === 'apply') {
      // Preset-excluded axes remain carried, just like unsupported Context fields.
      const condition = { ...g.condition };
      for (const axis of editableAxes) {
        const values = ownPicks(value.rule, axisFacet(axis.id));
        if (values?.length) condition[axis.id] = [...values]; else delete condition[axis.id];
      }
      const groupValues = ownPicks(value.rule, groupFacet);
      if (groupValues?.length) condition[CUSTOM_GROUP_AXIS] = [...groupValues]; else delete condition[CUSTOM_GROUP_AXIS];
      patch.condition = Object.keys(condition).length ? condition : null;
    }
    if (cap.selection === 'apply') patch.selection = value.fixed?.length ? [...value.fixed] : null;
    return patch;
  };
  const canEditBasis = cap.condition === 'apply' || cap.prcGroup === 'apply';
  const apply = (value: FacetedSetValue) => {
    const patch = targetPatch(value);
    if (canEditBasis) {
      const next = { ...g, ...patch };
      const hasOwner = next.condition !== null || next.prcGroups !== null;
      const nextBasis = hasOwner ? basis : null;
      if (nextBasis !== g.membershipBasis) patch.membershipBasis = nextBasis;
    }
    onChange(patch);
    close(false);
  };
  const settingsSlot = canEditBasis ? ({ value, ready }: { value: FacetedSetValue; ready: boolean }) => {
    const next = { ...g, ...targetPatch(value) };
    const customGroup = Boolean(next.condition?.[CUSTOM_GROUP_AXIS]?.length);
    const used = axes.filter(axis => next.condition?.[axis.id]);
    const hasOwner = next.condition !== null || next.prcGroups !== null;
    const history = hasOwner && !customGroup && used.every(axis => axis.membershipHistory);
    return {
      applyDisabled: hasOwner && basis === 'asOf' && !history,
      content: <>
        <MembershipBasis value={basis} onChange={setBasis} disabled={!ready} history={history} customGroup={customGroup} />
        {basis === 'asOf' && <p className="mt-1 text-xs text-text-secondary">{m('targetAsOfNote')}</p>}
      </>,
    };
  } : undefined;
  const explicitEmpty = facets.some(facet => ownPicks(picks, facet.id)?.length === 0) || (cap.selection === 'apply' && g.selection?.length === 0);
  const count = facts.status === 'done' ? m('targetCount', { count: matchCount }) : m('targetCountUnavailable');
  const summary = facets.flatMap(facet => {
    const values = ownPicks(rule, facet.id);
    return values ? [`${facet.label}: ${values.map(value => facet.id === groupFacet ? optionsById.get(value)?.label ?? value : value).join(', ')}`] : [];
  }).join(' · ');
  let text = t('all');
  if (Object.keys(rule).length) text = `${m('targetRule', { count })} · ${summary}`;
  if (fixed) text = m('targetFixed', { count: m('targetCount', { count: fixed.length }) });
  if (compact && !fixed) {
    const chosenFacets = facets.filter(facet => ownPicks(rule, facet.id)?.length);
    const prc = ownPicks(rule, globalFacet('prcGroups'));
    if (prc?.length && chosenFacets.length === 1) text = m('targetPrcSelected', { count: prc.length });
    else if (chosenFacets.length) {
      const choices = chosenFacets.map(facet => {
        const values = ownPicks(rule, facet.id)!;
        const first = facet.id === groupFacet ? optionsById.get(values[0])?.label ?? values[0] : values[0];
        return values.length === 1 ? first : m('targetMore', { first, count: values.length - 1 });
      });
      text = [facts.status === 'done' ? m('targetSelected', { count }) : count, ...choices].join(' · ');
    } else text = facts.status === 'done' ? m('targetSelectAll', { count }) : m('targetSelect');
  }
  if (explicitEmpty) text = `${text} · ${t('explicitEmpty')}`;
  if (g.membershipBasis === 'asOf') text += ` · ${t('membershipAsOf')}`;
  const chosen = TARGET_KEYS.some(key => {
    const field = { roomNames: g.roomNames, line: g.lineNames, prcGroup: g.prcGroups, condition: g.condition, selection: g.selection };
    return field[key] !== null;
  });
  const button = <span className="inline-flex min-w-0 items-center gap-1">
    {compact && <span className="shrink-0 text-xs text-text-secondary">{m('targetLabel')}</span>}
    <TargetButton onMount={node => { opener.current = node; }} type="button" disabled={disabled} className={cn(CONTEXT_CHIP, CONTEXT_CHIP_TONE, disabled && 'disabled:pointer-events-none disabled:opacity-50', 'max-w-[22rem]')} aria-label={`${m('targetLabel')} ${text}`} aria-haspopup="dialog" aria-expanded={open && !disabled} aria-controls={dialogId} aria-invalid={invalid || undefined} aria-describedby={invalid ? reasonId : undefined} title={text} onClick={event => { opener.current = event.currentTarget; openEditor(); }}>
      {!compact && <span className="text-text-muted">{m('targetLabel')}</span>}<span className="truncate font-medium tabular">{text}</span><ChevronDown className="size-3.5 shrink-0" aria-hidden />
    </TargetButton>
    {chosen && <Button type="button" variant="ghost" size="toolbar" disabled={disabled} aria-label={m('targetClear')} onClick={clear}><X className="size-3.5" aria-hidden /></Button>}
    {facts.status === 'done' && outside > 0 && <span className="text-xs text-text-warning-label">{m('selectionOutsideCondition', { count: outside })}</span>}
  </span>;
  const shareOptions = [
    { value: 'private', label: m('targetGroupSharePrivate') },
    ...shareGroups.filter(entry => entry.group.kind === 'custom' && entry.capabilities.canView).map(entry => ({ value: `group:${entry.group.id}`, label: m('targetGroupShareGroup', { name: entry.group.name }) })),
  ];
  const pendingSave = useRef<PendingGroupSave | null>(null);
  const saveGroup = async (input: { name: string; share: string; value: FacetedSetValue }) => {
    if (!savedViewStore || !g.scopeId || !canSaveGroup) throw new Error('Custom-group saving is unavailable');
    if (!input.value.fixed?.length && Object.hasOwn(input.value.rule, axisFacet('roomNames'))) throw new Error('An injected roomNames axis can only be saved as fixed IDs');
    const target: CustomGroupTarget = input.value.fixed?.length
      ? { fixed: [...new Set(input.value.fixed)] }
      : { rule: Object.fromEntries(Object.entries(input.value.rule).flatMap(([facetId, values]) => {
        const axis = savedRuleAxis(facetId);
        return axis === null ? [] : [[axis, [...new Set(values)]]];
      })) };
    const sharedGroupId = input.share.startsWith('group:') ? input.share.slice('group:'.length) : null;
    if (input.share !== 'private' && !shareOptions.some(option => option.value === input.share)) throw new Error('Selected shared group is unavailable');
    const fingerprint = JSON.stringify({ scopeId: g.scopeId, name: input.name, share: input.share, target });
    let saved = pendingSave.current?.fingerprint === fingerprint ? pendingSave.current.entry : null;
    if (!saved) {
      const result = await savedViewStore.save({ schemaVersion: 1, kind: 'custom-group', name: input.name, savedScopeId: g.scopeId, target });
      if (!result.ok) throw new Error(result.reason);
      saved = result.value;
      pendingSave.current = { fingerprint, entry: saved };
      groupSource.remember(saved);
    } else if (sharedGroupId !== null) {
      const latest = await savedViewStore.get(saved.view.id);
      if (!latest || ('denied' in latest && latest.denied) || latest.view.kind !== 'custom-group') throw new Error('Saved group is unavailable');
      saved = latest;
    }
    if (sharedGroupId !== null) {
      const wanted = { kind: 'groups' as const, groupIds: [sharedGroupId] };
      if (!(saved.view.visibility.kind === 'groups' && saved.view.visibility.groupIds.length === 1 && saved.view.visibility.groupIds[0] === sharedGroupId)) {
        const shared = await savedViewStore.setVisibility(saved.view.id, wanted, { expectedVersion: saved.view.version });
        if (!shared.ok) throw new Error(shared.reason);
        saved = shared.value;
      }
    }
    pendingSave.current = null;
    groupSource.remember(saved);
    return { selected: { facetId: groupFacet, value: saved.view.id } };
  };
  const groupSaveDisabledReason = (slot: { value: FacetedSetValue; invalid: boolean }): string | undefined => {
    if (slot.invalid) return m('targetGroupAllOff');
    if (slot.value.fixed?.length) return undefined;
    if (Object.hasOwn(slot.value.rule, axisFacet('roomNames'))) return m('targetGroupRoomAxisSaveDisabled');
    if (ownPicks(slot.value.rule, groupFacet)?.length) return m('targetGroupSaveDisabled');
    return undefined;
  };
  const saveSlot = canSaveGroup ? (slot: { value: FacetedSetValue; ready: boolean; invalid: boolean; onSaved(selection: { facetId: string; value: string }): void }) => <TargetGroupSaveSlot
    {...slot}
    shareOptions={shareOptions}
    disabledReason={groupSaveDisabledReason(slot)}
    onSave={saveGroup}
  /> : undefined;
  return <>{children ? children(button, open, disabled ? undefined : openEditor) : button}{opened && <Suspense fallback={null}><TargetPickerDialog dialogId={dialogId} open={open && !disabled} onOpenChange={close} title={m('targetLabel')} facets={facets} items={items} value={{ rule, fixed }} onApply={apply} applyMode="direct" initialFacet={initialFacet} allowFixed={cap.selection === 'apply'} selectAllResults resultColumns={facets.map(facet => facet.id)} valueLabel={(facetId, value) => facetId === groupFacet ? optionsById.get(value)?.label ?? value : value} itemKindLabel={m('targetEquipment')} formatCount={count => m('targetCount', { count })} status={facts.status === 'done' ? 'ready' : facts.status} onRetry={facts.retry} errorDetail={adapter.listEquipmentFacts ? m('targetFactsError') : m('targetFactsMissing')} note={!canEditBasis && g.membershipBasis === 'asOf' ? m('targetAsOfNote') : undefined} saveSlot={saveSlot} settingsSlot={settingsSlot} /></Suspense>}</>;
}

function TargetGroupSaveSlot({ value, ready, invalid, onSaved, disabledReason, shareOptions, onSave }: GroupSaveSlotProps) {
  const m = useMessages(SHELL_MESSAGES);
  const id = useId();
  const [state, setState] = useState<GroupSaveState>('closed');
  const [name, setName] = useState('');
  const [share, setShare] = useState('private');
  const saveStarted = useRef(false);
  const pending = state === 'pending';
  const canSubmit = ready && !invalid && !disabledReason && name.trim().length > 0 && shareOptions.some(option => option.value === share) && !pending && state !== 'saved';
  const submit = async () => {
    if (!canSubmit || saveStarted.current) return;
    saveStarted.current = true;
    setState('pending');
    try {
      const saved = await onSave({ name: name.trim(), share, value });
      onSaved(saved.selected);
      setState('saved');
    } catch {
      setState('error');
    } finally {
      saveStarted.current = false;
    }
  };
  if (state === 'closed') return <span className="inline-flex items-center gap-2">
    <Button type="button" variant="secondary" disabled={!ready || invalid || !!disabledReason} onClick={() => setState('editing')}>{m('targetGroupSaveAction')}</Button>
    {disabledReason && <span role="note" className="text-xs text-text-secondary">{disabledReason}</span>}
  </span>;
  return <form aria-busy={pending} className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <fieldset disabled={pending || state === 'saved'} className="flex flex-wrap items-end gap-2">
      <div className="space-y-1"><Label htmlFor={`${id}-name`}>{m('targetGroupName')}</Label><Input id={`${id}-name`} value={name} onChange={event => setName(event.target.value)} required /></div>
      <VisibilityOptionsPicker label={m('targetGroupVisibility')} value={share} onChange={setShare} options={shareOptions} />
      <Button type="submit" disabled={!canSubmit}>{pending ? m('targetGroupSaving') : m('targetGroupSubmit')}</Button>
    </fieldset>
    {disabledReason && state !== 'saved' && <span role="note" className="text-xs text-text-secondary">{disabledReason}</span>}
    {state === 'error' && <span role="alert" className="text-xs text-text-danger-label">{m('targetGroupSaveFailed')}</span>}
    {state === 'saved' && <span role="status" className="text-xs">{m('targetGroupSaved')}</span>}
  </form>;
}

function TargetButton({ onMount, ...props }: ComponentProps<'button'> & { onMount(node: HTMLButtonElement): void }) {
  const measuring = useContext(MeasuringContext);
  return <button {...props} ref={node => { if (node && !measuring) onMount(node); }} />;
}
