import { useRef, useState } from 'react';
import { Button, Textarea } from '@ap/ui';
import { CLASSIFICATIONS, type ComparedItem, type Comparison, type RerunDiff, type RuleRow, type ScreenProps } from './contracts';
import { Choice, DatasetBadge, Pager, Panel, ReadView, REVIEW_LABEL, StaleBadge, WriteError, pageSummary } from './presentation';
import { useDatasetWrite } from './useDatasetWrite';

type VisibleItem = Extract<ComparedItem, { restricted: false }>;
export function ComparisonPanel(props: ScreenProps & { datasetId: string; suiteRunId: string }) {
  const head = props.api.useRead<Comparison>('comparison', { suiteRunId: props.suiteRunId, page: 0, pageSize: 1 });
  const [ordinal, setOrdinal] = useState('');
  return <ReadView query={head}>{data => {
    const items = data.items.filter((i): i is VisibleItem => !i.restricted && i.datasetId === props.datasetId);
    const selected = items.find(i => String(i.ordinal) === ordinal) ?? items[0];
    return selected ? <>{items.length > 1 ? <div className="max-w-sm"><Choice label="비교 항목" value={String(selected.ordinal)} onChange={setOrdinal} options={items.map(i => [String(i.ordinal), `r${i.revisionSeq} · Baseline b${i.baselineSeq}`])} /></div> : null}<ComparisonContent key={selected.ordinal} {...props} ordinal={selected.ordinal} /></> : <p role="status" className="text-sm">이 회귀 실행에 데이터셋이 없거나 읽을 수 없습니다.</p>;
  }}</ReadView>;
}
function ComparisonContent(props: ScreenProps & { datasetId: string; suiteRunId: string; ordinal: number }) {
  const [classification, setClassification] = useState('all');
  const [page, setPage] = useState(0);
  const query = props.api.useRead<Comparison>('comparison', { suiteRunId: props.suiteRunId, ordinal: props.ordinal, page, pageSize: 25, filters: classification === 'all' ? [] : [{ id: 'classification', op: 'in', value: [classification] }], sorting: [] });
  const [reviewing, setReviewing] = useState<RuleRow | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  return <ReadView query={query}>{data => {
    const items = data.items.filter((i): i is VisibleItem => !i.restricted && i.datasetId === props.datasetId && i.ordinal === props.ordinal);
    if (!items.length) return <p role="status" className="text-sm">이 회귀 실행에 데이터셋이 없거나 읽을 수 없습니다.</p>;
    const item = items.find(i => i.ordinal === reviewing?.ordinal);
    const coverage = items[0]?.coverage;
    const rows = data.rules.rows.filter(r => items.some(i => i.ordinal === r.ordinal));
    return <div className="flex min-h-0 flex-1 flex-col gap-3 break-keep"><section aria-label="실행 커버리지" className="space-y-2 rounded-lg border border-border-subtle bg-surface-card p-3 text-xs">
      {/* eslint-disable-next-line shadcn/no-unknown-classes -- t-card-title is supplied by the platform host through @ap/ui/styles.css. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1"><h2 className="t-card-title">실행 커버리지</h2>{coverage ? <><span>실행 {coverage.executedCount}</span><span>미검사 {coverage.notExecutedCount}</span><strong className="text-text-warning-label">필수 미검사 {coverage.requiredGapCount}</strong>{coverage.requiredGapCount ? <span className="text-text-warning-label">필수 미검사: {coverage.notExecuted.filter(r => r.required).map(r => r.ruleId).join(' · ')}</span> : null}</> : <><span>미산출</span><span>실행 — · 미검사 — · 필수 미검사 —</span></>}</div>
      {items.map(i => <div key={i.ordinal} className="flex flex-wrap items-center gap-x-3 gap-y-1"><p className="break-all">비교 대상 고정: {i.datasetName} · r{i.revisionSeq} · Baseline b{i.baselineSeq} · 회귀 실행 {data.run.id} · {i.observed ? `시도 ${i.observed.attemptNo} 완료 · ${i.observed.ruleSetRevision ?? 'RuleSet 미확인'}` : '성공한 시도 없음'}</p><StaleBadge stale={i.baselineStale} />{!i.coverage ? <p>검증 요청: <DatasetBadge value={i.requestState} /> · 성공한 시도가 없어 실행 커버리지와 규칙 분류를 계산하지 않았습니다.</p> : null}</div>)}
      {coverage ? <div className="flex flex-wrap items-center gap-1" aria-label="비교 분류">{['all', ...CLASSIFICATIONS].map(c => <Button key={c} variant={classification === c ? 'secondary' : 'ghost'} size="toolbar" aria-pressed={classification === c} onClick={() => { setClassification(c); setPage(0); }}>{c === 'all' ? '전체' : c} {c === 'all' ? items.reduce((n, i) => n + Object.values(i.counts).reduce((a, b) => a + b, 0), 0) : items.reduce((n, i) => n + (i.counts[c as keyof typeof i.counts] ?? 0), 0)}</Button>)}<span className="text-text-muted">미지원·원본 부재는 PASS 제외 · 새 관측은 기대 분모 제외</span></div> : null}
    </section>{!coverage ? <Panel title="비교 결과를 제공할 수 없습니다."><p className="text-sm">성공한 시도의 결과가 필요합니다. 대기·시도 중인 검증 요청은 완료 후 실행 상태를 새로 읽으세요. 실패·취소·만료된 요청은 회귀 실행 요청으로 다시 등록하세요.</p></Panel> : props.ui.table({ title: 'Baseline 대비 규칙 결과', fill: true, rows: rows.map(r => ({ ...r, id: `${r.ordinal}:${r.ruleId}` })), preferenceKey: 'log-datasets-comparison', summary: pageSummary(data.rules.total, page), pagination: <Pager showCount={false} page={page} total={data.rules.total} onChange={setPage} />, columns: [
      { id: 'rule', header: 'Rule', size: 130, sortable: false, cell: r => <span className="font-mono text-xs">{r.ruleId}</span>, exportValue: r => r.ruleId },
      { id: 'expected', header: 'Baseline 기대', size: 190, sortable: false, cell: r => <DatasetBadge value={r.expected ?? '기대 없음'} />, exportValue: r => r.expected },
      { id: 'observed', header: '스크립트 판정', size: 170, sortable: false, cell: r => <DatasetBadge value={r.observed} />, exportValue: r => r.observed },
      { id: 'classification', header: '분류', size: 170, sortable: false, cell: r => <DatasetBadge value={r.classification} />, exportValue: r => r.classification },
      { id: 'reason', header: '비교 사유', size: 190, sortable: false, cell: r => REASONS[r.classification], exportValue: r => REASONS[r.classification] },
      { id: 'label', header: '결과 검토 라벨', size: 180, sortable: false, cell: r => props.ui.cellLink({ label: `${r.ruleId} ${r.label ? REVIEW_LABEL[r.label.label] ?? r.label.label : '검토 전'}`, onClick: e => { returnFocusRef.current = e.currentTarget; setReviewing(r); }, children: r.label ? REVIEW_LABEL[r.label.label] ?? r.label.label : '검토 전' }), exportValue: r => r.label?.label ?? '검토 전' },
    ] })}{reviewing && item ? <ReviewDrawer key={`${props.suiteRunId}:${reviewing.ordinal}:${reviewing.ruleId}`} {...props} item={item} row={reviewing} onClose={() => setReviewing(null)} returnFocusRef={returnFocusRef} /> : null}</div>;
  }}</ReadView>;
}
const REASONS = { regressed: '기대보다 나빠진 규칙 결과', new: '기대에 없는 새 관측', fixed: '기대보다 개선된 규칙 결과', not_comparable: '검사하지 못해 비교 불가', missing: '기대한 Rule이 결과에 없음', unchanged: '기대와 일치' };
function ReviewDrawer(props: ScreenProps & { suiteRunId: string; item: VisibleItem; row: RuleRow; onClose(): void; returnFocusRef: React.RefObject<HTMLElement | null> }) {
  const [label, setLabel] = useState('needs_review');
  const [reason, setReason] = useState('');
  const write = useDatasetWrite(props.api.useAction('reviewLabelAdd'));
  return props.ui.drawer({ footer: <Button size="toolbar" disabled={!props.canManage || !reason.trim() || write.pending || write.result?.outcome === 'unknown' || write.result?.outcome === 'ok'} onClick={() => { void write.submit({ suiteRunId: props.suiteRunId, ordinal: props.item.ordinal, datasetRevisionId: props.item.datasetRevisionId, ruleId: props.row.ruleId, label, reason: reason.trim() }); }}>결과 검토 라벨 남기기</Button>, title: '결과 검토 라벨', requestClose: props.onClose, returnFocusRef: props.returnFocusRef, body: <div className="space-y-4 break-keep"><p className="break-all text-xs">{props.row.ruleId} · r{props.item.revisionSeq} · Baseline b{props.item.baselineSeq} · 회귀 실행 {props.suiteRunId} 고정</p><Panel title="규칙 결과"><div className="flex flex-wrap items-center gap-2"><DatasetBadge value={props.row.classification} /><DatasetBadge value={props.row.observed} /></div><p className="text-xs">기대: {props.row.expected ?? '기대 없음'}</p><p className="text-xs">{REASONS[props.row.classification]}</p></Panel><Choice visibleLabel fullWidth label="결과 검토 라벨" value={label} onChange={setLabel} options={Object.entries(REVIEW_LABEL)} disabled={!props.canManage || write.pending} /><label htmlFor="dataset-review-reason" className="block text-sm">검토 사유</label><Textarea id="dataset-review-reason" maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} disabled={!props.canManage || write.pending} /><p className="text-xs text-text-secondary">사람의 결과 검토 라벨은 스크립트 판정과 Baseline 기대를 바꾸지 않습니다.</p>{!props.canManage ? <p className="text-sm">결과 검토 라벨 권한이 없습니다. 관리자에게 dataset.manage 권한을 요청하세요.</p> : null}<Panel title="최근 결과 검토 라벨">{props.row.label ? <><p className="text-sm">{REVIEW_LABEL[props.row.label.label]}</p><p className="text-xs">{props.row.label.reason}</p></> : <p className="text-xs text-text-muted">아직 결과 검토 라벨이 없습니다.</p>}</Panel><WriteError result={write.result} onRetry={write.retry} />{write.result?.outcome === 'ok' ? <p role="status" className="text-sm">결과 검토 라벨을 남겼습니다.</p> : null}</div> });
}
export function RerunPanel(props: ScreenProps & { datasetId: string; suiteRunId: string; options: [string, string][] }) {
  const [fromRun, setFromRun] = useState<[string, string]>(['none', '재실행 비교 대상 선택']);
  const fromRunId = fromRun[0];
  const options = props.options.filter(([id]) => id !== props.suiteRunId);
  if (fromRunId !== 'none' && !options.some(([id]) => id === fromRunId)) options.unshift(fromRun);
  const [page, setPage] = useState(0);
  const query = props.api.useRead<RerunDiff>('rerunDiff', { fromRunId, toRunId: props.suiteRunId, page, pageSize: 25 }, fromRunId !== 'none');
  return <div className="contents"><Choice label="같은 Revision 재실행 비교" value={fromRunId} onChange={v => { setFromRun(options.find(([id]) => id === v) ?? ['none', '재실행 비교 대상 선택']); setPage(0); }} options={[[ 'none', '재실행 비교 대상 선택' ], ...options]} />{fromRunId !== 'none' ? <ReadView query={query}>{data => <div className="w-full space-y-3"><p className="text-xs text-text-muted">이 표는 Suite 전체 항목의 재실행 차이입니다. Revision ID로 항목을 구분합니다.</p><p className="break-all text-xs">재실행 비교: {data.from.id} → {data.to.id}</p>{data.revisions.some(r => r.status !== 'compared') ? <p className="text-sm">성공한 시도가 없어 비교할 수 없는 Revision이 있습니다.</p> : null}{props.ui.table({ title: 'Suite 전체 재실행 차이', rows: data.diffs.rows.map((r, i) => ({ ...r, id: `${r.ordinal}:${r.ruleId}:${i}` })), preferenceKey: 'log-datasets-rerun', summary: pageSummary(data.diffs.total, page), pagination: <Pager showCount={false} page={page} total={data.diffs.total} onChange={setPage} />, columns: [
    { id: 'rule', header: 'Rule', size: 160, sortable: false, cell: r => r.ruleId },
    { id: 'revision', header: 'Revision ID', size: 260, sortable: false, cell: r => <span className="truncate font-mono text-xs">{r.datasetRevisionId}</span> },
    { id: 'kind', header: '변경', size: 160, sortable: false, cell: r => r.kind },
    { id: 'from', header: '이전 관측', size: 200, sortable: false, cell: r => <DatasetBadge value={r.from?.observed} /> },
    { id: 'to', header: '현재 관측', size: 200, sortable: false, cell: r => <DatasetBadge value={r.to?.observed} /> },
  ] })}</div>}</ReadView> : null}</div>;
}
