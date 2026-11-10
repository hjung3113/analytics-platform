import { useEffect, useId, useRef, useState } from 'react';
import { useMenuFetch, useMenuQuery } from '@ap/kernel';
import { Button, Input, SearchInput } from '@ap/ui';
import { useCopy } from '../copy';
import { questEndpoint, questSearchEndpoint, type Quest } from '../endpoints';
import { questPresentation } from '../model';
import { Field } from './parts';
type QuestState = 'ok' | 'not_found' | 'forbidden' | 'unavailable';
const questState = (outcome: string, data: Quest | null): QuestState => outcome === 'ok' && data ? 'ok' : outcome === 'empty' || (outcome === 'ok' && !data) ? 'not_found' : outcome === 'forbidden' ? 'forbidden' : 'unavailable';
export function QuestReference({ id, snapshot }: { id: string; snapshot: string }) {
  const c = useCopy();
  // `refreshing` (another mount of the same id reads it again) still shows its result.
  const r = useMenuQuery(questEndpoint, { id }).response;
  const state = r ? questState(r.outcome, r.data) : null;
  const presentation = questPresentation(state ?? 'unavailable', snapshot, r?.data ?? null);
  return <div className="space-y-1"><p className="font-mono text-xs">{id}</p><p className="break-words text-sm">{presentation.title}</p>
    <p className="text-xs text-text-secondary">{!state ? c.loading : state === 'not_found' ? c.questGone : state === 'unavailable' ? c.questDown : state === 'forbidden' ? c.questDenied : presentation.status}</p>
  </div>;
}
export type PickedQuest = { id: string; title: string };
export function QuestPicker({ selected, onSelect }: { selected: PickedQuest | null; onSelect: (quest: PickedQuest | null) => void }) {
  const c = useCopy(), uid = useId();
  const [text, setText] = useState(''), [query, setQuery] = useState(''), [page, setPage] = useState(0), [direct, setDirect] = useState(false), [id, setId] = useState('');
  const response = useMenuQuery(questSearchEndpoint, { query, page, pageSize: 10 }).response;
  const unsupported = response?.outcome === 'ok' && response.data?.supported === false;
  const failed = response && response.outcome !== 'ok' && response.outcome !== 'empty';
  const useIdEntry = direct || unsupported || !!failed;
  // A lookup is one gesture whose answer goes to `onSelect`, not a displayed result: one fetch per press, the previous attempt aborted.
  const { fetch } = useMenuFetch(questEndpoint);
  const [lookup, setLookup] = useState<'idle' | 'loading' | 'not_found' | 'unavailable' | 'forbidden'>('idle');
  const attempt = useRef<AbortController | null>(null);
  const cancelLookup = () => { attempt.current?.abort(); attempt.current = null; setLookup('idle'); };
  useEffect(() => () => attempt.current?.abort(), []);
  const startLookup = async () => {
    attempt.current?.abort();
    const controller = new AbortController();
    attempt.current = controller;
    setLookup('loading');
    let reply: Awaited<ReturnType<typeof fetch>>;
    try { reply = await fetch({ id: id.trim() }, controller.signal); } catch { if (!controller.signal.aborted) setLookup('unavailable'); return; }
    if (controller.signal.aborted) return;
    if (reply.outcome === 'ok' && reply.data) { setLookup('idle'); onSelect({ id: reply.data.id, title: reply.data.title }); return; }
    setLookup(questState(reply.outcome, null) === 'not_found' ? 'not_found' : reply.outcome === 'forbidden' ? 'forbidden' : 'unavailable');
  };
  return <section className="space-y-3 border-t border-border-subtle pt-4" aria-label={c.quest}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{c.quest}</h3><Button type="button" variant="ghost" size="sm" onClick={() => { if (useIdEntry) { setDirect(false); setQuery(''); setText(''); setPage(0); } else setDirect(true); cancelLookup(); }}>{useIdEntry ? c.questSearch : c.directId}</Button></div>
    {unsupported && <p className="text-sm text-text-secondary">{c.questUnsupported}</p>}
    {failed && <p role="status" className="text-sm text-text-secondary">{response.outcome === 'forbidden' ? c.questDenied : c.questDown}</p>}
    {useIdEntry ? <div className="space-y-2"><Field id={`${uid}-id`} label={c.directId}><Input id={`${uid}-id`} maxLength={200} value={id} onChange={e => { setId(e.target.value); cancelLookup(); }}
      onKeyDown={event => { if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return; event.preventDefault(); if (id.trim() && lookup !== 'loading') void startLookup(); }} /></Field>
      <Button type="button" variant="secondary" disabled={!id.trim() || lookup === 'loading'} onClick={() => void startLookup()}>{lookup === 'loading' ? c.loading : c.lookup}</Button>
      {lookup !== 'idle' && lookup !== 'loading' && <p role="status">{lookup === 'not_found' ? c.questGone : lookup === 'forbidden' ? c.questDenied : c.questDown}</p>}
    </div> : <>
      <div onKeyDown={event => { if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return; event.preventDefault(); }}>
        <SearchInput aria-label={c.questSearch} placeholder={c.questSearch} value={text} onValueChange={setText} onCommit={() => { setQuery(text.trim()); setPage(0); }} />
      </div>
      {!response ? <p role="status">{c.loading}</p> : response.data?.items.length ? <ul aria-label={c.questResults} tabIndex={0} className="max-h-40 space-y-2 overflow-y-auto">{response.data.items.map(q => <li key={q.id}><Button type="button" variant="ghost" size="sm" wrapText onClick={() => onSelect({ id: q.id, title: q.title })}>{q.id} · {q.title} · {q.status}</Button></li>)}</ul> : <p className="text-sm text-text-secondary">{c.questNoMatch}</p>}
      <div className="flex gap-2"><Button type="button" variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>{c.previous}</Button><Button type="button" variant="secondary" size="sm" disabled={!response?.data?.hasMore} onClick={() => setPage(p => p + 1)}>{c.next}</Button></div>
    </>}
    {selected && <div className="flex items-start justify-between gap-3 border-t border-border-subtle pt-3"><QuestReference id={selected.id} snapshot={selected.title} /><Button type="button" variant="ghost" size="sm" onClick={() => onSelect(null)}>{c.remove}</Button></div>}
  </section>;
}
