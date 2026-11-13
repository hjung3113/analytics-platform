import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { X } from 'lucide-react';
import { Button, Checkbox, Tabs, TabsContent, TabsList, TabsTrigger, ToggleGroup, ToggleGroupItem } from '@ap/ui';
import { RESULT_ORDER, STATE_LABEL, type Attempt, type OpinionEvidence, type OpinionScale, type Page, type Project, type RequestRow, type RoundDetail, type RuleResult, type ScreenProps, type TableParts, type ValidationIssueRow } from './contracts';
import { ISSUE_TOTAL_UNAVAILABLE, IssueDrawer, IssueLink, IssueRegister, IssueTablePage, RoundDiscussion, useDiscussionController, type DiscussionController } from './Discussion';
import { OpinionCell, OpinionHistory, UnlinkedOpinions } from './Opinions';
import { useGateController, GatePanel } from './GatePanel';
import { LifecycleForm } from './forms';
import { Attempts, QueueWindow, RequestRegister } from './RequestsScreen';
import { Choice, Disclosure, GateBadge, Pager, ReadView, Section, StateBadge, time } from './presentation';
import { usePageValue } from './usePageValue';
import { useRoundExecution } from './RoundExecution';
import { RuleEvidence } from './EvidenceRows';

function Excerpt({ api, ui, ruleResultId, evidenceIndex, onClose }: Pick<ScreenProps, 'api' | 'ui'> & { ruleResultId: string; evidenceIndex: number; onClose(): void }) {
  // Only mounted after the person's explicit read; every mount starts a fresh read with no prior answer. A deleted excerpt has no
  // authoritative cause (admin deletion and retention purge answer alike, R3), so it reads as an unknown state, never as «expired».
  const q = api.useRead<{ deleted: boolean; excerpt: string | null }>('excerpt', { ruleResultId, evidenceIndex });
  return ui.drawer({ title: '로그 발췌', requestClose: onClose, body: q.denied ? <p role="alert" className="text-sm">권한 없음 · 이 원본의 발췌 열람 권한이 없습니다.</p> : <ReadView query={q} empty="저장된 발췌가 없습니다.">{data => data.deleted ? <p className="text-sm">발췌 상태 알 수 없음 · 저장된 발췌를 더 이상 읽을 수 없습니다.</p> : <pre className="whitespace-pre-wrap break-all text-xs">{data.excerpt}</pre>}</ReadView> });
}
/** The compact table omits repeated sentences; the detail retains the complete server text. */
function observationSummary(value: string | null) { return value ? [...new Set(value.split(/(?<=[.!?])\s+/u))].join(' ') : '관측 없음'; }
function RuleTable(props: ScreenProps & { round: RoundDetail; attempt: Attempt; requestId: string; result: string; required: boolean; sort: string; detailVisible: boolean; discussion: DiscussionController; onOpenIssue(issueId: string): void; onOpenDetail(): void; onOpenSource?: (order: number, line: number) => void }) {
  const { api, ui, round, attempt, result, required, sort } = props;
  const [page, setPage] = usePageValue(props, 'rulesPage', 0);
  const [item, setItem] = usePageValue(props, 'rule', '', ['issue']);
  const hasOpinions = (attempt.opinionCount ?? 0) > 0;
  const scale = api.useRead<OpinionScale>('opinionScale', {}, hasOpinions);
  const declared = hasOpinions && scale.status === 'done' && !!scale.data?.grades.length;
  const [opinionGrade, setOpinionGrade] = useState('all');
  const [opinion, setOpinion] = useState<string | null>(null);
  const [excerpt, setExcerpt] = useState<{ id: string; index: number; evidence?: OpinionEvidence[] } | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const query = api.useRead<Page<RuleResult>>('ruleResults', { attemptId: attempt.id, page, pageSize: 25, sorting: [{ id: sort, desc: false }], ...(result === 'all' ? {} : { results: result === 'problems' ? RESULT_ORDER.filter(r => r !== 'PASS' && r !== 'NOT_APPLICABLE') : [result] }), ...(required ? { required: true } : {}), ...(declared && opinionGrade !== 'all' ? { opinionGrade: opinionGrade === 'none' ? 'none' : opinionGrade.slice('grade:'.length) } : {}) });
  const openOpinion = (key: string) => { props.onOpenDetail(); setExcerpt(null); setOpinion(key); };
  const openExcerpt = (id: string, index: number) => { props.onOpenDetail(); setOpinion(null); setExcerpt({ id, index }); };
  const openRule = (rule: RuleResult, opener: HTMLElement) => { returnFocusRef.current = opener; props.onOpenDetail(); setOpinion(null); setExcerpt(null); if (props.setState) props.setState({ request: props.requestId, attempt: attempt.id, rule: rule.id, issue: undefined }); else setItem(rule.id); };
  const handlers = useRef({ openRule, openOpinion });
  useLayoutEffect(() => { handlers.current = { openRule, openOpinion }; });
  // SDK cell renderers keep their component identity so URL selection does not detach the opener.
  const columns = useMemo<TableParts<RuleResult>['columns']>(() => [
    { id: 'rule', header: '규칙 · 상세', size: 300, sortable: false, cell: r => <Button variant="link" size="toolbar" className="h-auto max-w-full justify-start whitespace-normal text-left" aria-label={`${r.ruleId} 상세 열기`} onClick={event => handlers.current.openRule(r, event.currentTarget)}><span className="line-clamp-2 text-sm"><span className="whitespace-nowrap font-mono text-xs">{r.ruleId}</span> · {r.expected ?? (r.required ? '필수 규칙' : '선택 규칙')}</span></Button> },
    { id: 'result', header: '판정', size: 100, sortable: false, cell: r => <StateBadge value={r.result} /> },
    { id: 'observed', header: '관측 요약', size: 210, sortable: false, cell: r => <span className="line-clamp-2 break-keep text-xs">{observationSummary(r.observed)}</span> },
    ...(hasOpinions ? [{ id: 'opinion', header: '의견', size: 100, sortable: false as const, cell: (r: RuleResult) => <OpinionCell itemKey={r.ruleId} opinion={r.opinion} onOpen={() => handlers.current.openOpinion(r.ruleId)} /> }] : []),
  ], [hasOpinions]);
  return <Section title="규칙 결과">
    {hasOpinions ? <ReadView query={scale}>{data => declared ? <Choice label="의견 등급" value={opinionGrade} onChange={value => { setOpinionGrade(value); setPage(0); }} options={[[ 'all', '전체' ], ...data.grades.map(g => [`grade:${g.key}`, g.label] as const), ['none', '의견 없음']]} /> : <p className="text-xs text-text-secondary">의견 척도 미선언</p>}</ReadView> : null}
    <ReadView query={query}>{data => data.rows.length === 0 ? <p role="status" className="text-xs text-text-secondary">선택한 조건의 규칙 결과가 없습니다.</p> : ui.table({ title: '규칙 결과', fill: true, rows: data.rows, activeRowId: item, preferenceKey: 'log-lifecycle-rule-results-workbench', pagination: <Pager page={page} total={data.total} onChange={setPage} />, columns })}</ReadView>
    {hasOpinions ? <UnlinkedOpinions api={api} ui={ui} attemptId={attempt.id} onOpen={openOpinion} /> : null}
    {props.detailVisible ? opinion !== null ? <OpinionHistory key={opinion} api={api} ui={ui} attemptId={attempt.id} itemKey={opinion} onClose={() => setOpinion(null)} onEvidence={evidence => { setOpinion(null); setExcerpt({ id: '', index: -1, evidence }); }} /> : excerpt ? excerpt.index >= 0 ? <Excerpt key={`${excerpt.id}:${excerpt.index}`} api={api} ui={ui} ruleResultId={excerpt.id} evidenceIndex={excerpt.index} onClose={() => setExcerpt(null)} /> : ui.drawer({ title: '근거 위치', requestClose: () => setExcerpt(null), body: <div className="grid gap-3 break-keep">{excerpt.evidence?.map(e => <div key={`${e.fileRef}:${e.line}:${e.fileSha256}`} className="grid gap-1 text-xs"><p className="break-all font-mono">{e.fileRef}:{e.line}</p><p className="break-all font-mono">{e.fileSha256}</p><p>원본 확인 불가 (unresolved)</p></div>)}</div> }) : item ? <SelectedRuleDetail key={item} api={api} ui={ui} round={round} attempt={attempt} item={item} returnFocusRef={returnFocusRef} onClose={() => setItem('')} onExcerpt={openExcerpt} onOpinion={openOpinion} onOpenSource={props.onOpenSource} {...(props.canLink ? { link: { controller: props.discussion, onOpenIssue: props.onOpenIssue } } : {})} /> : null : null}
  </Section>;
}
/** The existing contract has no UUID filter/detail read: scan unfiltered pages only for an explicit selection.
 * This query is independent of the table's page, result and opinion filters, including on URL reload. */
function SelectedRuleDetail({ api, ui, round, attempt, item, returnFocusRef, onClose, onExcerpt, onOpinion, onOpenSource, link }: Pick<ScreenProps, 'api' | 'ui'> & { round: RoundDetail; attempt: Attempt; item: string; returnFocusRef: RefObject<HTMLElement | null>; onClose(): void; onExcerpt(id: string, index: number): void; onOpinion(key: string): void; onOpenSource?: ((order: number, line: number) => void) | undefined; /** Present only with `lifecycle:issue-link`. */ link?: { controller: DiscussionController; onOpenIssue(issueId: string): void } }) {
  const [page, setPage] = useState(0);
  const query = api.useRead<Page<RuleResult>>('ruleResults', { attemptId: attempt.id, page, pageSize: 25, sorting: [{ id: 'ruleId', desc: false }] });
  const selectedRule = query.data?.rows.find(row => row.id === item);
  const searching = query.status === 'done' && !!query.data && !selectedRule && (page + 1) * 25 < query.data.total;
  useEffect(() => { if (searching) setPage(previous => previous + 1); }, [searching, page]);
  return ui.drawer({ title: selectedRule ? `${selectedRule.ruleId} · 규칙 상세` : '규칙 상세', subtitle: `Round ${round.seq} · 시도 #${attempt.attemptNo}`, returnFocusRef, requestClose: onClose, body: <ReadView query={query}>{() => selectedRule ? <div className="grid min-w-0 gap-4 break-keep"><div className="flex flex-wrap items-center gap-2"><StateBadge value={selectedRule.result} /><span className="text-xs">{selectedRule.required ? '필수' : '선택'}</span></div><dl className="grid gap-2 text-sm"><dt className="font-semibold">기대</dt><dd className="whitespace-pre-wrap">{selectedRule.expected ?? '없음'}</dd><dt className="font-semibold">관측</dt><dd className="whitespace-pre-wrap">{selectedRule.observed ?? '없음'}</dd></dl><RuleEvidence api={api} rule={selectedRule} round={round} onOpenSource={onOpenSource} onExcerpt={index => onExcerpt(selectedRule.id, index)} /><Section title="의견">{selectedRule.opinion ? <OpinionCell itemKey={selectedRule.ruleId} opinion={selectedRule.opinion} onOpen={() => onOpinion(selectedRule.ruleId)} /> : <p className="text-xs text-text-secondary">의견 없음</p>}</Section>{link ? <IssueLink api={api} round={round} attemptId={attempt.id} rule={selectedRule} controller={link.controller} onOpenIssue={link.onOpenIssue} /> : null}</div> : searching ? <p role="status" className="text-sm">불러오는 중…</p> : <p role="alert" className="text-sm">선택한 규칙 결과를 찾을 수 없습니다. 목록에서 다시 선택해 주세요.</p>}</ReadView> });
}
export function RoundScreen(props: ScreenProps & { roundId: string; project: Project }) {
  const round = props.api.useRead<RoundDetail>('roundDetail', { roundId: props.roundId });
  return <ReadView query={round}>{r => r.projectId !== props.project.id ? <p role="alert">이 개발 건에 속한 Round가 아닙니다.</p> : <RoundWorkbench {...props} round={r} completedAt={round.completedAt ?? null} />}</ReadView>;
}
function RoundWorkbench(props: ScreenProps & { round: RoundDetail; project: Project; completedAt: number | null }) {
  const { api, ui, round: r, project, canRound } = props;
  const [page, setPage] = usePageValue(props, 'requestsPage', 0);
  const requests = api.useRead<Page<RequestRow>>('requests', { roundId: r.id, page, pageSize: 25 });
  const [selected, setSelected] = usePageValue(props, 'request', '');
  const [attemptId, setAttemptId] = usePageValue(props, 'attempt', '');
  const { latest, latestDetail, latestAttempt, request, requestId, attempt } = useRoundExecution(api, r, selected, attemptId);
  const [view, setView] = usePageValue(props, 'view', 'verify', []);
  const [result, setResult] = usePageValue(props, 'result', 'problems', ['rulesPage', 'rule']);
  const [required, setRequired] = usePageValue(props, 'required', 'false', ['rulesPage', 'rule']);
  const [sort, setSort] = usePageValue(props, 'sort', 'ruleId', ['rulesPage', 'rule']);
  const [issue, setIssue] = usePageValue(props, 'issue', '', ['rule']);
  const [registering, setRegistering] = useState(false);
  const [issueComposing, setIssueComposing] = useState(false);
  const discussion = useDiscussionController(api);
  const [issueCursors, setIssueCursors] = useState<string[]>([]);
  const issueCursor = issueCursors.at(-1);
  const firstIssuePage = useCallback(() => setIssueCursors(old => old.length ? [] : old), []);
  const canContribute = props.canContribute === true;
  const [closing, setClosing] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const gateController = useGateController({ api, round: r, actorId: props.actorId });
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const defectsRef = useRef<HTMLDivElement | null>(null);
  const [defectJump, setDefectJump] = useState(0);
  const lastDefectJump = useRef(0);
  useEffect(() => { if (defectJump !== lastDefectJump.current && view === 'verify') { defectsRef.current?.scrollIntoView({ block: 'start' }); defectsRef.current?.focus(); lastDefectJump.current = defectJump; } }, [defectJump, view]);
  const openSource = (order: number, line: number) => { if (props.setState) props.setState({ view: 'source', sourceTab: undefined, sourceFocus: `${order}:${line}`, sourceDrawer: 'record' }); else setView('source'); };
  const toggleResult = (next: string) => setResult(result === next ? 'problems' : next);
  const openDefect = (id: string, opener: HTMLElement) => { returnFocusRef.current = opener; setGateOpen(false); setIssueComposing(false); setIssue(id); };
  const openIssue = (id: string) => { setGateOpen(false); setIssueComposing(false); setView('verify'); setIssue(id); };
  const defectHandlers = useRef(openDefect);
  useLayoutEffect(() => { defectHandlers.current = openDefect; });
  const defectColumns = useMemo<TableParts<ValidationIssueRow>['columns']>(() => [
          { id: 'title', header: '검증 항목 · 상세', size: 300, sortable: false, cell: d => <Button variant="link" size="toolbar" className="h-auto max-w-full justify-start whitespace-normal text-left" onClick={event => defectHandlers.current(d.id, event.currentTarget)}>{d.title}</Button> },
          { id: 'comments', header: '항목 댓글', size: 90, sortable: false, cell: d => `${d.commentCount}건` },
          { id: 'occurrences', header: '연결 규칙·근거', size: 120, sortable: false, cell: d => d.occurrenceCount ? `${d.occurrenceCount}건 · Round ${d.roundCount}개` : '연결 없음' },
          { id: 'activity', header: '최근 활동 (KST)', size: 140, sortable: false, cell: d => time(d.lastActivityAt) },
        ], []);
  const resultsVisible = view === 'verify';
  const canShowGate = props.canGate === true;
  const overlay = registering || closing || issueComposing;
  return <div className="grid min-w-0 gap-4 break-keep" data-testid="result-first-workbench">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-semibold">{project.model?.code ?? '모델 확인 불가'} · SW {project.softwareLabel ?? '미지정'} · 개발 건 · Round {r.seq}</h2><div aria-label="Gate 상태" className="flex items-center gap-2"><span className="text-xs">Gate</span><GateBadge decision={r.gateDecisions.at(-1)?.decision} />{canShowGate ? <Button variant="secondary" size="toolbar" aria-pressed={gateOpen && resultsVisible} onClick={event => { returnFocusRef.current = event.currentTarget; setView('verify'); setGateOpen(true); }}>Gate 결정</Button> : null}</div></div>
    <div className="grid gap-2 border-b border-border-subtle pb-3"><div className="flex flex-wrap items-center gap-3"><div aria-label="선택 시도 서버 판정" className="flex items-center gap-2 text-sm">{attempt ? <><span>시도 #{attempt.attemptNo}<span className="font-mono text-xs" title={requestId}> · 요청 {requestId.slice(0, 8)}</span>:</span><StateBadge value={attempt.verdict ?? 'none'} /><span className="text-xs text-text-secondary">{attempt.outcome === 'succeeded' ? '완료 시도' : '판정 없음'} · 전체 규칙 {attempt.ruleCount}건</span></> : <span className="text-xs text-text-secondary">완료된 검증 시도 없음</span>}</div><Button size="toolbar" variant="ghost" aria-label={`검증 항목으로 이동 · ${ISSUE_TOTAL_UNAVAILABLE}`} onClick={() => { setView('verify'); setDefectJump(value => value + 1); }}>{ISSUE_TOTAL_UNAVAILABLE}<span className="text-xs"> · Round 전체</span></Button></div>
      {attempt?.outcome === 'succeeded' ? <div role="group" aria-label="규칙 결과 필터" className="flex flex-wrap items-center gap-3"><ToggleGroup type="single" appearance="filter" size="sm" aria-label="결과 범위" value={result} onValueChange={next => { if (next) setResult(next); }}><ToggleGroupItem value="all" appearance="selected-filter">전체 {attempt.ruleCount}</ToggleGroupItem><ToggleGroupItem value="problems" appearance="selected-filter">문제만</ToggleGroupItem></ToggleGroup><div role="group" aria-label="판정별 필터" className="flex flex-wrap items-center gap-1 border-l border-border-subtle pl-3">{RESULT_ORDER.map(key => <Button key={key} size="toolbar" variant={result === key ? 'secondary' : 'ghost'} aria-label={`${STATE_LABEL[key]} ${attempt.counts[key] ?? 0}`} aria-pressed={result === key} onClick={() => toggleResult(key)}>{STATE_LABEL[key]} <strong>{attempt.counts[key] ?? 0}</strong>{result === key ? <X className="size-3" aria-hidden /> : null}</Button>)}</div></div> : null}
    </div>
    <ReadView query={latest}>{() => latest.data?.rows.length ? <ReadView query={latestDetail}>{() => <p aria-label="최신 실행 상태" role="status" className="text-xs text-text-secondary">최신 실행{latestAttempt ? `(시도 #${latestAttempt.attemptNo})` : ''} · {STATE_LABEL[latest.data?.rows[0]?.state ?? ''] ?? '상태 확인 불가'}{attempt?.outcome === 'succeeded' && latestAttempt?.id !== attempt.id ? ` · 완료된 시도 #${attempt.attemptNo}의 결과를 보여 줍니다.` : ''} · {time(latestAttempt?.endedAt ?? latest.data?.rows[0]?.createdAt)} KST</p>}</ReadView> : <p className="text-xs text-text-secondary">요청 없음 · 이 Round의 검증을 요청하면 작업자가 실행 시간대에 가져갑니다.</p>}</ReadView>
    {attempt && !attempt.manifestMatches ? <p role="alert" className="text-xs text-text-warning-label">샘플 매니페스트 불일치</p> : null}
    <Tabs value={view} onValueChange={setView} className="min-w-0"><TabsList aria-label="Round 상세 보기"><TabsTrigger value="verify">결과·결함</TabsTrigger><TabsTrigger value="discussion">Round 토론</TabsTrigger><TabsTrigger value="source">원본</TabsTrigger><TabsTrigger value="history">설정·이력</TabsTrigger></TabsList>
      <TabsContent value="verify" forceMount hidden={!resultsVisible}><div className="grid min-w-0 gap-4">
        {requestId ? <ReadView query={request}>{detail => detail.roundId !== r.id ? <p role="alert">이 Round에 속한 요청이 아닙니다.</p> : attempt?.outcome === 'succeeded' ? <RuleTable key={attempt.id} {...props} round={r} attempt={attempt} requestId={requestId} result={result} required={required === 'true'} sort={sort} detailVisible={resultsVisible && !gateOpen && !issue && !overlay} discussion={discussion} onOpenIssue={openIssue} onOpenDetail={() => { setGateOpen(false); if (issue) setIssue(''); }} {...(ui.sourceView ? { onOpenSource: openSource } : {})} /> : <p role="status" className="text-sm text-text-secondary">규칙 결과 없음 · {attemptId ? '선택한 시도는 완료된 결과가 없습니다.' : '완료된 시도가 아직 없습니다.'}</p>}</ReadView> : <p className="text-sm text-text-secondary">규칙 결과 없음 · 완료된 시도가 아직 없습니다.</p>}
        <div ref={defectsRef} role="region" aria-label="검증 항목" tabIndex={-1} className="min-w-0 focus-visible:outline focus-visible:outline-focus-ring"><Section title="검증 항목">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-text-secondary">사람이 등록한 관찰·검토 항목입니다. 규칙 결과·판정·Gate와 별개입니다.</p>{canContribute ? <Button variant="secondary" size="toolbar" onClick={() => { setGateOpen(false); setIssue(''); setIssueComposing(true); }}>검증 항목 등록</Button> : null}</div>
          <IssueTablePage key={issueCursor ?? 'first'} api={api} roundId={r.id} cursor={issueCursor} onRefresh={firstIssuePage}>{data => data.rows.length === 0 && issueCursors.length === 0 ? <p role="status" className="text-xs text-text-secondary">검증 항목 없음</p> : ui.table({ title: '검증 항목', fill: true, preferenceKey: 'log-lifecycle-validation-issues', rows: data.rows, activeRowId: issue, summary: `${ISSUE_TOTAL_UNAVAILABLE} · 최근 활동순`, pagination: <div className="flex items-center justify-end gap-2 text-xs"><span>{issueCursors.length + 1}페이지</span><Button variant="secondary" size="toolbar" disabled={issueCursors.length === 0} onClick={() => setIssueCursors(old => old.slice(0, -1))}>이전</Button><Button variant="secondary" size="toolbar" disabled={!data.nextCursor} onClick={() => { const next = data.nextCursor; if (next) setIssueCursors(old => [...old, next]); }}>다음</Button></div>, columns: defectColumns })}</IssueTablePage>
        </Section></div>
      </div></TabsContent>
      <TabsContent value="discussion"><RoundDiscussion api={api} round={r} actorId={props.actorId} canContribute={canContribute} controller={discussion} /></TabsContent>
      <TabsContent value="source">{ui.sourceView ? ui.sourceView({ roundId: r.id, sampleSet: r.sampleSet }) : <p className="text-sm text-text-secondary">원본 보기를 사용할 수 없습니다.</p>}</TabsContent>
      <TabsContent value="history"><div className="grid min-w-0 gap-4">
        <div className="flex flex-wrap items-center gap-2"><p className="text-xs">Round {r.seq} · {r.status === 'open' ? '진행 중' : '종료'}</p>{canRound && r.status === 'open' ? <><Button variant="secondary" size="toolbar" onClick={() => setClosing(true)}>Round 종료</Button><Button variant="primary" size="toolbar" onClick={() => setRegistering(true)}>요청 등록</Button></> : null}</div>
        <Section title="샘플·고정 명세"><p className="text-xs">샘플 {r.sampleSet.files.length}개 · 원본 소유자 {r.sampleSet.sourceOwner}</p><ol className="grid gap-2 text-xs">{r.sampleSet.files.map(file => <li key={file.order} className="break-all">{file.order}. {file.fileRef}</li>)}</ol><p className="text-xs">명세 {r.specPin?.revisionId ?? '미고정'}</p><Disclosure label="해시·명세 근거"><div className="grid gap-2 text-xs">{r.sampleSet.files.map(file => <p key={file.order} className="break-all font-mono">샘플 {file.order} sha256 {file.sha256}</p>)}<p className="break-all">명세 digest {r.specPin?.changeSetDigest ?? '미고정'}</p><p className="break-all">manifest digest {r.sampleManifestDigest}</p></div></Disclosure>{r.note ? <p className="text-xs">{r.note}</p> : null}</Section>
        <Section title="검증 요청·시도"><QueueWindow api={api} /><ReadView query={requests}>{data => data.rows.length === 0 ? <p className="text-xs text-text-secondary">검증 요청 없음</p> : ui.table({ title: 'Round 검증 요청', fill: true, rows: data.rows, activeRowId: selected, preferenceKey: 'log-lifecycle-round-requests', pagination: <Pager page={page} total={data.total} onChange={setPage} />, columns: [
          { id: 'request', header: '요청', sortable: false, cell: q => <Button variant="link" size="toolbar" onClick={() => setSelected(q.id)}>{q.id.slice(0, 8)}</Button> },
          { id: 'state', header: '상태', sortable: false, cell: q => <StateBadge value={q.state} /> },
          { id: 'lease', header: 'lease 만료 (KST)', sortable: false, cell: q => time(q.leaseExpiresAt) },
          { id: 'heartbeat', header: '마지막 하트비트 (KST)', sortable: false, cell: q => time(q.lastHeartbeatAt) },
        ] })}</ReadView>{requestId ? <ReadView query={request}>{detail => detail.roundId === r.id ? <Attempts attempts={detail.attempts} selected={attempt?.id} onSelect={setAttemptId} ui={ui} RuleSetLink={props.RuleSetLink} /> : <p role="alert">이 Round에 속한 요청이 아닙니다.</p>}</ReadView> : null}</Section>
        <div className="flex flex-wrap items-center gap-3"><label htmlFor="rules-required" className="flex items-center gap-2 text-xs"><Checkbox id="rules-required" checked={required === 'true'} onCheckedChange={value => setRequired(String(value === true))} />필수 규칙만</label><Choice label="결과 정렬" value={sort} onChange={setSort} options={[[ 'ruleId', '규칙 ID순' ], ['result', '결과순'], ['required', '필수 여부순']]} /></div>
      </div></TabsContent>
    </Tabs>
    {resultsVisible && !overlay ? gateOpen && canShowGate ? ui.drawer({ title: 'Gate 결정', subtitle: `Round ${r.seq} · 사람의 업무 승인`, returnFocusRef, requestClose: () => setGateOpen(false), body: <GatePanel api={api} ui={ui} round={r} actorId={props.actorId} completedAt={props.completedAt} controller={gateController} /> }) : issue ? <IssueDrawer key={issue} api={api} ui={ui} round={r} issueId={issue} actorId={props.actorId} canContribute={canContribute} controller={discussion} returnFocusRef={returnFocusRef} onClose={() => setIssue('')} {...(ui.sourceView ? { onOpenSource: openSource } : {})} /> : null : null}
    {issueComposing && resultsVisible ? <IssueRegister ui={ui} round={r} controller={discussion} onClose={() => setIssueComposing(false)} onSaved={id => { setIssueComposing(false); setIssueCursors([]); setIssue(id); }} /> : null}
    {registering ? <RequestRegister {...props} fixedRound={{ id: r.id, seq: r.seq }} onClose={() => setRegistering(false)} /> : closing ? <LifecycleForm {...props} name="roundClose" title="Round 종료" initial={{ id: r.id }} version={r.version} onClose={() => setClosing(false)} /> : null}
  </div>;
}
