import { useState } from 'react';
import { Button, StatusBadge } from '@ap/ui';
import type { Opinion, OpinionEvidence, OpinionListRow, OpinionSummary, Page, ScreenProps } from './contracts';
import { Pager, ReadView, time } from './presentation';

function OpinionChips({ opinion }: { opinion: Pick<OpinionSummary, 'grade' | 'mark'> }) {
  return <><StatusBadge tone="neutral" variant="outline">{opinion.grade.label ?? opinion.grade.key}</StatusBadge>{opinion.mark ? <StatusBadge tone="neutral" variant="outline">{opinion.mark.label ?? opinion.mark.key}</StatusBadge> : null}</>;
}
export function OpinionCell({ itemKey, opinion, onOpen }: { itemKey: string; opinion: OpinionSummary | null | undefined; onOpen(): void }) {
  if (!opinion) return <span className="text-xs text-text-muted">—</span>;
  return <Button variant="link" size="toolbar" className="h-auto min-w-0 max-w-full flex-wrap justify-start whitespace-normal break-keep" aria-label={`${itemKey} 의견 이력`} onClick={onOpen}><OpinionChips opinion={opinion} />{opinion.hasNote ? <span className="text-xs">설비사 질의</span> : null}{opinion.count > 1 ? <span className="text-xs">{opinion.count}건</span> : null}</Button>;
}
export function OpinionHistory({ api, ui, itemKey, attemptId, onEvidence, onClose }: Pick<ScreenProps, 'api' | 'ui'> & { itemKey: string; attemptId: string; onEvidence(evidence: OpinionEvidence[]): void; onClose(): void }) {
  const [page, setPage] = useState(0);
  const query = api.useRead<Page<Opinion>>('opinions', { attemptId, itemKey, page, pageSize: 25 });
  return ui.drawer({ title: '의견 이력', subtitle: itemKey, requestClose: onClose, body: <div className="break-keep"><ReadView query={query} empty="의견 이력이 없습니다.">{data => data.rows.length === 0 ? <p className="text-xs text-text-secondary">의견 이력이 없습니다.</p> : <div className="grid gap-5"><ol className="grid gap-5">{data.rows.map(opinion => <li key={opinion.id} className="grid gap-2 border-b border-border-subtle pb-4"><div className="flex flex-wrap items-center gap-2"><OpinionChips opinion={opinion} /></div><div className="flex flex-wrap gap-2 text-xs text-text-secondary"><span>{opinion.author.displayName}</span><time dateTime={opinion.at}>{time(opinion.at)} KST</time></div><p className="text-xs text-text-secondary">입력 리비전 {opinion.inputRevision ?? '없음'} · 생산자 {opinion.producer ?? '없음'}</p><h3 className="text-xs font-semibold">설비사 질의</h3>{opinion.note ? <p className="whitespace-pre-wrap break-keep text-sm">{opinion.note}</p> : <p className="text-xs text-text-muted">질의 없음</p>}<div className="flex flex-wrap gap-2">{opinion.evidence.map((e, index) => <Button key={`${e.fileRef}:${e.line}:${e.fileSha256}`} variant="link" size="toolbar" className="break-keep" onClick={() => onEvidence([e])}>근거 {index + 1} · {e.fileRef}:{e.line}</Button>)}</div></li>)}</ol><Pager page={page} total={data.total} onChange={setPage} /></div>}</ReadView></div> });
}
export function UnlinkedOpinions({ api, ui, attemptId, onOpen }: Pick<ScreenProps, 'api' | 'ui'> & { attemptId: string; onOpen(itemKey: string): void }) {
  const [page, setPage] = useState(0);
  const query = api.useRead<Page<OpinionListRow>>('opinions', { attemptId, unlinked: true, page, pageSize: 25 });
  return <section className="grid min-w-0 gap-3 break-keep"><h3 className="text-sm font-semibold">규칙 결과에 연결되지 않은 의견</h3><ReadView query={query}>{data => data.rows.length === 0 ? <p className="text-xs text-text-secondary">연결되지 않은 의견이 없습니다.</p> : ui.table({ title: '규칙 결과에 연결되지 않은 의견', rows: data.rows.map(row => ({ ...row, id: row.itemKey })), preferenceKey: 'log-lifecycle-unlinked-opinions', pagination: <Pager page={page} total={data.total} onChange={setPage} />, columns: [
    { id: 'itemKey', header: '항목 키', sortable: false, cell: row => <Button variant="link" size="toolbar" aria-label={`${row.itemKey} 의견 이력`} onClick={() => onOpen(row.itemKey)}><span className="font-mono text-xs">{row.itemKey}</span></Button> },
    { id: 'opinion', header: '의견', sortable: false, cell: row => <div className="flex flex-wrap items-center gap-2"><OpinionChips opinion={row} /></div> },
    { id: 'query', header: '설비사 질의', sortable: false, cell: row => row.hasNote ? <span className="break-keep text-xs">설비사 질의</span> : <span className="text-xs text-text-muted">—</span> },
    { id: 'at', header: '작성 시각 (KST)', sortable: false, cell: row => <time dateTime={row.at} className="text-xs text-text-secondary">{time(row.at)}</time> },
  ] })}</ReadView></section>;
}
