import { useRef, useState, type ReactNode } from 'react';
import { Button } from '@ap/ui';
import type { Comparison, DatasetDetail, Page, Run, RunItem, ScreenProps, SuiteDetail, SuiteRow } from './contracts';
import { Choice, DatasetBadge, Pager, Panel, ReadView, StaleBadge, stateLabel, time, WriteError } from './presentation';
import { useDatasetWrite } from './useDatasetWrite';
import { ComparisonPanel, RerunPanel } from './ComparisonPanel';

type RunsProps = ScreenProps & { dataset: DatasetDetail; suiteRunId?: string; compare?: boolean; render?: (content: ReactNode, primaryAction?: ReactNode) => ReactNode };
function frame(props: RunsProps, content: ReactNode, action?: ReactNode) {
  return props.render ? props.render(content, action) : <>{action}{content}</>;
}
export function RunsPanel(props: RunsProps) {
  const [suitePage, updateSuitePage] = useState(props.runNavigation?.current.suitePage ?? 0);
  const setSuitePage = (next: number) => { updateSuitePage(next); props.runNavigation?.change({ suiteId: props.runNavigation.current.suiteId, page: props.runNavigation.current.page, suitePage: next }); };
  const [selected, setSelected] = useState(props.runNavigation?.current.suiteId ?? '');
  const suites = props.api.useRead<Page<SuiteRow>>('suites', { datasetId: props.dataset.id, page: suitePage, pageSize: 25 });
  const pinned = props.api.useRead<Comparison>('comparison', { suiteRunId: props.suiteRunId, page: 0, pageSize: 1 }, !!props.suiteRunId);
  // A pinned run is authoritative even when its Suite is outside this list page.
  if (props.suiteRunId && (pinned.status !== 'done' || !pinned.data)) return frame(props, <ReadView query={pinned}>{() => null}</ReadView>);
  const suiteId = props.suiteRunId ? pinned.data?.run.suiteId : selected || suites.data?.rows[0]?.id;
  if (!suiteId) return frame(props, <ReadView query={suites}>{() => <p role="status" className="text-sm text-text-secondary">이 데이터셋을 포함한 회귀 Suite가 없습니다.</p>}</ReadView>);
  return <SuiteRuns key={suiteId} {...props} suiteId={suiteId} pinnedRun={props.suiteRunId ? pinned.data?.run : undefined} suites={suites.data?.rows ?? []} onSelect={id => { setSelected(id); props.runNavigation?.change({ suiteId: id, page: 0, suitePage }); if (props.suiteRunId) props.navigate(props.dataset.id); }} suitePager={suites.data && suites.data.total > 25 ? <Pager page={suitePage} total={suites.data.total} onChange={setSuitePage} /> : null} />;
}
function SuiteRuns(props: RunsProps & { suiteId: string; pinnedRun?: Comparison['run'] | undefined; suites: SuiteRow[]; onSelect(id: string): void; suitePager: ReactNode }) {
  const [page, updatePage] = useState(props.runNavigation?.current.suiteId === props.suiteId ? props.runNavigation.current.page : 0);
  const setPage = (next: number) => { updatePage(next); props.runNavigation?.change({ suiteId: props.suiteId, page: next, suitePage: props.runNavigation.current.suitePage ?? 0 }); };
  const [requesting, setRequesting] = useState(false);
  const requestButton = useRef<HTMLButtonElement | null>(null);
  const suite = props.api.useRead<SuiteDetail>('suiteDetail', { suiteId: props.suiteId });
  const runs = props.api.useRead<Page<Run>>('suiteRuns', { suiteId: props.suiteId, page, pageSize: 25 });
  const choices = [...(runs.data?.rows ?? [])];
  if (props.pinnedRun && !choices.some(r => r.id === props.pinnedRun?.id)) choices.unshift({ ...props.pinnedRun, engineProfileRef: null, items: [] });
  const suiteOptions: [string, string][] = props.suites.map(s => [s.id, s.name]);
  if (suite.data && !suiteOptions.some(([id]) => id === props.suiteId)) suiteOptions.push([suite.data.id, suite.data.name]);
  const action = <Button ref={requestButton} size="toolbar" onClick={() => setRequesting(true)} disabled={!props.canRun || props.dataset.status === 'archived' || suite.status !== 'done' || !suite.data}>회귀 실행 요청</Button>;
  const content = <div className="flex min-h-0 flex-1 flex-col gap-3 break-keep">
    <div className="flex flex-wrap items-center gap-2">
      <Choice label="회귀 Suite" value={props.suiteId} onChange={props.onSelect} options={suiteOptions} />{props.suitePager}
      {props.compare ? <><Choice label="비교할 회귀 실행" value={props.suiteRunId ?? 'none'} onChange={id => props.navigate(props.dataset.id, id === 'none' ? undefined : id)} options={[[ 'none', '회귀 실행 선택' ], ...choices.filter(r => r.id === props.suiteRunId || r.items.some(i => !i.restricted && i.datasetId === props.dataset.id)).map(r => [r.id, `${time(r.createdAt)} · ${stateLabel(r.state)}`] as [string, string])]} />{props.suiteRunId ? <RerunPanel key={props.suiteRunId} {...props} datasetId={props.dataset.id} suiteRunId={props.suiteRunId} options={choices.map(r => [r.id, `${time(r.createdAt)} · ${stateLabel(r.state)}`])} /> : null}</> : null}
      <Button className="ml-auto" variant="secondary" size="toolbar" onClick={runs.retry}>실행 상태 새로 읽기</Button>
    </div>
    {!props.canRun ? <p className="text-xs text-text-secondary">회귀 실행 요청 권한이 없습니다. 관리자에게 요청해 주세요.</p> : null}
    <ReadView query={runs}>{data => props.compare ? <>{data.total > 25 ? <Pager page={page} total={data.total} onChange={setPage} /> : null}{!props.suiteRunId ? <p className="text-sm">비교할 회귀 실행을 선택하세요.</p> : null}</> : <Panel title="회귀 실행 요청">{data.rows.length ? <div className="space-y-3">{data.rows.map(run => <div key={run.id} className="space-y-2 border-b border-border-subtle pb-3 text-xs last:border-b-0 last:pb-0"><div className="flex flex-wrap items-center gap-2"><span className="break-all font-mono">{run.id}</span><span>{time(run.createdAt)}</span><DatasetBadge value={run.state} /><Button variant="link" size="toolbar" onClick={() => props.navigate(props.dataset.id, run.id)}>비교 열기</Button></div>{run.items.filter((i): i is Extract<RunItem, { restricted: false }> => !i.restricted && i.datasetId === props.dataset.id).map(i => <div key={i.ordinal} className="space-y-1"><p>r{i.revisionSeq} · Baseline b{i.baselineSeq} · {run.engineProfileRef ?? '프로파일 미지정'} 고정 · 시도 {i.attemptCount ?? 0}</p><p>검증 요청: <DatasetBadge value={i.requestState} />{i.requestState === 'failed' ? ' · 검증 요청이 실패했습니다. 성공한 시도의 결과를 확인하세요.' : null}</p><StaleBadge stale={i.baselineStale} /></div>)}</div>)}</div> : <p className="text-sm text-text-secondary">아직 회귀 실행 요청이 없습니다.</p>}<Pager page={page} total={data.total} onChange={setPage} /></Panel>}</ReadView>
    {props.compare && props.suiteRunId ? <ComparisonPanel key={props.suiteRunId} {...props} datasetId={props.dataset.id} suiteRunId={props.suiteRunId} /> : null}
    {requesting && suite.data ? <RequestDrawer key={suite.data.version} {...props} datasetId={props.dataset.id} suite={suite.data} onClose={() => setRequesting(false)} returnFocusRef={requestButton} /> : null}
  </div>;
  return frame(props, content, action);
}
export function RequestDrawer(props: ScreenProps & { suite: SuiteDetail; datasetId: string; onClose(): void; returnFocusRef?: React.RefObject<HTMLElement | null> }) {
  const write = useDatasetWrite(props.api.useAction('suiteRun'));
  const ownItems = props.suite.items.filter(i => !i.restricted && i.datasetId === props.datasetId);
  const blocked = !props.canRun || !ownItems.length || props.suite.items.some(i => i.restricted || !i.resolvesTo.ok);
  return props.ui.drawer({ footer: <Button size="toolbar" disabled={blocked || write.pending || write.result?.outcome === 'ok' || write.result?.outcome === 'unknown'} onClick={() => { void write.submit({ suiteId: props.suite.id, idempotencyKey: crypto.randomUUID() }); }}>회귀 실행 요청 등록</Button>, title: '회귀 실행 요청', requestClose: props.onClose, returnFocusRef: props.returnFocusRef, body: <div className="space-y-4 break-keep"><Panel title="요청에 고정할 항목">{props.suite.items.map(item => <div key={item.ordinal} className="space-y-2 text-xs">{item.restricted ? <p>읽을 수 없는 항목입니다.</p> : <><p>{item.datasetName}</p>{item.resolvesTo.ok ? <p>r{item.resolvesTo.revisionSeq} · Baseline b{item.resolvesTo.baselineSeq}</p> : <p>요청 불가: {PROBLEM[item.resolvesTo.problem] ?? item.resolvesTo.problem}</p>}</>}</div>)}<p className="break-all text-xs">실행 프로파일: {props.suite.engineProfileRef ?? '미지정'}</p><p className="text-xs text-text-secondary">등록 시점에 Revision·Baseline·프로파일을 고정합니다. 실행 결과가 기대 결과를 변경하지 않습니다.</p></Panel><p className="text-sm">사용자당 동시 회귀 실행 한도 3건 · 현재 동시 실행 수는 등록 시 서버에서 확인합니다.</p>{blocked ? <p className="text-sm">권한과 모든 항목의 승인 Baseline을 확인한 뒤 요청하세요.</p> : null}{write.result?.outcome === 'ok' ? <p role="status" className="text-sm">검증 요청: 대기</p> : null}<WriteError result={write.result} onRetry={write.retry} /></div> });
}
const PROBLEM: Record<string, string> = { no_approved_baseline: '승인된 Baseline이 없습니다.', baseline_not_approved: '승인된 Baseline이 아닙니다.', archived: '보관된 데이터셋입니다.', not_found: '항목을 찾을 수 없거나 읽을 수 없습니다.' };
