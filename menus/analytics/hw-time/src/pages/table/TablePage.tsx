/**
 * HW Time 표 (ADR-0078, 06 §13·§15): the same HW Time data as a Management-style table with a detail drawer, over existing SDK pieces.
 * The table follows the §12.7 drill level; entry is a visible `<값> 들어가기` button in a series cell, never a whole-row click.
 * Export belongs to the table (`exportRows` + note + summary). The drawer reuses the shared stack and trend panels with that one row.
 */
import { ChevronRight, Inbox, PanelRight } from 'lucide-react';
import { useMemo } from 'react';
import { useDrill, useI18n, useMenuFetch, usePlatform, type PageProps } from '@ap/kernel';
import {
  DetailDrawer, DrillLayout, PlatformDataTable, PlatformPage, RowAction, StateMessage, TableUrlWarning, useTableUrlState, type PlatformColumn,
} from '@ap/components';
import { hwTime, isHwTimeRowId, type HwTimeBlock, type HwTimeLevelData, type HwTimeRow } from '../../endpoints';
import { useHwTimeLevel, useHwTimeTrend } from '../../shared/data';
import { rowIdLabel } from '../../shared/format';
import { StackPanel } from '../../shared/panels/StackPanel';
import { TrendPanel } from '../../shared/panels/TrendPanel';
import {
  SORT_FIELDS, auxiliaryText, drillParams, exportFilterSummary, exportParams, levelOf, levelRowsOf, pageOfLevel, seriesIds, unitOf, valueText,
} from './tableData';

const NO_ROWS: HwTimeRow[] = [];

function EnterButton({ ko, value, onClick }: { ko: boolean; value: string; onClick: () => void }) {
  return <button type="button" aria-label={ko ? `${value} 들어가기` : `Enter ${value}`} onClick={onClick}
    className="inline-flex size-6 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-sunken hover:text-text-primary">
    <ChevronRight className="size-3.5" aria-hidden />
  </button>;
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

  const levels = useMenuFetch(hwTime.levelRows);
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

  const trendable = focusRow !== undefined && isHwTimeRowId(focusRow.id);
  const trendQ = useHwTimeTrend(trendable ? [focusRow.id] : [], trendable);

  const columns = useMemo<PlatformColumn<HwTimeRow>[]>(() => {
    const unit = unitOf(lang);
    const enter = (value: string) => drill.enter(level === 0 ? 'drillModule' : 'drillMotion', value);
    const series: PlatformColumn<HwTimeRow>[] = seriesIds(level, motion).map(id => ({
      id: `values.${id}`, header: `${id} (${unit})`, align: 'right', sortable: false,
      value: row => row.values[id] ?? null,
      cell: row => row.auxiliary ? null : <span className="inline-flex items-center justify-end gap-1">
        <span className="tabular">{valueText(row.values[id], lang)}</span>
        {level < 2 && <EnterButton ko={ko} value={id} onClick={() => enter(id)} />}
      </span>,
      exportValue: row => row.auxiliary ? null : row.values[id] ?? valueText(null, lang),
    }));
    return [
      { id: 'equipmentId', header: 'EquipmentID', cell: row => <span className="t-mono">{row.equipmentId}</span> },
      ...(level === 0 ? [] : [{
        id: 'subItem', header: ko ? '하위 항목' : 'Sub-item',
        value: (row: HwTimeRow) => row.auxiliary ? auxiliaryText(row, lang) : row.subItem ?? '',
        cell: (row: HwTimeRow) => <span className="t-mono">{row.auxiliary ? auxiliaryText(row, lang) : row.subItem}</span>,
      }]),
      ...series,
      {
        id: 'total', header: `${ko ? '합계' : 'Total'} (${unit})`, align: 'right',
        value: row => row.total,
        cell: row => row.auxiliary ? null : <span className="tabular">{valueText(row.total, lang)}</span>,
        exportValue: row => row.auxiliary ? null : row.total ?? valueText(null, lang),
      },
    ];
  }, [lang, ko, level, motion, drill]);

  const summary = module === null ? undefined
    : `Module ${module}${motion ? ` · Motion ${motion}` : ''}${response ? ` · ${ko ? `${dataRows.length}행` : `${dataRows.length} rows`}${partial > 0 ? ` · ${ko ? `일부 미측정 ${partial}행` : `${partial} partly not measured`}` : ''}` : ''}`;

  const drawerBlock: HwTimeBlock | null = focusRow && response ? {
    series: (response.level === 2 ? response.detail?.series : response.series) ?? [],
    rows: [focusRow], totals: { values: focusRow.values, total: focusRow.total },
  } : null;
  const closeDrawer = () => setPage({ focus: null });

  const table = tableInvalid ? <TableUrlWarning sentences={sentences} />
    : emptyDetail ? <StateMessage icon={<Inbox className="size-4" aria-hidden />} title={ko ? `${module} Module에는 ${motion} 동작 기록이 없습니다` : `No ${motion} records for Module ${module}`}
      body={ko ? 'Module의 다른 Motion은 한 단계 위에서 볼 수 있습니다.' : 'Other Motions of this Module are one level up.'} />
      : <PlatformDataTable<HwTimeRow>
        title={ko ? 'HW Time 표' : 'HW Time table'} ariaLabel={ko ? 'HW Time 동작시간 표' : 'HW Time operation time table'}
        subtitle={level === 2 ? undefined : (ko ? '값 옆 화살표로 한 단계 들어갑니다. 내보내기는 Module·Motion을 고른 뒤 사용할 수 있습니다.' : 'Use the arrow beside a value to drill in. Export is available once a Module and Motion are chosen.')}
        columns={columns} getRowId={row => row.id} filterKey={`${module ?? ''}/${motion ?? ''}`} preferenceKey={`hw-time-table:columns:v1:L${level + 1}`}
        activeRowId={focus} pageSize={25} urlState={urlState}
        loadPage={(query, signal) => level === 2
          ? pages.fetch({ drillModule: module!, drillMotion: motion!, ...query }, signal)
          : levels.fetch(drillParams(module, motion), signal).then(result => pageOfLevel(result, query))}
        rowAction={(row, { compact }) => row.auxiliary ? null
          : <RowAction compact={compact} icon={PanelRight} label={ko ? `${rowIdLabel(row.id)} 보기` : `View ${rowIdLabel(row.id)}`} text={ko ? '보기' : 'View'} onClick={() => setPage({ focus: row.id })} />}
        exportRows={level === 2 ? (request, signal) => exports.fetch(exportParams({ drillModule: module!, drillMotion: motion! }, request), signal) : undefined}
        exportNote={ko ? '선택한 Module·Motion의 행이며 미측정 값은 ‘미측정’으로 적힙니다' : 'Rows of the chosen Module and Motion; values not measured are written as “Not measured”'}
        exportFilterSummary={level === 2 ? exportFilterSummary(module!, motion!, ko) : undefined}
        exportContext={hwTime.exportRows.context}
      />;

  return <PlatformPage layout="fill">
    <DrillLayout fill summary={summary}>{table}</DrillLayout>
    {drawerBlock && focusRow && <DetailDrawer key={focusRow.id}
      title={<span className="t-mono">{rowIdLabel(focusRow.id)}</span>} subtitle={ko ? '행 상세 · 합성 데이터' : 'Row details · synthetic data'}
      onClose={closeDrawer}
      tabs={[{
        id: 'summary', label: ko ? '구성' : 'Breakdown',
        content: <div className="flex flex-col gap-3">
          <div className="flex h-56 flex-col">
            <StackPanel chartId="hw-time-table-drawer-stack" title={ko ? '동작시간 구성' : 'Operation time breakdown'} block={drawerBlock}
              visibleSeriesIds={drawerBlock.series.map(item => item.id)} />
          </div>
          {trendable
            ? <div className="flex flex-col"><TrendPanel chartId="hw-time-table-drawer-trend" title={ko ? '행별 일 추세' : 'Daily trend by row'} rowIds={[focusRow.id]} query={trendQ} level={drill.depth} /></div>
            : <p className="t-caption text-text-muted">{ko ? '일 추세는 하위 항목 행에서 볼 수 있습니다.' : 'The daily trend is available on sub-item rows.'}</p>}
        </div>,
      }]} />}
  </PlatformPage>;
}
