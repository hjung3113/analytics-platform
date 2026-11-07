import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { usePlatform, usePlatformQuery } from '@ap/kernel';
import type { Quest, QuestSearchPage } from '@ap/contracts';
import { Button, Input, SearchInput } from '@ap/ui';
import { useCopy } from '../copy';
import { questPresentation } from '../model';
import { Field } from './parts';
type QuestState = 'ok' | 'not_found' | 'forbidden' | 'unavailable';
const questState = (outcome: string, data: Quest | null): QuestState => outcome === 'ok' && data ? 'ok' : outcome === 'empty' || (outcome === 'ok' && !data) ? 'not_found' : outcome === 'forbidden' ? 'forbidden' : 'unavailable';
export function QuestReference({ id, snapshot }: { id: string; snapshot: string }) {
  const { adapter } = usePlatform();
  const c = useCopy();
  // 'session' identity: a destination single-row lookup does not refetch on a period or room change (06 §22).
  const query = usePlatformQuery<Quest | null>(signal => adapter.getQuest(id, signal), id, true, 'session');
  const r = query.status === 'done' ? query.response : null;
  const state = r ? questState(r.outcome, r.data) : null;
  const presentation = questPresentation(state ?? 'unavailable', snapshot, r?.data ?? null);
  return <div className="space-y-1"><p className="font-mono text-xs">{id}</p><p className="break-words text-sm">{presentation.title}</p>
    <p className="text-xs text-text-secondary">{!state ? c.loading : state === 'not_found' ? c.questGone : state === 'unavailable' ? c.questDown : state === 'forbidden' ? c.questDenied : presentation.status}</p>
  </div>;
}
export type PickedQuest = { id: string; title: string };
export function QuestPicker({ selected, onSelect }: { selected: PickedQuest | null; onSelect: (quest: PickedQuest | null) => void }) {
  const { adapter } = usePlatform();
  const c = useCopy(), uid = useId();
  const [text, setText] = useState(''), [query, setQuery] = useState(''), [page, setPage] = useState(0), [direct, setDirect] = useState(false), [id, setId] = useState('');
  const search = usePlatformQuery<QuestSearchPage>(signal => adapter.searchQuests({ query, page, pageSize: 10 }, signal), { query, page }, true, 'session');
  const response = search.status === 'done' ? search.response : null;
  const unsupported = response?.outcome === 'ok' && response.data?.supported === false;
  const failed = response && response.outcome !== 'ok' && response.outcome !== 'empty';
  const useIdEntry = direct || unsupported || !!failed;
  const [lookupRequest, setLookupRequest] = useState<{ id: string; seq: number } | null>(null);
  const selectQuest = useEffectEvent((quest: PickedQuest) => onSelect(quest));
  const startLookup = () => setLookupRequest(previous => ({ id: id.trim(), seq: (previous?.seq ?? 0) + 1 }));
  const lookupQuery = usePlatformQuery<Quest | null>(signal => adapter.getQuest(lookupRequest?.id ?? '', signal), lookupRequest, lookupRequest !== null, 'session');
  const lookupResponse = lookupRequest && lookupQuery.status === 'done' ? lookupQuery.response : null;
  const picked = lookupResponse?.outcome === 'ok' ? lookupResponse.data : null;
  const lookup: 'idle' | 'loading' | 'not_found' | 'unavailable' | 'forbidden' = !lookupRequest ? 'idle' : !lookupResponse ? 'loading' : picked ? 'idle' : questState(lookupResponse.outcome, null) === 'not_found' ? 'not_found' : lookupResponse.outcome === 'forbidden' ? 'forbidden' : 'unavailable';
  const selectedSeq = useRef(0);
  useEffect(() => {
    if (!picked || !lookupRequest || selectedSeq.current === lookupRequest.seq) return;
    selectedSeq.current = lookupRequest.seq;
    selectQuest({ id: picked.id, title: picked.title });
  }, [picked, lookupRequest]);
  return <section className="space-y-3 border-t border-border-subtle pt-4" aria-label={c.quest}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{c.quest}</h3><Button type="button" variant="ghost" size="sm" onClick={() => { if (useIdEntry) { setDirect(false); setQuery(''); setText(''); setPage(0); } else setDirect(true); setLookupRequest(null); }}>{useIdEntry ? c.questSearch : c.directId}</Button></div>
    {unsupported && <p className="text-sm text-text-secondary">{c.questUnsupported}</p>}
    {failed && <p role="status" className="text-sm text-text-secondary">{response.outcome === 'forbidden' ? c.questDenied : c.questDown}</p>}
    {useIdEntry ? <div className="space-y-2"><Field id={`${uid}-id`} label={c.directId}><Input id={`${uid}-id`} maxLength={200} value={id} onChange={e => { setId(e.target.value); setLookupRequest(null); }}
      onKeyDown={event => { if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return; event.preventDefault(); if (id.trim() && lookup !== 'loading') startLookup(); }} /></Field>
      <Button type="button" variant="secondary" disabled={!id.trim() || lookup === 'loading'} onClick={startLookup}>{lookup === 'loading' ? c.loading : c.lookup}</Button>
      {lookup !== 'idle' && lookup !== 'loading' && <p role="status">{lookup === 'not_found' ? c.questGone : lookup === 'forbidden' ? c.questDenied : c.questDown}</p>}
    </div> : <>
      <div onKeyDown={event => { if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return; event.preventDefault(); }}>
        <SearchInput aria-label={c.questSearch} placeholder={c.questSearch} value={text} onValueChange={setText} onCommit={() => { setQuery(text.trim()); setPage(0); }} />
      </div>
      {!response ? <p role="status">{c.loading}</p> : response.data?.items.length ? <ul className="space-y-2">{response.data.items.map(q => <li key={q.id}><Button type="button" variant="ghost" size="sm" wrapText onClick={() => onSelect({ id: q.id, title: q.title })}>{q.id} · {q.title} · {q.status}</Button></li>)}</ul> : <p className="text-sm text-text-secondary">{c.questNoMatch}</p>}
      <div className="flex gap-2"><Button type="button" variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>{c.previous}</Button><Button type="button" variant="secondary" size="sm" disabled={!response?.data?.hasMore} onClick={() => setPage(p => p + 1)}>{c.next}</Button></div>
    </>}
    {selected && <div className="flex items-start justify-between gap-3 border-t border-border-subtle pt-3"><QuestReference id={selected.id} snapshot={selected.title} /><Button type="button" variant="ghost" size="sm" onClick={() => onSelect(null)}>{c.remove}</Button></div>}
  </section>;
}
