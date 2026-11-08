import { useLifecycleNavigate } from './host';
import { usePageValue } from './usePageValue';
import { useRef, useState } from 'react';
import { Button, Checkbox, Input, Label } from '@ap/ui';
import { STATE_LABEL, type Attempt, type Model, type Page, type QueueStatus, type RoundDetail, type RequestDetail, type RequestRow, type Round, type ScreenProps, type WriteResult } from './contracts';
import { Choice, Disclosure, GateBadge, Pager, ReadView, Section, StateBadge, time, writeFailure, WriteError } from './presentation';
import { LifecycleForm } from './forms';
import { RuleSetCell } from './RuleSetCell';

export function QueueWindow({ api }: Pick<ScreenProps, 'api'>) {
  const q = api.useRead<QueueStatus>('queueStatus', {});
  return <ReadView query={q} empty="실행 시간대를 확인하지 못했습니다.">{s => <div className="grid gap-1 text-xs text-text-secondary"><p>평일 {String(s.runWindow.weekday.fromHour).padStart(2, '0')}:00–{String(s.runWindow.weekday.toHour).padStart(2, '0')}:00 · 주말 {s.runWindow.weekendAllDay ? '종일' : '동일 시간대'} ({s.runWindow.timezone})</p><p>서버 시각 {time(s.serverAt)} KST · {s.withinWindow ? '시간대 안' : '시간대 밖'} · 사용자당 즉시 대기 요청 동시 {s.immediateLimit}건까지</p></div>}</ReadView>;
}
export function Attempts({ attempts, selected, onSelect, ui, compact = false, RuleSetLink }: { RuleSetLink?: ScreenProps['RuleSetLink']; compact?: boolean; attempts: Attempt[]; selected?: string | undefined; onSelect?(id: string): void; ui: ScreenProps['ui'] }) {
  return attempts.length === 0 ? <p className="text-sm text-text-secondary">작업자가 아직 가져가지 않았습니다. 실행 시간대를 확인해 주세요.</p> : compact ? <section aria-label="시도 이력" className="grid min-w-0 grid-cols-1 gap-3"><h3 className="text-sm font-semibold">시도 이력</h3>{[...attempts].reverse().map(a => <div key={a.id} className="grid min-w-0 grid-cols-1 gap-2 border-t border-border-subtle pt-3"><div className="flex flex-wrap items-center gap-2 text-xs"><span>시도 {a.attemptNo}</span><StateBadge value={a.outcome} /><StateBadge value={a.verdict} /></div><dl className="grid min-w-0 grid-cols-1 gap-1 text-xs"><div><dt className="text-text-secondary">작업자</dt><dd className="break-all font-mono">{a.workerActorId}</dd></div><div><dt className="text-text-secondary">규칙 세트</dt><dd><RuleSetCell attempt={a} RuleSetLink={RuleSetLink} /></dd></div><div><dt className="text-text-secondary">시작 (KST)</dt><dd>{time(a.startedAt)}</dd></div></dl></div>)}</section> : ui.table({ title: '시도 이력', preferenceKey: 'log-lifecycle-attempts', rows: [...attempts].reverse(), columns: [
    { id: 'attemptNo', size: 96, header: '시도', sortable: false, cell: a => onSelect ? <Button variant={a.id === selected ? 'secondary' : 'link'} size="toolbar" onClick={() => onSelect(a.id)}>시도 {a.attemptNo}</Button> : a.attemptNo },
    { id: 'state', size: 130, header: '실행 상태', sortable: false, cell: a => <StateBadge value={a.outcome} /> },
    { id: 'verdict', size: 110, header: '서버 판정', sortable: false, cell: a => <StateBadge value={a.verdict} /> },
    { id: 'worker', size: 130, header: '작업자', sortable: false, cell: a => <span className="font-mono text-xs block truncate" title={a.workerActorId}>{a.workerActorId}</span> },
    { id: 'ruleSet', size: 190, header: '규칙 세트', sortable: false, cell: a => <RuleSetCell attempt={a} RuleSetLink={RuleSetLink} truncate /> },
    { id: 'startedAt', size: 130, header: '시작 (KST)', sortable: false, cell: a => time(a.startedAt) },
  ] });
}
export function ResultSummary({ attempt }: { attempt?: Attempt | undefined }) { return <p className="text-xs text-text-secondary">{attempt ? `${STATE_LABEL[attempt.verdict ?? 'none'] ?? '판정 없음'}${attempt.requiredUnchecked > 0 ? ` · 필수 규칙 ${attempt.requiredUnchecked}건 미검증` : ''}${attempt.manifestMatches ? '' : ' · 샘플 매니페스트 불일치'}` : '아직 결과가 없습니다. 작업자가 실행 결과를 저장하면 표시됩니다.'}</p>; }

export function RequestRegister(props: ScreenProps & { fixedRound?: { id: string; seq: number }; onClose(): void }) {
  const { api, ui, fixedRound, onClose } = props;
  const create = api.useAction('requestCreate');
  const [modelQ, setModelQ] = useState('');
  const [modelPage, setModelPage] = useState(0);
  const models = api.useRead<Page<Model>>('models', { q: modelQ || null, page: modelPage, pageSize: 25 }, !fixedRound);
  const [projectId, setProjectId] = useState('');
  const rounds = api.useRead<{ rows: Round[] }>('rounds', { projectId }, !fixedRound && !!projectId);
  const [roundId, setRoundId] = useState(fixedRound?.id ?? 'none');
  const [priority, setPriority] = useState('1');
  const [immediate, setImmediate] = useState(false);
  const [result, setResult] = useState<WriteResult | null>(null);
  const locked = create.pending || result?.outcome === 'unknown' || result?.outcome === 'error';
  async function submit() { try { const next = await create.run({ roundId, priority: Number(priority), immediate }); setResult(next); if (next.outcome === 'ok') onClose(); } catch (cause) { const failure = writeFailure(cause); if (failure) setResult(failure); } }
  return ui.drawer({ title: '요청 등록', subtitle: 'Round의 샘플·명세 검증을 요청합니다', requestClose: () => { if (!create.pending) onClose(); }, body: <form className="grid gap-5 break-keep" onSubmit={e => { e.preventDefault(); void submit(); }}>
    {fixedRound ? <div className="grid gap-2"><Label htmlFor="fixed-round">Round (필수)</Label><Input inputSize="toolbar" id="fixed-round" disabled value={fixedRound.id} /><p className="text-xs">Round {fixedRound.seq} · 이 Round로 고정</p></div> : <>
      <div className="grid gap-2"><Label htmlFor="request-model">모델 검색</Label><Input id="request-model" inputSize="toolbar" value={modelQ} disabled={locked} onChange={e => { setModelQ(e.target.value); setModelPage(0); setProjectId(''); setRoundId('none'); }} /></div>
      <ReadView query={models}>{data => <><Choice label="개발 건 선택" value={projectId || 'none'} disabled={locked} onChange={id => { setProjectId(id === 'none' ? '' : id); setRoundId('none'); }} options={[[ 'none', '모델의 열린 개발 건 선택' ], ...data.rows.flatMap(m => m.project ? [[m.project.projectId, `${m.code} · ${m.name}`] as const] : [])]} /><Pager page={modelPage} total={data.total} onChange={setModelPage} />{data.rows.every(m => !m.project) ? <p className="text-xs">선택할 개발 건이 없습니다. 모델에서 개발 건을 먼저 만들어 주세요.</p> : null}</>}</ReadView>
      {projectId ? <ReadView query={rounds}>{data => <Choice label="Round (필수)" value={roundId} onChange={setRoundId} disabled={locked} options={[[ 'none', '열린 Round 선택' ], ...data.rows.filter(r => r.status === 'open').map(r => [r.id, `Round ${r.seq}`] as const)]} />}</ReadView> : null}
    </>}
    <p className="text-xs text-text-secondary">Round의 샘플과 명세는 읽기 전용입니다. 샘플을 바꾸려면 새 Round를 열어 주세요.</p>
    <Choice label="우선순위" value={priority} onChange={setPriority} disabled={locked} options={[[ '0', '0 · 낮음' ], ['1', '1 · 보통'], ['2', '2 · 높음']]} />
    <label htmlFor="request-immediate" className="flex items-center gap-2 text-sm"><Checkbox id="request-immediate" checked={immediate} disabled={locked} onCheckedChange={v => setImmediate(v === true)} />즉시 실행</label><p className="text-xs text-text-secondary">시간대 밖에서도 가져갈 수 있습니다. 시작을 보장하지 않으며 우선순위와 별개입니다. 작업자 토큰이 필요합니다.</p>
    <Section title="현재 실행 시간대"><QueueWindow api={api} /></Section>
    <WriteError result={result} onRetry={() => { void result?.retry?.().then(next => { setResult(next); if (next.outcome === 'ok') onClose(); }).catch(cause => { const failure = writeFailure(cause); if (failure) setResult(failure); }); }} />
    <Button type="submit" variant="primary" size="toolbar" disabled={locked || roundId === 'none'}>{create.pending ? '등록 중…' : '요청 등록'}</Button>
  </form> });
}
export function RequestDrawer(props: ScreenProps & { requestId: string; onClose(): void }) {
  const { api, ui, requestId, canRound, onClose } = props;
  const navigate = useLifecycleNavigate();
  const q = api.useRead<RequestDetail>('requestDetail', { requestId });
  const round = api.useRead<RoundDetail>('roundDetail', { roundId: q.data?.roundId ?? '' }, !!q.data?.roundId);
  const [cancel, setCancel] = useState(false);
  if (cancel && q.data) return <LifecycleForm {...props} name="requestCancel" title="요청 취소" initial={{ id: requestId, reason: '' }} version={q.data.version} onClose={() => setCancel(false)} />;
  return <>{ui.drawer({ title: '검증 요청 상세', subtitle: requestId, requestClose: onClose, body: <ReadView query={q}>{r => <div className="grid min-w-0 grid-cols-1 gap-5 break-keep"><div className="flex flex-wrap items-center gap-2"><StateBadge value={r.state} />{round.data ? <GateBadge decision={round.data.gateDecisions.at(-1)?.decision} /> : <span className="text-xs text-text-muted">Gate {round.status === 'loading' ? '확인 중' : '확인 불가'}</span>}</div><p className="text-sm">{r.modelCode} · SW {r.softwareLabel ?? '미지정'} · Round {r.roundSeq}</p><p className="text-xs">우선순위 {r.priority}{r.immediate ? ' · 즉시' : ''} · lease 만료 {time(r.leaseExpiresAt)} KST</p><ResultSummary attempt={r.attempts.at(-1)} /><Attempts attempts={r.attempts} ui={ui} compact RuleSetLink={props.RuleSetLink} /><Button variant="secondary" size="toolbar" onClick={() => navigate('round', r.projectId, r.roundId)}>Round 결과 열기</Button>{canRound && ['queued', 'claimed'].includes(r.state) ? <Button variant="secondary" size="toolbar" onClick={() => setCancel(true)}>요청 취소</Button> : <p className="text-xs text-text-muted">{r.cancelReason ? `취소 사유: ${r.cancelReason}` : '종료된 요청은 다시 실행되지 않습니다. 재실행하려면 새 요청을 등록해 주세요.'}</p>}</div>}</ReadView> })}</>;
}
export function RequestsScreen(props: ScreenProps & { fixedRound?: { id: string; seq: number }; register?: boolean }) {
  const { api, ui, canRound, selection, setSelection } = props;
  const [state, setState] = usePageValue(props, 'state', 'all');
  const [page, setPage] = usePageValue(props, 'page', 0);
  const [priority, setPriority] = usePageValue(props, 'priority', 'all');
  const [modelId, setModelId] = usePageValue(props, 'modelId', '');
  const [modelDraft, setModelDraft] = useState({ applied: modelId, text: modelId });
  if (modelDraft.applied !== modelId) setModelDraft({ applied: modelId, text: modelId });
  const [from, setFrom] = usePageValue(props, 'requestedFrom', '');
  const [to, setTo] = usePageValue(props, 'requestedTo', '');
  const [registering, setRegistering] = useState(props.register ?? false);
  const trigger = useRef<HTMLButtonElement>(null);
  const q = api.useRead<Page<RequestRow>>('requests', { page, pageSize: 25, ...(state === 'all' ? {} : { states: [state] }), ...(priority === 'all' ? {} : { priority: Number(priority) }), ...(modelId ? { modelId } : {}), ...(from ? { from: `${from}:00+09:00` } : {}), ...(to ? { to: `${to}:00+09:00` } : {}) });
  const filtered = state !== 'all' || priority !== 'all' || !!modelId || !!from || !!to;
  function clearFilters() {
    if (props.setState) props.setState({ state: undefined, priority: undefined, modelId: undefined, requestedFrom: undefined, requestedTo: undefined, page: undefined });
    else { setState('all'); setPriority('all'); setModelId(''); setFrom(''); setTo(''); setPage(0); }
  }
  return <div className="grid min-w-0 grid-cols-1 gap-4 break-keep" data-testid="log-validation-requests"><div className="flex min-w-0 flex-wrap items-end justify-between gap-3"><div className="min-w-0 flex-1"><QueueWindow api={api} /></div>{canRound ? <Button ref={trigger} variant="primary" size="toolbar" onClick={() => setRegistering(true)}>요청 등록</Button> : null}</div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="요청 상태">{['all', 'queued', 'claimed', 'succeeded', 'failed', 'expired', 'cancelled'].map(s => <Button key={s} variant={state === s ? 'secondary' : 'ghost'} size="toolbar" aria-pressed={state === s} onClick={() => setState(s)}>{STATE_LABEL[s] ?? '전체'}</Button>)}</div>
    <div><Disclosure label="추가 필터"><div className="grid min-w-0 grid-cols-1 gap-3"><Choice label="우선순위" value={priority} onChange={setPriority} options={[[ 'all', '전체' ], ['0', '0 · 낮음'], ['1', '1 · 보통'], ['2', '2 · 높음']]} /><div className="grid gap-2"><Label htmlFor="requests-model">모델 ID</Label><Input id="requests-model" inputSize="toolbar" value={modelDraft.text} onChange={e => setModelDraft({ applied: modelId, text: e.target.value })} onBlur={() => setModelId(modelDraft.text.trim())} onKeyDown={e => { if (e.key === 'Enter') setModelId(modelDraft.text.trim()); }} /></div><div className="grid gap-2"><Label htmlFor="requests-from">요청 시작 (KST)</Label><Input id="requests-from" type="datetime-local" inputSize="toolbar" value={from} onChange={e => setFrom(e.target.value)} /></div><div className="grid gap-2"><Label htmlFor="requests-to">요청 종료, 미포함 (KST)</Label><Input id="requests-to" type="datetime-local" inputSize="toolbar" value={to} onChange={e => setTo(e.target.value)} /></div></div></Disclosure></div>
    <ReadView query={q}>{data => data.rows.length === 0 ? <div className="grid min-w-0 grid-cols-1 gap-2"><p role="status" className="text-sm text-text-secondary">{filtered ? '조건에 맞는 검증 요청이 없습니다. 필터를 변경하거나 해제해 주세요.' : '검증 요청이 없습니다. Round를 열고 요청을 등록해 주세요.'}</p>{filtered ? <Button variant="secondary" size="toolbar" onClick={clearFilters}>필터 해제</Button> : null}</div> : ui.table({ title: '검증 요청', rows: data.rows, activeRowId: selection, preferenceKey: 'log-lifecycle-requests', pagination: <Pager page={page} total={data.total} onChange={setPage} />, columns: [
      { id: 'request', size: 110, header: '요청', sortable: false, cell: r => <Button variant="link" size="toolbar" onClick={() => setSelection(r.id)}><span className="font-mono text-xs">{r.id.slice(0, 8)}</span></Button> },
      { id: 'model', size: 125, header: '모델·SW', sortable: false, cell: r => <div><p>{r.modelCode}</p><p className="text-xs text-text-muted">SW {r.softwareLabel ?? '미지정'}</p></div> },
      { id: 'round', size: 70, header: 'Round', sortable: false, cell: r => r.roundSeq },
      { id: 'priority', size: 85, header: '우선순위', sortable: false, cell: r => `${r.priority}${r.immediate ? ' · 즉시' : ''}` },
      { id: 'state', size: 130, header: '상태', sortable: false, cell: r => <StateBadge value={r.state} /> },
      { id: 'progress', size: 160, header: '진행 (KST)', sortable: false, cell: r => <div className="text-xs"><p>{r.state === 'queued' ? `대기 ${Math.max(0, Math.floor((Date.now() - Date.parse(r.createdAt)) / 60000))}분` : r.state === 'claimed' ? '실행 중' : '종료'}</p><p className="text-text-muted">하트비트 {time(r.lastHeartbeatAt)}</p></div> },
      { id: 'attempts', size: 75, header: '시도', sortable: false, cell: r => `${r.attemptCount} / ${r.maxAttempts}` },
      { id: 'requester', size: 90, header: '요청자', sortable: false, cell: r => r.requestedBy.displayName || '이름 확인 불가' },
    ] })}</ReadView>
    {registering && canRound ? <RequestRegister {...props} onClose={() => { setRegistering(false); trigger.current?.focus(); }} /> : selection ? <RequestDrawer key={selection} {...props} requestId={selection} onClose={() => setSelection(undefined)} /> : null}
  </div>;
}
