import type { TextParams } from '@ap/kernel';
import { useMessages, formatText } from '@ap/kernel';
import { HW_TIME_MESSAGES } from '../../messages';
/**
 * HW Time 표 (ADR-0078, 06 §13·§15): the same HW Time data as a Management-style table with a detail drawer, over existing SDK pieces.
 * The table follows the §12.7 drill level; entry is a visible `<값> 들어가기` button in a series cell, never a whole-row click.
 * Export belongs to the table (`exportRows` + note + summary). The drawer reuses the shared stack and trend panels with that one row.
 */
import { ChevronRight, Inbox, PanelRight } from 'lucide-react';
import { useMemo } from 'react';
import { useDrill, useI18n, useMenuFetch, usePlatform, type PageProps } from '@ap/kernel';
import {
  DetailDrawer, DrillLayout, PlatformDataTable, PlatformPage, QueryView, RowAction, StateMessage, TableUrlWarning, useTableUrlState, type PlatformColumn,
} from '@ap/components';
import { isThemeColorToken, readColorToken } from '@ap/ui/theme';
import { hwTime, isHwTimeTrendId, type HwTimeBlock, type HwTimeLevelData, type HwTimeRow, type HwTimeSeries, type HwTimeTableRow } from '../../endpoints';
import { shownDrill } from '../../shared/shownDrill';
import { useHwTimeLevel, useHwTimeTrend } from '../../shared/data';
import { formatSeconds, missingText, rowIdLabel } from '../../shared/format';
import { StackPanel } from '../../shared/panels/StackPanel';
import { TrendPanel } from '../../shared/panels/TrendPanel';
import {
  SORT_FIELDS, auxiliaryText, columnSizeOf, drillParams, exportFilterSummary, exportNumber, exportParams, levelOf, levelRowsOf, seriesIds, unitOf, valueText,
} from './tableData';

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

export default function TablePage(_props: PageProps) {
  const m = useMessages(HW_TIME_MESSAGES);
  const { lang } = useI18n();
  const { pageParam, setPage } = usePlatform();
  const drill = useDrill();
  const module = drill.levels[0]?.value ?? null;
  const motion = drill.levels[1]?.value ?? null;
  const level = levelOf(module, motion);
  const focus = pageParam('focus');
  const { urlState, invalid: tableInvalid, sentences } = useTableUrlState(SORT_FIELDS);

  const pages = useMenuFetch(hwTime.tableRows);
  const exports = useMenuFetch(hwTime.exportRows);

  // The level response gives the empty/partial states and the drawer's row at every level; the table pages through its own fetch.
  const levelQ = useHwTimeLevel(drillParams(module, motion));
  // The row counts below describe the kept level result (#1365): they name the Module/Motion it was loaded with.
  const kept = shownDrill(levelQ, drillParams(module, motion));
  const response: HwTimeLevelData | null = levelQ.response?.outcome === 'ok' ? levelQ.response.data : null;
  const listed = response ? levelRowsOf(response) : NO_ROWS;
  const dataRows = listed.filter(row => !row.auxiliary);
  const partial = dataRows.filter(row => Object.values(row.values).some(value => value === null)).length;
  const emptyDetail = level === 2 && response !== null && dataRows.length === 0;
  const focusRow = focus === null ? undefined : dataRows.find(row => row.id === focus);
  // A failed level read is not an absent row: the summary and the drawer say so and retry, while the paged table keeps working.
  const levelFailure = levelQ.response && levelQ.response.outcome !== 'ok' && levelQ.response.outcome !== 'empty' ? levelQ.response : null;
  const detailPending = focus !== null && focusRow === undefined && response === null;

  const trendable = focusRow !== undefined && isHwTimeTrendId(focusRow.id);
  const trendQ = useHwTimeTrend(trendable ? [focusRow.id] : [], trendable);

  const columns = useMemo<PlatformColumn<HwTimeTableRow>[]>(() => {
    const unit = unitOf(lang);
    const size = columnSizeOf(level);
    const enter = (value: string) => drill.enter(level === 0 ? 'drillModule' : 'drillMotion', value);
    const series: PlatformColumn<HwTimeTableRow>[] = seriesIds(level, motion).map(id => ({
      id, header: `${id} (${unit})`, align: 'right', size: size.value,
      value: row => (row[id] as number | null | undefined) ?? null,
      cell: row => row.auxiliary ? null : <span className="inline-flex items-center justify-end gap-1">
        <span className="tabular whitespace-nowrap">{valueText(row.values[id], lang)}</span>
        {level < 2 && <EnterButton ko={(lang === 'ko')} value={id} onClick={() => enter(id)} />}
      </span>,
      exportValue: row => row.auxiliary ? null : exportNumber(row.values[id], lang),
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
        id: 'total', header: `${m('tablePageTotal')} (${unit})`, align: 'right', size: size.total,
        value: row => row.total,
        cell: row => row.auxiliary ? null : <span className="tabular whitespace-nowrap">{valueText(row.total, lang)}</span>,
        exportValue: row => row.auxiliary ? null : exportNumber(row.total, lang),
      },
    ];
  }, [m, lang, level, motion, drill]);

  const megRows = listed.length - dataRows.length;
  const rowCount = megRows > 0 ? (m('tablePageSubItemRowsMegRows', { length: String(dataRows.length), megRows: String(megRows) }))
    : (m('tablePageRows', { length: String(dataRows.length) }));
  const summary = kept.module === null ? undefined
    : `Module ${kept.module}${kept.motion ? ` · Motion ${kept.motion}` : ''}${response ? ` · ${rowCount}${partial > 0 ? ` · ${m('tablePagePartlyNotMeasured', { partial: String(partial) })}` : ''}` : ''}`;

  const drawerBlock: HwTimeBlock | null = focusRow && response ? {
    series: (response.level === 2 ? response.detail?.series : response.series) ?? [],
    rows: [focusRow], totals: { values: focusRow.values, total: focusRow.total },
  } : null;
  const closeDrawer = () => setPage({ focus: null });

  const table = tableInvalid ? <TableUrlWarning sentences={sentences} />
    : emptyDetail ? <StateMessage icon={<Inbox className="size-4" aria-hidden />} title={m('tablePageNoRecordsForModule', { module: String(kept.module), motion: String(kept.motion) })}
      body={m('tablePageOtherMotionsOfThisModuleAreOne')} />
      : <PlatformDataTable<HwTimeTableRow>
        title={m('tablePageHwTimeTable')} ariaLabel={m('tablePageHwTimeOperationTimeTable')}
        subtitle={level === 2 ? undefined : (m('tablePageUseTheArrowBesideAValueTo'))}
        columns={columns} getRowId={row => row.id} filterKey={`${module ?? ''}/${motion ?? ''}`} preferenceKey={`hw-time-table:columns:v1:L${level + 1}`}
        activeRowId={focus} pageSize={25} urlState={urlState}
        loadPage={(query, signal) => pages.fetch({ ...drillParams(module, motion), ...query }, signal)}
        rowAction={(row, { compact }) => row.auxiliary ? null
          : <RowAction compact={compact} icon={PanelRight} label={m('tablePageView', { value: String(rowIdLabel(row.id)) })} text={m('tablePageView2')} onClick={() => setPage({ focus: row.id })} />}
        exportRows={(request, signal) => exports.fetch(exportParams(drillParams(module, motion), request), signal)}
        exportNote={m('tablePageRowsOfTheCurrentLevelValuesNot')}
        exportFilterSummary={exportFilterSummary(module, motion, lang === 'ko')}
        exportContext={hwTime.exportRows.context}
      />;

  return <PlatformPage layout="fill">
    <DrillLayout fill summary={summary}>
      {levelFailure && <QueryView query={levelQ} widgetName={m('tablePageLevelSummary')} compact>{() => null}</QueryView>}
      {table}
    </DrillLayout>
    {detailPending && <DetailDrawer key={focus} title={<span className="t-mono">{rowIdLabel(focus)}</span>} subtitle={m('tablePageRowDetailsSyntheticData')}
      onClose={closeDrawer}
      tabs={[{ id: 'summary', label: m('tablePageBreakdown'), content: <QueryView query={levelQ} widgetName={m('tablePageRowDetails')} compact>{() => null}</QueryView> }]} />}
    {drawerBlock && focusRow && <DetailDrawer key={focusRow.id}
      title={<span className="t-mono">{rowIdLabel(focusRow.id)}</span>} subtitle={m('tablePageRowDetailsSyntheticData2')}
      onClose={closeDrawer}
      tabs={[{
        id: 'summary', label: m('tablePageBreakdown2'),
        content: <div className="flex flex-col gap-3">
          <div className="flex h-40 flex-col">
            <StackPanel chartId="hw-time-table-drawer-stack" title={m('tablePageOperationTimeBreakdown')} block={drawerBlock}
              visibleSeriesIds={drawerBlock.series.map(item => item.id)} />
          </div>
          <SeriesLegend series={drawerBlock.series} values={focusRow.values} lang={lang} />
          <div className="flex flex-col"><TrendPanel chartId="hw-time-table-drawer-trend" title={m('tablePageDailyTrend')} rowIds={[focusRow.id]} query={trendQ} level={drill.depth}
            description={trendCaption(drill.depth, lang === 'ko')} /></div>
        </div>,
      }]} />}
  </PlatformPage>;
}
