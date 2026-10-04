import { useMemo } from 'react';
import { PlatformLink, useI18n, useMenuFetch, useMenuQuery, usePlatform } from '@ap/kernel';
import { equipmentExportEndpoint, equipmentMakersEndpoint, equipmentPageEndpoint, type Equipment } from '../endpoints';
import { PrototypePageFilterBar, DetailDrawer, type PlatformColumn, PlatformDataTable, PlatformPage, encodeTableSort, parsePageIndex, parseTableSort } from '@ap/components';
import { Button } from '@ap/ui';
import { EquipmentPanel, EquipmentStatus } from './EquipmentDetail';
import { exportFilterSummary, exportParams, fields, sortFields, statusText } from './data';

const NO_PARAMS = {} as const;

export default function EquipmentMaster() {
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const { pageParam, setPage, linkTo } = usePlatform();
  const q = pageParam('q') ?? '', status = pageParam('status') ?? '', maker = pageParam('maker') ?? '', focus = pageParam('focus');
  // §6.1 page keys: sort/page/tab are URL-owned; invalid wire values alert instead of substituting.
  const drawerTab = pageParam('tab') ?? 'attributes';
  const validTab = ['attributes', 'validity', 'audit'].includes(drawerTab);
  const parsedSort = parseTableSort(pageParam('sort'), sortFields);
  const parsedPage = parsePageIndex(pageParam('page'));
  const tableInvalid = !parsedSort.ok || !parsedPage.ok;
  const filterKey = JSON.stringify([q, status, maker]);
  // #173 review P2-4: the full list is no longer the render gate. Maker options come from a small distinct-values
  // endpoint; the table renders its own outcomes.
  const makers = useMenuQuery(equipmentMakersEndpoint, NO_PARAMS, !tableInvalid);
  const makerOptions = [...new Set([
    ...(makers.response?.outcome === 'ok' ? makers.response.data! : []),
    ...(maker ? [maker] : []), // the chosen value stays selectable while the options (re)load
  ])].sort();
  const pages = useMenuFetch(equipmentPageEndpoint);
  const exports = useMenuFetch(equipmentExportEndpoint);

  // A global-Context change clears `page` in the kernel (manifest contextResetKeys); pages write no reset effect.
  const columns = useMemo<PlatformColumn<Equipment>[]>(() => fields.map(f => ({
    id: f.key, header: f[lang], size: ['validFrom', 'validTo', 'updatedAt'].includes(f.key) ? 188 : f.key === 'name' ? 220 : f.key === 'equipmentId' ? 184 : 128,
    cell: row => f.key === 'status' ? <EquipmentStatus equipment={row} /> : <span className={f.key === 'equipmentId' ? 't-mono' : f.key.includes('At') || f.key.startsWith('valid') ? 'tabular' : ''}>{row[f.key] ?? '—'}</span>,
    // The status cell shows a label badge; the export shows the same text (06 §15).
    exportValue: f.key === 'status' ? (row: Equipment) => statusText[row.status][lang] : undefined,
  })), [lang]);
  const control = 'h-8 rounded-sm border border-border-control bg-surface-card px-2 text-[12px] focus-visible:outline-2 focus-visible:outline-focus-ring';
  const clear = <Button size="sm" variant="secondary" onClick={() => setPage({ q: null, status: null, maker: null, page: null })}>{ko ? '페이지 필터 초기화' : 'Clear page filters'}</Button>;
  return <PlatformPage description={ko ? '설비 속성 → 유효구간 → Audit. 합성 데이터 · 조회 전용 Candidate.' : 'Equipment attributes → validity → audit. Synthetic data · read-only Candidate.'}>
    {tableInvalid ? <p role="alert">{ko ? '정렬·페이지 값이 잘못되었습니다.' : 'Invalid sort or page value.'} <Button size="sm" variant="secondary" onClick={() => setPage({ sort: null, page: null })}>{ko ? '초기화' : 'Reset'}</Button></p> :
    <PlatformDataTable<Equipment>
      title={ko ? '설비 목록' : 'Equipment list'} ariaLabel={ko ? '설비 마스터 목록' : 'Equipment master list'}
      subtitle={ko ? '행 체크는 내보내기용입니다. 분석 이동을 클릭할 때만 전역 Selection을 교체합니다.' : 'Row checks are for export. Only the explicit analysis link replaces global Selection.'}
      columns={columns} getRowId={e => e.equipmentId} filterKey={filterKey} preferenceKey="equipment-master:columns:v1" activeRowId={focus} pageSize={25} height={430}
      urlState={parsedSort.ok && parsedPage.ok ? {
        page: parsedPage.page === 1 ? null : parsedPage.page,
        sorting: parsedSort.sorting,
        onChange: ({ page, sorting }) => setPage({ sort: encodeTableSort(sorting), page: page === null ? null : String(page) }),
      } : undefined}
      loadPage={(page, signal) => pages.fetch({ q, status, maker, ...page }, signal)}
      filters={<PrototypePageFilterBar label={ko ? '페이지 필터' : 'Page filters'} allLabel={ko ? '전체' : 'All'} filterLabel={ko ? '필터' : 'Filters'} reset={clear} fields={[
        { key: 'q', label: ko ? '설비 ID 또는 이름 검색' : 'Search equipment ID or name', value: q, onChange: value => setPage({ q: value || null, page: null }, { replace: true }) },
        { key: 'status', label: ko ? '상태' : 'Status', value: status, onChange: value => setPage({ status: value || null, page: null }), options: Object.entries(statusText).map(([value, text]) => ({ value, label: text[lang] })) },
        { key: 'maker', label: 'Maker', value: maker, onChange: value => setPage({ maker: value || null, page: null }), options: makerOptions.map(value => ({ value, label: value })) },
      ]}><fieldset className="flex flex-wrap items-center gap-2 border-l-2 border-border-strong pl-3"><legend className="t-caption text-text-muted">{ko ? '페이지 필터' : 'Page filters'}</legend>
        <label className="flex items-center gap-1 text-xs">{ko ? '검색' : 'Search'}<input className={control} aria-label={ko ? '설비 ID 또는 이름 검색' : 'Search equipment ID or name'} value={q} onChange={e => setPage({ q: e.target.value || null, page: null }, { replace: true })} /></label>
        <label className="flex items-center gap-1 text-xs">{ko ? '상태' : 'Status'}<select className={control} value={status} onChange={e => setPage({ status: e.target.value || null, page: null })}><option value="">{ko ? '전체' : 'All'}</option>{Object.entries(statusText).map(([id, text]) => <option key={id} value={id}>{text[lang]}</option>)}</select></label>
        <label className="flex items-center gap-1 text-xs">Maker<select className={control} value={maker} onChange={e => setPage({ maker: e.target.value || null, page: null })}><option value="">{ko ? '전체' : 'All'}</option>{makerOptions.map(m => <option key={m}>{m}</option>)}</select></label>{clear}
      </fieldset></PrototypePageFilterBar>}
      rowAction={e => <Button size="sm" variant="ghost" onClick={() => setPage({ focus: e.equipmentId, tab: null })}>{ko ? '보기' : 'View'}</Button>}
      bulkActions={ids => <Button asChild size="sm"><PlatformLink href={linkTo('productivity-overview', { global: { selection: ids } })}>{ko ? '선택 설비로 분석' : 'Analyze selected equipment'}</PlatformLink></Button>}
      // Table-owned export (#173): the page only says how to read the rows; the table builds the file.
      exportRows={(request, signal) => exports.fetch(exportParams({ q, status, maker }, request), signal)}
      exportFilterSummary={exportFilterSummary({ q, status, maker }, lang)} exportContext={equipmentExportEndpoint.context}
      emptyAction={clear}
    />}
    {focus && <DetailDrawer key={focus} title={<span className="t-mono">{focus}</span>} subtitle={ko ? '설비 상세 · 합성 데이터' : 'Equipment details · synthetic data'}
      onClose={() => setPage({ focus: null })} tab={validTab ? drawerTab : undefined} onTabChange={tab => setPage({ tab: tab === 'attributes' ? null : tab })}
      context={ko ? '목적지 ID만 열었습니다. 전역 Selection과 목록 필터는 유지됩니다.' : 'Only the destination ID is opened. Global Selection and list filters are preserved.'}
      headerActions={<Button asChild size="sm" variant="secondary"><PlatformLink href={linkTo('equipment-detail', { params: { equipmentId: focus }, returnTo: true })}>{ko ? '전체 화면' : 'Full page'}</PlatformLink></Button>}
      tabs={validTab ? [{ id: 'attributes', label: ko ? '속성' : 'Attributes', content: <EquipmentPanel id={focus} kind="attributes" /> }, { id: 'validity', label: ko ? '유효구간 이력' : 'Validity history', content: <EquipmentPanel id={focus} kind="validity" /> }, { id: 'audit', label: 'Audit', content: <EquipmentPanel id={focus} kind="audit" /> }]
        : [{ id: 'invalid', label: ko ? '알 수 없는 탭' : 'Unknown tab', content: <p role="alert">{ko ? '등록되지 않은 탭입니다.' : 'Unknown tab.'} <Button size="sm" variant="secondary" onClick={() => setPage({ tab: null })}>{ko ? '속성 열기' : 'Open attributes'}</Button></p> }]} />}
  </PlatformPage>;
}
