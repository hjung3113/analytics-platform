import { useMemo, useState, useSyncExternalStore } from 'react';
import { Info, PanelRight } from 'lucide-react';
import type { ApiResponse, PageResult } from '@ap/contracts';
import { useMenuAction, useMenuQuery, usePlatform, type PageProps } from '@ap/kernel';
import { HeaderOverflowItem, OrderedIntervalTrack, PageFilterBar, PageKeyWarning, PlatformDataTable, PlatformPage, RowAction, StateMessage, useHeaderOverflowDialog, usePageKeyRules, type PageFilterField, type PlatformColumn } from '@ap/components';
import { Button, Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue, SearchInput, Skeleton, StatusBadge, Tabs, TabsList, TabsTrigger } from '@ap/ui';
import { investigationsEndpoint, investigationDetailEndpoint, investigationUpdate, isUuid, periodsEndpoint, recordsEndpoint, type Investigation, type InvestigationFilters, type SampleSet, type SourceRow } from '../endpoints';
import { BasketDrawer, ExportDialog, RecordDrawer, SampleDialog, SourceNotice } from './ExplorerPanels';
import { periodSelectionOf, queryFrom, selectionOf, sequenceData, sourceReadable } from './explorerModel';
import { DEFAULT_PAGE_KEYS, PageKeysContext, type PageKeys } from './pageKeys';
import { useSourceRead } from './useSourceRead';

const rulesFor = (keys: PageKeys) => [
  { key: keys.tab, label: { ko: '탭', en: 'Tab' }, valid: (s: string) => s === 'raw' || s === 'sequence' },
  { key: keys.focus, label: { ko: '근거 위치', en: 'Evidence location' }, valid: (s: string) => /^[1-9]\d*:[1-9]\d*$/.test(s) },
  { key: keys.drawer, label: { ko: '서랍', en: 'Drawer' }, valid: (s: string) => s === 'record' || s === 'basket' },
];
const STATES = { period: { label: '기간 행', colorToken: 'chart-blue' as const }, incomplete: { label: 'incomplete · 불완전', colorToken: 'chart-purple' as const } };
const media = () => window.matchMedia('(max-width: 1280px)');
const subscribeNarrow = (notify: () => void) => { const mq = media(); mq.addEventListener('change', notify); return () => mq.removeEventListener('change', notify); };
const narrowSnapshot = () => media().matches;
function ExportEntry({ set, summary }: { set: SampleSet; summary: string }) {
  const show = useHeaderOverflowDialog();
  return <HeaderOverflowItem label="현재 범위 내보내기…" onSelect={() => show?.(control => <ExportDialog open onOpenChange={open => { if (!open) control.close(); }} onCloseAutoFocus={control.onCloseAutoFocus} set={set} querySummary={summary} />)} />;
}
function Loading({ onCancel }: { onCancel?: () => void }) {
  return <div aria-busy="true" className="flex flex-col gap-3"><p role="status" className="text-sm text-text-secondary">불러오는 중</p><Skeleton className="h-20" />{onCancel && <Button variant="secondary" size="toolbar" onClick={onCancel}>조회 취소</Button>}</div>;
}
export default function LogExplorer({ params }: PageProps) {
  const { navigate, linkTo } = usePlatform();
  const [sampleOpen, setSampleOpen] = useState(false);
  const list = useMenuQuery(investigationsEndpoint, { status: 'open', page: 0, pageSize: 200 });
  const id = params.investigationId ?? list.response?.data?.rows[0]?.id;
  const valid = id === undefined || isUuid(id);
  const detail = useMenuQuery(investigationDetailEndpoint, { investigationId: id ?? '' }, !!id && valid);
  const investigation = detail.response?.data;
  const picker = <div className="flex min-w-0 flex-wrap items-center gap-2 break-keep">
    <Select value={id ?? ''} onValueChange={investigationId => navigate(linkTo('log-explorer-view', { params: { investigationId } }))}><SelectTrigger density="compact" aria-label="샘플 목록" className="max-w-xs"><SelectValue placeholder="저장한 조사 선택" /></SelectTrigger><SelectContent><SelectGroup>{list.response?.data?.rows.map(row => <SelectItem key={row.id} value={row.id}>{row.title}</SelectItem>)}</SelectGroup></SelectContent></Select>
    <Button variant="secondary" size="toolbar" onClick={() => setSampleOpen(true)}>조사 만들기</Button>
    {list.response?.data && list.response.data.total > 200 && <p className="text-xs text-text-secondary">최근 조사 200개 표시 · 조사 주소로 직접 열 수 있습니다.</p>}
  </div>;
  const failed = list.response?.outcome !== 'ok' && list.response?.outcome !== 'empty' || !!detail.response && detail.response.outcome !== 'ok' && detail.response.outcome !== 'empty';
  if (!valid) return <PlatformPage><StateMessage icon={<Info className="size-4" aria-hidden />} title="조사 주소를 확인하세요." /></PlatformPage>;
  return <>
    {investigation ? <InvestigationScreen key={investigation.id} investigation={investigation} picker={picker} /> : <PlatformPage layout="fill">
      <div className="flex flex-col gap-3">{picker}{list.status === 'loading' || (!!id && detail.status === 'loading') ? <Loading /> : <StateMessage icon={<Info className="size-4" aria-hidden />} title={failed ? '조사를 읽지 못했습니다.' : id ? '조사를 찾을 수 없습니다.' : '저장한 조사가 없습니다.'} body={failed ? '자신의 조사만 열 수 있습니다. 원본은 Source 접근 권한으로 다시 확인합니다.' : '자신의 조사만 열 수 있습니다. 조사 만들기로 새 조사를 시작하세요.'} action={failed ? <Button variant="secondary" size="toolbar" onClick={() => { list.refetch(); detail.refetch(); }}>다시 시도</Button> : <Button variant="secondary" size="toolbar" onClick={() => setSampleOpen(true)}>조사 만들기</Button>} />}</div>
    </PlatformPage>}
    <SampleDialog open={sampleOpen} onOpenChange={setSampleOpen} />
  </>;
}

type FrameProps = { contextExtension: React.ReactNode; children: React.ReactNode };
/**
 * The investigation body: conditions, 원본/시퀀스 tabs, the record drawer. `embedded` is a read-only host (the Round detail tab, #1475):
 * no saved-conditions write, no evidence basket, no add-to-basket; the conditions stay local. `frame` replaces the page frame when a host
 * already owns one.
 */
export function InvestigationScreen({ investigation, picker, embedded = false, pageKeys = DEFAULT_PAGE_KEYS, frame }: { investigation: Investigation; picker: React.ReactNode; embedded?: boolean; pageKeys?: PageKeys; frame?: (props: FrameProps) => React.ReactNode }) {
  const { pageParam, setPage } = usePlatform();
  const set = investigation.sampleSet;
  const keys = usePageKeyRules(rulesFor(pageKeys).map(rule => rule.key === pageKeys.focus && set ? { ...rule, valid: (value: string) => selectionOf(value, set) !== null } : rule));
  const tab = pageParam(pageKeys.tab) ?? 'raw';
  const focus = pageParam(pageKeys.focus);
  const drawer = pageParam(pageKeys.drawer);
  const savedKey = JSON.stringify(investigation.filters);
  const [filters, setFilters] = useState({ savedKey, draft: investigation.filters, applied: investigation.filters });
  if (filters.savedKey !== savedKey) setFilters({ savedKey, draft: investigation.filters, applied: investigation.filters });
  const query = queryFrom(filters.applied);
  const filterKey = JSON.stringify(query);
  const [paging, setPaging] = useState<{ key: string; cursors: (string | null)[]; index: number }>({ key: filterKey, cursors: [null], index: 0 });
  if (paging.key !== filterKey) setPaging({ key: filterKey, cursors: [null], index: 0 });
  const cursor = paging.key === filterKey ? paging.cursors[paging.index] ?? null : null;
  const [periodPaging, setPeriodPaging] = useState<{ key: string; cursors: (string | null)[]; index: number }>({ key: filterKey, cursors: [null], index: 0 });
  if (periodPaging.key !== filterKey) setPeriodPaging({ key: filterKey, cursors: [null], index: 0 });
  const periodCursor = periodPaging.key === filterKey ? periodPaging.cursors[periodPaging.index] ?? null : null;
  const records = useSourceRead(recordsEndpoint, { sampleSet: set!, query, cursor, limit: 200 }, !!set && !keys.invalid && tab === 'raw');
  const periods = useSourceRead(periodsEndpoint, { sampleSet: set!, query, cursor: periodCursor, limit: 200 }, !!set && !keys.invalid && tab === 'sequence');
  const update = useMenuAction(investigationUpdate);
  const [writeNotice, setWriteNotice] = useState('');
  const narrow = useSyncExternalStore(subscribeNarrow, narrowSnapshot, () => false);
  const selection = set ? selectionOf(focus, set) : null;
  const drawerOpen = drawer === 'basket' || !!selection;
  const compactColumns = narrow && drawerOpen;
  const columns = useMemo<PlatformColumn<SourceRow>[]>(() => {
    const compact = compactColumns;
    const column: PlatformColumn<SourceRow>[] = [{ id: 'order', header: '순번', size: drawerOpen ? 60 : 76, cell: r => <span className="whitespace-nowrap t-mono">{r.fileOrder}:{r.line}</span> }];
    if (!compact) column.push({ id: 'fileRef', header: '파일', size: drawerOpen ? 88 : 140, cell: r => <span className="block truncate" title={r.fileRef}>{r.fileRef}</span> });
    column.push({ id: 'line', header: '줄', size: drawerOpen ? 60 : 64, cell: r => <span className="t-mono">{r.line}</span> }, { id: 'timestamp', header: '시간', size: drawerOpen ? 96 : 116, cell: r => <span className="block truncate t-mono" title={r.timestamp ?? undefined}>{r.timestamp?.split('T')[1] ?? '—'}{r.timeReversal ? ' ↶' : ''}</span> });
    // SourceRow has no type field; only a parsed response may assert a log type. Do not infer one from the source text.
    if (!compact) column.push({ id: 'type', header: '타입', size: 72, cell: () => <span className="whitespace-nowrap break-keep">미확인</span> });
    column.push({ id: 'text', header: '요약', size: compactColumns ? 140 : drawerOpen ? 160 : 360, cell: r => <span className="block truncate" title={r.text}>{r.text}</span> });
    return column.map(c => ({ ...c, sortable: false }));
  }, [compactColumns, drawerOpen]);
  const data = records.response?.data;
  const periodData = periods.response?.data;
  const [accessDenied, setAccessDenied] = useState(false);
  if ((data?.state === 'permission_denied' || periodData?.state === 'permission_denied') && !accessDenied) setAccessDenied(true);
  const synthetic = (tab === 'raw' ? data : periodData)?.synthetic;
  const active = tab === 'raw' ? records : periods;
  const pending = JSON.stringify(filters.draft) !== JSON.stringify(filters.applied);
  const fields: PageFilterField[] = ['logType', 'module', 'event', 'contextKey', 'contextValue'].map((key, index) => ({ key, label: ['로그 타입', 'Module', 'Event', 'Context 키', 'Context 값'][index], kind: 'text', value: String(filters.draft[key] ?? ''), onValueChange: value => setFilters(f => ({ ...f, draft: { ...f.draft, [key]: value.slice(0, key === 'logType' || key === 'contextKey' || key === 'module' || key === 'event' ? 100 : 200) } })) }));
  const summaryItems = [...fields.map(f => ({ key: f.key, label: f.label, value: String(filters.applied[f.key] || '전체') })), { key: 'text', label: '검색', value: String(filters.applied.text || '없음') }];
  const summary = summaryItems.map(i => `${i.label} ${i.value}`).join(' · ');
  const track = set ? sequenceData(set, periodData?.rows ?? []) : null;
  const closeDrawer = () => setPage({ [pageKeys.focus]: null, [pageKeys.drawer]: null });
  const contextExtension = <div className="flex flex-col gap-3 break-keep">
      <PageFilterBar collapsible defaultCollapsed preferenceKey="log-explorer" label="조회 조건" summaryItems={summaryItems} hasPendingChanges={pending} fields={[
        ...fields, { key: 'period', label: '기간 시작·끝', kind: 'custom', content: <p className="text-xs text-text-secondary">Source 조회 계약에서 미지원</p> },
      ]} actions={<><Button size="toolbar" disabled={!pending} onClick={() => setFilters(f => ({ ...f, applied: f.draft }))}>적용</Button><Button variant="ghost" size="toolbar" onClick={() => setFilters(f => ({ ...f, draft: {}, applied: {} }))}>초기화</Button>{!embedded && <Button variant="secondary" size="toolbar" disabled={update.pending || !investigation.canInvestigate || investigation.status !== 'open' || pending} onClick={() => { void update.run({ id: investigation.id, filters: filters.applied }, { expectedVersion: investigation.version }).then(r => setWriteNotice(r.outcome === 'ok' ? '조회 조건을 저장했습니다.' : r.outcome === 'conflict' ? '조사가 변경되었습니다. 새 버전을 확인하고 다시 시도하세요.' : '조건을 저장하지 못했습니다.')).catch(() => undefined); }}>조건 저장</Button>}</>} />
    </div>;
  const inner = (
    <div className="flex min-h-0 flex-1 flex-col gap-3 break-keep">
      <div className="flex shrink-0 flex-wrap items-center gap-2">{picker}{synthetic && <StatusBadge tone="info">합성 데이터</StatusBadge>}{set && <span className="text-xs text-text-secondary">{set.files.length}파일 · 파일 순서 → 줄 번호</span>}{!embedded && <Button variant="secondary" size="toolbar" onClick={() => setPage({ [pageKeys.drawer]: 'basket' })}>근거 위치 바구니 · {investigation.evidence.length}</Button>}</div>
      {writeNotice && <p role="status" className="text-xs text-text-secondary">{writeNotice}</p>}
      {keys.invalid ? <PageKeyWarning sentences={keys.sentences} onRecover={keys.recover} /> : !set ? <StateMessage icon={<Info className="size-4" aria-hidden />} title="원본 없음" body="Round의 샘플 목록을 열 수 없습니다." /> : <>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2"><Tabs value={tab} onValueChange={value => setPage({ [pageKeys.tab]: value })}><TabsList aria-label="로그 보기"><TabsTrigger value="raw">원본</TabsTrigger><TabsTrigger value="sequence">시퀀스</TabsTrigger></TabsList></Tabs><span className="text-xs text-text-secondary">{selection ? `선택 ${selection.fileRef}:${selection.line} · ` : ''}Top View 미연결</span></div>
        {active.loading ? <Loading onCancel={active.cancel} /> : active.cancelled ? <StateMessage icon={<Info className="size-4" aria-hidden />} title="조회를 취소했습니다." action={<Button variant="secondary" size="toolbar" onClick={active.retry}>다시 조회</Button>} /> : active.failed ? <StateMessage icon={<Info className="size-4" aria-hidden />} title="원본을 읽지 못했습니다." action={<Button variant="secondary" size="toolbar" onClick={active.retry}>다시 시도</Button>} /> : <>
          <SourceNotice answer={accessDenied ? { state: 'permission_denied', reason: null, synthetic: false, label: null } : tab === 'raw' ? data : periodData} />
          {accessDenied && <Button variant="secondary" size="toolbar" onClick={() => { closeDrawer(); setAccessDenied(false); records.retry(); periods.retry(); }}>접근 권한 다시 확인</Button>}
          {tab === 'raw' && !accessDenied && data && sourceReadable(data.state) && <>
            <div className="flex shrink-0 items-center justify-between gap-2 text-xs text-text-secondary"><span>현재 읽은 범위 · {data.rows.length}행 · 요청당 최대 200행</span><div className="flex gap-2"><Button variant="ghost" size="toolbar" disabled={paging.index === 0} onClick={() => setPaging(p => ({ ...p, index: p.index - 1 }))}>이전 범위</Button><Button variant="ghost" size="toolbar" disabled={!data.nextCursor} onClick={() => { if (data.nextCursor) setPaging(p => ({ ...p, cursors: [...p.cursors.slice(0, p.index + 1), data.nextCursor], index: p.index + 1 })); }}>다음 범위</Button></div></div>
            <div className="flex min-h-0 flex-1 flex-col"><PlatformDataTable<SourceRow> fill search={<SearchInput placeholder="요약 검색" value={String(filters.draft.text ?? '')} onValueChange={text => setFilters(f => ({ ...f, draft: { ...f.draft, text: text.slice(0, 200) } }))} onCommit={() => setFilters(f => ({ ...f, applied: { ...f.applied, text: f.draft.text ?? '' } }))} />} title="원본 이벤트 목록" ariaLabel="원본 이벤트 목록" columns={columns} getRowId={r => `${r.fileOrder}:${r.line}`} preferenceKey="log-explorer-records:v1" pageSize={200} filterKey={JSON.stringify([filterKey, cursor, records.response?.correlationId])} activeRowId={focus} loadPage={async (): Promise<ApiResponse<PageResult<SourceRow>>> => ({ outcome: 'ok', data: { rows: data.rows, total: data.rows.length }, assessments: [], trust: null, correlationId: records.response?.correlationId ?? 'source' })} rowAction={row => <RowAction compact icon={PanelRight} label={`${row.fileRef}:${row.line} 상세`} text="상세" onClick={() => setPage({ [pageKeys.focus]: `${row.fileOrder}:${row.line}`, [pageKeys.drawer]: 'record' })} />} /></div>
          </>}
          {tab === 'sequence' && !accessDenied && track && periodData && <><div className="flex shrink-0 items-center justify-between gap-2 text-xs text-text-secondary"><span>현재 읽은 기간 범위 · {periodData.rows.length}개</span><div className="flex gap-2"><Button variant="ghost" size="toolbar" disabled={periodPaging.index === 0} onClick={() => setPeriodPaging(p => ({ ...p, index: p.index - 1 }))}>이전 기간 범위</Button><Button variant="ghost" size="toolbar" disabled={!periodData.nextCursor} onClick={() => { if (periodData.nextCursor) setPeriodPaging(p => ({ ...p, cursors: [...p.cursors.slice(0, p.index + 1), periodData.nextCursor], index: p.index + 1 })); }}>다음 기간 범위</Button></div></div><OrderedIntervalTrack ariaLabel="시퀀스" description="파일 순서 → 줄 번호 · 시간순 재정렬 없음" {...track} height={Math.min(288, track.lanes.length * 28 + 56)} states={STATES} axisLabel="파일 순서:줄" selectedId={set ? periodSelectionOf(set, periodData.rows, focus) : null} onSelect={item => setPage({ [pageKeys.focus]: item?.id ?? null, [pageKeys.drawer]: item ? 'record' : null })} state={!sourceReadable(periodData.state) ? { kind: periodData.state === 'permission_denied' ? 'forbidden' : 'unsupported', title: '시퀀스 미지원', body: '기간 행 미지원' } : periodData.nextCursor || periodData.state === 'partial' ? { kind: 'partial', title: '일부 결과 · 현재 기간 범위만 표시' } : undefined} /></>}
        </>}
      </>}
      {!keys.invalid && !embedded && drawer === 'basket' && <BasketDrawer investigation={investigation} onClose={closeDrawer} />}
      {!keys.invalid && (embedded || drawer !== 'basket') && selection && set && <RecordDrawer embedded={embedded} key={`${selection.fileRef}:${selection.line}`} investigation={investigation} blocked={accessDenied} onDenied={() => setAccessDenied(true)} set={set} selection={selection} onClose={closeDrawer} />}
    </div>
  );
  const framed = frame ? frame({ contextExtension, children: inner }) : <PlatformPage layout="fill" contextExtension={contextExtension} queryBarExtension={{ pageSummary: summaryItems, appliedPageSummary: summaryItems, issues: [] }} secondaryActions={set && <ExportEntry set={set} summary={summary} />}>{inner}</PlatformPage>;
  return <PageKeysContext.Provider value={pageKeys}>{framed}</PageKeysContext.Provider>;
}
