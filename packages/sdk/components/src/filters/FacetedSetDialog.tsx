import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMessages } from '@ap/kernel';
import { Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogTitle, Input, Label, SkeletonRows, StatusBadge, cn } from '@ap/ui';
import { COMPONENTS_MESSAGES } from '../messages';
import { SegmentedRadio } from '../RadioGroup';
import { buildFacetedSetIndex, evaluateFacetedSet, facetValues, outsideFixedIds, rulePicks, type FacetedSetFacet, type FacetedSetItem, type FacetedSetValue } from './facetedSet';

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
}
const ROW_HEIGHT = 36;
const INITIAL_RESULT_HEIGHT = 360;
const INITIAL_RESULT_WIDTH = 1100;
const SEARCH_PAGE_SIZE = 30;
const identityLabel = (_facet: string, value: string) => value;
const plainCount = (count: number) => String(count);
const EMPTY_PICKS: ReadonlySet<string> = new Set();
type SaveState = 'closed' | 'editing' | 'pending' | 'error' | 'saved';
type Index = ReturnType<typeof buildFacetedSetIndex>;

export function FacetedSetDialog(props: FacetedSetDialogProps) {
  const index = useMemo(() => buildFacetedSetIndex(props.items), [props.items]);
  return <Dialog open={props.open} onOpenChange={props.onOpenChange}>
    {props.open && <FacetedSetBody {...props} index={index} />}
  </Dialog>;
}

function FacetedSetBody({ index, title, facets, value, onApply, onOpenChange, resultColumns, valueLabel = identityLabel,
  itemKindLabel, formatCount = plainCount, status = 'ready', onRetry, note, errorDetail, save }: FacetedSetDialogProps & { index: Index }) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const id = useId();
  const [draft, setDraft] = useState<FacetedSetValue>(() => ({
    rule: Object.fromEntries(Object.entries(value.rule).map(([facet, picks]) => [facet, [...new Set(picks)]])),
    fixed: value.fixed?.length ? [...new Set(value.fixed)] : null,
  }));
  const [expanded, setExpanded] = useState(() => new Set(Object.keys(value.rule).filter(key => value.rule[key].length)));
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
  const evaluation = useMemo(() => evaluateFacetedSet(index, draft.rule), [index, draft.rule]);
  const fixed = useMemo(() => new Set(draft.fixed ?? []), [draft.fixed]);
  const outside = useMemo(() => outsideFixedIds(index, evaluation.matches, draft.fixed ?? []), [index, evaluation.matches, draft.fixed]);
  const columns = (resultColumns ?? facets.slice(0, 4).map(facet => facet.id)).map(key => facets.find(facet => facet.id === key)).filter((facet): facet is FacetedSetFacet => !!facet);
  const virtual = useVirtualizer({
    count: evaluation.matches.length, getScrollElement: () => scroll.current, estimateSize: () => ROW_HEIGHT,
    getItemKey: position => index.items[evaluation.matches[position]].id,
    overscan: 5, initialRect: { height: INITIAL_RESULT_HEIGHT, width: INITIAL_RESULT_WIDTH },
  });
  const visibleRows = virtual.getVirtualItems();
  useEffect(() => {
    if (!targetId) return;
    const node = rows.current.get(targetId);
    if (node) { node.focus({ preventScroll: true }); setTargetId(null); }
  }, [targetId, visibleRows]);
  const count = draft.fixed ? draft.fixed.length : evaluation.matches.length;
  // One Set per facet so each option's checked state is O(1), even with thousands of picks (review C1).
  const pickedSets = useMemo(() => new Map(facets.map(facet => [facet.id, new Set(rulePicks(draft.rule, facet.id))])), [facets, draft.rule]);
  const mode = draft.fixed ? m('fsFixed', { count: formatCount(count) }) : m('fsRule', { count: formatCount(count) });
  const applyLabel = draft.fixed ? m('fsApplyFixed', { count: formatCount(count) }) : m('fsApplyRule', { count: formatCount(count) });
  const pending = saveState === 'pending';
  const changePick = (facet: string, pick: string) => {
    setDraft(previous => {
      const picks = rulePicks(previous.rule, facet);
      const next = picks.includes(pick) ? picks.filter(value => value !== pick) : [...picks, pick];
      const rule = { ...previous.rule, [facet]: next };
      if (!next.length) delete rule[facet];
      return { ...previous, rule };
    });
  };
  const addPick = (facet: string, pick: string) => {
    setDraft(previous => ({ ...previous, rule: { ...previous.rule, [facet]: [...new Set([...(rulePicks(previous.rule, facet)), pick])] } }));
    setExpanded(previous => new Set([...previous, facet])); setSearch('');
  };
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
    for (const itemIndex of evaluation.matches) {
      const item = index.items[itemIndex];
      if (item.id.toLocaleLowerCase().includes(query)) values.push({ key: JSON.stringify([item.id]), value: item.id,
        label: m('fsItemSuggestion', { kind: itemKindLabel ?? m('fsItem'), id: item.id }) });
    }
    return values;
  }, [query, status, facets, evaluation, index, valueLabel, formatCount, itemKindLabel, m]);
  const submitSave = async () => {
    if (!save || !name.trim() || !save.shareOptions.some(option => option.value === share) || saveStarted.current || status !== 'ready') return;
    saveStarted.current = true; setSaveState('pending');
    try {
      await save.onSave({ name: name.trim(), share, value: draft });
      setSaveState('saved');
    } catch {
      // The caller owns transport details; keep the full draft and show a localized retryable failure.
      setSaveState('error');
    } finally { saveStarted.current = false; }
  };
  const ready = status === 'ready';
  return <DialogContent closeLabel={m('fsCancel')} aria-describedby={`${id}-description`}
    className="flex h-196 max-h-screen w-full max-w-6xl flex-col gap-3 overflow-hidden">
    <DialogTitle>{title}</DialogTitle>
    <DialogDescription id={`${id}-description`}>{m('fsDescription')}</DialogDescription>
    {note && <p className="shrink-0 text-sm text-text-secondary">{note}</p>}
    <fieldset disabled={!ready || pending} className="min-h-0 min-w-0 flex flex-1 flex-col gap-3">
      <Label htmlFor={`${id}-search`}>{m('fsSearch')}</Label>
      <Input className="shrink-0" id={`${id}-search`} value={search} onChange={event => { setSearch(event.target.value); setSearchLimit(SEARCH_PAGE_SIZE); }} />
      {query && ready && <div role="group" aria-label={m('fsSuggestions')} className="max-h-40 shrink-0 overflow-auto rounded-md border border-border-subtle p-2">
        <p className="text-xs text-text-secondary">{m('fsSuggestionCount', { count: suggestions.length.toLocaleString() })}</p>
        {suggestions.slice(0, searchLimit).map(suggestion => <Button key={suggestion.key} variant="ghost" className="w-full justify-start" onClick={() => {
          if (suggestion.facet !== undefined) addPick(suggestion.facet, suggestion.value);
          else {
            const position = evaluation.matches.findIndex(item => index.items[item].id === suggestion.value);
            if (position >= 0) { virtual.scrollToIndex(position, { align: 'center' }); setTargetId(suggestion.value); }
            setSearch('');
          }
        }}>{suggestion.label}</Button>)}
        {suggestions.length > searchLimit && <Button variant="secondary" onClick={() => setSearchLimit(previous => previous + SEARCH_PAGE_SIZE)}>{m('fsMoreSuggestions', { count: (suggestions.length - searchLimit).toLocaleString() })}</Button>}
      </div>}
      <div className="flex shrink-0 gap-2 overflow-x-auto" aria-label={m('fsFacets')}>
        {facets.map((facet, position) => <Button key={facet.id} variant="secondary" aria-expanded={expanded.has(facet.id)} aria-controls={`${id}-facet-${position}`} onClick={() => setExpanded(previous => {
          const next = new Set(previous); if (next.has(facet.id)) next.delete(facet.id); else next.add(facet.id); return next;
        })}><span aria-hidden>{expanded.has(facet.id) ? '−' : '+'}</span>{facet.label}{!!rulePicks(draft.rule, facet.id).length && <span>{rulePicks(draft.rule, facet.id).length}</span>}</Button>)}
      </div>
      {ready && <div className="flex shrink-0 gap-3 overflow-x-auto">
        {facets.map((facet, position) => { if (!expanded.has(facet.id)) return null; const picked = pickedSets.get(facet.id) ?? EMPTY_PICKS; return <div key={facet.id} id={`${id}-facet-${position}`} role="group" aria-label={facet.label} className="max-h-48 w-56 shrink-0 overflow-y-auto rounded-md border border-border-subtle p-3">
          {[...new Set([...(evaluation.counts.get(facet.id)?.keys() ?? []), ...picked])].map(pick => {
            const amount = evaluation.counts.get(facet.id)?.get(pick) ?? 0;
            return <label key={pick} className={cn('flex items-center gap-2 py-1 text-sm', amount === 0 && 'text-text-muted')}>
              <Checkbox aria-label={valueLabel(facet.id, pick)} checked={picked.has(pick)} onCheckedChange={() => changePick(facet.id, pick)} />
              <span className="flex-1">{valueLabel(facet.id, pick)}</span><span>{formatCount(amount)}</span>
            </label>;
          })}
        </div>; })}
      </div>}
      {ready && <>
        <div className="flex shrink-0 items-center gap-3" role="status"><StatusBadge tone="neutral">{mode}</StatusBadge><span>{m('fsResults', { count: formatCount(evaluation.matches.length) })}</span></div>
        {outside.length > 0 && <div className="max-h-24 shrink-0 overflow-auto rounded-md border border-border-subtle p-2">
          <p>{m('fsOutside', { count: formatCount(outside.length) })}</p>
          {outside.map(item => <label key={item} className="mr-4 inline-flex items-center gap-2"><Checkbox checked aria-label={m('fsOutsideItem', { id: item })} onCheckedChange={() => toggleItem(item)} />{item}</label>)}
        </div>}
      </>}
      {status === 'loading' && <div role="status" aria-label={m('fsLoading')} className="flex-1 space-y-3"><SkeletonRows count={5} size="regular" /></div>}
      {status === 'error' && <div role="alert" className="flex flex-1 flex-col items-start gap-3"><p>{m('fsError')}</p>{errorDetail && <p className="text-sm text-text-secondary">{errorDetail}</p>}</div>}
      {ready && <div role="table" aria-label={m('fsResultTable')} aria-rowcount={evaluation.matches.length + 1} aria-colcount={columns.length + 2} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border-subtle">
        <div role="row" aria-rowindex={1} className="flex shrink-0 items-center border-b border-border-subtle bg-surface-sunken text-sm font-semibold h-9">
          <span role="columnheader" className="w-12 shrink-0 px-3">{m('fsSelect')}</span><span role="columnheader" className="min-w-0 flex-1 px-3">{m('fsId')}</span>
          {columns.map(column => <span key={column.id} role="columnheader" className="min-w-0 flex-1 px-3">{column.label}</span>)}
        </div>
        <div ref={scroll} data-faceted-results className="min-h-0 flex-1 overflow-auto">
          {evaluation.matches.length === 0 && <div className="flex h-full flex-col items-center justify-center gap-3 p-4"><p>{m('fsEmpty')}</p><Button variant="secondary" onClick={clear}>{m('fsClear')}</Button></div>}
          <div className="relative w-full h-(--fs-total-height)" style={{ '--fs-total-height': `${virtual.getTotalSize()}px` } as CSSProperties}>
            {visibleRows.map(row => {
              const item = index.items[evaluation.matches[row.index]];
              return <div key={item.id} ref={node => { if (node) rows.current.set(item.id, node); else rows.current.delete(item.id); }} role="row" aria-rowindex={row.index + 2} tabIndex={-1}
                aria-label={item.id} className="absolute left-0 top-0 flex w-full h-(--fs-row-height) translate-y-(--fs-row-offset) items-center border-b border-border-subtle text-sm focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
                style={{ '--fs-row-height': `${row.size}px`, '--fs-row-offset': `${row.start}px` } as CSSProperties}>
                <span role="cell" className="w-12 shrink-0 px-3"><Checkbox checked={fixed.has(item.id)} aria-label={m('fsSelectItem', { id: item.id })} onCheckedChange={() => toggleItem(item.id)} /></span>
                <span role="cell" className="min-w-0 flex-1 truncate px-3" title={item.id}>{item.id}</span>
                {columns.map(column => { const text = facetValues(item.facets[column.id]).map(pick => valueLabel(column.id, pick)).join(', '); return <span key={column.id} role="cell" className="min-w-0 flex-1 truncate px-3" title={text}>{text}</span>; })}
              </div>;
            })}
          </div>
        </div>
      </div>}
    </fieldset>
    {status === 'error' && onRetry && <Button variant="secondary" onClick={onRetry}>{m('fsRetry')}</Button>}
    {save && saveState !== 'closed' && <form aria-busy={pending} className="shrink-0 space-y-2 rounded-md border border-border-subtle p-3" onSubmit={event => { event.preventDefault(); void submitSave(); }}>
      <p>{ready ? mode : m('fsUnavailable')}</p>
      <fieldset disabled={pending || !ready} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label htmlFor={`${id}-name`}>{m('fsName')}</Label><Input id={`${id}-name`} value={name} onChange={event => setName(event.target.value)} required /></div>
        <SegmentedRadio label={m('fsShare')} value={share} onChange={setShare} options={save.shareOptions} />
        {save.author && <p>{m('fsAuthor', { author: save.author })}</p>}
        <Button type="submit" disabled={!name.trim() || !save.shareOptions.some(option => option.value === share)}>{pending ? m('fsSaving') : m('fsSave')}</Button>
      </fieldset>
      {saveState === 'error' && <p role="alert" className="text-text-danger-label">{m('fsSaveError')}</p>}
      {saveState === 'saved' && <p role="status">{m('fsSaved')}</p>}
    </form>}
    <div className="flex shrink-0 items-center gap-2 border-t border-border-subtle pt-3">
      <Button variant="ghost" disabled={!ready || pending} onClick={clear}>{m('fsClear')}</Button>
      {save && saveState === 'closed' && <Button variant="secondary" disabled={!ready} onClick={() => setSaveState('editing')}>{m('fsSaveGroup')}</Button>}
      <div className="flex-1" />
      <Button variant="secondary" onClick={() => onOpenChange(false)}>{m('fsCancel')}</Button>
      <Button disabled={!ready || pending} onClick={() => {
        if (applyStarted.current) return;
        applyStarted.current = true; onApply(draft); onOpenChange(false);
      }}>{ready ? applyLabel : m('fsApply')}</Button>
    </div>
  </DialogContent>;
}
