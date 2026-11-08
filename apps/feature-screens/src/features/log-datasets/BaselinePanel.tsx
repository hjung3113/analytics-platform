import { useState } from 'react';
import { Button, Popover, PopoverContent, PopoverTrigger, Textarea } from '@ap/ui';
import type { Baseline, BaselineRow, Dataset, Page, ScreenProps } from './contracts';
import { Choice, DatasetBadge, Panel, ReadView, StaleBadge, time, WriteError } from './presentation';
import { useDatasetWrite } from './useDatasetWrite';

export function BaselinePanel(props: ScreenProps & { dataset: Dataset; revisionId: string }) {
  const query = props.api.useRead<Page<BaselineRow>>('baselines', { datasetRevisionId: props.revisionId });
  const [selected, setSelected] = useState('');
  return <ReadView query={query}>{data => {
    const id = data.rows.some(b => b.id === selected) ? selected : data.rows[0]?.id;
    return <div className="space-y-3 break-keep">{data.rows.length > 1 ? <div className="max-w-sm"><Choice label="Baseline 선택" value={id ?? ''} onChange={setSelected} options={data.rows.map(b => [b.id, `b${b.seq} · ${b.status === 'draft' ? '초안' : b.status === 'approved' ? '승인' : '이전 기준'}`])} /></div> : null}{id ? <BaselineContent key={id} {...props} baselineId={id} approvedBaseline={data.rows.find(b => b.status === 'approved') ?? null} /> : <p role="status" className="text-sm text-text-secondary">초안 없음 · 이 Revision에 등록된 Baseline이 없습니다.</p>}</div>;
  }}</ReadView>;
}
function BaselineContent(props: ScreenProps & { dataset: Dataset; baselineId: string; approvedBaseline: BaselineRow | null }) {
  const query = props.api.useRead<Baseline>('baselineDetail', { baselineId: props.baselineId });
  return <ReadView query={query}>{baseline => <BaselineBody key={`${baseline.id}:${baseline.version}`} {...props} baseline={baseline} completedAt={query.completedAt ?? null} />}</ReadView>;
}
function BaselineBody(props: ScreenProps & { dataset: Dataset; baseline: Baseline; approvedBaseline: BaselineRow | null; completedAt?: number | null }) {
  const { baseline: b, dataset, ui } = props;
  const [reason, setReason] = useState('');
  const write = useDatasetWrite(props.api.useAction('baselineApprove'));
  const blocked = !props.canApprove ? 'Baseline 승인 권한이 없습니다. 관리자에게 세션 승인 권한을 요청하세요.' : dataset.status === 'archived' ? '보관된 데이터셋의 Baseline은 승인할 수 없습니다.' : b.status !== 'draft' ? '초안 Baseline만 승인할 수 있습니다.' : b.expectationCount === 0 ? '기대 결과가 없어 승인할 수 없습니다.' : null;
  const approved = props.approvedBaseline;
  const pinText = (row: BaselineRow) => `Spec ${row.profilePin.specPin?.revisionId ?? '미고정'} · RuleSet ${row.profilePin.ruleSetRevision ?? '미고정'} · Parser ${row.profilePin.parserVersion ?? '미고정'} · 실행 프로파일 ${row.profilePin.engineProfileRef ?? '미고정'}`;
  const selfApproved = b.events.some(e => e.selfApproved);
  return <div className="grid min-w-0 grid-cols-3 items-start gap-4 break-keep"><div className="col-span-2 min-w-0 space-y-3"><p className="text-xs text-text-muted">로그 탐색 메뉴가 아직 연결되지 않았습니다.</p>{ui.table({ title: `Baseline b${b.seq} 기대 결과`, rows: b.expectations.map(e => ({ ...e, id: e.ruleId })), preferenceKey: 'log-datasets-expectations', columns: [
    { id: 'rule', header: 'Rule', size: 100, sortable: false, cell: r => <span className="font-mono text-xs">{r.ruleId}</span>, exportValue: r => r.ruleId },
    { id: 'expected', header: '기대', size: 170, sortable: false, cell: r => <DatasetBadge value={r.expected} />, exportValue: r => r.expected },
    { id: 'exception', header: '예외', size: 160, sortable: false, cell: r => <FullText label={`${r.ruleId} 예외 전체 보기`} value={r.exception ? `${r.exception.reason} · ${r.exception.scope}` : '없음'} />, exportValue: r => r.exception ? `${r.exception.reason} · ${r.exception.scope}` : '없음' },
    { id: 'evidence', header: '근거 위치', size: 210, sortable: false, cell: r => <FullText label={`${r.ruleId} 근거 위치 전체 보기`} value={r.evidence?.map(e => `${e.fileRef} · ${e.line}행`).join(' / ') || '없음'} />, exportValue: r => r.evidence?.map(e => `${e.fileRef}:${e.line}`).join(', ') || '없음' },
  ] })}</div><div className="min-w-0 space-y-3"><Panel title="Baseline"><div className="flex flex-wrap items-center gap-2"><DatasetBadge value={approved?.status ?? b.status} /><span className="text-xs">{approved ? `승인 b${approved.seq} · ` : '승인 없음 · '}{b.status === 'draft' ? `초안 b${b.seq} · ` : ''}r{b.revisionSeq ?? '—'} 고정</span></div><StaleBadge stale={approved?.stale ?? b.stale} />{approved ? <p className="break-words text-xs">승인 b{approved.seq}: {pinText(approved)}</p> : null}{b.id !== approved?.id ? <p className="break-words text-xs">{b.status === 'draft' ? '초안' : '선택'} b{b.seq}: {pinText(b)}</p> : null}<p className="text-xs text-text-muted">기대 결과는 실행 결과로 자동 변경되지 않습니다.</p></Panel><Panel title={`Baseline b${b.seq} 승인 · 세션 전용`}><p className="text-xs">작성자 {b.author.displayName || '이름 확인 불가'} · 검토자 {b.approvedBy?.displayName ?? '미정'} · 자기 승인 허용, 이력에 표시</p>{blocked && b.status === 'draft' ? <><p className="text-sm">{blocked}</p>{ui.trust([blocked], props.completedAt)}</> : null}{b.status === 'draft' ? <><label htmlFor={`baseline-reason-${b.id}`} className="block text-xs">승인 사유</label><Textarea id={`baseline-reason-${b.id}`} value={reason} onChange={e => setReason(e.target.value)} maxLength={2000} disabled={!!blocked || write.pending} /><Button size="toolbar" disabled={!!blocked || !reason.trim() || write.pending || write.result?.outcome === 'unknown'} onClick={() => { void write.submit({ id: b.id, reason: reason.trim() }, { expectedVersion: b.version }); }}>초안 b{b.seq} 승인</Button><p className="text-xs text-text-muted">승인하면 이전 승인 Baseline은 superseded로 남깁니다.</p></> : <p className="text-xs">승인자 {b.approvedBy?.displayName ?? '없음'} · {time(b.approvedAt)}{selfApproved ? ' · 자기 승인' : ''}</p>}{write.result?.outcome === 'ok' ? <p role="status" className="text-sm">Baseline을 승인했습니다.</p> : null}<WriteError result={write.result} onRetry={write.retry} /></Panel><Panel title="Baseline 상태 이력">{ui.timeline(b.events, b.id)}</Panel></div></div>;
}

function FullText({ label, value }: { label: string; value: string }) {
  if (value === '없음') return value;
  return <Popover><PopoverTrigger asChild><button type="button" aria-label={label} className="min-w-0 truncate text-left text-accent-primary hover:underline">{value}</button></PopoverTrigger><PopoverContent aria-label={label}><p className="whitespace-normal break-words text-xs">{value}</p></PopoverContent></Popover>;
}
