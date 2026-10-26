/**
 * HW Time 비교 (ADR-0078, 06 §12.7–§12.8, #912): the same Module → Motion drill as 단계별, but a drill step never replaces the body. One `PanelWorkspace`
 * (B 주-상세: summary full height on the left; Module composition over Motion detail+trend tabs on the right) and an Inspector `rail`. Each panel
 * owns its query (summary `{}`, composition `{drillModule}`, detail `{drillModule, drillMotion}`), so a drill step only asks for the panel it fills.
 * The composition and the detail share one focused row (`row` page key, ADR-0079).
 */
import { Inbox, ListTree, SlidersHorizontal, Target } from 'lucide-react';
import type { ReactNode } from 'react';
import { useDrill, useI18n, usePlatform, type PageProps, type QueryState } from '@ap/kernel';
import { DrillLayout, Inspector, LegendTree, PageKeyWarning, PanelWorkspace, PlatformPage, QueryView, SegmentedRadio, StateMessage, type InspectorSection, type PanelWorkspacePanel, type PanelWorkspacePreset } from '@ap/components';
import { Checkbox } from '@ap/ui';
import type { ThemeColorToken } from '@ap/ui/theme';
import { HW_TIME_UNIT, type HwTimeBlock, type HwTimeLevelData } from '../../endpoints';
import { useHwTimeLevel, useHwTimeTrend } from '../../shared/data';
import { formatSeconds, missingText } from '../../shared/format';
import { StackPanel } from '../../shared/panels/StackPanel';
import { TrendPanel } from '../../shared/panels/TrendPanel';
import { useHwTimeLevelState } from '../../shared/useHwTimeLevelState';
import { useKeyedHidden } from '../../shared/useKeyedHidden';

const EMPTY_BLOCK: HwTimeBlock = { series: [], rows: [], totals: { values: {}, total: null } };

/**
 * The trend Frame needs toolbar + legend + canvas = about 239px at its 160px floor (`COMPARE_TREND_FILL_MIN`, the least the Frame accepts). The
 * trend tab shares the lower right area with the detail (about half of the right column); what does not fit scrolls inside the panel
 * (06 §12.8: the card grows and the panel body scrolls), and maximizing the panel shows the chart whole.
 */
const COMPARE_TREND_FILL_MIN = 160;

/** The trend is a tab beside the detail (the trend Frame needs more height than the right column can spare); `revealTrend` is off, so adding a row only changes the badge. */
// Below 900px the panels stack into one tab group in layout order, which for this preset reads summary → composition → detail → trend (display only, not stored).
const PRESETS: PanelWorkspacePreset[] = [
  { id: 'default', label: { ko: '기본', en: 'Default' }, layout: { type: 'branch', dir: 'row', sizes: [34, 66], children: [
    { type: 'group', panels: ['summary'] },
    { type: 'branch', dir: 'column', sizes: [48, 52], children: [{ type: 'group', panels: ['module'] }, { type: 'group', panels: ['detail', 'trend'] }] },
  ] } },
];

/** A `PanelWorkspace` panel box is not a flex container, so the chart's `flex-1` would collapse to its floor; this gives it the panel height. */
function PanelFill({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-0 flex-col">{children}</div>;
}

export default function ComparePage(_props: PageProps) {
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const { pageParam, setPage } = usePlatform();
  const drill = useDrill();
  const module = drill.levels[0]?.value ?? null;
  const motion = drill.levels[1]?.value ?? null;
  // Tree drill does what the chart segment click does at this depth: Module without one, Motion once a Module is chosen.
  const drillTo = (id: string) => drill.enter(drill.depth === 0 ? 'drillModule' : 'drillMotion', id);
  // Only a chosen Motion is a drilled node among the legend series; the Module is not one of the Motion nodes.
  const currentId = drill.depth === 2 ? motion : null;
  // Hidden series are per panel input, never per drill depth (#912 C1): the summary's Modules are independent of any drill; the composition's Motions
  // are keyed by its Module input alone (a Motion step of the same Module keeps them; the detail shares this set); the level hook owns no legend set here.
  // The URL `row` is the truth: any drill step clears it in the same navigation (manifest `drill.resetKeys`, 06 §6.4), and the Frame names only a
  // row it draws. `revealTrend` is off: adding a row to the trend leaves the detail tab active and only the trend badge changes (#912 a).
  const state = useHwTimeLevelState({ row: true });
  const { invalid, sort, sortText, row, trendRows, notice } = state;
  const [summaryHidden, setSummaryHidden] = useKeyedHidden('summary');
  const [moduleHidden, setModuleHidden] = useKeyedHidden(module ?? '');
  const enabled = drill.invalid === null && invalid === null;
  // One query per panel, each projecting only its own drill keys (#912 §5). A panel whose input is missing sends nothing; its placeholder
  // identity (`''`) differs from the summary's, so a disabled query never reads another panel's cached answer.
  const summaryQ = useHwTimeLevel({}, enabled);
  const moduleQ = useHwTimeLevel({ drillModule: module ?? '' }, enabled && module !== null);
  const detailQ = useHwTimeLevel({ drillModule: module ?? '', drillMotion: motion ?? '' }, enabled && module !== null && motion !== null);
  const trendQ = useHwTimeTrend(trendRows, trendRows.length > 0 && invalid === null);

  // Page keys, not reset keys. `scroll` is on unless `scroll=0`; `align` and `minmax` are off unless `1`.
  const scroll = pageParam('scroll') !== '0';
  const align = pageParam('align') === '1';
  const minmax = pageParam('minmax') === '1';

  const okData = (query: QueryState<HwTimeLevelData>, wanted: boolean) => (wanted && query.response?.outcome === 'ok' ? query.response.data : null);
  const summaryData = okData(summaryQ, true);
  const moduleData = okData(moduleQ, module !== null);
  const detailData = okData(detailQ, module !== null && motion !== null);
  // The legend and the target counts follow the selected input: the Modules without one, the Motions of the chosen Module with one. While that
  // composition is pending, failed or empty the legend says so; it never falls back to the Module rows (they would be drilled as Motions).
  const context: HwTimeBlock | null = module === null ? summaryData : moduleData;
  const hidden = module === null ? summaryHidden : moduleHidden;
  const setHidden = module === null ? setSummaryHidden : setModuleHidden;
  const legendState = module === null || context ? null
    : moduleQ.response?.outcome === 'empty' ? (ko ? '이 Module에는 구성 기록이 없습니다.' : 'This Module has no composition records.')
      : moduleQ.response && moduleQ.response.outcome !== 'ok' ? (ko ? '구성을 불러오지 못했습니다.' : 'The composition could not be loaded.')
      : ko ? '구성을 불러오는 중입니다.' : 'Loading the composition.';
  const detailBlock: HwTimeBlock | null = detailData ? (detailData.level === 2 ? detailData.detail ?? EMPTY_BLOCK : EMPTY_BLOCK) : null;
  const counts = state.countsOf(context);

  const legendSeries = context?.series ?? [];
  const visibleIds = legendSeries.map(item => item.id).filter(id => !hidden.includes(id));
  const optionText = [
    sortText[lang],
    ko ? (scroll ? '행 스크롤' : '전체 맞춤') : (scroll ? 'Row scroll' : 'Fit all'),
    ...(align ? [ko ? '시작 위치 맞춤' : 'Start aligned'] : []),
    ...(minmax ? [ko ? '최소·최대' : 'Min·Max'] : []),
  ].join(' · ');
  const sections: InspectorSection[] = [
    {
      id: 'target', title: { ko: '분석 대상', en: 'Target' }, icon: Target,
      summary: counts ?? undefined,
      render: () => counts
        ? <p className="t-caption text-text-secondary">{counts[lang]}</p>
        : <p className="t-caption text-text-muted">{legendState ?? (ko ? '불러오는 중입니다.' : 'Loading.')}</p>,
    },
    {
      id: 'legend', title: { ko: '계층 범례', en: 'Legend' }, icon: ListTree,
      summary: context ? { ko: `${legendSeries.length}개 중 ${visibleIds.length}개 표시`, en: `${visibleIds.length} of ${legendSeries.length} shown` } : undefined,
      render: () => <LegendTree label={ko ? '계층 범례' : 'Legend'}
        nodes={legendSeries.map(item => ({ id: item.id, label: item.name, color: item.color as ThemeColorToken }))}
        visible={new Set(visibleIds)}
        onVisibleChange={next => setHidden(legendSeries.map(item => item.id).filter(id => !next.has(id)))}
        onDrill={drillTo} canDrill={() => true} currentId={currentId}
          emptyText={legendState ?? (ko ? '표시할 범례가 없습니다.' : 'No legend to show.')} />,
    },
    {
      id: 'options', title: { ko: '옵션', en: 'Options' }, icon: SlidersHorizontal, summary: { ko: optionText, en: optionText },
      render: () => <div className="flex flex-col gap-3 text-xs">
        <div className="flex flex-col gap-1">
          <span id="hw-compare-sort-label" className="font-medium text-text-secondary">{ko ? '정렬' : 'Sort'}</span>
          <SegmentedRadio labelledBy="hw-compare-sort-label" label={ko ? '정렬' : 'Sort'} value={sort ?? 'none'}
            onChange={next => setPage({ sort: next === 'none' ? null : next })}
            options={[{ value: 'none', label: ko ? '기본' : 'Default' }, { value: 'total-desc', label: ko ? '큰 순' : 'High' }, { value: 'total-asc', label: ko ? '작은 순' : 'Low' }]} />
        </div>
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox checked={scroll} onCheckedChange={checked => setPage({ scroll: checked === true ? null : '0' })} />
          {ko ? '행 스크롤 보기' : 'Scroll rows'}
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox checked={align} onCheckedChange={checked => setPage({ align: checked === true ? '1' : null })} />
          {ko ? '시작 위치 맞춤' : 'Align start positions'}
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox checked={minmax} onCheckedChange={checked => setPage({ minmax: checked === true ? '1' : null })} />
          {ko ? '최소·최대 표시' : 'Show min·max'}
        </label>
      </div>,
    },
  ];

  const unit = HW_TIME_UNIT[lang];
  const totalText = (shown: HwTimeBlock) => {
    const values = shown.rows.filter(item => !item.auxiliary).flatMap(item => Object.values(item.values));
    if (shown.rows.length === 0) return ko ? '기록 없음' : 'No records';
    const measured = values.filter((value): value is number => value !== null);
    if (measured.length === 0) return missingText(lang);
    const sum = `${formatSeconds(measured.reduce((a, b) => a + b, 0))} ${unit}`;
    return measured.length < values.length ? `${sum} · ${ko ? '일부 미측정' : 'partly not measured'}` : sum;
  };
  const summary = !module ? undefined
    : motion ? (detailBlock ? `Module ${module} · Motion ${motion} · ${totalText(detailBlock)}` : undefined)
      : (moduleData ? `Module ${module} · ${totalText(moduleData)}` : undefined);

  const stackProps = {
    sort, startAlign: align, minMax: minmax, rowPitch: scroll ? 26 : null,
  } as const;
  const visibleOf = (block: HwTimeBlock, hiddenIds: string[]) => block.series.map(item => item.id).filter(id => !hiddenIds.includes(id));
  const setVisible = (block: HwTimeBlock, setHiddenIds: (ids: string[]) => void) => (ids: string[]) => setHiddenIds(block.series.map(item => item.id).filter(id => !ids.includes(id)));

  const trendPanel: PanelWorkspacePanel = {
    id: 'trend', title: { ko: '추세', en: 'Trend' },
    badge: trendRows.length > 0 ? { count: trendRows.length, description: { ko: `추세에 ${trendRows.length}행`, en: `${trendRows.length} rows in the trend` } } : undefined,
    render: () => <div className="flex h-full min-h-0 flex-col gap-1 p-2">
      {notice && <p role="status" className="t-caption text-text-warning-label">{notice}</p>}
      <TrendPanel chartId="hw-compare-trend" title={ko ? '행별 일 추세' : 'Daily trend by row'} rowIds={trendRows} query={trendQ} level={drill.depth} fillMin={COMPARE_TREND_FILL_MIN} />
    </div>,
  };

  const waiting = (text: string) => <StateMessage icon={<Inbox className="size-4" aria-hidden />} title={text} />;
  // A row focus belongs to the Motion step: the composition and the detail draw the same rows then (ADR-0079).
  const rowFocus = motion !== null
    ? { activeRowId: row, revealActive: scroll, onActiveRowChange: (rowId: string | null) => setPage({ row: rowId }) }
    : {};
  const moduleBlock = moduleData ?? EMPTY_BLOCK;

  const panels: PanelWorkspacePanel[] = [
    { id: 'summary', primary: true, title: module
      ? { ko: `Module별 · ${module} 선택`, en: `By Module · ${module} selected` }
      : { ko: 'Module별', en: 'By Module' }, render: () =>
      <PanelFill><QueryView fill query={summaryQ} widgetName={ko ? 'Module별 동작시간' : 'Operation time by Module'} hideWidgetName skeletonRows={6}>
        {data => <StackPanel chartId="hw-compare-summary" title={ko ? 'Module별 동작시간' : 'Operation time by Module'} block={data}
          visibleSeriesIds={visibleOf(data, summaryHidden)} onVisibleSeriesChange={setVisible(data, setSummaryHidden)} {...stackProps}
          onActivate={({ seriesId }) => drill.enter('drillModule', seriesId)} />}
      </QueryView></PanelFill> },
    { id: 'module', title: module
      ? motion
        ? { ko: `Module ${module} 구성 · ${motion} 선택`, en: `Module ${module} · ${motion} selected` }
        : { ko: `Module ${module} 구성`, en: `Module ${module} composition` }
      : { ko: 'Module 구성', en: 'Module composition' }, render: () => !module
      ? waiting(ko ? 'Module을 고르세요' : 'Choose a Module')
      : <PanelFill><QueryView fill query={moduleQ} widgetName={ko ? `Module ${module} 구성` : `Module ${module} composition`} hideWidgetName skeletonRows={6}>
        {data => <StackPanel chartId="hw-compare-module" title={ko ? `Motion별 동작시간 — Module ${module}` : `Operation time by Motion — Module ${module}`} block={data}
          visibleSeriesIds={visibleOf(data, moduleHidden)} onVisibleSeriesChange={setVisible(data, setModuleHidden)} {...stackProps} {...rowFocus}
          onActivate={({ seriesId }) => drill.enter('drillMotion', seriesId)} rowActions={state.rowActionsOf} />}
      </QueryView></PanelFill> },
    { id: 'detail', title: motion ? { ko: `Motion ${motion} 상세`, en: `Motion ${motion} detail` } : { ko: 'Motion 상세', en: 'Motion detail' }, render: () => !module || !motion
      ? waiting(!module ? (ko ? 'Module을 고르세요' : 'Choose a Module') : (ko ? 'Motion을 고르세요' : 'Choose a Motion'))
      : <PanelFill><QueryView fill query={detailQ} widgetName={ko ? `Motion ${motion} 상세` : `Motion ${motion} detail`} hideWidgetName skeletonRows={6}>
        {data => {
          const det = data.level === 2 ? data.detail ?? EMPTY_BLOCK : EMPTY_BLOCK;
          return det.rows.length === 0
            ? <StateMessage icon={<Inbox className="size-4" aria-hidden />} title={ko ? `${module} Module에는 ${motion} 동작 기록이 없습니다` : `No ${motion} records for Module ${module}`}
              body={ko ? 'Module의 다른 Motion은 한 단계 위에서 볼 수 있습니다.' : 'Other Motions of this Module are one level up.'} />
            : <StackPanel chartId="hw-compare-detail" title={ko ? `Motion ${motion} 상세 — Module ${module}` : `Motion ${motion} detail — Module ${module}`} block={det}
              visibleSeriesIds={visibleOf(det, moduleHidden)} onVisibleSeriesChange={setVisible(moduleBlock, setModuleHidden)} {...stackProps} {...rowFocus} rowActions={state.rowActionsOf} />;
        }}
      </QueryView></PanelFill> },
    trendPanel,
  ];

  return <PlatformPage layout="fill">
    <div className="flex h-full min-h-0 gap-3">
      <aside className="shrink-0 overflow-hidden rounded-lg border border-border-subtle bg-surface-card">
        <Inspector form="rail" persistKey="hw-time-compare" label={{ ko: '분석 보조', en: 'Analysis aids' }} sections={sections} />
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <DrillLayout fill summary={summary}>
          {invalid ? <PageKeyWarning sentences={invalid} onRecover={state.recover} />
            : <PanelWorkspace persistKey="hw-compare" label={{ ko: 'HW Time 비교 영역', en: 'HW Time compare workspace' }} panels={panels}
              presets={PRESETS} initialPreset="default" />}
        </DrillLayout>
      </div>
    </div>
  </PlatformPage>;
}
