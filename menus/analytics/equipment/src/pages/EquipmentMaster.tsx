import { useMemo } from 'react';
import { PlatformLink, useI18n, useMenuFetch, useMenuQuery, usePlatform } from '@ap/kernel';
import { equipmentExportEndpoint, equipmentMakersEndpoint, equipmentPageEndpoint, type Equipment } from '../endpoints';
import { DetailDrawer, FilterApplyButton, ManagementLayout, PageFilterBar, type PlatformColumn, PlatformDataTable, PlatformPage, TableUrlWarning, encodeTableSort, useFilterDraft, useTableUrlWarning } from '@ap/components';
import { Button } from '@ap/ui';
import { EquipmentPanel, EquipmentStatus } from './EquipmentDetail';
import { exportFilterSummary, exportParams, fields, sortFields, statusText } from './data';
import { applyEquipmentPageFilters, equipmentPageFilterFields, resetEquipmentPageFilters } from './filter-fields';

const NO_PARAMS = {} as const;

export default function EquipmentMaster() {
  const { t, lang } = useI18n();
  const ko = lang === 'ko';
  const { pageParam, setPage, linkTo } = usePlatform();
  const q = pageParam('q') ?? '', status = pageParam('status') ?? '', maker = pageParam('maker') ?? '', focus = pageParam('focus');
  // §6.1 page keys: sort/page/tab are URL-owned; invalid wire values alert instead of substituting.
  const drawerTab = pageParam('tab') ?? 'attributes';
  const validTab = ['attributes', 'validity', 'audit'].includes(drawerTab);
  // §13: the fullscreen link carries the viewed tab when the destination knows it; the default tab stays off the URL.
  const detailPage = validTab && drawerTab !== 'attributes' ? { tab: drawerTab } : undefined;
  const { parsedSort, parsedPage, invalid: tableInvalid, sentences: invalidTableSentences } = useTableUrlWarning(sortFields);
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
    id: f.key, header: f[lang], size: ['validFrom', 'validTo', 'updatedAt'].includes(f.key) ? 188 : f.key === 'equipmentId' ? 184 : 128,
    cell: row => f.key === 'status' ? <EquipmentStatus equipment={row} /> : <span className={f.key === 'equipmentId' ? 't-mono' : f.key.includes('At') || f.key.startsWith('valid') ? 'tabular' : ''}>{row[f.key] ?? '—'}</span>,
    // The status cell shows a label badge; the export shows the same text (06 §15).
    exportValue: f.key === 'status' ? (row: Equipment) => statusText[row.status][lang] : undefined,
  })), [lang]);
  // Draft + apply (ADR-0037): the drafts live here, above ManagementLayout, so they survive rail ↔ popover and collapse.
  const draft = useFilterDraft({ q, status, maker });
  const activeFilterCount = [q, status, maker].filter(Boolean).length;
  const clear = activeFilterCount > 0 ? <Button type="button" size="sm" variant="secondary" onClick={() => { draft.reset({}); resetEquipmentPageFilters(setPage); }}>{t('clearFilters')}</Button> : null;
  return <PlatformPage description={ko ? '설비 속성 → 유효구간 → 변경 이력. 합성 데이터 · 조회 전용.' : 'Equipment attributes → validity → change history. Synthetic data · read-only.'}>
    <ManagementLayout filter={<PageFilterBar orientation="column" label={t('pageFilter')} fields={equipmentPageFilterFields({ values: draft.values, set: draft.set, makers: makerOptions, lang })}
      onApply={() => applyEquipmentPageFilters(setPage, draft.patch())} actions={<><FilterApplyButton changedCount={draft.changedCount} />{clear}</>} />}
      activeFilterCount={activeFilterCount} pendingFilterCount={draft.changedCount}
      drawer={focus && <DetailDrawer key={focus} title={<span className="t-mono">{focus}</span>} subtitle={ko ? '설비 상세 · 합성 데이터' : 'Equipment details · synthetic data'}
      onClose={() => setPage({ focus: null, tab: null })} tab={validTab ? drawerTab : 'invalid'} onTabChange={tab => setPage({ tab: tab === 'attributes' ? null : tab })}
      context={ko ? '목록 필터와 설비 선택은 그대로입니다.' : 'List filters and the equipment selection stay as they are.'}
      headerActions={<Button asChild size="sm" variant="secondary"><PlatformLink href={linkTo('equipment-detail', { params: { equipmentId: focus }, page: detailPage, returnTo: true })}>{ko ? '전체 화면' : 'Full page'}</PlatformLink></Button>}
      tabs={validTab ? [{ id: 'attributes', label: ko ? '속성' : 'Attributes', content: <EquipmentPanel id={focus} kind="attributes" /> }, { id: 'validity', label: ko ? '유효구간 이력' : 'Validity history', content: <EquipmentPanel id={focus} kind="validity" /> }, { id: 'audit', label: ko ? '변경 이력' : 'Change history', content: <EquipmentPanel id={focus} kind="audit" /> }]
        : [{ id: 'invalid', label: ko ? '알 수 없는 탭' : 'Unregistered tab', content: <p role="alert">{ko ? '등록되지 않은 탭입니다.' : 'This tab is not registered.'} <Button size="sm" variant="secondary" onClick={() => setPage({ tab: null })}>{ko ? '속성 열기' : 'Open attributes'}</Button></p> }]} />}
      table={filterSlot => tableInvalid ? <>{filterSlot}<TableUrlWarning sentences={invalidTableSentences} /></> :
    <PlatformDataTable<Equipment>
      title={ko ? '설비 목록' : 'Equipment list'} ariaLabel={ko ? '설비 마스터 목록' : 'Equipment master list'}
      subtitle={ko ? '행을 체크하면 내보내거나, ‘선택 설비로 분석’으로 그 설비들을 분석할 수 있습니다.' : 'Check rows to export them, or to analyse them with ‘Analyze selected equipment’.'}
      columns={columns} getRowId={e => e.equipmentId} filterKey={filterKey} preferenceKey="equipment-master:columns:v1" activeRowId={focus} pageSize={25}
      urlState={parsedSort.ok && parsedPage.ok ? {
        page: parsedPage.page === 1 ? null : parsedPage.page,
        sorting: parsedSort.sorting,
        onChange: ({ page, sorting }, reason) => setPage({ sort: encodeTableSort(sorting), page: page === null ? null : String(page) }, { replace: reason === 'clamp' }),
      } : undefined}
      loadPage={(page, signal) => pages.fetch({ q, status, maker, ...page }, signal)}
      filters={filterSlot}
      rowAction={e => <Button size="toolbar" variant="ghost" aria-label={ko ? `${e.equipmentId} 보기` : `View ${e.equipmentId}`} onClick={() => setPage({ focus: e.equipmentId, tab: null })}>{ko ? '보기' : 'View'}</Button>}
      bulkActions={ids => <Button asChild size="sm"><PlatformLink href={linkTo('productivity-overview', { global: { selection: ids } })}>{ko ? '선택 설비로 분석' : 'Analyze selected equipment'}</PlatformLink></Button>}
      // Table-owned export (#173): the page only says how to read the rows; the table builds the file.
      exportRows={(request, signal) => exports.fetch(exportParams({ q, status, maker }, request), signal)}
      exportFilterSummary={exportFilterSummary({ q, status, maker }, lang)} exportContext={equipmentExportEndpoint.context}
      emptyAction={clear}
    />} />

  </PlatformPage>;
}
