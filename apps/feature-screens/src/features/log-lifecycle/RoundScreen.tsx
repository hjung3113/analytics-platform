import { usePageValue } from './usePageValue';
import { useState } from 'react';
import { Button, Checkbox, Tabs, TabsContent, TabsList, TabsTrigger } from '@ap/ui';
import { RESULT_ORDER, STATE_LABEL, type Attempt, type OpinionEvidence, type OpinionScale, type Page, type Project, type RequestDetail, type RequestRow, type RoundDetail, type RuleResult, type ScreenProps } from './contracts';
import { OpinionCell, OpinionHistory, UnlinkedOpinions } from './Opinions';
import { GatePanel } from './GatePanel';
import { LifecycleForm } from './forms';
import { Attempts, QueueWindow, RequestRegister, ResultSummary } from './RequestsScreen';
import { Choice, Disclosure, Pager, ReadView, Section, StateBadge, time } from './presentation';

function Excerpt({ api, ui, ruleResultId, evidenceIndex, onClose }: Pick<ScreenProps, 'api' | 'ui'> & { ruleResultId: string; evidenceIndex: number; onClose(): void }) {
  // Only mounted after the person's explicit read. Kernel cancels and discards it on close/session change.
  const q = api.useRead<{ deleted: boolean; excerpt: string | null }>('excerpt', { ruleResultId, evidenceIndex });
  return ui.drawer({ title: '로그 발췌', requestClose: onClose, body: q.denied ? <p role="alert" className="text-sm">권한 없음 · 이 원본의 발췌 열람 권한이 없습니다.</p> : <ReadView query={q} empty="저장된 발췌가 없습니다.">{data => data.deleted ? <p className="text-sm">보관 기간 지남으로 삭제됨</p> : <pre className="whitespace-pre-wrap break-all text-xs">{data.excerpt}</pre>}</ReadView> });
}
function RuleTable(props: ScreenProps & { round: RoundDetail; attempt: Attempt; onOpenSource?: (order: number, line: number) => void }) {
  const { api, ui, round, attempt } = props;
  const [result, setResult] = usePageValue(props, 'result', 'all', ['rulesPage']);
  const [requiredValue, setRequiredValue] = usePageValue(props, 'required', 'false', ['rulesPage']);
  const required = requiredValue === 'true';
  const setRequired = (next: boolean) => setRequiredValue(String(next));
  const [sort, setSort] = usePageValue(props, 'sort', 'ruleId', ['rulesPage']);
  const [page, setPage] = usePageValue(props, 'rulesPage', 0);
  const hasOpinions = (attempt.opinionCount ?? 0) > 0;
  const scale = api.useRead<OpinionScale>('opinionScale', {}, hasOpinions);
  const declared = hasOpinions && scale.status === 'done' && !!scale.data?.grades.length;
  // A transient row filter; it never changes the attempt's result counts or summary.
  const [opinionGrade, setOpinionGrade] = useState('all');
  const [opinion, setOpinion] = useState<string | null>(null);
  const [excerpt, setExcerpt] = useState<{ id: string; index: number; evidence?: OpinionEvidence[] } | null>(null);
  const query = api.useRead<Page<RuleResult>>('ruleResults', { attemptId: attempt.id, page, pageSize: 25, sorting: [{ id: sort, desc: false }], ...(result === 'all' ? {} : { results: [result] }), ...(required ? { required: true } : {}), ...(declared && opinionGrade !== 'all' ? { opinionGrade } : {}) });
  return <Section title="규칙 결과">{hasOpinions && scale.status === 'done' && scale.data && !scale.data.grades.length ? <p className="break-keep text-xs text-text-secondary">의견 척도 미선언</p> : null}<div role="group" aria-label="규칙 결과 필터" className="flex flex-wrap items-center gap-2"><ResultSummary attempt={attempt} /><Button variant={result === 'all' ? 'secondary' : 'ghost'} size="toolbar" aria-pressed={result === 'all'} onClick={() => setResult('all')}>전체 {attempt.ruleCount}</Button>{RESULT_ORDER.map(r => <Button key={r} variant={result === r ? 'secondary' : 'ghost'} size="toolbar" aria-pressed={result === r} onClick={() => setResult(r)}>{STATE_LABEL[r]} {attempt.counts[r] ?? 0}</Button>)}</div>
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3"><label htmlFor="rules-required" className="flex items-center gap-2 text-xs"><Checkbox id="rules-required" checked={required} onCheckedChange={v => setRequired(v === true)} />필수 규칙만</label><Choice label="결과 정렬" value={sort} onChange={setSort} options={[[ 'ruleId', '규칙 ID순' ], ['result', '결과순'], ['required', '필수 여부순']]} />{hasOpinions ? <div className="break-keep"><ReadView query={scale}>{data => declared ? <Choice label="의견 등급" value={opinionGrade} onChange={value => { setOpinionGrade(value); setPage(0); }} options={[[ 'all', '전체' ], ...data.grades.map(g => [g.key, g.label] as const), ['none', '의견 없음']]} /> : null}</ReadView></div> : null}</div>
    <ReadView query={query}>{data => data.rows.length === 0 ? <p className="text-xs text-text-secondary">선택한 조건의 규칙 결과가 없습니다.</p> : ui.table({ title: '규칙 결과', rows: data.rows, preferenceKey: 'log-lifecycle-rule-results', pagination: <Pager page={page} total={data.total} onChange={setPage} />, columns: [
      { id: 'rule', header: '규칙·필수', size: 100, sortable: false, cell: r => <div><p className="font-mono text-xs truncate" title={r.ruleId}>{r.ruleId}</p><p className="text-xs text-text-muted">{r.required ? '필수' : '선택'}</p></div> },
      { id: 'result', header: '결과', size: 90, sortable: false, cell: r => <StateBadge value={r.result} /> },
      { id: 'observed', header: '기대·관측', size: 210, sortable: false, cell: r => <div className="text-xs"><p className="truncate" title={r.expected ?? ''}>기대: {r.expected ?? '없음'}</p><p className="truncate" title={r.observed ?? ''}>관측: {r.observed ?? '없음'}</p></div> },
      { id: 'evidence', header: '근거 위치·발췌', size: 280, sortable: false, cell: r => {
        const e = r.evidence[0];
        if (!e) return <span className="text-xs text-text-muted">근거 위치 없음 · 발췌 없음</span>;
        const file = round.sampleSet.files.find(f => f.fileRef === e.fileRef);
        const mismatch = file?.sha256 !== e.fileSha256;
        return <div className="text-xs"><div className="flex min-w-0 items-center gap-2"><span className="font-mono text-xs min-w-0 truncate" title={`${e.fileRef}:${e.line}`}>{e.fileRef}:{e.line}</span>{mismatch ? <span className="text-text-warning-label">해시 불일치</span> : null}</div><div className="flex min-w-0 items-center gap-2">{props.onOpenSource && !mismatch && file ? <Button variant="link" size="toolbar" className="min-w-0 flex-1 justify-start break-keep whitespace-nowrap" aria-label={`${r.ruleId} ${e.fileRef}:${e.line} 원본에서 보기`} onClick={() => props.onOpenSource?.(file.order, e.line)}>원본에서 보기</Button> : <span className="min-w-0 flex-1 truncate text-text-muted" title="원본 확인 불가 (unresolved)">원본 확인 불가</span>}{r.evidence.some(x => x.hasExcerpt) ? <Button variant="link" size="toolbar" onClick={() => setExcerpt({ id: r.id, index: r.evidence.findIndex(x => x.hasExcerpt) })}>발췌 보기</Button> : <span className="text-text-muted">발췌 없음</span>}{r.evidence.length > 1 ? <Button variant="link" size="toolbar" onClick={() => setExcerpt({ id: r.id, index: -1 })}>근거 {r.evidence.length}건</Button> : null}</div></div>;
      } },
      ...(declared ? [{ id: 'opinion', header: '의견', sortable: false as const, cell: (r: RuleResult) => <OpinionCell itemKey={r.ruleId} opinion={r.opinion} onOpen={() => { setExcerpt(null); setOpinion(r.ruleId); }} /> }] : []),
    ] })}</ReadView>
    {hasOpinions ? <UnlinkedOpinions api={api} ui={ui} attemptId={attempt.id} declared={declared} onOpen={itemKey => { setExcerpt(null); setOpinion(itemKey); }} /> : null}
    {hasOpinions && opinion !== null ? <OpinionHistory key={opinion} api={api} ui={ui} attemptId={attempt.id} itemKey={opinion} onClose={() => setOpinion(null)} onEvidence={evidence => { setOpinion(null); setExcerpt({ id: '', index: -1, evidence }); }} /> : null}
    {excerpt ? excerpt.index >= 0 ? <Excerpt key={`${excerpt.id}:${excerpt.index}`} api={api} ui={ui} ruleResultId={excerpt.id} evidenceIndex={excerpt.index} onClose={() => setExcerpt(null)} /> : ui.drawer({ title: '근거 위치', requestClose: () => setExcerpt(null), body: <div className="grid gap-3 break-keep">{(excerpt.evidence ?? query.data?.rows.find(r => r.id === excerpt.id)?.evidence)?.map((e, index) => <div key={`${e.fileRef}:${e.line}:${e.fileSha256}`} className="grid gap-1 text-xs"><p className="font-mono text-xs break-all">{e.fileRef}:{e.line}</p><p className="font-mono text-xs break-all">{e.fileSha256}</p><p>원본 확인 불가 (unresolved)</p>{'hasExcerpt' in e && e.hasExcerpt ? <Button variant="link" size="toolbar" onClick={() => setExcerpt({ ...excerpt, index })}>발췌 보기</Button> : <span>발췌 없음</span>}</div>)}</div> }) : null}
  </Section>;
}
export function RoundScreen(props: ScreenProps & { roundId: string; project: Project }) {
  const { api, ui, roundId, project, canRound } = props;
  const round = api.useRead<RoundDetail>('roundDetail', { roundId });
  const [page, setPage] = usePageValue(props, 'requestsPage', 0);
  const requests = api.useRead<Page<RequestRow>>('requests', { roundId, page, pageSize: 25 });
  const [selected, setSelected] = usePageValue(props, 'request', '');
  const requestId = selected || requests.data?.rows[0]?.id || '';
  const request = api.useRead<RequestDetail>('requestDetail', { requestId }, !!requestId);
  const [attemptId, setAttemptId] = usePageValue(props, 'attempt', '');
  const attempt = request.data?.roundId === roundId ? request.data.attempts.find(a => a.id === attemptId) ?? request.data.attempts.at(-1) : undefined;
  const [registering, setRegistering] = useState(false);
  const [closing, setClosing] = useState(false);
  const [view, setView] = usePageValue(props, 'view', 'verify', []);
  const sourceView = ui.sourceView;
  // One patch: the tab, the selected line and its drawer; the body's own tab (원본/시퀀스) goes back to 원본.
  const openSource = (order: number, line: number) => { if (props.setState) props.setState({ view: 'source', sourceTab: undefined, sourceFocus: `${order}:${line}`, sourceDrawer: 'record' }); else setView('source'); };
  return <ReadView query={round}>{r => r.projectId !== project.id ? <p role="alert">이 개발 건에 속한 Round가 아닙니다.</p> : <>
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-semibold">Round {r.seq} · {r.status === 'open' ? '진행 중' : '종료'}</h2><div className="flex gap-2">{canRound && r.status === 'open' ? <><Button variant="secondary" size="toolbar" onClick={() => setClosing(true)}>Round 종료</Button><Button variant="primary" size="toolbar" onClick={() => setRegistering(true)}>요청 등록</Button></> : null}</div></div>
    {(() => {
      const verification = <div className="flex min-w-0 items-start gap-6" data-testid="round-gate-layout"><div className="grid min-w-0 flex-1 grid-cols-1 gap-6">
      <Section title="샘플·고정 명세"><Disclosure label={`샘플 ${r.sampleSet.files.length}개 · 원본 소유자 ${r.sampleSet.sourceOwner} · 순서·해시 고정`}><ol className="mt-2 grid gap-2 text-xs">{r.sampleSet.files.map(f => <li key={f.order}><p className="break-all">{f.order}. {f.fileRef}</p><p className="font-mono text-xs break-all">{f.sha256}</p></li>)}</ol></Disclosure><p className="break-all text-xs">명세 {r.specPin ? `${r.specPin.revisionId} · ${r.specPin.changeSetDigest}` : '미고정'}</p><p className="font-mono text-xs break-all">샘플 digest {r.sampleManifestDigest}</p>{r.note ? <p className="text-xs">{r.note}</p> : null}</Section>
      <Section title="검증 요청·시도"><QueueWindow api={api} /><ReadView query={requests}>{data => data.rows.length === 0 ? <><p className="text-sm text-text-secondary">요청 없음 · 이 Round의 검증을 요청하면 작업자가 실행 시간대에 가져갑니다.</p>{page > 0 ? <Pager page={page} total={data.total} onChange={setPage} /> : null}</> : ui.table({ title: 'Round 검증 요청', rows: data.rows, activeRowId: requestId, preferenceKey: 'log-lifecycle-round-requests', pagination: <Pager page={page} total={data.total} onChange={setPage} />, columns: [
        { id: 'request', header: '요청', sortable: false, cell: q => <Button variant="link" size="toolbar" onClick={() => setSelected(q.id)}>{q.id.slice(0, 8)}</Button> },
        { id: 'state', header: '상태', sortable: false, cell: q => <StateBadge value={q.state} /> },
        { id: 'lease', header: 'lease 만료 (KST)', sortable: false, cell: q => time(q.leaseExpiresAt) },
        { id: 'heartbeat', header: '마지막 하트비트 (KST)', sortable: false, cell: q => time(q.lastHeartbeatAt) },
      ] })}</ReadView>
      {requestId ? <ReadView query={request}>{detail => detail.roundId === r.id ? <Attempts attempts={detail.attempts} selected={attempt?.id} onSelect={setAttemptId} ui={ui} RuleSetLink={props.RuleSetLink} /> : <p role="alert">이 Round에 속한 요청이 아닙니다.</p>}</ReadView> : null}</Section>
      {attempt ? <RuleTable key={attempt.id} {...props} round={r} attempt={attempt} {...(sourceView ? { onOpenSource: openSource } : {})} /> : <p className="text-sm text-text-secondary">규칙 결과 없음 · 완료된 시도가 아직 없습니다.</p>}
</div><GatePanel {...props} round={r} completedAt={round.completedAt ?? null} /></div>;
      if (!sourceView) return verification;
      return <Tabs value={view === 'source' ? 'source' : 'verify'} onValueChange={setView} className="min-w-0"><TabsList aria-label="Round 상세 보기"><TabsTrigger value="verify">검증 · Gate</TabsTrigger><TabsTrigger value="source">원본/시퀀스</TabsTrigger></TabsList>{/* Kept mounted: a Gate draft or an open excerpt must survive a look at the Source. The source tab mounts only while open, so it reads nothing in the background. */}<TabsContent value="verify" forceMount hidden={view === 'source'}>{verification}</TabsContent><TabsContent value="source">{sourceView({ roundId: r.id, sampleSet: r.sampleSet })}</TabsContent></Tabs>;
    })()}
    {registering ? <RequestRegister {...props} fixedRound={{ id: r.id, seq: r.seq }} onClose={() => setRegistering(false)} /> : closing ? <LifecycleForm {...props} name="roundClose" title="Round 종료" initial={{ id: r.id }} version={r.version} onClose={() => setClosing(false)} /> : null}
  </>}</ReadView>;
}
