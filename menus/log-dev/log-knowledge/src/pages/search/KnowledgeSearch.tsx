import { useEffect, useId, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useMenuQuery, usePlatform } from '@ap/kernel';
import { PageKeyWarning, PlatformPage, usePageKeyRules } from '@ap/components';
import { Button, Callout, Checkbox, EmptyState, ListToolbar, RadioGroup, RadioGroupItem, SearchInput, Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@ap/ui';
import { searchEndpoint, searchSuggestEndpoint, type SearchDirection, type SearchKind, type SearchRelation } from '../../endpoints';
import { EventKeyPicker } from '../items/EventKeyPicker';
import { useSpecWords } from '../spec/SpecControls';
import { parseSearchAddress, plainQuery, SEARCH_KEY_RULES, SEARCH_KIND_LABEL } from './searchModel';
import { SearchFailure, SearchMore, SearchRows } from './SearchResults';

function useSuggestions(text: string) {
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const timer = setTimeout(() => setDebounced(text.trim().slice(0, 200)), 200); return () => clearTimeout(timer); }, [text]);
  const query = useMenuQuery(searchSuggestEndpoint, { q: debounced }, text.trim() !== '' && debounced === text.trim());
  return query.response?.outcome === 'ok' ? query.response.data?.suggestions ?? [] : [];
}
function KindSelect({ value, onChange, compact = false }: { value: SearchKind; onChange: (kind: SearchKind) => void; compact?: boolean }) {
  const w = useSpecWords();
  return <Select value={value} onValueChange={next => onChange(next as SearchKind)}><SelectTrigger density={compact ? 'compact' : 'default'} aria-label={w('종류', 'Kind')}><SelectValue /></SelectTrigger>
    <SelectContent><SelectGroup>{Object.entries(SEARCH_KIND_LABEL).map(([kind, label]) => <SelectItem key={kind} value={kind}>{w(label.ko, label.en)}</SelectItem>)}</SelectGroup></SelectContent>
  </Select>;
}
function OrderSelector({ direction, kind, onSearch }: { direction: SearchDirection | null; kind: SearchKind; onSearch: (relation: SearchRelation, kind: SearchKind) => void }) {
  const w = useSpecWords(), uid = useId();
  const [source, setSource] = useState(direction?.source ?? ''), [target, setTarget] = useState(direction?.target ?? '');
  const [predicate, setPredicate] = useState<'before' | 'after'>('before'), [chosenKind, setKind] = useState(kind);
  const [sourceQuery, setSourceQuery] = useState(''), [targetQuery, setTargetQuery] = useState('');
  const sourceOptions = useSuggestions(sourceQuery), targetOptions = useSuggestions(targetQuery);
  return <section aria-label={w('순서 검색', 'Event order search')} className="grid gap-2">
    <h2 className="text-sm font-medium">{w('순서 검색', 'Event order search')}</h2><p className="text-xs text-text-secondary">{w('Event 순서를 찾을 때 선택하세요.', 'Select Events to search their order.')}</p>
    <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); if (source.trim() && target.trim()) onSearch({ source: source.trim(), target: target.trim(), predicate }, chosenKind); }}>
      <div className="grid min-w-0 flex-1 gap-1"><label htmlFor={`${uid}-a`} className="text-xs text-text-secondary">Event A</label><EventKeyPicker id={`${uid}-a`} compact value={source} onChange={setSource} options={sourceOptions.filter(s => s.kind === 'eventKey').map(s => s.text)} onSearchChange={setSourceQuery} /></div>
      <RadioGroup appearance="segmented" aria-label={w('순서', 'Order')} value={predicate} onValueChange={next => setPredicate(next === 'after' ? 'after' : 'before')}>
        <RadioGroupItem appearance="segmented" value="before">{w('먼저', 'Before')}</RadioGroupItem><RadioGroupItem appearance="segmented" value="after">{w('나중', 'After')}</RadioGroupItem>
      </RadioGroup>
      <div className="grid min-w-0 flex-1 gap-1"><label htmlFor={`${uid}-b`} className="text-xs text-text-secondary">Event B</label><EventKeyPicker id={`${uid}-b`} compact value={target} onChange={setTarget} options={targetOptions.filter(s => s.kind === 'eventKey').map(s => s.text)} onSearchChange={setTargetQuery} /></div>
      <div className="w-28"><KindSelect compact value={chosenKind} onChange={setKind} /></div>
      <Button type="submit" size="toolbar" variant="secondary" disabled={!source.trim() || !target.trim()}>{w('순서 검색', 'Search order')}</Button>
    </form>
  </section>;
}

/** Confirmed selector row (A), #1509. URL inputs and every read stay within the Kernel query lifecycle. */
export default function KnowledgeSearch() {
  const w = useSpecWords(), uid = useId(), { pageParam, setPage } = usePlatform();
  const q = pageParam('q') ?? '', relation = pageParam('relation'), kind = pageParam('kind'), opposite = pageParam('opposite');
  const keys = usePageKeyRules(SEARCH_KEY_RULES);
  const address = parseSearchAddress({ q, relation, kind, opposite });
  const [draft, setDraft] = useState({ applied: q, text: q }), [filtersOpen, setFiltersOpen] = useState(false);
  if (draft.applied !== q) setDraft({ applied: q, text: q });
  const query = useMenuQuery(searchEndpoint, address.params, address.active && !keys.invalid);
  const response = query.response, data = response && ['ok', 'empty'].includes(response.outcome) ? response.data : null;
  const interpretationKey = JSON.stringify([q, relation, kind]);
  const [interpretation, setInterpretation] = useState<{ key: string; direction: SearchDirection | null }>({ key: '', direction: null });
  if (data && (interpretation.key !== interpretationKey || JSON.stringify(interpretation.direction) !== JSON.stringify(data.interpretation.direction))) {
    setInterpretation({ key: interpretationKey, direction: data.interpretation.direction });
  }
  // Interpretation is derived only from submitted text, not from protected result data. Keep its toggle mounted while the opposite read loads.
  const direction = data?.interpretation.direction ?? (interpretation.key === interpretationKey ? interpretation.direction : null);
  const suggestions = useSuggestions(draft.text === q ? '' : draft.text);
  const commit = (text = draft.text) => {
    if (text.trim().length > 200) return;
    if (text.trim() === q && !relation && !opposite) query.refetch();
    else setPage({ q: text.trim() || null, relation: null, opposite: null });
  };
  const clearDirection = () => setPage({ q: plainQuery(q) || null, relation: null, opposite: null });
  const reset = () => setPage({ q: plainQuery(q) || null, relation: null, kind: null, opposite: null });
  const resultTitle = data?.items.length ? w(`검색 결과${data.hasMore ? ' · 더 있음' : ''}`, `Search results${data.hasMore ? ' · more available' : ''}`) : undefined;
  const lag = data?.indexLag.lagSeconds !== null && data?.indexLag.lagSeconds !== undefined;
  return <PlatformPage description={w('발행된 기술 Item을 모델·SW에 걸쳐 찾고, 일치한 이유와 Event 순서를 확인합니다.', 'Search published technical Items across models and software, with match reasons and Event order.')}>
    <div className="flex flex-col gap-3 break-keep">
      {data?.indexLag.backfill.state === 'running' && <Callout tone="blue" title={w(`색인 중 ${data.indexLag.backfill.percent}%`, `Indexing ${data.indexLag.backfill.percent}%`)}>{w('검색 결과를 계속 보여 드립니다. 아직 반영되지 않은 Item이 있을 수 있습니다.', 'Results remain available. Some Items may not be indexed yet.')}</Callout>}
      <form className="flex items-center gap-2" onSubmit={event => { event.preventDefault(); commit(); }} onKeyDown={event => {
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.type === 'search' && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); commit(); }
      }}><SearchInput size="toolbar" className="min-w-0 flex-1" aria-label={w('통합 검색어', 'Knowledge search query')}
        placeholder={w('Event 키·기술 용어 검색', 'Search Event keys or technical terms')} clearLabel={w('검색어 지우기', 'Clear query')}
        value={draft.text} onValueChange={text => setDraft({ applied: q, text })} />
        <Button type="submit" variant="secondary" size="toolbar" disabled={draft.text.trim().length > 200}>{w('검색', 'Search')}</Button></form>
      {draft.text.length > 200 && <p role="alert" className="text-xs text-text-danger-label">{w('검색어는 200자 이하로 입력하세요.', 'Use a query of at most 200 characters.')}</p>}
      {suggestions.length > 0 && <div aria-label={w('검색 제안', 'Search suggestions')} className="flex flex-wrap items-center gap-2">{suggestions.map(s => <Button type="button" variant="secondary" size="toolbar" key={`${s.kind}:${s.text}`} aria-label={w(`${s.text} 검색`, `Search ${s.text}`)} onClick={() => commit(s.text)}>{s.text}</Button>)}</div>}
      <OrderSelector key={JSON.stringify([direction, kind])} direction={direction} kind={address.params.kind ?? 'all'} onSearch={(next, nextKind) => {
        if (relation === JSON.stringify(next) && kind === nextKind && !opposite) query.refetch();
        else setPage({ relation: JSON.stringify(next), kind: nextKind, opposite: null });
      }} />
      {direction && <div className="flex flex-wrap items-center gap-2"><span className="inline-flex min-w-0 items-center gap-1 rounded bg-accent-primary-soft px-2 text-xs text-accent-primary">
        <span className="py-1">{w('방향으로 해석:', 'Interpreted direction:')} <span className="break-all">{direction.source} → {direction.target}</span> ({w(SEARCH_KIND_LABEL[direction.kind].ko, SEARCH_KIND_LABEL[direction.kind].en)})</span>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={w('방향 해석 끄기', 'Turn off direction interpretation')} onClick={clearDirection}><X className="size-3" aria-hidden /></Button>
      </span><Button type="button" variant="link" size="sm" onClick={reset}>{w('필터 초기화', 'Reset filters')}</Button></div>}
      {keys.invalid ? <PageKeyWarning sentences={keys.sentences} onRecover={keys.recover} /> : <>
      <section aria-label={w('검색 결과', 'Search results')} aria-busy={query.status === 'loading' || query.status === 'refreshing'} className="overflow-clip rounded-md border border-border-subtle bg-surface-card">
        <ListToolbar title={resultTitle} action={<div className="flex flex-wrap items-center gap-3">
          {data?.capped && <span className="text-xs text-text-secondary">{w('100건 이상', '100+ matches')}</span>}
          <Button type="button" variant="secondary" size="toolbar" aria-expanded={filtersOpen} aria-controls={`${uid}-filters`} onClick={() => setFiltersOpen(open => !open)}>{w('필터', 'Filters')}</Button>
          {direction && <label className="flex items-center gap-2 text-xs text-text-secondary"><Checkbox checked={address.params.includeOpposite === true} onCheckedChange={checked => setPage({ opposite: checked === true ? 'true' : null })} />{w('반대 방향도 보기', 'Include opposite direction')}</label>}
        </div>} />
        {filtersOpen && <div id={`${uid}-filters`} className="flex flex-wrap items-end gap-3 border-b border-border-subtle p-3"><div className="w-28"><KindSelect compact value={address.params.kind ?? 'all'} onChange={next => setPage({ kind: next })} /></div>{!direction && <Button type="button" size="sm" variant="link" onClick={reset}>{w('필터 초기화', 'Reset filters')}</Button>}</div>}
        {!address.active ? <EmptyState size="sm" icon={<Search aria-hidden />} title={w('기술 Item을 통합 검색합니다', 'Search technical Items')} body={w('Event 키나 기술 용어를 입력하세요. 순서를 찾으려면 순서 검색을 선택하세요.', 'Enter an Event key or technical term, or use order search.')} />
          : !response ? <p role="status" className="p-6 text-center text-sm text-text-secondary">{w('검색 중…', 'Searching…')}</p>
          : !data ? <SearchFailure retry={query.refetch} />
          : data.items.length === 0 ? <EmptyState size="sm" title={w('일치하는 기술 Item을 찾지 못했습니다', 'No matching technical Items')} body={w('방금 발행한 Item은 잠시 뒤 검색됩니다', 'Recently published Items will appear shortly')} />
          : <><SearchRows items={data.items} lag={lag} />{query.status === 'done' && <SearchMore key={JSON.stringify([address.params, query.completedAt])} params={address.params} data={data} restart={query.refetch} />}</>}
      </section>
      {direction && address.params.includeOpposite && data?.opposite && <section aria-label={w('반대 방향', 'Opposite direction')} className="overflow-clip rounded-md border border-border-subtle bg-surface-card">
        <ListToolbar title={w('반대 방향', 'Opposite direction')} />
        <p className="px-5 py-3 text-xs text-text-secondary">{w('검색한 방향과 반대인 기록입니다. 같은 방향 결과와 구분해 확인하세요.', 'These records have the reverse order of your search.')}</p>
        {data.opposite.length > 0 ? <SearchRows items={data.opposite} lag={lag} /> : <EmptyState size="sm" title={w('반대 방향 기록이 없습니다', 'No opposite-direction records')} />}
        {data.oppositeHasMore && <p className="px-5 py-3 text-xs text-text-secondary">{w('반대 방향 결과가 더 있습니다. 순서를 바꿔 검색하세요.', 'More opposite-direction results exist. Reverse the order to search them.')}</p>}
      </section>}
      </>}
    </div>
  </PlatformPage>;
}
