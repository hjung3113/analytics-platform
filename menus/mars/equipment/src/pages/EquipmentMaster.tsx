import { useMemo } from 'react';
import type { ColumnFilter } from '@ap/contracts';
import { PlatformLink, useI18n, useMenuFetch, useMenuQuery, usePlatform } from '@ap/kernel';
import { equipmentExportEndpoint, equipmentMakersEndpoint, equipmentPageEndpoint, type Equipment } from '../endpoints';
import { PanelRight } from 'lucide-react';
import { DetailDrawer, RowAction, ManagementLayout, type PlatformColumn, PlatformDataTable, PlatformPage, TableUrlWarning, useTableUrlState } from '@ap/components';
import { Button } from '@ap/ui';
import { EquipmentPanel, EquipmentStatus } from './EquipmentDetail';
import { columnFilter, exportFilterSummary, exportParams, fields, filterSpecs, legacyFilterKeys, pinnedFilterKeys, sortFields, statusText } from './data';
import { QuickSearch } from './QuickSearch';

const NO_PARAMS = {} as const;
const NO_FILTERS: ColumnFilter[] = [];

export default function EquipmentMaster() {
  const { t, lang } = useI18n();
  const ko = lang === 'ko';
  const { pageParam, setPage, linkTo } = usePlatform();
  const q = pageParam('q') ?? '', focus = pageParam('focus');
  // §6.1 page keys: sort/page/tab are URL-owned; invalid wire values alert instead of substituting.
  const drawerTab = pageParam('tab') ?? 'attributes';
  const validTab = ['attributes', 'validity', 'audit'].includes(drawerTab);
  // §13: the fullscreen link carries the viewed tab when the destination knows it; the default tab stays off the URL.
  const detailPage = validTab && drawerTab !== 'attributes' ? { tab: drawerTab } : undefined;
  // ADR-0105: every condition (상태, Maker, the column filters) is one hidden repeated page key `filter`; `status`/`maker` links are read for one release and rewritten.
  // The URL codec does not check enum values against options, so the parse specs need no Maker options (they come from the makers endpoint below).
  const urlFilters = useMemo(() => ({
    key: 'filter', specs: filterSpecs([], lang), legacy: legacyFilterKeys,
    labels: Object.fromEntries(fields.map(f => [f.key, f[lang]])),
  }), [lang]);
  const { urlState: tableUrlState, invalid: tableInvalid, sentences: invalidTableSentences, recoverKeys, cause } = useTableUrlState(sortFields, { filters: urlFilters });
  const conditions = tableUrlState?.filters ?? NO_FILTERS;
  const filterKey = q;
  // #173 review P2-4: the full list is no longer the render gate. Maker options come from a small distinct-values
  // endpoint; the table renders its own outcomes.
  const makers = useMenuQuery(equipmentMakersEndpoint, NO_PARAMS, !tableInvalid);
  const makerKey = [...new Set([
    ...(makers.response?.outcome === 'ok' ? makers.response.data! : []),
    ...conditions.flatMap(c => c.id === 'maker' && (c.op === 'in' || c.op === 'notIn') ? c.value : []), // the chosen values stay selectable while the options (re)load
  ])].sort().join('\u0000');
  // Same options → same array, so the columns (and the table's filter state) do not rebuild on every render.
  const makerOptions = useMemo(() => makerKey ? makerKey.split('\u0000') : [], [makerKey]);
  const pages = useMenuFetch(equipmentPageEndpoint);
  const exports = useMenuFetch(equipmentExportEndpoint);

  // A global-Context change clears `page` in the kernel (manifest contextResetKeys); pages write no reset effect.
  const columns = useMemo<PlatformColumn<Equipment>[]>(() => fields.map(f => ({
    id: f.key, header: f[lang], size: ['validFrom', 'validTo', 'updatedAt'].includes(f.key) ? 188 : f.key === 'equipmentId' ? 184 : 128,
    cell: row => f.key === 'status' ? <EquipmentStatus equipment={row} /> : <span className={f.key === 'equipmentId' ? 't-mono' : f.key.includes('At') || f.key.startsWith('valid') ? 'tabular' : ''}>{row[f.key] ?? '—'}</span>,
    // The status cell shows a label badge; the export shows the same text (06 §15).
    exportValue: f.key === 'status' ? (row: Equipment) => statusText[row.status][lang] : undefined,
    // ADR-0104/0105: filter fields — 상태 and Maker (pinned), the line enum, two text columns and the validity dates; the server applies them.
    filter: columnFilter(f.key, makerOptions, lang),
    filterPinned: pinnedFilterKeys.includes(f.key) ? pinnedFilterKeys.indexOf(f.key) + 1 : undefined, // the position in `pinnedFilterKeys` (상태, then Maker), not the column order
    // #556d: rows can be grouped by line (a column filter, not a page filter); the export stays flat rows.
    groupable: f.key === 'line',
  })), [lang, makerOptions]);
  // One clear for the search and every condition: one `setPage`, back to page 1 (`status`/`maker` aliases are rewritten away already).
  const clearButton = q || conditions.length > 0
    ? <Button type="button" size="sm" variant="secondary" onClick={() => setPage({ q: null, filter: null, page: null })}>{t('clearFilters')}</Button>
    : null;
  return <PlatformPage description={ko ? '설비 속성 → 유효구간 → 변경 이력. 합성 데이터 · 조회 전용.' : 'Equipment attributes → validity → change history. Synthetic data · read-only.'}>
    <ManagementLayout search={<QuickSearch applied={q} label={ko ? '설비 ID 검색' : 'Search equipment ID'} onApply={value => setPage({ q: value === '' ? null : value, page: null })} />}
      drawer={focus && <DetailDrawer key={focus} title={<span className="t-mono">{focus}</span>} subtitle={ko ? '설비 상세 · 합성 데이터' : 'Equipment details · synthetic data'}
      onClose={() => setPage({ focus: null, tab: null })} tab={validTab ? drawerTab : 'invalid'} onTabChange={tab => setPage({ tab: tab === 'attributes' ? null : tab })}
      context={ko ? '목록 필터와 설비 선택은 그대로입니다.' : 'List filters and the equipment selection stay as they are.'}
      headerActions={<Button asChild size="sm" variant="secondary"><PlatformLink href={linkTo('equipment-detail', { params: { equipmentId: focus }, page: detailPage, returnTo: true })}>{ko ? '전체 화면' : 'Full page'}</PlatformLink></Button>}
      tabs={validTab ? [{ id: 'attributes', label: ko ? '속성' : 'Attributes', content: <EquipmentPanel id={focus} kind="attributes" /> }, { id: 'validity', label: ko ? '유효구간 이력' : 'Validity history', content: <EquipmentPanel id={focus} kind="validity" /> }, { id: 'audit', label: ko ? '변경 이력' : 'Change history', content: <EquipmentPanel id={focus} kind="audit" /> }]
        : [{ id: 'invalid', label: ko ? '알 수 없는 탭' : 'Unregistered tab', content: <p role="alert">{ko ? '등록되지 않은 탭입니다.' : 'This tab is not registered.'} <Button size="sm" variant="secondary" onClick={() => setPage({ tab: null })}>{ko ? '속성 열기' : 'Open attributes'}</Button></p> }]} />}
      table={(_filterSlot, search) => tableInvalid ? <TableUrlWarning filters={search} sentences={invalidTableSentences} recoverKeys={recoverKeys} cause={cause} /> :
    <PlatformDataTable<Equipment>
      title={ko ? '설비 목록' : 'Equipment list'} ariaLabel={ko ? '설비 마스터 목록' : 'Equipment master list'}
      subtitle={ko ? '행을 체크하면 내보내거나, ‘선택 설비로 분석’으로 그 설비들을 분석할 수 있습니다.' : 'Check rows to export them, or to analyse them with ‘Analyze selected equipment’.'}
      columns={columns} getRowId={e => e.equipmentId} filterKey={filterKey} preferenceKey="equipment-master:columns:v1" activeRowId={focus} pageSize={25}
      urlState={tableUrlState}
      loadPage={(page, signal) => pages.fetch({ q, ...page }, signal)}
      search={search}
      rowAction={(e, { compact }) => <RowAction compact={compact} icon={PanelRight} label={ko ? `${e.equipmentId} 보기` : `View ${e.equipmentId}`} text={ko ? '보기' : 'View'} onClick={() => setPage({ focus: e.equipmentId, tab: null })} />}
      selectAllResults
      bulkActions={ids => <Button asChild size="sm"><PlatformLink href={linkTo('productivity-overview', { global: { selection: ids } })}>{ko ? '선택 설비로 분석' : 'Analyze selected equipment'}</PlatformLink></Button>}
      // Table-owned export (#173): the page only says how to read the rows; the table builds the file.
      exportRows={(request, signal) => exports.fetch(exportParams({ q }, request), signal)}
      exportFilterSummary={exportFilterSummary({ q }, lang)} exportContext={equipmentExportEndpoint.context}
      emptyAction={clearButton}
    />} />

  </PlatformPage>;
}
