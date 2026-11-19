import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useI18n, useMessages } from '@ap/kernel';
import { Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogTitle, Input, Label, SkeletonRows, StatusBadge, cn } from '@ap/ui';
import { SegmentedRadio } from '../RadioGroup';
import { COMPONENTS_MESSAGES } from '../messages';
import { buildFacetedSetIndex, evaluateFacetedSet, facetUniverse, facetValues, normalizeFacetedRule, outsideFixedIds, rulePicks, sameFacetedRule, type FacetedSetFacet, type FacetedSetItem, type FacetedSetValue } from './facetedSet';

export interface FacetedSetDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  facets: readonly FacetedSetFacet[];
  /** Complete, authorized dataset; stable identity avoids rebuilding the index. IDs must be unique. */
  items: readonly FacetedSetItem[];
  /** Snapshot used on each open. To replace an open editing session, remount with a caller session key. */
  value: FacetedSetValue;
  onApply(next: FacetedSetValue): void;
  /** Hide fixed-ID selection for callers that apply rules only. Defaults to true. */
  allowFixed?: boolean;
  /** In direct mode the results and Apply follow the settled draft without a separate Query action. */
  applyMode?: 'manual' | 'direct';
  /** Open this facet first when present; otherwise expand the facets in the initial value. */
  initialFacet?: string;
  /** Caller settings staged alongside the current rule, above the footer. Can block Apply while invalid. */
  settingsSlot?(props: { value: FacetedSetValue; ready: boolean }): { content: ReactNode; applyDisabled?: boolean };
  resultColumns?: readonly string[];
  valueLabel?(facetId: string, value: string): string;
  itemKindLabel?: string;
  formatCount?(n: number): string;
  status?: 'loading' | 'error' | 'ready';
  onRetry?(): void;
  /** One caller line under the description, e.g. what the counts are based on. */
  note?: string;
  /** Caller reason shown under the generic error text while `status` is `error`. */
  errorDetail?: string;
  save?: {
    shareOptions: readonly { value: string; label: string }[];
    defaultShare: string;
    author?: string;
    onSave(input: { name: string; share: string; value: FacetedSetValue }): Promise<void>;
  };
  /** Optional footer UI for caller-owned actions such as saving a custom target group. Takes precedence over `save` when both are given. */
  saveSlot?: (props: { value: FacetedSetValue; ready: boolean; invalid: boolean; onSaved(selection: { facetId: string; value: string }): void }) => ReactNode;
}
const SETTLE_RESULTS_MS = 120;
const ROW_HEIGHT = 36;
const INITIAL_RESULT_HEIGHT = 360;
const INITIAL_RESULT_WIDTH = 1100;
const SEARCH_PAGE_SIZE = 30;
const identityLabel = (_facet: string, value: string) => value;
const plainCount = (count: number) => String(count);
const EMPTY_PICKS: ReadonlySet<string> = new Set();
type SaveState = 'closed' | 'editing' | 'pending' | 'error' | 'saved';
type Index = ReturnType<typeof buildFacetedSetIndex>;

function facetCheckedState(rule: FacetedSetValue['rule'], facet: string, defaultSelection: 'all' | 'none', universeSize: number): boolean | 'indeterminate' {
  if (!Object.hasOwn(rule, facet)) return defaultSelection === 'all';
  const picks = rulePicks(rule, facet);
  if (!picks.length) return false;
  return picks.length === universeSize ? true : 'indeterminate';
}

export function FacetedSetDialog(props: FacetedSetDialogProps) {
  const index = useMemo(() => buildFacetedSetIndex(props.items, props.facets), [props.items, props.facets]);
  return <Dialog open={props.open} onOpenChange={props.onOpenChange}>
    {props.open && <FacetedSetBody {...props} index={index} />}
  </Dialog>;
}

function FacetedSetBody({ index, title, facets, value, onApply, onOpenChange, allowFixed = true, applyMode = 'manual', initialFacet, resultColumns, valueLabel = identityLabel,
  itemKindLabel, formatCount = plainCount, status = 'ready', onRetry, note, errorDetail, save, saveSlot, settingsSlot }: FacetedSetDialogProps & { index: Index }) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const { t } = useI18n();
  const direct = applyMode === 'direct';
  const id = useId();
  const [draft, setDraft] = useState<FacetedSetValue>(() => ({
    rule: Object.fromEntries(Object.entries(value.rule).map(([facet, picks]) => [facet, [...new Set(picks)]])),
    fixed: allowFixed && value.fixed?.length ? [...new Set(value.fixed)] : null,
  }));
  const rule = useMemo(() => normalizeFacetedRule(index, draft.rule), [index, draft.rule]);
  const current = useMemo(() => ({ rule, fixed: allowFixed ? draft.fixed : null }), [rule, allowFixed, draft.fixed]);
  const [queriedDraft, setQueriedDraft] = useState(draft.rule);
  const queriedRule = useMemo(() => normalizeFacetedRule(index, queriedDraft), [index, queriedDraft]);
  const stale = !sameFacetedRule(rule, queriedRule);
  const [expanded, setExpanded] = useState(() => new Set(initialFacet && facets.some(facet => facet.id === initialFacet)
    ? [initialFacet] : Object.keys(value.rule).filter(key => value.rule[key].length)));
  useEffect(() => {
    if (!direct || !stale || status !== 'ready') return;
    const timer = setTimeout(() => {
      setQueriedDraft(rule);
      setTargetId(null);
      if (scroll.current) scroll.current.scrollTop = 0;
    }, SETTLE_RESULTS_MS);
    return () => clearTimeout(timer);
  }, [direct, stale, status, rule]);
  const [search, setSearch] = useState('');
  const [searchLimit, setSearchLimit] = useState(SEARCH_PAGE_SIZE);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('closed');
  const [name, setName] = useState('');
  const [share, setShare] = useState(save?.defaultShare ?? '');
  const applyStarted = useRef(false);
  const saveStarted = useRef(false);
  const scroll = useRef<HTMLDivElement>(null);
  const rows = useRef(new Map<string, HTMLDivElement>());
  const evaluation = useMemo(() => evaluateFacetedSet(index, rule), [index, rule]);
  const queried = useMemo(() => evaluateFacetedSet(index, queriedRule), [index, queriedRule]);
  const fixed = useMemo(() => new Set(current.fixed ?? []), [current.fixed]);
  const outside = useMemo(() => outsideFixedIds(index, queried.matches, current.fixed ?? []), [index, queried.matches, current.fixed]);
  const columns = (resultColumns ?? facets.slice(0, 4).map(facet => facet.id)).map(key => facets.find(facet => facet.id === key)).filter((facet): facet is FacetedSetFacet => !!facet);
  const virtual = useVirtualizer({
    count: queried.matches.length, getScrollElement: () => scroll.current, estimateSize: () => ROW_HEIGHT,
    getItemKey: position => index.items[queried.matches[position]].id,
    overscan: 5, initialRect: { height: INITIAL_RESULT_HEIGHT, width: INITIAL_RESULT_WIDTH },
  });
  const visibleRows = virtual.getVirtualItems();
  useEffect(() => {
    if (!targetId) return;
    const node = rows.current.get(targetId);
    if (node) { node.focus({ preventScroll: true }); setTargetId(null); }
  }, [targetId, visibleRows]);
  const count = current.fixed ? current.fixed.length : evaluation.matches.length;
  // One Set per facet so each option's checked state is O(1), even with thousands of picks (review C1).
  const universes = useMemo(() => new Map(facets.map(facet => [facet.id, facetUniverse(index, draft.rule, facet.id)])), [index, facets, draft.rule]);
  const pickedSets = useMemo(() => new Map(facets.map(facet => [facet.id, new Set(Object.hasOwn(rule, facet.id) ? rulePicks(rule, facet.id) : facet.defaultSelection === 'none' ? [] : universes.get(facet.id))])), [facets, rule, universes]);
  const invalidRule = Object.values(rule).some(picks => !picks.length);
  const mode = current.fixed ? m('fsFixed', { count: formatCount(count) }) : m('fsRule', { count: formatCount(count) });
  const applyLabel = current.fixed ? m('fsApplyFixed', { count: formatCount(count) }) : m('fsApplyRule', { count: formatCount(count) });
  const pending = saveState === 'pending';
  const changePick = (facet: string, pick: string) => {
    setDraft(previous => {
      const facetDefinition = facets.find(item => item.id === facet);
      const picks = Object.hasOwn(previous.rule, facet) ? rulePicks(previous.rule, facet) : facetDefinition?.defaultSelection === 'none' ? [] : facetUniverse(index, previous.rule, facet);
      const next = picks.includes(pick) ? picks.filter(value => value !== pick) : [...picks, pick];
      return { ...previous, rule: normalizeFacetedRule(index, { ...previous.rule, [facet]: next }) };
    });
  };
  const addPick = (facet: string, pick: string) => {
    setDraft(previous => ({ ...previous, rule: normalizeFacetedRule(index, { ...previous.rule, [facet]: [...new Set([...(rulePicks(previous.rule, facet)), pick])] }) }));
    setExpanded(previous => new Set([...previous, facet])); setSearch('');
  };
  const onlyPick = (facet: string, pick: string) => setDraft(previous => ({ ...previous, rule: normalizeFacetedRule(index, { ...previous.rule, [facet]: [pick] }) }));
  const toggleAll = (facet: string) => setDraft(previous => {
    const rule = { ...normalizeFacetedRule(index, previous.rule) };
    const facetDefinition = facets.find(item => item.id === facet);
    if (facetDefinition?.defaultSelection === 'none') {
      const universe = facetUniverse(index, previous.rule, facet);
      const current = Object.hasOwn(rule, facet) ? rulePicks(rule, facet) : [];
      if (current.length === universe.length) delete rule[facet];
      else rule[facet] = universe;
      return { ...previous, rule };
    }
    if (!Object.hasOwn(rule, facet)) return { ...previous, rule: { ...rule, [facet]: [] } };
    delete rule[facet];
    return { ...previous, rule };
  });
  const toggleItem = (item: string) => setDraft(previous => {
    const next = new Set(previous.fixed ?? []);
    if (next.has(item)) next.delete(item); else next.add(item);
    return { ...previous, fixed: next.size ? [...next] : null };
  });
  const clear = () => { setDraft({ rule: {}, fixed: null }); setSearch(''); };
  const query = search.trim().toLocaleLowerCase();
  const suggestions = useMemo(() => {
    if (!query || status !== 'ready') return [];
    const values: { key: string; label: string; facet?: string; value: string }[] = [];
    for (const facet of facets) {
      for (const [pick, amount] of evaluation.counts.get(facet.id) ?? []) {
        const label = valueLabel(facet.id, pick);
        if (`${facet.label} ${label}`.toLocaleLowerCase().includes(query)) values.push({
          key: JSON.stringify([facet.id, pick]), facet: facet.id, value: pick,
          label: m('fsValueSuggestion', { facet: facet.label, value: label, count: formatCount(amount) }),
        });
      }
    }
    for (const itemIndex of queried.matches) {
      const item = index.items[itemIndex];
      if (item.id.toLocaleLowerCase().includes(query)) values.push({ key: JSON.stringify([item.id]), value: item.id,
        label: m('fsItemSuggestion', { kind: itemKindLabel ?? m('fsItem'), id: item.id }) });
    }
    return values;
  }, [query, status, facets, evaluation.counts, queried.matches, index, valueLabel, formatCount, itemKindLabel, m]);
  const onSaved = (selection: { facetId: string; value: string }) => {
    const { facetId, value } = selection;
    setDraft(previous => ({ ...previous, rule: { ...previous.rule, [facetId]: [...new Set([...rulePicks(previous.rule, facetId), value])] } }));
    setQueriedDraft(previous => ({ ...previous, [facetId]: [...new Set([...rulePicks(previous, facetId), value])] }));
    setExpanded(previous => new Set([...previous, facetId]));
  };
  const submitSave = async () => {
    if (!save || !name.trim() || !save.shareOptions.some(option => option.value === share) || saveStarted.current || status !== 'ready' || invalidRule) return;
    saveStarted.current = true; setSaveState('pending');
    try {
      await save.onSave({ name: name.trim(), share, value: current });
      setSaveState('saved');
    } catch {
      // The caller owns transport details; keep the full draft and show a localized retryable failure.
      setSaveState('error');
    } finally { saveStarted.current = false; }
  };
  const ready = status === 'ready';
  const awaitingCount = direct && (!ready || stale);
  const settings = settingsSlot?.({ value: current, ready });
  const applyDisabled = !ready || pending || invalidRule || settings?.applyDisabled;
  const facetButtons = facets.map((facet, position) => {
    const open = expanded.has(facet.id);
    const picks = rulePicks(rule, facet.id);
    const first = picks.length ? valueLabel(facet.id, picks[0]) : null;
    const count = Object.hasOwn(rule, facet.id) ? picks.length : (universes.get(facet.id)?.length ?? 0);
    let caption = ready ? m('fsFacetCount', { count }) : '—';
    if (first !== null) caption = picks.length === 1 ? first : m('fsFacetMore', { first, count: picks.length - 1 });
    return <li key={facet.id} className="grid min-w-0 max-w-full gap-1">
      <Button variant="secondary" size="toolbar" className="min-w-0 justify-start" aria-expanded={open} id={`${id}-facet-trigger-${position}`} aria-controls={`${id}-facet-${position}`} onClick={() => setExpanded(previous => {
        const next = new Set(previous);
        if (next.has(facet.id)) next.delete(facet.id); else next.add(facet.id);
        return next;
      })}><span aria-hidden>{open ? '−' : '+'}</span>{facet.label}<span className="truncate text-text-secondary" title={caption}>{caption}</span></Button>
    </li>;
  });
  return <DialogContent closeLabel={direct ? t('close') : m('fsCancel')} aria-describedby={`${id}-description`}
    onEscapeKeyDown={direct ? event => {
      const facet = [...expanded].at(-1);
      if (!facet) return;
      event.preventDefault();
      setExpanded(previous => new Set([...previous].filter(key => key !== facet)));
      document.getElementById(`${id}-facet-trigger-${facets.findIndex(item => item.id === facet)}`)?.focus();
    } : undefined}
    className="flex h-196 max-h-screen w-full max-w-6xl flex-col gap-3 overflow-hidden">
    <DialogTitle>{title}</DialogTitle>
    <DialogDescription id={`${id}-description`}>{m('fsDescription')}</DialogDescription>
    {note && <p className="shrink-0 text-sm text-text-secondary">{note}</p>}
    {invalidRule && <p id={`${id}-invalid`} className="shrink-0 text-sm text-text-danger-label">{m('fsPickRequired')}</p>}
    <fieldset disabled={!ready || pending} className="min-h-0 min-w-0 flex flex-1 flex-col gap-3">
      <Label htmlFor={`${id}-search`}>{m('fsSearch')}</Label>
      <Input className="shrink-0" id={`${id}-search`} value={search} onChange={event => { setSearch(event.target.value); setSearchLimit(SEARCH_PAGE_SIZE); }} />
      {query && ready && <div role="group" aria-label={m('fsSuggestions')} className="max-h-40 shrink-0 overflow-auto rounded-md border border-border-subtle p-2">
        <p className="text-xs text-text-secondary">{m('fsSuggestionCount', { count: suggestions.length.toLocaleString() })}</p>
        {suggestions.slice(0, searchLimit).map(suggestion => <Button key={suggestion.key} variant="ghost" className="w-full justify-start" onClick={() => {
          if (suggestion.facet !== undefined) addPick(suggestion.facet, suggestion.value);
          else {
            const position = queried.matches.findIndex(item => index.items[item].id === suggestion.value);
            if (position >= 0) { virtual.scrollToIndex(position, { align: 'center' }); setTargetId(suggestion.value); }
            setSearch('');
          }
        }}>{suggestion.label}</Button>)}
        {suggestions.length > searchLimit && <Button variant="secondary" onClick={() => setSearchLimit(previous => previous + SEARCH_PAGE_SIZE)}>{m('fsMoreSuggestions', { count: (suggestions.length - searchLimit).toLocaleString() })}</Button>}
      </div>}
      <ul className="flex max-h-36 shrink-0 list-none flex-wrap items-start gap-2 overflow-auto" aria-label={m('fsFacets')}>
        {facetButtons}
      </ul>
      {ready && <div className="flex shrink-0 gap-3 overflow-x-auto">
        {facets.map((facet, position) => { if (!expanded.has(facet.id)) return null; const picked = pickedSets.get(facet.id) ?? EMPTY_PICKS; return <div key={facet.id} id={`${id}-facet-${position}`} role="group" aria-label={facet.label} className="max-h-48 w-80 shrink-0 overflow-y-auto rounded-md border border-border-subtle p-3">
          <label className="flex items-center gap-2 border-b border-border-subtle pb-2 text-sm">
            <Checkbox aria-label={m('fsAll')} checked={facetCheckedState(rule, facet.id, facet.defaultSelection ?? 'all', universes.get(facet.id)?.length ?? 0)} onCheckedChange={() => toggleAll(facet.id)} />{m('fsAll')}
          </label>
          {(universes.get(facet.id) ?? []).map(pick => {
            const amount = evaluation.counts.get(facet.id)?.get(pick) ?? 0;
            return <div key={pick} className={cn('group flex items-center gap-2 py-1 text-sm', amount === 0 && 'text-text-muted')}>
              <label className="flex min-w-0 flex-1 items-center gap-2">
                <Checkbox aria-label={valueLabel(facet.id, pick)} checked={picked.has(pick)} onCheckedChange={() => changePick(facet.id, pick)} />
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{valueLabel(facet.id, pick)}</span><span className="w-16 shrink-0 text-right tabular-nums">{formatCount(amount)}</span>
              </label>
              <span className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"><Button variant="ghost" size="sm" aria-label={m('fsOnlyValue', { value: valueLabel(facet.id, pick) })} onClick={() => onlyPick(facet.id, pick)}>{m('fsOnly')}</Button></span>
            </div>;
          })}
        </div>; })}
      </div>}
      {ready && <>
        <div className="flex shrink-0 items-center gap-3" role="status"><StatusBadge tone="neutral">{awaitingCount ? m('fsUpdating') : mode}</StatusBadge><span>{m('fsResults', { count: formatCount(queried.matches.length) })}</span>{!direct && <Button variant="secondary" disabled={!stale} onClick={() => { setQueriedDraft(rule); setTargetId(null); virtual.scrollToOffset(0); }}>{m('fsQuery')}</Button>}</div>
        {stale && <p id={`${id}-stale`} aria-live="polite" className="shrink-0 text-sm text-text-secondary">{m(direct ? 'fsUpdating' : 'fsStale')}</p>}
        {allowFixed && outside.length > 0 && <div className="max-h-24 shrink-0 overflow-auto rounded-md border border-border-subtle p-2">
          <p>{m('fsOutside', { count: formatCount(outside.length) })}</p>
          {outside.map(item => <label key={item} className="mr-4 inline-flex items-center gap-2"><Checkbox checked aria-label={m('fsOutsideItem', { id: item })} onCheckedChange={() => toggleItem(item)} />{item}</label>)}
        </div>}
      </>}
      {status === 'loading' && <div role="status" aria-label={m('fsLoading')} className="flex-1 space-y-3"><SkeletonRows count={5} size="regular" /></div>}
      {status === 'error' && <div role="alert" className="flex flex-1 flex-col items-start gap-3"><p>{m('fsError')}</p>{errorDetail && <p className="text-sm text-text-secondary">{errorDetail}</p>}</div>}
      {ready && <div role="table" aria-label={m('fsResultTable')} aria-describedby={stale ? `${id}-stale` : undefined} data-stale={stale} aria-rowcount={queried.matches.length + 1} aria-colcount={columns.length + (allowFixed ? 2 : 1)} className={cn('flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border-subtle', stale && 'text-text-muted')}>
        <div role="row" aria-rowindex={1} className="flex shrink-0 items-center border-b border-border-subtle bg-surface-sunken text-sm font-semibold h-9">
          {allowFixed && <span role="columnheader" className="w-12 shrink-0 px-3">{m('fsSelect')}</span>}<span role="columnheader" className="min-w-0 flex-1 px-3">{m('fsId')}</span>
          {columns.map(column => <span key={column.id} role="columnheader" className="min-w-0 flex-1 px-3">{column.label}</span>)}
        </div>
        <div ref={scroll} data-faceted-results className="min-h-0 flex-1 overflow-auto">
          {queried.matches.length === 0 && <div className="flex h-full flex-col items-center justify-center gap-3 p-4"><p>{m('fsEmpty')}</p><Button variant="secondary" onClick={clear}>{m('fsClear')}</Button></div>}
          <div className="relative w-full h-(--fs-total-height)" style={{ '--fs-total-height': `${virtual.getTotalSize()}px` } as CSSProperties}>
            {visibleRows.map(row => {
              const item = index.items[queried.matches[row.index]];
              return <div key={item.id} ref={node => { if (node) rows.current.set(item.id, node); else rows.current.delete(item.id); }} role="row" aria-rowindex={row.index + 2} tabIndex={-1}
                aria-label={item.id} className="absolute left-0 top-0 flex w-full h-(--fs-row-height) translate-y-(--fs-row-offset) items-center border-b border-border-subtle text-sm focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
                style={{ '--fs-row-height': `${row.size}px`, '--fs-row-offset': `${row.start}px` } as CSSProperties}>
                {allowFixed && <span role="cell" className="w-12 shrink-0 px-3"><Checkbox checked={fixed.has(item.id)} aria-label={m('fsSelectItem', { id: item.id })} onCheckedChange={() => toggleItem(item.id)} /></span>}
                <span role="cell" className="min-w-0 flex-1 truncate px-3" title={item.id}>{item.id}</span>
                {columns.map(column => { const text = facetValues(item.facets[column.id]).map(pick => valueLabel(column.id, pick)).join(', '); return <span key={column.id} role="cell" className="min-w-0 flex-1 truncate px-3" title={text}>{text}</span>; })}
              </div>;
            })}
          </div>
        </div>
      </div>}
    </fieldset>
    {status === 'error' && onRetry && <Button variant="secondary" onClick={onRetry}>{m('fsRetry')}</Button>}
    {!saveSlot && save && saveState !== 'closed' && <form aria-busy={pending} className="shrink-0 space-y-2 rounded-md border border-border-subtle p-3" onSubmit={event => { event.preventDefault(); void submitSave(); }}>
      <p>{ready ? mode : m('fsUnavailable')}</p>
      <fieldset disabled={pending || !ready} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label htmlFor={`${id}-name`}>{m('fsName')}</Label><Input id={`${id}-name`} value={name} onChange={event => setName(event.target.value)} required /></div>
        <SegmentedRadio label={m('fsShare')} value={share} onChange={setShare} options={save.shareOptions} />
        {save.author && <p>{m('fsAuthor', { author: save.author })}</p>}
        <Button type="submit" aria-describedby={invalidRule ? `${id}-invalid` : undefined} disabled={invalidRule || !name.trim() || !save.shareOptions.some(option => option.value === share)}>{pending ? m('fsSaving') : m('fsSave')}</Button>
      </fieldset>
      {saveState === 'error' && <p role="alert" className="text-text-danger-label">{m('fsSaveError')}</p>}
      {saveState === 'saved' && <p role="status">{m('fsSaved')}</p>}
    </form>}
    {settings && <div className="shrink-0 border-t border-border-subtle pt-2">{settings.content}</div>}
    <div className="flex shrink-0 items-center gap-2 border-t border-border-subtle pt-3">
      <Button variant="ghost" disabled={!ready || pending} onClick={clear}>{m('fsClear')}</Button>
      {!saveSlot && save && saveState === 'closed' && <Button variant="secondary" disabled={!ready || invalidRule} onClick={() => setSaveState('editing')}>{m('fsSaveGroup')}</Button>}
      {saveSlot?.({ value: current, ready, invalid: invalidRule, onSaved })}
      <div className="flex-1" />
      <Button variant="secondary" onClick={() => onOpenChange(false)}>{m('fsCancel')}</Button>
      <Button aria-describedby={invalidRule ? `${id}-invalid` : undefined} loading={awaitingCount && status !== 'error'} disabled={applyDisabled} onClick={() => {
        if (applyStarted.current || applyDisabled || awaitingCount) return;
        applyStarted.current = true; onApply(current); onOpenChange(false);
      }}>{ready && !awaitingCount ? applyLabel : m('fsApply')}</Button>
    </div>
  </DialogContent>;
}
