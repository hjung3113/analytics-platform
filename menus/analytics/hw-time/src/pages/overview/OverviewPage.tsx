/**
 * HW Time 개요 (ADR-0078, 06 §12.7–§12.8): the same Module → Motion drill as 단계별 and 비교, drawn as one stacked `PanelWorkspace`
 * (`initialMode="stack"`, ADR-0077): ranking, the current level, L3 context and detail, a trend and a legend. Panel badges carry the trend
 * row count and unmeasured rows, so a background tab or a hidden panel still signals them. The page owns the single level query and the
 * shared visible-series set; a hidden panel unmounts its subtree, so no panel keeps that state. At L3 context and detail share `row` (ADR-0079).
 */
import { Inbox, SlidersHorizontal, Target } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useDrill, useI18n, usePlatform, type PageProps } from '@ap/kernel';
import { DrillLayout, Inspector, LegendTree, PanelWorkspace, PlatformPage, QueryView, SegmentedRadio, StateMessage, type InspectorSection, type PanelWorkspaceLayout, type PanelWorkspacePanel, type PanelWorkspacePreset } from '@ap/components';
import { Checkbox } from '@ap/ui';
import type { ThemeColorToken } from '@ap/ui/theme';
import { HW_TIME_MAX_TREND_ROWS, HW_TIME_UNIT, isHwTimeRowId, type HwTimeBlock, type HwTimeDrill, type HwTimeLevelData } from '../../endpoints';
import { useHwTimeLevel, useHwTimeTrend } from '../../shared/data';
import { formatSeconds, missingText } from '../../shared/format';
import { selectionCounts } from '../../shared/selectionCounts';
import { RankingPanel } from '../../shared/panels/RankingPanel';
import { StackPanel, type StackSort } from '../../shared/panels/StackPanel';
import { TrendPanel } from '../../shared/panels/TrendPanel';
import { formatTrendKey, parseTrendKey } from '../../shared/trendKey';

const SORTS: readonly StackSort[] = ['total-desc', 'total-asc'];
const EMPTY_BLOCK: HwTimeBlock = { series: [], rows: [], totals: { values: {}, total: null } };
/** The stacked rows keep the row pitch of 단계별 and 비교 (no ScrollView toggle here). */
const ROW_PITCH = 26;

const group = (...panels: string[]): PanelWorkspaceLayout => ({ type: 'group', panels });
/**
 * One preset per level (the panels differ, so each level has its own `persistKey`). The first row is the analysis row (about 62%), so a
 * fresh stacked session shows a chart above the fold; trend and legend sit under it. L3 puts the detail (primary, UX-17) beside the context.
 * First-row arithmetic (06 §12.8 row model, `enterRows`): row px = round(share × max(fit height, rows × 360)), so with two rows the total is
 * at least 720 and the first row at least round(0.62 × 720) = 446px (row minimum 200). The Inspector is a 40px `rail` (a 256px `stack`
 * Inspector pushed every default width below `compactBelow` 900). Measured (690j UX2): 1440×900 workspace 1015px, stacked, chart at y 278–633;
 * 1280×800 with the shell's default collapsed sidebar 1039px, stacked, chart at y 278–612; 1280×800 with the sidebar expanded 870px, so the
 * fit tab group shows with the primary chart first (y 253–762). Either way an analysis chart is above the fold.
 */
const GROUPS = {
  l1: ['level', 'ranking', 'trend', 'legend'],
  l2: ['level', 'ranking', 'trend', 'legend'],
  l3: ['detail', 'context', 'ranking', 'trend', 'legend'],
} as const;
/** Below `compactBelow` one tab group shows its first tab: the primary panel (level at L1/L2, detail at L3) leads. */
const COMPACT = (level: keyof typeof GROUPS): PanelWorkspacePreset => ({ id: 'compact', label: { ko: '탭 하나', en: 'One tab group' }, layout: group(...GROUPS[level]) });
const PRESETS: Record<'l1' | 'l2' | 'l3', PanelWorkspaceLayout> = {
  l1: { type: 'branch', dir: 'column', sizes: [62, 38], children: [
    { type: 'branch', dir: 'row', sizes: [25, 75], children: [group('ranking'), group('level')] },
    { type: 'branch', dir: 'row', sizes: [65, 35], children: [group('trend'), group('legend')] },
  ] },
  l2: { type: 'branch', dir: 'column', sizes: [62, 38], children: [
    { type: 'branch', dir: 'row', sizes: [25, 75], children: [group('ranking'), group('level')] },
    { type: 'branch', dir: 'row', sizes: [65, 35], children: [group('trend'), group('legend')] },
  ] },
  l3: { type: 'branch', dir: 'column', sizes: [62, 38], children: [
    { type: 'branch', dir: 'row', sizes: [20, 40, 40], children: [group('ranking'), group('context'), group('detail')] },
    { type: 'branch', dir: 'row', sizes: [65, 35], children: [group('trend'), group('legend')] },
  ] },
};

/** A `PanelWorkspace` panel box is not a flex container, so the chart's `flex-1` would collapse to its floor; this gives it the panel height. */
function PanelFill({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-0 flex-col">{children}</div>;
}

/** Data rows with at least one value not measured (auxiliary rows are annotations, not data). */
function unmeasuredRows(block: HwTimeBlock) {
  return block.rows.filter(row => !row.auxiliary && Object.values(row.values).some(value => value === null)).length;
}

export default function OverviewPage(_props: PageProps) {
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const { pageParam, setPage } = usePlatform();
  const drill = useDrill();
  const module = drill.levels[0]?.value ?? null;
  const motion = drill.levels[1]?.value ?? null;
  // Tree drill does what the chart segment click does at this level: Module at L1, Motion at L2, and at L3 a switch to another Motion.
  const drillTo = (id: string) => drill.enter(drill.depth === 0 ? 'drillModule' : 'drillMotion', id);
  // Only L3 has a drilled node among the series; at L2 the Module is not one of the Motion nodes.
  const currentId = drill.depth === 2 ? motion : null;
  const params: HwTimeDrill = { ...(module ? { drillModule: module } : {}), ...(module && motion ? { drillMotion: motion } : {}) };
  const levelQ = useHwTimeLevel(params, drill.invalid === null);

  const trendRows = useMemo(() => parseTrendKey(pageParam('trend')), [pageParam]);
  const trendQ = useHwTimeTrend(trendRows, trendRows.length > 0);

  const rawSort = pageParam('sort');
  const sort: StackSort = SORTS.includes(rawSort as StackSort) ? rawSort as StackSort : null;
  // Page keys, not reset keys: `align` and `minmax` are off unless `1`.
  const align = pageParam('align') === '1';
  const minmax = pageParam('minmax') === '1';
  const rawRow = pageParam('row');
  const levelKey = `${module ?? ''}/${motion ?? ''}`;
  // The URL `row` is the truth at every level: any drill step clears it in the same navigation (manifest `drill.resetKeys`, 06 §6.4), and the
  // Frame names only a row it draws (a URL row of another level shows no active row).
  const row = isHwTimeRowId(rawRow) ? rawRow : null;
  // The shared visible-series set lives here, above the workspace: a hidden panel unmounts, and the legend panel is one of them.
  const [hiddenState, setHiddenState] = useState<{ key: string; ids: string[] }>({ key: levelKey, ids: [] });
  const hidden = hiddenState.key === levelKey ? hiddenState.ids : [];
  const [reveal, setReveal] = useState<{ panelId: string; seq: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const response = levelQ.response?.outcome === 'ok' ? levelQ.response.data : null;
  const context: HwTimeBlock | null = response ? (response.level === 2 ? response.context ?? response : response) : null;
  const detail: HwTimeBlock | null = response?.level === 2 ? response.detail ?? EMPTY_BLOCK : null;
  const counts = context ? selectionCounts(context) : null;

  const addTrend = (rowId: string) => {
    if (!isHwTimeRowId(rowId) || trendRows.includes(rowId)) return;
    if (trendRows.length >= HW_TIME_MAX_TREND_ROWS) {
      setNotice(ko ? `추세는 최대 ${HW_TIME_MAX_TREND_ROWS}행까지 볼 수 있습니다.` : `The trend shows at most ${HW_TIME_MAX_TREND_ROWS} rows.`);
      return;
    }
    setNotice(null);
    setPage({ trend: formatTrendKey([...trendRows, rowId]) });
    setReveal(current => ({ panelId: 'trend', seq: (current?.seq ?? 0) + 1 }));
  };
  const removeTrend = (rowId: string) => {
    if (!trendRows.includes(rowId)) return;
    setNotice(null);
    setPage({ trend: formatTrendKey(trendRows.filter(id => id !== rowId)) });
  };
  const rowActionsOf = (rowId: string) => (!isHwTimeRowId(rowId) ? []
    : trendRows.includes(rowId) ? [{ id: 'trend-remove', label: ko ? '추세에서 제거' : 'Remove from trend', keepsFocus: true, onSelect: removeTrend }]
      : [{ id: 'trend-add', label: ko ? '추세에 추가' : 'Add to trend', keepsFocus: true, onSelect: addTrend }]);

  const legendSeries = context?.series ?? [];
  const visibleIds = legendSeries.map(item => item.id).filter(id => !hidden.includes(id));
  const sortText = sort === 'total-desc' ? { ko: '정렬: 큰 순', en: 'Sort: high' } : sort === 'total-asc' ? { ko: '정렬: 작은 순', en: 'Sort: low' } : { ko: '정렬: 기본', en: 'Sort: default' };
  const optionText = [
    sortText[lang],
    ...(align ? [ko ? '시작 위치 맞춤' : 'Start aligned'] : []),
    ...(minmax ? [ko ? '최소·최대' : 'Min·Max'] : []),
  ].join(' · ');
  const sections: InspectorSection[] = [
    {
      id: 'target', title: { ko: '분석 대상', en: 'Target' }, icon: Target,
      summary: counts ?? undefined,
      render: () => counts
        ? <p className="t-caption text-text-secondary">{counts[lang]}</p>
        : <p className="t-caption text-text-muted">{ko ? '불러오는 중입니다.' : 'Loading.'}</p>,
    },
    {
      id: 'options', title: { ko: '옵션', en: 'Options' }, icon: SlidersHorizontal, summary: { ko: optionText, en: optionText },
      render: () => <div className="flex flex-col gap-3 text-xs">
        <div className="flex flex-col gap-1">
          <span id="hw-overview-sort-label" className="font-medium text-text-secondary">{ko ? '정렬' : 'Sort'}</span>
          <SegmentedRadio labelledBy="hw-overview-sort-label" label={ko ? '정렬' : 'Sort'} value={sort ?? 'none'}
            onChange={next => setPage({ sort: next === 'none' ? null : next })}
            options={[{ value: 'none', label: ko ? '기본' : 'Default' }, { value: 'total-desc', label: ko ? '큰 순' : 'High' }, { value: 'total-asc', label: ko ? '작은 순' : 'Low' }]} />
        </div>
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
  const summary = !response || !module ? undefined
    : motion ? `Module ${module} · Motion ${motion} · ${totalText(detail ?? EMPTY_BLOCK)}`
      : `Module ${module} · ${totalText(response)}`;

  const stackProps = { sort, startAlign: align, minMax: minmax, rowPitch: ROW_PITCH } as const;
  const visibleOf = (block: HwTimeBlock) => block.series.map(item => item.id).filter(id => !hidden.includes(id));
  const setVisible = (block: HwTimeBlock) => (ids: string[]) => setHiddenState({ key: levelKey, ids: block.series.map(item => item.id).filter(id => !ids.includes(id)) });
  /** A stack panel whose block has unmeasured values says so on its tab and in the hidden-panel list. */
  const partialBadge = (block: HwTimeBlock): PanelWorkspacePanel['badge'] => {
    const count = unmeasuredRows(block);
    return count === 0 ? undefined : { tone: 'warning', description: { ko: `일부 미측정 ${count}행`, en: `${count} rows partly not measured` } };
  };

  const trendPanel: PanelWorkspacePanel = {
    id: 'trend', title: { ko: '추세', en: 'Trend' },
    badge: trendRows.length > 0 ? { count: trendRows.length, description: { ko: `추세에 ${trendRows.length}행`, en: `${trendRows.length} rows in the trend` } } : undefined,
    render: () => <div className="flex h-full min-h-0 flex-col gap-1 p-2">
      {notice && <p role="status" className="t-caption text-text-warning-label">{notice}</p>}
      <TrendPanel chartId="hw-overview-trend" title={ko ? '행별 일 추세' : 'Daily trend by row'} rowIds={trendRows} query={trendQ} level={drill.depth} />
    </div>,
  };
  const legendPanel: PanelWorkspacePanel = {
    id: 'legend', title: { ko: '범례', en: 'Legend' }, minWidth: 160,
    render: () => <div className="h-full min-h-0 overflow-auto p-2">
      <LegendTree label={ko ? '계층 범례' : 'Legend'}
        nodes={legendSeries.map(item => ({ id: item.id, label: item.name, color: item.color as ThemeColorToken }))}
        visible={new Set(visibleIds)}
        onVisibleChange={next => setHiddenState({ key: levelKey, ids: legendSeries.map(item => item.id).filter(id => !next.has(id)) })}
        onDrill={drillTo} currentId={currentId}
          emptyText={ko ? '표시할 범례가 없습니다.' : 'No legend to show.'} />
    </div>,
  };
  const rankingPanel = (block: HwTimeBlock): PanelWorkspacePanel => ({
    id: 'ranking', title: { ko: '합계 순위', en: 'Ranking' }, minWidth: 180,
    render: () => <RankingPanel block={block} visibleSeriesIds={visibleOf(block)} />,
  });

  const renderBody = (data: HwTimeLevelData) => {
    let panels: PanelWorkspacePanel[];
    let persistKey: 'hw-overview-l1' | 'hw-overview-l2' | 'hw-overview-l3';
    let layout: PanelWorkspaceLayout;
    let compact: PanelWorkspacePreset;
    if (data.level === 2) {
      persistKey = 'hw-overview-l3'; layout = PRESETS.l3; compact = COMPACT('l3');
      const ctx = context ?? data;
      const det = detail ?? EMPTY_BLOCK;
      const shared = { ...stackProps, activeRowId: row, revealActive: true, onActiveRowChange: (rowId: string | null) => setPage({ row: rowId }), rowActions: rowActionsOf };
      panels = [
        rankingPanel(ctx),
        { id: 'context', title: { ko: `Module ${module} 전체 Motion`, en: `All Motions of Module ${module}` }, badge: partialBadge(ctx), render: () =>
          <PanelFill><StackPanel chartId="hw-overview-L3-context" title={ko ? `Module ${module} 전체 Motion` : `All Motions of Module ${module}`} block={ctx}
            visibleSeriesIds={visibleOf(ctx)} onVisibleSeriesChange={setVisible(ctx)} {...shared} /></PanelFill> },
        { id: 'detail', primary: true, title: { ko: `Motion ${motion} 상세`, en: `Motion ${motion} detail` }, badge: partialBadge(det), render: () => det.rows.length === 0
          ? <StateMessage icon={<Inbox className="size-4" aria-hidden />} title={ko ? `${module} Module에는 ${motion} 동작 기록이 없습니다` : `No ${motion} records for Module ${module}`}
            body={ko ? 'Module의 다른 Motion은 한 단계 위에서 볼 수 있습니다.' : 'Other Motions of this Module are one level up.'} />
          : <PanelFill><StackPanel chartId="hw-overview-L3-detail" title={ko ? `Motion ${motion} 상세 — Module ${module}` : `Motion ${motion} detail — Module ${module}`} block={det}
            visibleSeriesIds={visibleOf(det).filter(id => visibleIds.includes(id))} onVisibleSeriesChange={setVisible(ctx)} {...shared} /></PanelFill> },
        trendPanel,
        legendPanel,
      ];
    } else {
      const first = data.level === 0;
      persistKey = first ? 'hw-overview-l1' : 'hw-overview-l2'; layout = first ? PRESETS.l1 : PRESETS.l2; compact = COMPACT(first ? 'l1' : 'l2');
      const stackTitle = first ? (ko ? 'Module별 동작시간' : 'Operation time by Module') : (ko ? `Motion별 동작시간 — Module ${module}` : `Operation time by Motion — Module ${module}`);
      panels = [
        rankingPanel(data),
        { id: 'level', primary: true, title: first ? { ko: 'Module별', en: 'By Module' } : { ko: 'Motion별', en: 'By Motion' }, badge: partialBadge(data), render: () =>
          <PanelFill><StackPanel chartId={first ? 'hw-overview-L1' : 'hw-overview-L2'} title={stackTitle} block={data} visibleSeriesIds={visibleOf(data)} onVisibleSeriesChange={setVisible(data)} {...stackProps}
            onActivate={first ? ({ seriesId }) => drill.enter('drillModule', seriesId)
              : ({ seriesId }) => drill.enter('drillMotion', seriesId)}
            rowActions={first ? undefined : rowActionsOf} /></PanelFill> },
        trendPanel,
        legendPanel,
      ];
    }
    return <PanelWorkspace persistKey={persistKey} initialMode="stack" label={{ ko: 'HW Time 개요 영역', en: 'HW Time overview workspace' }} panels={panels}
      presets={[{ id: 'default', label: { ko: '패널 나눔', en: 'Split panels' }, layout }, compact]} initialPreset="default" compactPreset="compact" revealRequest={reveal} />;
  };

  return <PlatformPage layout="fill">
    <div className="flex h-full min-h-0 gap-3">
      <aside className="shrink-0 overflow-hidden rounded-lg border border-border-subtle bg-surface-card">
        <Inspector form="rail" persistKey="hw-time-overview" label={{ ko: '분석 보조', en: 'Analysis aids' }} sections={sections} />
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <DrillLayout fill summary={summary}>
          <QueryView fill query={levelQ} widgetName={ko ? 'HW Time 개요' : 'HW Time overview'} hideWidgetName skeletonRows={6}>
            {data => renderBody(data)}
          </QueryView>
        </DrillLayout>
      </div>
    </div>
  </PlatformPage>;
}
