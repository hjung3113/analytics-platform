import { useMessages, formatText } from '@ap/kernel';
import { HW_TIME_MESSAGES } from '../../messages';
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
import { shownDrill } from '../../shared/shownDrill';
import { formatSeconds, missingText } from '../../shared/format';
import { targetStateText } from '../../shared/targetState';
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
  { id: 'default', label: HW_TIME_MESSAGES.comparePageDefault, layout: { type: 'branch', dir: 'row', sizes: [34, 66], children: [
    { type: 'group', panels: ['summary'] },
    { type: 'branch', dir: 'column', sizes: [48, 52], children: [{ type: 'group', panels: ['module'] }, { type: 'group', panels: ['detail', 'trend'] }] },
  ] } },
];

/** A `PanelWorkspace` panel box is not a flex container, so the chart's `flex-1` would collapse to its floor; this gives it the panel height. */
function PanelFill({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-0 flex-col">{children}</div>;
}

export default function ComparePage(_props: PageProps) {
  const m = useMessages(HW_TIME_MESSAGES);
  const { lang } = useI18n();
  const { pageParam, setPage } = usePlatform();
  const drill = useDrill();
  const module = drill.levels[0]?.value ?? null;
  const motion = drill.levels[1]?.value ?? null;
  // Tree drill does what the chart segment click does at this depth: Module without one, Motion once a Module is chosen.
  const drillTo = (id: string) => { if (!moduleKept.previous) drill.enter(drill.depth === 0 ? 'drillModule' : 'drillMotion', id); };
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
  const enabled = invalid === null;
  // One query per panel, each projecting only its own drill keys (#912 §5). A panel whose input is missing sends nothing; its placeholder
  // identity (`''`) differs from the summary's, so a disabled query never reads another panel's cached answer.
  const summaryQ = useHwTimeLevel({}, enabled);
  const moduleQ = useHwTimeLevel({ drillModule: module ?? '' }, enabled && module !== null);
  const detailQ = useHwTimeLevel({ drillModule: module ?? '', drillMotion: motion ?? '' }, enabled && module !== null && motion !== null);
  const trendQ = useHwTimeTrend(trendRows, trendRows.length > 0 && invalid === null);
  // Each panel's query changes params with the drill (#1365): while a previous result is kept, its title, summary and drill actions use the Module/Motion it was loaded with.
  const moduleKept = shownDrill(moduleQ, { drillModule: module ?? '' });
  const detailKept = shownDrill(detailQ, { drillModule: module ?? '', drillMotion: motion ?? '' });

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
    : moduleQ.response?.outcome === 'empty' ? (m('comparePageThisModuleHasNoCompositionRecords'))
      : moduleQ.response && moduleQ.response.outcome !== 'ok' ? (m('comparePageTheCompositionCouldNotBeLoaded'))
      : m('comparePageLoadingTheComposition');
  // Without a Module the target and the legend follow the summary query (`legendState` is null by construction there).
  const summaryState = module === null && !summaryData ? targetStateText(lang, summaryQ.response?.outcome) : null;
  const detailBlock: HwTimeBlock | null = detailData ? (detailData.level === 2 ? detailData.detail ?? EMPTY_BLOCK : EMPTY_BLOCK) : null;
  const counts = state.countsOf(context);

  const legendSeries = context?.series ?? [];
  const visibleIds = legendSeries.map(item => item.id).filter(id => !hidden.includes(id));
  const optionText = [
    sortText[lang],
    m(scroll ? 'comparePageRowScroll' : 'comparePageFitAll'),
    ...(align ? [m('comparePageStartAligned')] : []),
    ...(minmax ? [m('comparePageMinMax')] : []),
  ].join(' · ');
  const sections: InspectorSection[] = [
    {
      id: 'target', title: HW_TIME_MESSAGES.comparePageTarget, icon: Target,
      summary: counts ?? undefined,
      render: () => counts
        ? <p className="t-caption text-text-secondary">{counts[lang]}</p>
        : <p className="t-caption text-text-muted">{legendState ?? summaryState ?? (m('comparePageLoading'))}</p>,
    },
    {
      id: 'legend', title: HW_TIME_MESSAGES.comparePageLegend, icon: ListTree,
      summary: context ? { ko: formatText(HW_TIME_MESSAGES.comparePageOfShown, 'ko', { length: String(legendSeries.length), value2: String(visibleIds.length) }), en: formatText(HW_TIME_MESSAGES.comparePageOfShown, 'en', { length: String(legendSeries.length), value2: String(visibleIds.length) }) } : undefined,
      render: () => <LegendTree label={m('comparePageLegend2')}
        nodes={legendSeries.map(item => ({ id: item.id, label: item.name, color: item.color as ThemeColorToken }))}
        visible={new Set(visibleIds)}
        onVisibleChange={next => setHidden(legendSeries.map(item => item.id).filter(id => !next.has(id)))}
        onDrill={drillTo} canDrill={() => !moduleKept.previous} currentId={currentId}
          emptyText={legendState ?? summaryState ?? (m('comparePageNoLegendToShow'))} />,
    },
    {
      id: 'options', title: HW_TIME_MESSAGES.comparePageOptions, icon: SlidersHorizontal, summary: { ko: optionText, en: optionText },
      render: () => <div className="flex flex-col gap-3 text-xs">
        <div className="flex flex-col gap-1">
          <span id="hw-compare-sort-label" className="font-medium text-text-secondary">{m('comparePageSort')}</span>
          <SegmentedRadio labelledBy="hw-compare-sort-label" label={m('comparePageSort2')} value={sort ?? 'none'}
            onChange={next => setPage({ sort: next === 'none' ? null : next })}
            options={[{ value: 'none', label: m('comparePageDefault2') }, { value: 'total-desc', label: m('comparePageHigh') }, { value: 'total-asc', label: m('comparePageLow') }]} />
        </div>
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox checked={scroll} onCheckedChange={checked => setPage({ scroll: checked === true ? null : '0' })} />
          {m('comparePageScrollRows')}
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox checked={align} onCheckedChange={checked => setPage({ align: checked === true ? '1' : null })} />
          {m('comparePageAlignStartPositions')}
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox checked={minmax} onCheckedChange={checked => setPage({ minmax: checked === true ? '1' : null })} />
          {m('comparePageShowMinMax')}
        </label>
      </div>,
    },
  ];

  const unit = HW_TIME_UNIT[lang];
  const totalText = (shown: HwTimeBlock) => {
    const values = shown.rows.filter(item => !item.auxiliary).flatMap(item => Object.values(item.values));
    if (shown.rows.length === 0) return m('comparePageNoRecords');
    const measured = values.filter((value): value is number => value !== null);
    if (measured.length === 0) return missingText(lang);
    const sum = `${formatSeconds(measured.reduce((a, b) => a + b, 0), lang)} ${unit}`;
    return measured.length < values.length ? `${sum} · ${m('comparePagePartlyNotMeasured')}` : sum;
  };
  const summary = !module ? undefined
    : motion ? (detailBlock ? `Module ${detailKept.module} · Motion ${detailKept.motion} · ${totalText(detailBlock)}` : undefined)
      : (moduleData ? `Module ${moduleKept.module} · ${totalText(moduleData)}` : undefined);

  const stackProps = {
    sort, startAlign: align, minMax: minmax, rowPitch: scroll ? 26 : null,
  } as const;
  const visibleOf = (block: HwTimeBlock, hiddenIds: string[]) => block.series.map(item => item.id).filter(id => !hiddenIds.includes(id));
  const setVisible = (block: HwTimeBlock, setHiddenIds: (ids: string[]) => void) => (ids: string[]) => setHiddenIds(block.series.map(item => item.id).filter(id => !ids.includes(id)));

  const trendPanel: PanelWorkspacePanel = {
    id: 'trend', title: HW_TIME_MESSAGES.comparePageTrend,
    badge: trendRows.length > 0 ? { count: trendRows.length, description: { ko: formatText(HW_TIME_MESSAGES.comparePageRowsInTheTrend, 'ko', { length: String(trendRows.length) }), en: formatText(HW_TIME_MESSAGES.comparePageRowsInTheTrend, 'en', { length: String(trendRows.length) }) } } : undefined,
    render: () => <div className="flex h-full min-h-0 flex-col gap-1 p-2">
      {notice && <p role="status" className="t-caption text-text-warning-label">{notice}</p>}
      <TrendPanel chartId="hw-compare-trend" title={m('comparePageDailyTrendByRow')} rowIds={trendRows} query={trendQ} level={drill.depth} fillMin={COMPARE_TREND_FILL_MIN} />
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
      ? { ko: formatText(HW_TIME_MESSAGES.comparePageByModuleSelected, 'ko', { module: String(module) }), en: formatText(HW_TIME_MESSAGES.comparePageByModuleSelected, 'en', { module: String(module) }) }
      : HW_TIME_MESSAGES.comparePageByModule, render: () =>
      <PanelFill><QueryView fill query={summaryQ} widgetName={m('comparePageOperationTimeByModule')} hideWidgetName skeletonRows={6}>
        {data => <StackPanel chartId="hw-compare-summary" title={m('comparePageOperationTimeByModule2')} block={data}
          visibleSeriesIds={visibleOf(data, summaryHidden)} onVisibleSeriesChange={setVisible(data, setSummaryHidden)} {...stackProps}
          onActivate={({ seriesId }) => drill.enter('drillModule', seriesId)} />}
      </QueryView></PanelFill> },
    { id: 'module', title: module
      ? motion
        ? { ko: formatText(HW_TIME_MESSAGES.comparePageModuleSelected, 'ko', { module: String(moduleKept.module), motion: String(motion) }), en: formatText(HW_TIME_MESSAGES.comparePageModuleSelected, 'en', { module: String(moduleKept.module), motion: String(motion) }) }
        : { ko: formatText(HW_TIME_MESSAGES.comparePageModuleComposition, 'ko', { module: String(moduleKept.module) }), en: formatText(HW_TIME_MESSAGES.comparePageModuleComposition, 'en', { module: String(moduleKept.module) }) }
      : HW_TIME_MESSAGES.comparePageModuleComposition2, render: () => !module
      ? waiting(m('comparePageChooseAModule'))
      : <PanelFill><QueryView fill query={moduleQ} widgetName={m('comparePageModuleComposition3', { module: String(moduleKept.module) })} hideWidgetName skeletonRows={6}>
        {data => <StackPanel chartId="hw-compare-module" title={m('comparePageModuleOperationTimeByMotion', { module: String(moduleKept.module) })} block={data}
          visibleSeriesIds={visibleOf(data, moduleHidden)} onVisibleSeriesChange={setVisible(data, setModuleHidden)} {...stackProps} {...rowFocus}
          onActivate={moduleKept.previous ? undefined : ({ seriesId }) => drill.enter('drillMotion', seriesId)} rowActions={state.rowActionsOf} />}
      </QueryView></PanelFill> },
    { id: 'detail', title: motion ? { ko: formatText(HW_TIME_MESSAGES.comparePageMotionDetail, 'ko', { motion: String(detailKept.motion) }), en: formatText(HW_TIME_MESSAGES.comparePageMotionDetail, 'en', { motion: String(detailKept.motion) }) } : HW_TIME_MESSAGES.comparePageMotionDetail2, render: () => !module || !motion
      ? waiting(!module ? (m('comparePageChooseAModule2')) : (m('comparePageChooseAMotion')))
      : <PanelFill><QueryView fill query={detailQ} widgetName={m('comparePageMotionDetail3', { motion: String(detailKept.motion) })} hideWidgetName skeletonRows={6}>
        {data => {
          const det = data.level === 2 ? data.detail ?? EMPTY_BLOCK : EMPTY_BLOCK;
          return det.rows.length === 0
            ? <StateMessage icon={<Inbox className="size-4" aria-hidden />} title={m('comparePageNoRecordsForModule', { module: String(detailKept.module), motion: String(detailKept.motion) })}
              body={m('comparePageOtherMotionsOfThisModuleAreOne')} />
            : <StackPanel chartId="hw-compare-detail" title={m('comparePageModuleMotionDetail', { module: String(detailKept.module), motion: String(detailKept.motion) })} block={det}
              visibleSeriesIds={visibleOf(det, moduleHidden)} onVisibleSeriesChange={setVisible(moduleBlock, setModuleHidden)} {...stackProps} {...rowFocus} rowActions={state.rowActionsOf} />;
        }}
      </QueryView></PanelFill> },
    trendPanel,
  ];

  return <PlatformPage layout="fill">
    <div className="flex h-full min-h-0 gap-3">
      <aside className="shrink-0 overflow-hidden rounded-lg border border-border-subtle bg-surface-card">
        <Inspector form="rail" persistKey="hw-time-compare" label={HW_TIME_MESSAGES.comparePageAnalysisAids} sections={sections} />
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <DrillLayout fill summary={summary}>
          {invalid ? <PageKeyWarning sentences={invalid} onRecover={state.recover} />
            : <PanelWorkspace persistKey="hw-compare" label={HW_TIME_MESSAGES.comparePageHwTimeCompareWorkspace} panels={panels}
              presets={PRESETS} initialPreset="default" />}
        </DrillLayout>
      </div>
    </div>
  </PlatformPage>;
}
