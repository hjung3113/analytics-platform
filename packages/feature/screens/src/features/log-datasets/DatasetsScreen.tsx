import { useState } from 'react';
import { SearchInput, StatusBadge } from '@ap/ui';
import type { Dataset, Page, ScreenProps } from './contracts';
import { Choice, Pager, ReadView, TAG_LABEL, time, pageSummary } from './presentation';

export function DatasetsScreen(props: ScreenProps) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState('active');
  const [sort, setSort] = useState('updatedAt');
  const query = props.api.useRead<Page<Dataset>>('datasets', { q: q || null, page, pageSize: 25, sorting: [{ id: sort, desc: sort === 'updatedAt' }], filters: status === 'all' ? [] : [{ id: 'status', op: 'in', value: [status] }] });
  const search = <div className="flex min-w-0 items-center gap-2"><SearchInput className="min-w-0 flex-1" value={q} size="toolbar" onValueChange={v => { setQ(v.slice(0, 200)); setPage(0); }} placeholder="데이터셋 이름·목적 검색" aria-label="데이터셋 검색" /><Choice filter label="상태" value={status} onChange={v => { setStatus(v); setPage(0); }} options={['active', 'archived', 'all'].map(v => [v, v === 'active' ? '사용 중' : v === 'archived' ? '보관' : '전체 상태'])} /><Choice filter label="정렬" value={sort} onChange={v => { setSort(v); setPage(0); }} options={[[ 'updatedAt', '최근 갱신순' ], [ 'name', '이름순' ]]} /></div>;
  const table = (data: Page<Dataset>, loading = false) => props.ui.table({ title: '테스트 데이터셋 목록', rows: data.rows, loading, search, summary: loading ? '불러오는 중…' : pageSummary(data.total, page), preferenceKey: 'log-datasets-list', fill: true, pagination: <Pager showCount={false} page={page} total={data.total} onChange={setPage} />, rowAction: { label: r => `${r.name} 열기`, open: r => props.navigate(r.id) }, columns: [
    { id: 'name', header: '이름', size: 230, sortable: false, cell: r => <div className="flex min-w-0 items-center gap-2">{props.ui.cellLink({ datasetId: r.id, children: r.name })}{r.synthetic ? <StatusBadge tone="neutral">합성</StatusBadge> : null}</div>, exportValue: r => r.name },
    { id: 'tags', header: '태그', size: 150, sortable: false, cell: r => <span className="truncate">{r.scenarioTags.map(t => TAG_LABEL[t] ?? t).join(' · ') || '없음'}</span>, exportValue: r => r.scenarioTags.join(', ') },
    { id: 'models', header: '모델 범위', size: 180, sortable: false, cell: r => <span className="truncate">{r.modelIds.join(' · ') || '모델 무관'}</span>, exportValue: r => r.modelIds.join(', ') || '모델 무관' },
    { id: 'revision', header: '최신 Revision', size: 110, sortable: false, cell: r => r.latestRevisionSeq === null ? '없음' : `r${r.latestRevisionSeq}`, exportValue: r => r.latestRevisionSeq },
    { id: 'owner', header: '소유자', size: 100, sortable: false, cell: r => r.owner.displayName || '이름 확인 불가', exportValue: r => r.owner.displayName },
    { id: 'updatedAt', header: '갱신', size: 170, sortable: false, cell: r => time(r.updatedAt), exportValue: r => time(r.updatedAt) },
  ] });
  return props.ui.page({ children: <div className="flex min-h-0 flex-1 flex-col gap-3 break-keep"><p className="text-xs text-text-muted">Baseline 상태와 최근 회귀 실행 요약은 상세에서 확인합니다.</p><ReadView query={query} loading={table(EMPTY_PAGE, true)}>{data => <>{data.rows.length === 0 ? <section role="status" className="rounded-lg border border-border-subtle bg-surface-card p-4"><h3 className="text-sm font-semibold">{q || status !== 'active' ? '조건에 맞는 테스트 데이터셋이 없습니다.' : '등록된 테스트 데이터셋이 없습니다.'}</h3><p className="mt-2 text-sm text-text-secondary">{q || status !== 'active' ? '검색어나 상태 필터를 변경해 주세요.' : '이 Workspace에는 아직 테스트 데이터셋이 등록되지 않았습니다. 샘플 목록과 기대 결과를 준비한 뒤 등록하세요.'}</p></section> : null}{table(data)}</>}</ReadView></div> });
}

const EMPTY_PAGE: Page<Dataset> = { rows: [], total: 0 };
