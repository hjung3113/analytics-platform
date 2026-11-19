import { useMessages } from '@ap/kernel';
import { EQUIPMENT_MESSAGES } from '../messages';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { ColumnFilter } from '@ap/contracts';
import { PlatformLink, useEntityQuery, useI18n, useMenuFetch, useMenuQuery, usePlatform, useQueryContext } from '@ap/kernel';
import { EQUIPMENT_ENTITY_TYPE, equipmentExportEndpoint, equipmentMakersEndpoint, equipmentPageEndpoint, type Equipment } from '../endpoints';
import { PanelRight } from 'lucide-react';
import { useClearFiltersAction, useTableFilterDeclaration, type TableFilterDeclaration, DetailDrawer, RowAction, ManagementLayout, type PlatformColumn, PlatformDataTable, PlatformPage, TableQuickSearch, TableUrlWarning, useTableUrlState } from '@ap/components';
import { Button } from '@ap/ui';
import { EquipmentPanel, EquipmentStatus } from './EquipmentDetail';
import { columnFilter, equipmentDateText, exportFilterSummary, exportParams, fields, pinnedFilterKeys, sortFields, statusText } from './data';

const NO_PARAMS = {} as const;
const NO_FILTERS: ColumnFilter[] = [];

export default function EquipmentMaster() {
  const m = useMessages(EQUIPMENT_MESSAGES);
  const { lang } = useI18n();
  const { pageParam, setPage, linkTo, global, scope, user, revision } = usePlatform();
  const queryContext = useQueryContext();
  const q = pageParam('q') ?? '', focus = pageParam('focus');
  // §6.1 page keys: sort/page/tab are URL-owned; invalid wire values alert instead of substituting.
  const drawerTab = pageParam('tab') ?? 'attributes';
  const validTab = ['attributes', 'validity', 'audit'].includes(drawerTab);
  // §13: the fullscreen link carries the viewed tab when the destination knows it; the default tab stays off the URL.
  const detailPage = validTab && drawerTab !== 'attributes' ? { tab: drawerTab } : undefined;
  // ADR-0105: every condition (상태, Maker, the column filters) is one hidden repeated page key `filter`.
  // The URL codec does not check enum values against options, so the parse specs need no Maker options (they come from the makers endpoint below).
  const filterDeclarations = useMemo<TableFilterDeclaration[]>(() => fields.map(f => {
    const spec = columnFilter(f.key, [], lang);
    return { id: f.key, label: f, spec, pinned: pinnedFilterKeys.includes(f.key) ? pinnedFilterKeys.indexOf(f.key) + 1 : undefined };
  }), [lang]);
  const { urlFilters, filterColumnProps } = useTableFilterDeclaration('filter', filterDeclarations, { lang });
  const { urlState: tableUrlState, invalid: tableInvalid, sentences: invalidTableSentences, recoverKeys, cause } = useTableUrlState(sortFields, { filters: urlFilters });
  const conditions = tableUrlState?.filters ?? NO_FILTERS;
  // A settlement belongs to the applied query that received it, even when the table still shows the previous page.
  const listQuery = JSON.stringify([user.id, revision, queryContext, q, conditions, tableUrlState?.sorting, tableUrlState?.page]);
  const [readyListQuery, setReadyListQuery] = useState<string | null>(null);
  const onPageReadyChange = useCallback((ready: boolean) => setReadyListQuery(ready ? listQuery : null), [listQuery]);
  const filterKey = q;
  const list = useRef<HTMLDivElement>(null);
  const detailEnabled = !!focus && scope.status === 'valid';
  const detail = useEntityQuery<Equipment>({ type: EQUIPMENT_ENTITY_TYPE, id: focus ?? '', scopeId: global.scopeId }, null, detailEnabled);
  const equipment = detail.response?.outcome === 'ok' && detail.response.data?.equipmentId === focus ? detail.response.data : null;
  const missing = detail.response?.outcome === 'empty' || detail.response?.outcome === 'forbidden';
  // Reuse the list's scoped filter contract and constrain the read to one ID across all pages.
  const membership = useMenuQuery(equipmentExportEndpoint, {
    q, ids: focus ? [focus] : [], sorting: [], ...(conditions.length ? { filters: conditions } : {}),
  }, { enabled: detailEnabled && !tableInvalid && equipment !== null });
  let isInList: boolean | undefined;
  if (!tableInvalid && readyListQuery === listQuery && membership.status === 'done') {
    if (membership.response?.outcome === 'empty') isInList = false;
    if (membership.response?.outcome === 'ok') isInList = membership.response.data?.some(row => row.equipmentId === focus);
  }
  const clearFocus = () => setPage({ focus: null, tab: null });
  const clearExcludedFocus = () => setPage({ focus: null, tab: null }, { replace: true });
  // #173 review P2-4: the full list is no longer the render gate. Maker options come from a small distinct-values
  // endpoint; the table renders its own outcomes.
  const makers = useMenuQuery(equipmentMakersEndpoint, NO_PARAMS, !tableInvalid);
  const makerKey = [...new Set([
    ...(makers.response?.outcome === 'ok' ? makers.response.data! : []),
    ...conditions.flatMap(c => c.id === 'maker' && (c.op === 'in' || c.op === 'notIn') ? c.value : []), // the chosen values stay selectable while the options (re)load
  ])].sort().join('\u0000');
  // Same options → same array, so the columns (and the table's filter state) do not rebuild on every render.
  const makerOptions = useMemo(() => (makerKey ? makerKey.split('\u0000') : []).map(value => ({ value, label: value })), [makerKey]);
  const pages = useMenuFetch(equipmentPageEndpoint);
  const exports = useMenuFetch(equipmentExportEndpoint);

  // A global-Context change clears `page` in the kernel (manifest contextResetKeys); pages write no reset effect.
  const columns = useMemo<PlatformColumn<Equipment>[]>(() => fields.map(f => ({
    size: ['validFrom', 'validTo', 'updatedAt'].includes(f.key) ? 188 : f.key === 'equipmentId' ? 184 : 128,
    cell: row => f.key === 'status' ? <EquipmentStatus equipment={row} /> : <span className={f.key === 'equipmentId' ? 't-mono' : f.key.includes('At') || f.key.startsWith('valid') ? 'tabular' : ''}>{row[f.key] == null ? '—' : equipmentDateText(f.key, String(row[f.key]))}</span>,
    // The status cell shows a label badge; the export shows the same text (06 §15).
    exportValue: f.key === 'status' ? (row: Equipment) => statusText[row.status][lang]
      : f.key === 'validFrom' || f.key === 'validTo' || f.key === 'updatedAt' ? (row: Equipment) => row[f.key] == null ? '' : equipmentDateText(f.key, String(row[f.key])) : undefined,
    // ADR-0104/0105: filter fields — 상태 and Maker (pinned), the line enum, two text columns and the validity dates; the server applies them.
    ...filterColumnProps(f.key, f.key === 'maker' ? makerOptions : undefined),
    // #556d: rows can be grouped by line (a column filter, not a page filter); the export stays flat rows.
    groupable: f.key === 'line',
  })), [lang, makerOptions, filterColumnProps]);
  // One clear for the search and every condition: one `setPage`, back to page 1.
  const clearButton = useClearFiltersAction({ filterKey: urlFilters.key, hasFilters: !!q || conditions.length > 0, extraKeys: ['q'] });
  const search = <TableQuickSearch pageKey="q" label={m('equipmentMasterSearchEquipmentId')} />;
  return <PlatformPage description={m('equipmentMasterEquipmentAttributesValidityChangeHistoryReadOnly')}>
    <ManagementLayout
      drawer={focus && (missing
        ? <DetailDrawer key={focus} id={focus} missing onClose={clearFocus} />
        : <DetailDrawer key={focus} id={focus} title={equipment?.model}
          fullPageHref={equipment ? linkTo('equipment-detail', { params: { equipmentId: focus }, page: detailPage, returnTo: true }) : undefined}
          isInList={isInList} listFocusRef={list} onClose={clearFocus} onListLeave={clearExcludedFocus}
          tab={drawerTab} onTabRecover={() => setPage({ tab: null })} onTabChange={tab => setPage({ tab: tab === 'attributes' ? null : tab })}
          tabs={[{ id: 'attributes', label: m('equipmentMasterAttributes'), content: <EquipmentPanel id={focus} kind="attributes" /> }, { id: 'validity', label: m('equipmentMasterValidityHistory'), content: <EquipmentPanel id={focus} kind="validity" /> }, { id: 'audit', label: m('equipmentMasterChangeHistory'), content: <EquipmentPanel id={focus} kind="audit" /> }]} />)}
      table={tableInvalid ? <TableUrlWarning search={search} sentences={invalidTableSentences} recoverKeys={recoverKeys} cause={cause} /> :
    <div ref={list} role="group" aria-label={m('equipmentMasterEquipmentList')} tabIndex={-1} className="rounded-lg focus:outline-2 focus:outline-focus-ring focus:-outline-offset-2">
    <PlatformDataTable<Equipment>
      title={m('equipmentMasterEquipmentList')} ariaLabel={m('equipmentMasterEquipmentMasterList')}
      subtitle={m('equipmentMasterCheckRowsToExportOrOpenThem')}
      columns={columns} getRowId={e => e.equipmentId} filterKey={filterKey} preferenceKey="equipment-master:columns:v1" activeRowId={focus} pageSize={25}
      urlState={tableUrlState}
      loadPage={(page, signal) => pages.fetch({ q, ...page }, signal)}
      onPageReadyChange={onPageReadyChange}
      search={search}
      rowAction={(e, { compact }) => <RowAction compact={compact} icon={PanelRight} label={m('equipmentMasterView', { equipmentId: String(e.equipmentId) })} text={m('equipmentMasterView2')} onClick={() => setPage({ focus: e.equipmentId, tab: null })} />}
      selectAllResults
      bulkSelectionActions={selection => selection.kind === 'all' ? <span className="text-xs text-text-secondary">{m('equipmentMasterAnalyzeAllHint')}</span> : null}
      bulkActions={ids => <Button asChild size="sm"><PlatformLink href={linkTo('productivity-overview', { global: { selection: ids } })}>{m('equipmentMasterAnalyzeSelectedEquipment')}</PlatformLink></Button>}
      // Table-owned export (#173): the page only says how to read the rows; the table builds the file.
      exportRows={(request, signal) => exports.fetch(exportParams({ q }, request), signal)}
      exportFilterSummary={exportFilterSummary({ q }, lang)} exportContext={equipmentExportEndpoint.context}
      emptyAction={clearButton}
    /></div>} />

  </PlatformPage>;
}
