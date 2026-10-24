/**
 * HW Time 표 (ADR-0078, 06 §13·§15): the same HW Time data as a Management-style table with a detail drawer, over existing SDK pieces.
 * The table follows the §12.7 drill level; entry is a visible `<값> 들어가기` button in a series cell, never a whole-row click.
 * Export belongs to the table (`exportRows` + note + summary). The drawer reuses the shared stack and trend panels with that one row.
 */
import { ChevronRight, Inbox, PanelRight } from 'lucide-react';
import { useMemo } from 'react';
import { useDrill, useI18n, useMenuFetch, usePlatform, type PageProps } from '@ap/kernel';
import {
  DetailDrawer, DrillLayout, OutcomeView, PlatformDataTable, PlatformPage, QueryView, RowAction, StateMessage, TableUrlWarning, useTableUrlState, type PlatformColumn,
} from '@ap/components';
import { isThemeColorToken, readColorToken } from '@ap/ui/theme';
import { hwTime, isHwTimeTrendId, type HwTimeBlock, type HwTimeLevelData, type HwTimeRow, type HwTimeSeries, type HwTimeTableRow } from '../../endpoints';
import { useHwTimeLevel, useHwTimeTrend } from '../../shared/data';
import { formatSeconds, missingText, rowIdLabel } from '../../shared/format';
import { StackPanel } from '../../shared/panels/StackPanel';
import { TrendPanel } from '../../shared/panels/TrendPanel';
import {
  COLUMN_SIZE, SORT_FIELDS, auxiliaryText, drillParams, exportFilterSummary, exportNumber, exportParams, levelOf, levelRowsOf, seriesIds, unitOf, valueText,
} from './tableData';

const NO_ROWS: HwTimeRow[] = [];

function EnterButton({ ko, value, onClick }: { ko: boolean; value: string; onClick: () => void }) {
  return <button type="button" aria-label={ko ? `${value} 들어가기` : `Enter ${value}`} onClick={onClick}
    className="inline-flex size-6 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-sunken hover:text-text-primary">
    <ChevronRight className="size-3.5" aria-hidden />
  </button>;
}

/** What the drawer's trend is: `hwTime.trend` is the sub-item's daily total over all Modules (an equipment id: the equipment's), whatever the level. */
const trendCaption = (depth: number, ko: boolean) => depth === 0 ? (ko ? '설비 전체 일 합계' : 'Equipment daily total')
  : ko ? '하위 항목 전체 일 합계 · Module·Motion과 무관' : 'Sub-item daily total over all Modules · independent of Module·Motion';

/** One line per series of the row: colour swatch (the series' theme token), name and value with unit; a missing value reads 미측정. */
function SeriesLegend({ series, values, lang }: { series: readonly HwTimeSeries[]; values: Record<string, number | null>; lang: 'ko' | 'en' }) {
  return <ul aria-label={lang === 'ko' ? '구성 범례' : 'Breakdown legend'} className="flex flex-col gap-1 text-xs text-text-secondary">
    {series.map(item => {
      const value = values[item.id] ?? null;
      return <li key={item.id} className="flex items-center gap-2">
        {/* eslint-disable-next-line shadcn/no-inline-styles -- swatch color is the series' theme token resolved at runtime (as in LegendTree) */}
        <span data-legend-swatch aria-hidden className="inline-block size-3 shrink-0 rounded-sm" style={{ backgroundColor: isThemeColorToken(item.color) ? readColorToken(item.color) : undefined }} />
        <span className="min-w-0 flex-1 truncate">{item.name}</span>
        <span className="tabular text-text-primary">{value === null ? missingText(lang) : `${formatSeconds(value)} ${unitOf(lang)}`}</span>
      </li>;
    })}
  </ul>;
}

export default function TablePage(_props: PageProps) {
  const { lang } = useI18n();
  const ko = lang === 'ko';
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
  const levelQ = useHwTimeLevel(drillParams(module, motion), drill.invalid === null);
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
    const enter = (value: string) => drill.enter(level === 0 ? 'drillModule' : 'drillMotion', value);
    const series: PlatformColumn<HwTimeTableRow>[] = seriesIds(level, motion).map(id => ({
      id, header: `${id} (${unit})`, align: 'right', size: COLUMN_SIZE.value,
      value: row => (row[id] as number | null | undefined) ?? null,
      cell: row => row.auxiliary ? null : <span className="inline-flex items-center justify-end gap-1">
        <span className="tabular">{valueText(row.values[id], lang)}</span>
        {level < 2 && <EnterButton ko={ko} value={id} onClick={() => enter(id)} />}
      </span>,
      exportValue: row => row.auxiliary ? null : exportNumber(row.values[id], lang),
    }));
    return [
      { id: 'equipmentId', header: 'EquipmentID', size: COLUMN_SIZE.equipmentId, cell: row => <span className="t-mono">{row.equipmentId}</span> },
      ...(level === 0 ? [] : [{
        id: 'subItem', header: ko ? '하위 항목' : 'Sub-item', size: COLUMN_SIZE.subItem,
        value: (row: HwTimeTableRow) => row.auxiliary ? auxiliaryText(row, lang) : row.subItem ?? '',
        cell: (row: HwTimeTableRow) => <span className="t-mono">{row.auxiliary ? auxiliaryText(row, lang) : row.subItem}</span>,
      }]),
      ...series,
      {
        id: 'total', header: `${ko ? '합계' : 'Total'} (${unit})`, align: 'right', size: COLUMN_SIZE.total,
        value: row => row.total,
        cell: row => row.auxiliary ? null : <span className="tabular">{valueText(row.total, lang)}</span>,
        exportValue: row => row.auxiliary ? null : exportNumber(row.total, lang),
      },
    ];
  }, [lang, ko, level, motion, drill]);

  const megRows = listed.length - dataRows.length;
  const rowCount = megRows > 0 ? (ko ? `설비 하위 항목 ${dataRows.length}행 · MEG ${megRows}행` : `${dataRows.length} sub-item rows · MEG ${megRows} rows`)
    : (ko ? `${dataRows.length}행` : `${dataRows.length} rows`);
  const summary = module === null ? undefined
    : `Module ${module}${motion ? ` · Motion ${motion}` : ''}${response ? ` · ${rowCount}${partial > 0 ? ` · ${ko ? `일부 미측정 ${partial}행` : `${partial} partly not measured`}` : ''}` : ''}`;

  const drawerBlock: HwTimeBlock | null = focusRow && response ? {
    series: (response.level === 2 ? response.detail?.series : response.series) ?? [],
    rows: [focusRow], totals: { values: focusRow.values, total: focusRow.total },
  } : null;
  const closeDrawer = () => setPage({ focus: null });

  const table = tableInvalid ? <TableUrlWarning sentences={sentences} />
    : emptyDetail ? <StateMessage icon={<Inbox className="size-4" aria-hidden />} title={ko ? `${module} Module에는 ${motion} 동작 기록이 없습니다` : `No ${motion} records for Module ${module}`}
      body={ko ? 'Module의 다른 Motion은 한 단계 위에서 볼 수 있습니다.' : 'Other Motions of this Module are one level up.'} />
      : <PlatformDataTable<HwTimeTableRow>
        title={ko ? 'HW Time 표' : 'HW Time table'} ariaLabel={ko ? 'HW Time 동작시간 표' : 'HW Time operation time table'}
        subtitle={level === 2 ? undefined : (ko ? '값 옆 화살표로 한 단계 들어갑니다.' : 'Use the arrow beside a value to drill in.')}
        columns={columns} getRowId={row => row.id} filterKey={`${module ?? ''}/${motion ?? ''}`} preferenceKey={`hw-time-table:columns:v1:L${level + 1}`}
        activeRowId={focus} pageSize={25} urlState={urlState}
        loadPage={(query, signal) => pages.fetch({ ...drillParams(module, motion), ...query }, signal)}
        rowAction={(row, { compact }) => row.auxiliary ? null
          : <RowAction compact={compact} icon={PanelRight} label={ko ? `${rowIdLabel(row.id)} 보기` : `View ${rowIdLabel(row.id)}`} text={ko ? '보기' : 'View'} onClick={() => setPage({ focus: row.id })} />}
        exportRows={(request, signal) => exports.fetch(exportParams(drillParams(module, motion), request), signal)}
        exportNote={ko ? '현재 단계의 행이며 미측정 값은 ‘미측정’으로 적힙니다' : 'Rows of the current level; values not measured are written as “Not measured”'}
        exportFilterSummary={exportFilterSummary(module, motion, ko)}
        exportContext={hwTime.exportRows.context}
      />;

  return <PlatformPage layout="fill">
    <DrillLayout fill summary={summary}>
      {levelFailure && <OutcomeView response={levelFailure} onRetry={levelQ.refetch} compact>{() => null}</OutcomeView>}
      {table}
    </DrillLayout>
    {detailPending && <DetailDrawer key={focus} title={<span className="t-mono">{rowIdLabel(focus)}</span>} subtitle={ko ? '행 상세 · 합성 데이터' : 'Row details · synthetic data'}
      onClose={closeDrawer}
      tabs={[{ id: 'summary', label: ko ? '구성' : 'Breakdown', content: <QueryView query={levelQ} widgetName={ko ? '행 상세' : 'Row details'} compact>{() => null}</QueryView> }]} />}
    {drawerBlock && focusRow && <DetailDrawer key={focusRow.id}
      title={<span className="t-mono">{rowIdLabel(focusRow.id)}</span>} subtitle={ko ? '행 상세 · 합성 데이터' : 'Row details · synthetic data'}
      onClose={closeDrawer}
      tabs={[{
        id: 'summary', label: ko ? '구성' : 'Breakdown',
        content: <div className="flex flex-col gap-3">
          <div className="flex h-40 flex-col">
            <StackPanel chartId="hw-time-table-drawer-stack" title={ko ? '동작시간 구성' : 'Operation time breakdown'} block={drawerBlock}
              visibleSeriesIds={drawerBlock.series.map(item => item.id)} />
          </div>
          <SeriesLegend series={drawerBlock.series} values={focusRow.values} lang={lang} />
          <div className="flex flex-col"><TrendPanel chartId="hw-time-table-drawer-trend" title={ko ? '일 추세' : 'Daily trend'} rowIds={[focusRow.id]} query={trendQ} level={drill.depth}
            description={trendCaption(drill.depth, ko)} /></div>
        </div>,
      }]} />}
  </PlatformPage>;
}
