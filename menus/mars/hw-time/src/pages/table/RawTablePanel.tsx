import type { TextParams } from '@ap/kernel';
import { useMessages, formatText } from '@ap/kernel';
import { HW_TIME_MESSAGES } from '../../messages';
import { panelDeclarations } from '../analysis/panelDeclaration';
/**
 * HW Time raw table (ADR-0078): paging, export and a detail drawer over existing SDK pieces.
 * In the linked workspace, raw rows stay at the root grain and can be filtered by the declared analysis selection.
 * Standalone consumers follow the §12.7 drill level; entry is a visible `<값> 들어가기` button in a series cell.
 * Export belongs to the table (`exportRows` + note + summary). The drawer reuses the shared stack and trend panels with that one row.
 */
import { ChevronRight, Inbox, PanelRight } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useI18n, useMenuFetch, usePlatform, type PageProps } from '@ap/kernel';
import {
  DetailDrawer, encodeTableSort, PageKeyWarning, PlatformDataTable, QueryView, RowAction, StateMessage, TableUrlWarning, useTableUrlState, type PlatformColumn, type TableUrlState,
} from '@ap/components';
import { Button, StatusBadge } from '@ap/ui';
import { useHwTimeFilterContext } from '../../shared/HwTimeFilterContext';
import { useHwTimeDrillRules } from '../../shared/useHwTimeDrillRules';
import { filterRow } from '../../shared/filterData';
import { worstJudgement } from '../../shared/JudgementSummary';
import { htmStatusText, htmStatusView } from '../../shared/htm';
import { isThemeColorToken, readColorToken } from '@ap/ui/theme';
import { HW_TIME_MODULE_TYPES, MOTION_EQUIPMENT_KEY, hwTime, isHwTimeTrendId, type HwTimeBlock, type HwTimeLevelData, type HwTimeRow, type HwTimeSeries, type HwTimeTableRow } from '../../endpoints';
import { shownDrill } from '../../shared/shownDrill';
import { useHwTimeLevel, useHwTimeTrend } from '../../shared/data';
import { formatSeconds, missingText, rowIdLabel } from '../../shared/format';
import { StackPanel } from '../../shared/panels/StackPanel';
import { TrendPanel } from '../../shared/panels/TrendPanel';
import {
  SORT_FIELDS, auxiliaryText, columnSizeOf, drillParams, exportFilterSummary, exportNumber, exportParams, levelOf, levelRowsOf, seriesIds, unitOf, valueText, type TableLevel,
} from './tableData';
import { isAnswered } from '@ap/contracts';

const NO_ROWS: HwTimeRow[] = [];

function EnterButton({ ko, value, onClick }: { ko: boolean; value: string; onClick: () => void }) {
  const m = (key: keyof typeof HW_TIME_MESSAGES, params?: TextParams) => formatText(HW_TIME_MESSAGES[key], (ko ? 'ko' : 'en'), params);
  return <button type="button" aria-label={m('tablePageEnter', { value: String(value) })} onClick={onClick}
    className="inline-flex size-6 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-sunken hover:text-text-primary">
    <ChevronRight className="size-3.5" aria-hidden />
  </button>;
}

/** What the drawer's trend is: `hwTime.trend` is the sub-item's daily total over all Modules (an equipment id: the equipment's), whatever the level. */
const trendCaption = (depth: number, ko: boolean) => depth === 0 ? (formatText(HW_TIME_MESSAGES.tablePageEquipmentDailyTotal, (ko ? 'ko' : 'en')))
  : formatText(HW_TIME_MESSAGES.tablePageSubItemDailyTotalOverAllModules, (ko ? 'ko' : 'en'));

/** One line per series of the row: colour swatch (the series' theme token), name and value with unit; a missing value reads 미측정. */
function SeriesLegend({ series, values, lang }: { series: readonly HwTimeSeries[]; values: Record<string, number | null>; lang: 'ko' | 'en' }) {
  const m = (key: keyof typeof HW_TIME_MESSAGES, params?: TextParams) => formatText(HW_TIME_MESSAGES[key], lang, params);
  return <ul aria-label={m('tablePageBreakdownLegend')} className="flex flex-col gap-1 text-xs text-text-secondary">
    {series.map(item => {
      const value = values[item.id] ?? null;
      return <li key={item.id} className="flex items-center gap-2">
        {/* eslint-disable-next-line shadcn/no-inline-styles -- swatch color is the series' theme token resolved at runtime (as in LegendTree) */}
        <span data-legend-swatch aria-hidden className="inline-block size-3 shrink-0 rounded-sm" style={{ backgroundColor: isThemeColorToken(item.color) ? readColorToken(item.color) : undefined }} />
        <span className="min-w-0 flex-1 truncate">{item.name}</span>
        <span className="tabular text-text-primary">{value === null ? missingText(lang) : `${formatSeconds(value, lang)} ${unitOf(lang)}`}</span>
      </li>;
    })}
  </ul>;
}

export function useRawTableColumns(level: TableLevel, motion: string | null, checkedSeries?: readonly string[], enter?: (value: string) => void) {
  const m = useMessages(HW_TIME_MESSAGES);
  const { lang } = useI18n();
  const activeSeries = checkedSeries ?? seriesIds(level, motion);
  return useMemo<PlatformColumn<HwTimeTableRow>[]>(() => {
    const project = (row: HwTimeTableRow) => checkedSeries ? filterRow(row, activeSeries) : row;
    const unit = unitOf(lang);
    const size = columnSizeOf(level);
    const series: PlatformColumn<HwTimeTableRow>[] = activeSeries.filter(id => level !== 2 || id === motion).map(id => ({
      id, header: `${id} (${unit})`, align: 'right', size: size.value,
      value: row => project(row).values[id] ?? null,
      cell: row => row.auxiliary ? null : <span className="inline-flex items-center justify-end gap-1">
        <span className="tabular whitespace-nowrap">{valueText(project(row).values[id], lang)}</span>
        {level < 2 && enter && <EnterButton ko={(lang === 'ko')} value={id} onClick={() => enter(id)} />}
      </span>,
      exportValue: row => row.auxiliary ? null : exportNumber(project(row).values[id], lang),
    }));
    return [
      { id: 'equipmentId', header: 'EquipmentID', size: size.equipmentId, cell: row => <span className="t-mono">{row.equipmentId}</span> },
      ...(level === 0 ? [] : [{
        id: 'subItem', header: m('tablePageSubItem'), size: size.subItem,
        value: (row: HwTimeTableRow) => row.auxiliary ? auxiliaryText(row, lang) : row.subItem ?? '',
        cell: (row: HwTimeTableRow) => <span className="t-mono">{row.auxiliary ? auxiliaryText(row, lang) : row.subItem}</span>,
      }]),
      ...series,
      {
        id: 'judgement', header: m('judgement'), size: 160, sortable: false,
        value: row => { const judgement = worstJudgement(project(row).judgements); return judgement ? htmStatusText(judgement, lang) : ''; },
        cell: row => {
          const judgement = worstJudgement(project(row).judgements);
          if (!judgement || row.auxiliary) return null;
          const status = htmStatusView(judgement, lang);
          return <StatusBadge tone={status?.tone ?? 'neutral'}>{htmStatusText(judgement, lang)}</StatusBadge>;
        },
      },
      {
        id: 'total', header: `${m('tablePageTotal')} (${unit})`, align: 'right', size: size.total,
        value: row => project(row).total,
        cell: row => row.auxiliary ? null : <span className="tabular whitespace-nowrap">{valueText(project(row).total, lang)}</span>,
        exportValue: row => row.auxiliary ? null : exportNumber(project(row).total, lang),
      },
    ];
  }, [m, lang, level, motion, checkedSeries, activeSeries, enter]);
}

const FOCUS_RULE = [{ key: 'focus', label: { ko: '열린 행', en: 'Open row' }, valid: isHwTimeTrendId }];
const NO_FOCUS_RULE: typeof FOCUS_RULE = [];

export default function RawTablePanel({ linked = false, analysis, local = false }: PageProps & {
  linked?: boolean;
  analysis?: { equipment: readonly string[]; level: ReturnType<typeof useHwTimeLevel> };
  /** A second raw table on the screen (#2862 ②): its open row and paging stay in this panel, so the address's `focus`/`page`/`sort` belong to the first. */
  local?: boolean;
}) {
  const m = useMessages(HW_TIME_MESSAGES);
  const { lang } = useI18n();
  const { pageParam, setPage } = usePlatform();
  const filter = useHwTimeFilterContext();
  const module = linked ? null : pageParam('drillModule');
  const motion = linked ? null : pageParam('drillMotion');
  const level = levelOf(module, motion);
  const checkedSeries = level === 0 ? filter?.modules : filter?.motions;
  const activeSeries = checkedSeries ?? seriesIds(level, motion);
  const queryDrill = { ...drillParams(module, motion), ...(filter ? { moduleType: filter.moduleType.id } : {}), ...(analysis ? { [MOTION_EQUIPMENT_KEY]: analysis.equipment } : {}) };
  const [localFocus, setLocalFocus] = useState<string | null>(null);
  const focus = local ? localFocus : pageParam('focus');
  const setFocus = (id: string | null) => { if (local) setLocalFocus(id); else setPage({ focus: id }); };
  // The address's `focus` belongs to the first table: a local one neither checks nor clears it (#2862 ② R C7).
  const focusKeys = useHwTimeDrillRules(local ? NO_FOCUS_RULE : FOCUS_RULE);
  const tableState = useTableUrlState(SORT_FIELDS);
  // Chart-only sort values from old steps/compare links are ignored, not rejected as malformed table sorts.
  const legacyChartSort = linked && ['total-desc', 'total-asc'].includes(pageParam('sort') ?? '');
  const { sentences, parsedPage } = tableState;
  // A local table keeps page and one-column sort in this panel, under the same single-sort contract as the address (R C12).
  const [localState, setLocalState] = useState<Pick<TableUrlState, 'page' | 'sorting'> & { query: string }>({ page: null, sorting: [], query: '' });
  // The page owns its resets (TableUrlState): a new query starts the local table on its first page again.
  const queryKey = JSON.stringify(queryDrill);
  if (local && localState.query !== queryKey) setLocalState(current => ({ ...current, page: current.query === '' ? current.page : null, query: queryKey }));
  const tableInvalid = local ? false : legacyChartSort ? !parsedPage.ok : tableState.invalid;
  const urlState: TableUrlState | undefined = local ? { page: localState.page, sorting: localState.sorting, onChange: ({ page, sorting }) => setLocalState(current => ({ ...current, page, sorting })) } : legacyChartSort && parsedPage.ok ? {
    page: parsedPage.page === 1 ? null : parsedPage.page, sorting: [],
    onChange: ({ page, sorting }, reason) => setPage({ sort: encodeTableSort(sorting), page: page === null ? null : String(page) }, { replace: reason === 'clamp' }),
  } : tableState.urlState;

  const pages = useMenuFetch(hwTime.tableRows);
  const exports = useMenuFetch(hwTime.exportRows);

  // The level response gives the empty/partial states and the drawer's row at every level; the table pages through its own fetch.
  const localLevel = useHwTimeLevel(drillParams(module, motion), !analysis && !focusKeys.invalid);
  const levelQ = analysis?.level ?? localLevel;
  // The row counts below describe the kept level result (#1365): they name the Module/Motion it was loaded with.
  const kept = shownDrill(levelQ, drillParams(module, motion));
  const response: HwTimeLevelData | null = levelQ.response && isAnswered(levelQ.response.outcome) && !(analysis && levelQ.showingPrevious) ? levelQ.response.data : null;
  const listed = response ? levelRowsOf(response) : NO_ROWS;
  const dataRows = listed.filter(row => !row.auxiliary);
  const partial = dataRows.filter(row => Object.values(row.values).some(value => value === null)).length;
  const emptyDetail = level === 2 && response !== null && dataRows.length === 0;
  const focusRow = focus === null ? undefined : dataRows.find(row => row.id === focus);
  // A failed level read is not an absent row: the summary and the drawer say so and retry, while the paged table keeps working.
  const levelFailure = levelQ.response && !isAnswered(levelQ.response.outcome) ? levelQ.response : null;
  const detailPending = focus !== null && focusRow === undefined && response === null;

  const trendable = focusRow !== undefined && isHwTimeTrendId(focusRow.id);
  const trendQ = useHwTimeTrend(trendable ? [focusRow.id] : [], trendable && !focusKeys.invalid);

  // The raw table's Module action follows the same type → Motion → Module path as the charts.
  const enter = useCallback((value: string) => {
    const type = HW_TIME_MODULE_TYPES.find(type => (type.modules as readonly string[]).includes(value));
    if (!type) return;
    const selectedMotion = pageParam('drillMotion');
    const motion = selectedMotion && (type.motions as readonly string[]).includes(selectedMotion) ? selectedMotion : null;
    // A Module needs a Motion now: first open its type when no compatible Motion has been chosen.
    setPage({ moduleType: type.id, drillMotion: motion, drillModule: motion ? value : null, row: null, trend: null, focus: null });
  }, [pageParam, setPage]);
  const columns = useRawTableColumns(level, motion, checkedSeries, enter);

  const megRows = listed.length - dataRows.length;
  const rowCount = megRows > 0 ? (m('tablePageSubItemRowsMegRows', { length: String(dataRows.length), megRows: String(megRows) }))
    : (m('tablePageRows', { length: String(dataRows.length) }));
  const summary = kept.module === null ? undefined
    : `Module ${kept.module}${kept.motion ? ` · Motion ${kept.motion}` : ''}${response ? ` · ${rowCount}${partial > 0 ? ` · ${m('tablePagePartlyNotMeasured', { partial: String(partial) })}` : ''}` : ''}`;

  const drawerBlock: HwTimeBlock | null = focusRow && response ? {
    series: (response.level === 2 ? response.detail?.series : response.series) ?? [],
    rows: [focusRow], totals: { values: focusRow.values, total: focusRow.total },
  } : null;
  const closeDrawer = () => setFocus(null);

  const table = tableInvalid ? <TableUrlWarning sentences={sentences} />
    : emptyDetail ? <StateMessage icon={<Inbox className="size-4" aria-hidden />} title={m('tablePageNoRecordsForModule', { module: String(kept.module), motion: String(kept.motion) })}
      body={m('tablePageOtherMotionsOfThisModuleAreOne')} />
      : <PlatformDataTable<HwTimeTableRow> fill editableColumnGroups
        title={m('tablePageHwTimeTable')} ariaLabel={m('tablePageHwTimeOperationTimeTable')}
        subtitle={level === 2 ? undefined : (m('tablePageUseTheArrowBesideAValueTo'))}
        columns={columns} getRowId={row => row.id} filterKey={JSON.stringify(queryDrill)} preferenceKey={`hw-time-table:columns:v1:L${level + 1}`}
        activeRowId={focus} pageSize={25} urlState={urlState}
        loadPage={(query, signal) => pages.fetch({ ...queryDrill, ...query }, signal)}
        rowAction={(row, { compact }) => row.auxiliary ? null
          : <RowAction compact={compact} icon={PanelRight} label={m('tablePageView', { value: String(rowIdLabel(row.id)) })} text={m('tablePageView2')} onClick={() => setFocus(row.id)} />}
        exportRows={panelDeclarations.table.csvExport ? async (request, signal) => {
          const response = await exports.fetch(exportParams(queryDrill, request), signal);
          return response.data && filter ? { ...response, data: response.data.map(row => filterRow(row, activeSeries)) } : response;
        } : undefined}
        exportNote={m('tablePageRowsOfTheCurrentLevelValuesNot')}
        exportFilterSummary={exportFilterSummary(module, motion, lang === 'ko')}
        exportContext={hwTime.exportRows.context}
      />;

  return <>
    {summary && <p className="t-caption text-text-secondary">{summary}</p>}
      {levelFailure && <QueryView query={levelQ} widgetName={m('tablePageLevelSummary')} compact>{() => null}</QueryView>}
      {focusKeys.invalid ? <PageKeyWarning sentences={focusKeys.sentences} onRecover={focusKeys.recover} /> : <>
        {focus !== null && response !== null && !focusRow && <div role="status" className="text-sm"><p>{m('tablePageRowNotInThisLevel')}</p><Button variant="secondary" size="sm" onClick={closeDrawer}>{m('tablePageClearRowSelection')}</Button></div>}
        {table}
      </>}
    
    {detailPending && <DetailDrawer key={focus} id={rowIdLabel(focus)} subtitle={m('tablePageRowDetailsSyntheticData')}
      onClose={closeDrawer}
      tabs={[{ id: 'summary', label: m('tablePageBreakdown'), content: <QueryView query={levelQ} widgetName={m('tablePageRowDetails')} compact>{() => null}</QueryView> }]} />}
    {drawerBlock && focusRow && <DetailDrawer key={focusRow.id}
      id={rowIdLabel(focusRow.id)} subtitle={m('tablePageRowDetailsSyntheticData2')}
      onClose={closeDrawer}
      tabs={[{
        id: 'summary', label: m('tablePageBreakdown2'),
        content: <div className="flex flex-col gap-3">
          <div className="flex h-40 flex-col">
            <StackPanel chartId="hw-time-table-drawer-stack" title={m('tablePageOperationTimeBreakdown')} block={drawerBlock}
              visibleSeriesIds={drawerBlock.series.map(item => item.id)} />
          </div>
          <SeriesLegend series={drawerBlock.series} values={focusRow.values} lang={lang} />
          <div className="flex flex-col"><TrendPanel chartId="hw-time-table-drawer-trend" title={m('tablePageDailyTrend')} rowIds={[focusRow.id]} query={trendQ} level={level}
            description={trendCaption(level, lang === 'ko')} /></div>
        </div>,
      }]} />}
  </>;
}
