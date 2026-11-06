import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useMenuFetch, useMenuQuery, usePlatform, type QueryState } from '@ap/kernel';
import { Button, StatusBadge } from '@ap/ui';
import { conceptMappingsEndpoint, conceptPairPlan, SPEC_PUBLISH_PERMISSION, type ConceptMappingRow, type ConceptSuggestion, type ConceptSuggestionsResult, type ConceptProposeResult } from '../../endpoints';
import { useSubjectPickerSpec } from '../items/useSubjectData';
import { targetBodyOf } from '../items/subjectModel';
import { canConfirm, canReject, CONCEPT_RELATION_LABEL, filterByTarget, proposedQueue, recoverConflict, reviewDraft, reviewOutcome, sortMappings, unmappedSuggestions } from './conceptModel';
import { Pager, SpecField, useSpecWords } from './SpecControls';
import { eventsOf, eventIdentity, type Spec } from './specModel';
import { useConceptActions } from './useConceptData';

type DefinitionState = ReturnType<typeof useSubjectPickerSpec>;
/** One query observer per model in the section, shared by every definition card. */
function DefinitionLoader({ modelId, onLoad }: { modelId: string; onLoad: (modelId: string, state: DefinitionState) => void }) {
  const query = useSubjectPickerSpec(modelId);
  const { response, refetch } = query;
  useEffect(() => { onLoad(modelId, { response, refetch, status: response ? 'done' : 'loading', missing: [], completedAt: null }); }, [modelId, response, refetch, onLoad]);
  return null;
}
/** `rows: null` = the read failed; it is never a completed, empty comparison. */
type Membership = { rows: ConceptMappingRow[] | null; outcome: string; refetch: () => void };
function MembershipLoader({ conceptId, onLoad }: { conceptId: string; onLoad: (id: string, membership: Membership) => void }) {
  const query = useMenuQuery(conceptMappingsEndpoint, { conceptId, page: 0, pageSize: 200 });
  const { response, refetch } = query;
  useEffect(() => { if (response) onLoad(conceptId, { rows: response.outcome === 'ok' || response.outcome === 'empty' ? response.data?.rows ?? [] : null, outcome: response.outcome, refetch }); }, [conceptId, response, refetch, onLoad]);
  return null;
}
/** A computed decision resolves only its two targets: open rows of each model, small pages, hard request ceiling. */
export const TARGET_READ_PAGE_SIZE = 50, TARGET_READ_MAX_PAGES = 2;
const OPEN_STATES = ['proposed', 'confirmed'] as const;
function Definition({ modelName, targetKey, name, spec, query }: { modelName: string; targetKey: string; name: string | null; spec: Spec | null; query?: DefinitionState | undefined }) {
  const w = useSpecWords();
  const event = spec ? eventsOf(spec).find(e => eventIdentity(e) === targetKey) : null;
  return <div className="grid min-w-0 content-start gap-1 bg-surface-sunken p-3"><p className="text-xs text-text-secondary">{modelName}</p><p className="t-mono break-all">{targetKey}</p><p className="text-sm font-medium">{name ?? w('대상 사라짐', 'Target gone')}</p>
    {!spec && !query?.response ? <p role="status" className="text-sm">{w('정의를 불러오는 중…', 'Loading definition…')}</p> : query?.response && !['ok', 'empty'].includes(query.response.outcome) ? <div><p role="alert" className="text-sm">{w('정의를 불러오지 못했습니다.', 'Could not load definition.')}</p><Button size="sm" variant="secondary" onClick={query.refetch}>{w('다시 시도', 'Retry')}</Button></div> : <p className="text-sm">{event?.triggerRule ?? w('발생 조건 없음', 'No trigger rule')}</p>}
  </div>;
}
type CardProps = { modelId: string; current: Spec | null; row?: ConceptMappingRow; suggestion?: ConceptSuggestion; all: ConceptMappingRow[]; reload: () => void; definitions: Map<string, DefinitionState>; onComplete: (id: string, action: 'confirm' | 'reject') => void; cardId: string; headingRef?: ((element: HTMLHeadingElement | null) => void) | undefined };
function ReviewCard({ modelId, current, row, suggestion, all, reload, definitions, onComplete, cardId, headingRef }: CardProps) {
  const w = useSpecWords(), { can } = usePlatform(), uid = useId(), actions = useConceptActions(), read = useMenuFetch(conceptMappingsEndpoint);
  const [rejecting, setRejecting] = useState(false), [reason, setReason] = useState(''), [error, setError] = useState(''), [conflict, setConflict] = useState(false), [busy, setBusy] = useState(false);
  // A computed proposal is persisted once before review; retry never creates it twice.
  const [staged, setStaged] = useState<ConceptProposeResult | null>(null);
  const [materialized, setMaterialized] = useState<ConceptMappingRow[] | null>(null), [freshRow, setFreshRow] = useState<ConceptMappingRow | null>(null);
  const rejectButton = useRef<HTMLButtonElement>(null);
  const active = freshRow ?? row, source = active ?? suggestion!.source, key = source.targetKey;
  const relation = active?.relationKind ?? 'equivalent', relationLabel = CONCEPT_RELATION_LABEL[relation];
  const partners = active ? all.filter(r => r.conceptId === active.conceptId && r.modelId !== modelId) : [];
  const score = active?.similarityScore ?? suggestion?.score, basis = active?.similarityBasis ?? suggestion?.basis;
  const allowed = can(SPEC_PUBLISH_PERMISSION), pending = busy || actions.pending;
  async function decide(action: 'confirm' | 'reject') {
    const draft = reviewDraft(action, reason);
    if (!draft.ok) { setError(w(draft.error === 'required' ? '거절하려면 사유를 써 주세요.' : '거절 사유는 500자 이하로 써 주세요.', 'Enter a rejection reason of 1–500 characters.')); return; }
    setBusy(true); setError('');
    try {
      let reviewRows = active ? [active] : materialized;
      if (!reviewRows && suggestion) {
        let saved = staged;
        if (!saved) {
          // Resolve just the two compared targets before materializing: earlier decisions may already own a member.
          const memberships: ConceptMappingRow[] = [];
          for (const target of [suggestion.source, suggestion.candidate]) {
            for (const reviewState of OPEN_STATES) {
              for (let page = 0; ; page++) {
                const response = await read.fetch({ modelId: target.modelId, kind: suggestion.kind, reviewState, page, pageSize: TARGET_READ_PAGE_SIZE });
                if (response.outcome !== 'ok' || !response.data) throw new Error('membership read failed');
                memberships.push(...response.data.rows.filter(r => r.targetKey === target.targetKey));
                if ((page + 1) * TARGET_READ_PAGE_SIZE >= response.data.total || !response.data.rows.length) break;
                // Past the ceiling the target's membership is unknown: refuse instead of proposing a possible duplicate.
                if (page + 1 >= TARGET_READ_MAX_PAGES) throw new Error('membership too large to verify');
              }
            }
          }
          const plan = conceptPairPlan(suggestion, memberships), first = plan.missing[0], second = plan.missing[1];
          if (!first) { reviewRows = plan.existing; setMaterialized(reviewRows); }
          else {
            const proposed = await actions.propose({ modelId: first.modelId, targetKind: suggestion.kind, target: targetBodyOf(suggestion.kind, first.targetKey), ...(plan.conceptId ? { conceptId: plan.conceptId } : { canonicalLabel: suggestion.source.name }), relationKind: relation, ...(second ? { pairWith: { modelId: second.modelId, targetKind: suggestion.kind, target: targetBodyOf(suggestion.kind, second.targetKey) } } : {}) });
            const outcome = reviewOutcome(proposed);
            if (outcome.kind !== 'done' || !proposed.data) { setError(outcome.kind === 'invalid' ? Object.values(outcome.fieldErrors).map(x => w(x.ko, x.en)).join(' ') : outcome.kind === 'forbidden' ? w('명세 관리 권한을 관리자에게 요청하세요.', 'Ask an administrator for specification management permission.') : w('제안을 저장하지 못했습니다. 다시 시도해 주세요.', 'Could not save the proposal. Retry.')); return; }
            const reused = plan.existing.find(r => r.reviewState === 'proposed');
            saved = { ...proposed.data, ...(reused ? { pairMappingId: reused.id } : {}) }; setStaged(saved);
          }
        }
        if (saved) {
          const loaded = await read.fetch({ conceptId: saved.conceptId, page: 0, pageSize: 200 });
          if (loaded.outcome !== 'ok' || !loaded.data) { setError(w('제안은 저장됐습니다. 최신 불러오기로 검토 목록을 확인하세요.', 'Proposal saved. Reload the review list.')); setConflict(true); return; }
          reviewRows = loaded.data.rows.filter(r => r.id === saved!.mappingId || r.id === saved!.pairMappingId); setMaterialized(reviewRows);
        }
      }
      if (!reviewRows?.length) { setError(w('검토 대상을 찾을 수 없습니다.', 'Review target not found.')); return; }
      for (const r of reviewRows) {
        if (r.reviewState !== 'proposed') continue;
        const result = action === 'confirm' ? await actions.confirm(r.id, r.version) : await actions.reject(r.id, draft.reason!, r.version);
        const outcome = reviewOutcome(result);
        if (outcome.kind === 'conflict') { setConflict(true); return; }
        if (outcome.kind !== 'done') { setError(outcome.kind === 'invalid' ? Object.values(outcome.fieldErrors).map(x => w(x.ko, x.en)).join(' ') : outcome.kind === 'forbidden' ? w('명세 관리 권한을 관리자에게 요청하세요.', 'Ask an administrator for specification management permission.') : w(outcome.message.ko, outcome.message.en)); return; }
        if (!active) { reviewRows = reviewRows.map(old => old.id === r.id ? { ...old, reviewState: action === 'confirm' ? 'confirmed' : 'rejected' } : old); setMaterialized(reviewRows); }
      }
      onComplete(cardId, action); reload();
    } catch { setError(w('결과를 확인하지 못했습니다. 최신 상태를 불러온 뒤 확인하세요.', 'Could not verify the result. Reload the latest state.')); setConflict(true); }
    finally { setBusy(false); }
  }
  async function recover() {
    setBusy(true);
    try {
      const response = await read.fetch({ ...(active ? { conceptId: active.conceptId } : staged ? { conceptId: staged.conceptId } : {}), page: 0, pageSize: 200 });
      if (response.outcome !== 'ok' || !response.data) { setError(w('최신 상태를 불러오지 못했습니다. 다시 시도해 주세요.', 'Could not reload. Retry.')); return; }
      if (active) { const next = recoverConflict(active, response.data.rows); if (next.status === 'retry') setFreshRow(next.row); else { setError(w('이 제안은 이미 처리됐거나 사라졌습니다.', 'This proposal was already reviewed or removed.')); reload(); return; } }
      else if (staged) {
        const fresh = response.data.rows.filter(r => r.id === staged.mappingId || r.id === staged.pairMappingId);
        if (fresh.length !== (staged.pairMappingId ? 2 : 1)) { setError(w('검토 대상을 찾을 수 없습니다. 목록을 다시 확인하세요.', 'Review targets could not be found. Reload the list.')); return; }
        setMaterialized(fresh);
      }
      else { reload(); return; }
      setConflict(false); setError('');
    } catch { setError(w('최신 상태를 불러오지 못했습니다.', 'Could not reload.')); }
    finally { setBusy(false); }
  }
  const waiting = !active || active.reviewState === 'proposed';
  return <article aria-label={`${w('검토', 'Review')} ${row?.id ?? `suggestion-${key}-${suggestion!.candidate.modelId}-${suggestion!.candidate.targetKey}`}`} className="grid gap-3 border-b border-border-subtle py-4">
    <div className="flex flex-wrap items-center gap-2"><StatusBadge tone={waiting ? 'warning' : active?.reviewState === 'confirmed' ? 'success' : 'neutral'}>{waiting ? w('제안 · 사람이 확정하기 전', 'Proposal · awaiting human review') : active?.reviewState === 'confirmed' ? w('확정됨', 'Confirmed') : w('거절됨', 'Rejected')}</StatusBadge><h4 ref={headingRef} tabIndex={-1} className="text-lg font-semibold">{active?.conceptLabel ?? suggestion?.source.name}</h4><span className="text-sm">{w(relationLabel.ko, relationLabel.en)}</span>{active?.targetState === 'target_gone' && <StatusBadge tone="warning">{w('대상 사라짐', 'Target gone')}</StatusBadge>}</div>
    <div className="grid grid-cols-2 gap-3"><Definition modelName={active?.modelName ?? all.find(r => r.modelId === modelId)?.modelName ?? w('현재 모델', 'Current model')} targetKey={key} name={active?.targetName ?? suggestion?.source.name ?? null} spec={definitions.get(modelId)?.response?.data ?? current} query={definitions.get(modelId)} />
      <div className="grid gap-2">{suggestion ? <Definition modelName={suggestion.candidate.modelName} targetKey={suggestion.candidate.targetKey} name={suggestion.candidate.name} spec={definitions.get(suggestion.candidate.modelId)?.response?.data ?? null} query={definitions.get(suggestion.candidate.modelId)} /> : partners.length ? partners.map(p => <Definition key={p.id} modelName={p.modelName} targetKey={p.targetKey} name={p.targetName} spec={definitions.get(p.modelId)?.response?.data ?? null} query={definitions.get(p.modelId)} />) : <p className="bg-surface-sunken p-3 text-sm text-text-secondary">{w('다른 모델의 대상이 아직 없습니다.', 'No target from another model yet.')}</p>}</div>
    </div>
    <p className="text-xs text-text-secondary">{score != null ? basis?.name_trgm === 1
      ? w(`이름이 같아 제안됨 (유사도 ${Math.round(score * 100)}%) · 이름만으로는 같은 개념을 판단할 수 없습니다.`, `Proposed because names match (similarity ${Math.round(score * 100)}%). Names alone do not establish equivalence.`)
      : w(`이름이 비슷해 제안됨 (유사도 ${Math.round(score * 100)}%) · 사람이 정의를 비교해야 합니다.`, `Proposed because names are similar (similarity ${Math.round(score * 100)}%). Compare definitions before deciding.`)
      : w('사람이 대상을 지정한 제안입니다.', 'A person selected these targets.')}{basis?.field_overlap != null && ` · ${w('필드 겹침', 'Field overlap')} ${Math.round(basis.field_overlap * 100)}%`}</p>
    {active?.rejectReason && <p className="text-sm">{active.rejectReason}</p>}
    <div role="alert" aria-live="assertive" className={conflict ? 'flex flex-wrap items-center gap-2 text-sm text-text-warning-label' : 'sr-only'}><span>{conflict ? w('다른 사람이 먼저 바꿨습니다. 입력은 유지됩니다.', 'Someone changed this first. Your input is preserved.') : ''}</span>{conflict && <Button size="sm" variant="secondary" disabled={pending} onClick={() => void recover()}>{w('최신 불러오기', 'Reload latest')}</Button>}</div>
    <p role="alert" aria-live="assertive" className={error ? 'text-sm text-text-danger-label' : 'sr-only'}>{error}</p>
    {waiting && allowed && <><div className="flex gap-2">{(!active || canConfirm(active)) && <Button size="sm" variant="secondary" disabled={pending || conflict || !actions.ready} onClick={() => void decide('confirm')}>{w(`${relationLabel.ko}으로 확정`, `Confirm as ${relationLabel.en.toLowerCase()}`)}</Button>}{(!active || canReject(active)) && <Button ref={rejectButton} size="sm" variant="secondary" disabled={pending || conflict || !actions.ready} onClick={() => setRejecting(true)}>{w('거절', 'Reject')}</Button>}</div>
      {rejecting && <div className="grid gap-2"><SpecField id={`${uid}-reason`} label={w('거절 사유', 'Rejection reason')} value={reason} onChange={setReason} required multiline disabled={pending} /><div className="flex gap-2"><Button size="sm" variant="secondary" disabled={pending || conflict} onClick={() => void decide('reject')}>{w('거절하기', 'Reject proposal')}</Button><Button size="sm" variant="ghost" disabled={pending} onClick={() => { setRejecting(false); rejectButton.current?.focus(); }}>{w('취소', 'Cancel')}</Button></div></div>}
    </>}
  </article>;
}
export function ConceptReview({ modelId, current, mappings, suggestions, reload, historyQueries, page, onPage, historyPage, onHistoryPage }: { modelId: string; current: Spec | null; mappings: QueryState<{ rows: ConceptMappingRow[]; total: number }>; suggestions: QueryState<ConceptSuggestionsResult>; reload: () => void; historyQueries: QueryState<{ rows: ConceptMappingRow[]; total: number }>[]; page: number; onPage: (page: number) => void; historyPage: number; onHistoryPage: (page: number) => void }) {
  const w = useSpecWords(), { pageParam, setPage } = usePlatform();
  const [members, setMembers] = useState<Map<string, Membership>>(new Map());
  const onMembers = useCallback((id: string, next: Membership) => setMembers(old => { const prev = old.get(id); return prev && prev.rows === next.rows && prev.outcome === next.outcome && prev.refetch === next.refetch ? old : new Map(old).set(id, next); }), []);
  const [definitions, setDefinitions] = useState<Map<string, DefinitionState>>(new Map());
  const onLoad = useCallback((id: string, query: DefinitionState) => setDefinitions(old => old.get(id)?.response === query.response && old.get(id)?.refetch === query.refetch ? old : new Map(old).set(id, query)), []);
  const [message, setMessage] = useState('');
  const headings = useRef(new Map<string, HTMLHeadingElement>()), sectionHeading = useRef<HTMLHeadingElement>(null), focusAfter = useRef<{ id: string; index: number } | null>(null);
  const event = pageParam('event'), response = mappings.response, suggest = suggestions.response;
  // Keep card instances while refreshing so rejection drafts survive conflict recovery and failed reads.
  const [kept, setKept] = useState<ConceptMappingRow[]>([]);
  const live = response?.outcome === 'ok' ? response.data?.rows : undefined;
  if (live && live !== kept) setKept(live);
  const visible = (rows: ConceptMappingRow[], index: number) => rows.slice((index % 2) * 10, (index % 2 + 1) * 10);
  const own = filterByTarget((live ?? kept).filter(r => r.modelId === modelId), event), queue = visible(proposedQueue(own), page);
  const history = sortMappings([...new Map([...historyQueries.flatMap((q, index) => visible(sortMappings(filterByTarget((q.response?.outcome === 'ok' ? q.response.data?.rows ?? [] : []).filter(r => r.modelId === modelId && r.reviewState === (index === 0 ? 'confirmed' : 'rejected')), event)), historyPage)), ...queue.filter(r => r.targetState === 'target_gone')].map(r => [r.id, r])).values()]);
  const conceptIds = [...new Set([...queue, ...history].map(r => r.conceptId))];
  const all = [...new Map([...conceptIds.flatMap(id => members.get(id)?.rows ?? []), ...(live ?? kept), ...history].map(r => [r.id, r])).values()];
  const computed = unmappedSuggestions(all, suggest?.outcome === 'ok' ? suggest.data?.rows ?? [] : []).filter(s => !event || s.source.targetKey === event).slice((page % 2) * 10, (page % 2 + 1) * 10);
  const cards = [...queue.filter(r => r.targetState !== 'target_gone').map(row => ({ id: row.id, row, suggestion: undefined })), ...computed.map(suggestion => ({ id: `suggestion-${suggestion.source.targetKey}-${suggestion.candidate.modelId}-${suggestion.candidate.targetKey}`, row: undefined, suggestion }))];
  const queueTotal = Math.max(mappings.response?.data?.total ?? 0, suggest?.data?.total ?? 0);
  const historyTotal = Math.max(0, ...historyQueries.map((q, index) => {
    const data = q.response?.outcome === 'ok' ? q.response.data : null;
    return data?.total === data?.rows.length ? data?.rows.filter(r => r.modelId === modelId && r.reviewState === (index === 0 ? 'confirmed' : 'rejected')).length ?? 0 : data?.total ?? 0;
  }));
  const membershipReady = (row: ConceptMappingRow) => !!members.get(row.conceptId)?.rows || all.some(p => p.conceptId === row.conceptId && p.modelId !== modelId);
  const membershipFailed = (row: ConceptMappingRow) => members.get(row.conceptId)?.rows === null && !membershipReady(row);
  const membershipGate = (row: ConceptMappingRow, key: string) => membershipFailed(row)
    ? <div key={key} className="grid justify-items-start gap-2"><p role="alert" className="text-sm">{members.get(row.conceptId)?.outcome === 'forbidden' ? w('개념 대상을 볼 권한이 없습니다.', 'No permission to read concept targets.') : w('다른 모델의 대상을 불러오지 못했습니다.', 'Could not load the targets from other models.')}</p>{members.get(row.conceptId)?.outcome !== 'forbidden' && <Button size="sm" variant="secondary" onClick={members.get(row.conceptId)?.refetch}>{w('다시 시도', 'Retry')}</Button>}</div>
    : <p key={key} role="status">{w('정의를 불러오는 중…', 'Loading definition…')}</p>;
  const historyFailed = historyQueries.some(q => q.response && !['ok', 'empty'].includes(q.response.outcome));
  const modelIds = [...new Set([...queue, ...history].flatMap(r => [r.modelId, ...all.filter(p => p.conceptId === r.conceptId).map(p => p.modelId)]).concat(computed.flatMap(s => [s.source.modelId, s.candidate.modelId])))].filter(id => id !== modelId || !!current && 'effective' in current && current.effective);
  const onComplete = (id: string, action: 'confirm' | 'reject') => {
    focusAfter.current = { id, index: cards.findIndex(c => c.id === id) };
    setMessage(w(action === 'confirm' ? '제안을 확정했습니다.' : '제안을 거절했습니다.', action === 'confirm' ? 'Proposal confirmed.' : 'Proposal rejected.'));
  };
  useEffect(() => {
    const pending = focusAfter.current;
    if (!pending || cards.some(c => c.id === pending.id)) return;
    const next = cards[Math.min(Math.max(0, pending.index), cards.length - 1)];
    (next ? headings.current.get(next.id) : null)?.focus();
    if (!next || !headings.current.has(next.id)) sectionHeading.current?.focus();
    focusAfter.current = null;
  });
  const clearFilter = () => { onPage(0); onHistoryPage(0); setPage({ event: null }); sectionHeading.current?.focus(); };
  const eventName = current ? eventsOf(current).find(e => eventIdentity(e) === event)?.name : null;
  const failed = response && !['ok', 'empty'].includes(response.outcome);
  const readError = failed ? response.outcome === 'forbidden' ? w('개념 매핑을 볼 권한이 없습니다', 'No permission to read concept mappings') : w('개념 제안을 불러오지 못했습니다', 'Could not load concept proposals') : '';
  const suggestionError = suggest && !['ok', 'empty'].includes(suggest.outcome) ? w('추가 제안을 불러오지 못했습니다.', 'Could not load additional suggestions.') : '';
  return <section aria-label={w('개념 매핑 검토', 'Concept mapping review')} className="grid gap-3">
    {conceptIds.map(id => <MembershipLoader key={id} conceptId={id} onLoad={onMembers} />)}
    {modelIds.map(id => <DefinitionLoader key={id} modelId={id} onLoad={onLoad} />)}
    <p role="status" aria-live="polite" aria-label={w('검토 결과', 'Review result')} className={message ? 'text-sm' : 'sr-only'}>{message}</p>
    <h2 ref={sectionHeading} tabIndex={-1} className="t-section-title">{w('개념 매핑 검토', 'Concept mapping review')}</h2><p className="text-sm">{w('같은 이름이어도 사람이 확정해야 같은 개념입니다', 'Even identical names need human confirmation to be the same concept')}</p>
    {event && <div className="flex items-center gap-2 text-sm"><StatusBadge tone="info">{w('이벤트', 'Event')} · {eventName ?? w('현재 명세에 없는 이벤트', 'Event absent from current specification')}</StatusBadge><Button size="icon-sm" variant="ghost" aria-label={w('필터 해제', 'Clear filter')} onClick={clearFilter}>×</Button></div>}
    {!response && <p role="status">{w('개념 제안을 불러오는 중…', 'Loading concept proposals…')}</p>}
    <p role="alert" aria-live="assertive" className={readError ? undefined : 'sr-only'}>{readError}</p><p role="alert" aria-live="assertive" className={suggestionError ? undefined : 'sr-only'}>{suggestionError}</p>
    {failed && <div>{response.outcome === 'forbidden' ? <p className="text-sm">{w('조회 권한을 관리자에게 요청하세요.', 'Ask an administrator for read permission.')}</p> : <Button size="sm" variant="secondary" onClick={reload}>{w('다시 시도', 'Retry')}</Button>}</div>}
    {response && !failed && <>
      {!suggest && <p role="status">{w('추가 제안을 불러오는 중…', 'Loading additional suggestions…')}</p>}
      {suggest && !['ok', 'empty'].includes(suggest.outcome) && <div><Button size="sm" variant="secondary" onClick={suggestions.refetch}>{w('다시 시도', 'Retry')}</Button></div>}
      {suggest?.outcome === 'ok' && suggest.data?.truncated && <p role="status" className="text-sm text-text-secondary">{w('제안 상한에 도달해 일부만 표시합니다.', 'The suggestion limit was reached; this list is incomplete.')}</p>}
      {cards.length === 0 && suggest && ['ok', 'empty'].includes(suggest.outcome) && <div role="status" className="grid justify-items-start gap-2"><p>{event ? w('이 Event에 해당하는 제안이 없습니다', 'No proposals for this Event') : w('개념 제안이 없습니다', 'No concept proposals')}</p>{event ? <Button size="sm" variant="secondary" onClick={clearFilter}>{w('필터 해제', 'Clear filter')}</Button> : <Button size="sm" variant="secondary" onClick={() => setPage({ tab: 'spec', event: null, drawer: null, change: null })}>{w('Event에서 제안하기', 'Propose from an Event')}</Button>}</div>}
    </>}
    {cards.map(c => c.row && !membershipReady(c.row) ? membershipGate(c.row, c.id) : <ReviewCard key={c.id} modelId={modelId} current={current} all={all} reload={reload} definitions={definitions} onComplete={onComplete} cardId={c.id} headingRef={element => { if (element) headings.current.set(c.id, element); else headings.current.delete(c.id); }} {...(c.row ? { row: c.row } : { suggestion: c.suggestion! })} />)}
    {queueTotal > 10 && <Pager page={page} size={10} total={queueTotal} onChange={onPage} />}
    {response && !failed && <section aria-label={w('확정·거절 이력', 'Review history')} className="grid gap-3"><h3 className="mt-3 text-sm font-semibold">{w('확정·거절 이력', 'Review history')}</h3>{historyFailed && <div className="grid justify-items-start gap-2"><p role="alert" className="text-sm">{historyQueries.some(q => q.response?.outcome === 'forbidden') ? w('이력을 볼 권한이 없습니다.', 'No permission to read review history.') : w('검토 이력을 불러오지 못했습니다.', 'Could not load review history.')}</p>{!historyQueries.some(q => q.response?.outcome === 'forbidden') && <Button size="sm" variant="secondary" onClick={() => historyQueries.forEach(q => { if (q.response && !['ok', 'empty'].includes(q.response.outcome)) q.refetch(); })}>{w('다시 시도', 'Retry')}</Button>}</div>}{history.length === 0 && !historyFailed && <p className="text-sm text-text-muted">{w('검토 이력이 없습니다.', 'No review history.')}</p>}{history.map(row => !membershipReady(row) ? membershipGate(row, row.id) : <ReviewCard key={row.id} row={row} modelId={modelId} current={current} all={all} reload={reload} definitions={definitions} onComplete={onComplete} cardId={row.id} />)}{historyTotal > 10 && <Pager page={historyPage} size={10} total={historyTotal} onChange={onHistoryPage} />}</section>}
  </section>;
}
