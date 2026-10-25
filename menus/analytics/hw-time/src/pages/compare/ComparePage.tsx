/**
 * HW Time 비교 (ADR-0078, 06 §12.7–§12.8): the same Module → Motion drill as 단계별, but the body is a `PanelWorkspace` with one preset
 * per level (L1 stack, L2 ranking | stack, L3 context | detail), a trend row below, and an Inspector `rail`. At L3 the two stacks share
 * one focused row (`row` page key, ADR-0079). The page owns the single level query; panels only draw what it hands them.
 */
import { Inbox, ListTree, SlidersHorizontal, Target } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useDrill, useI18n, usePlatform, type PageProps } from '@ap/kernel';
import { DrillLayout, Inspector, LegendTree, PanelWorkspace, PlatformPage, QueryView, SegmentedRadio, StateMessage, type InspectorSection, type PanelWorkspaceLayout, type PanelWorkspacePanel } from '@ap/components';
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

/**
 * Trend row height (#690i UX-3). The confirmed compare captures give the trend row about 40% of the workspace, so every level uses [60, 40].
 * The trend Frame needs toolbar + legend + canvas = about 239px at its 160px floor (`COMPARE_TREND_FILL_MIN`, the least the Frame accepts).
 * A 40% row gives a content box of about 202px in the 505px fit body at 1440×900 and about 164px in the 410px body at 1280×800. The rest
 * scrolls inside the panel (06 §12.8: the card grows and the panel body scrolls), and maximizing the panel shows the chart whole. Going above
 * 40% makes the stacks above unreadable. Fitting it fully needs a compact Frame chrome for short panels (`.planning/backlog.md`).
 */
const COMPARE_TREND_FILL_MIN = 160;

/** One preset per level (a level's panels differ, so each level has its own `persistKey`). The trend row is about 40% at every level (its empty state sits inside it); `revealRequest` only activates the tab. */
const PRESETS: Record<'l1' | 'l2' | 'l3', PanelWorkspaceLayout> = {
  l1: { type: 'branch', dir: 'column', sizes: [60, 40], children: [{ type: 'group', panels: ['stack'] }, { type: 'group', panels: ['trend'] }] },
  l2: { type: 'branch', dir: 'column', sizes: [60, 40], children: [
    { type: 'branch', dir: 'row', sizes: [28, 72], children: [{ type: 'group', panels: ['ranking'] }, { type: 'group', panels: ['stack'] }] },
    { type: 'group', panels: ['trend'] },
  ] },
  l3: { type: 'branch', dir: 'column', sizes: [60, 40], children: [
    { type: 'branch', dir: 'row', sizes: [50, 50], children: [{ type: 'group', panels: ['context'] }, { type: 'group', panels: ['detail'] }] },
    { type: 'group', panels: ['trend'] },
  ] },
};

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
  // Page keys, not reset keys. `scroll` is on unless `scroll=0`; `align` and `minmax` are off unless `1`.
  const scroll = pageParam('scroll') !== '0';
  const align = pageParam('align') === '1';
  const minmax = pageParam('minmax') === '1';
  const rawRow = pageParam('row');
  const levelKey = `${module ?? ''}/${motion ?? ''}`;
  // The URL `row` is the truth at every level: any drill step clears it in the same navigation (manifest `drill.resetKeys`, 06 §6.4), and the
  // Frame names only a row it draws (a URL row of another level shows no active row).
  const row = isHwTimeRowId(rawRow) ? rawRow : null;
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
        : <p className="t-caption text-text-muted">{ko ? '불러오는 중입니다.' : 'Loading.'}</p>,
    },
    {
      id: 'legend', title: { ko: '계층 범례', en: 'Legend' }, icon: ListTree,
      summary: context ? { ko: `${legendSeries.length}개 중 ${visibleIds.length}개 표시`, en: `${visibleIds.length} of ${legendSeries.length} shown` } : undefined,
      render: () => <LegendTree label={ko ? '계층 범례' : 'Legend'}
        nodes={legendSeries.map(item => ({ id: item.id, label: item.name, color: item.color as ThemeColorToken }))}
        visible={new Set(visibleIds)}
        onVisibleChange={next => setHiddenState({ key: levelKey, ids: legendSeries.map(item => item.id).filter(id => !next.has(id)) })}
        onDrill={drillTo} currentId={currentId}
          emptyText={ko ? '표시할 범례가 없습니다.' : 'No legend to show.'} />,
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
  const summary = !response || !module ? undefined
    : motion ? `Module ${module} · Motion ${motion} · ${totalText(detail ?? EMPTY_BLOCK)}`
      : `Module ${module} · ${totalText(response)}`;

  const stackProps = {
    sort, startAlign: align, minMax: minmax, rowPitch: scroll ? 26 : null,
  } as const;
  const visibleOf = (block: HwTimeBlock) => block.series.map(item => item.id).filter(id => !hidden.includes(id));
  const setVisible = (block: HwTimeBlock) => (ids: string[]) => setHiddenState({ key: levelKey, ids: block.series.map(item => item.id).filter(id => !ids.includes(id)) });

  const trendPanel: PanelWorkspacePanel = {
    id: 'trend', title: { ko: '추세', en: 'Trend' },
    badge: trendRows.length > 0 ? { count: trendRows.length, description: { ko: `추세에 ${trendRows.length}행`, en: `${trendRows.length} rows in the trend` } } : undefined,
    render: () => <div className="flex h-full min-h-0 flex-col gap-1 p-2">
      {notice && <p role="status" className="t-caption text-text-warning-label">{notice}</p>}
      <TrendPanel chartId="hw-compare-trend" title={ko ? '행별 일 추세' : 'Daily trend by row'} rowIds={trendRows} query={trendQ} level={drill.depth} fillMin={COMPARE_TREND_FILL_MIN} />
    </div>,
  };

  const renderBody = (data: HwTimeLevelData) => {
    const stackTitle = data.level === 0 ? (ko ? 'Module별 동작시간' : 'Operation time by Module') : (ko ? `Motion별 동작시간 — Module ${module}` : `Operation time by Motion — Module ${module}`);
    let panels: PanelWorkspacePanel[];
    let persistKey: 'hw-compare-l1' | 'hw-compare-l2' | 'hw-compare-l3';
    let layout: PanelWorkspaceLayout;
    if (data.level === 2) {
      persistKey = 'hw-compare-l3'; layout = PRESETS.l3;
      const ctx = context ?? data;
      const det = detail ?? EMPTY_BLOCK;
      const shared = { ...stackProps, activeRowId: row, revealActive: scroll, onActiveRowChange: (rowId: string | null) => setPage({ row: rowId }), rowActions: rowActionsOf };
      panels = [
        { id: 'context', title: { ko: `Module ${module} 전체 Motion`, en: `All Motions of Module ${module}` }, render: () =>
          <PanelFill><StackPanel chartId="hw-compare-L3-context" title={ko ? `Module ${module} 전체 Motion` : `All Motions of Module ${module}`} block={ctx}
            visibleSeriesIds={visibleOf(ctx)} onVisibleSeriesChange={setVisible(ctx)} {...shared} /></PanelFill> },
        { id: 'detail', primary: true, title: { ko: `Motion ${motion} 상세`, en: `Motion ${motion} detail` }, render: () => det.rows.length === 0
          ? <StateMessage icon={<Inbox className="size-4" aria-hidden />} title={ko ? `${module} Module에는 ${motion} 동작 기록이 없습니다` : `No ${motion} records for Module ${module}`}
            body={ko ? 'Module의 다른 Motion은 한 단계 위에서 볼 수 있습니다.' : 'Other Motions of this Module are one level up.'} />
          : <PanelFill><StackPanel chartId="hw-compare-L3-detail" title={ko ? `Motion ${motion} 상세 — Module ${module}` : `Motion ${motion} detail — Module ${module}`} block={det}
            visibleSeriesIds={visibleOf(det).filter(id => visibleIds.includes(id))} onVisibleSeriesChange={setVisible(ctx)} {...shared} /></PanelFill> },
        trendPanel,
      ];
    } else if (data.level === 1) {
      persistKey = 'hw-compare-l2'; layout = PRESETS.l2;
      panels = [
        { id: 'ranking', title: { ko: '합계 순위', en: 'Ranking' }, minWidth: 180, render: () => <RankingPanel block={data} visibleSeriesIds={visibleOf(data)} /> },
        { id: 'stack', primary: true, title: { ko: 'Motion별', en: 'By Motion' }, render: () =>
          <PanelFill><StackPanel chartId="hw-compare-L2" title={stackTitle} block={data} visibleSeriesIds={visibleOf(data)} onVisibleSeriesChange={setVisible(data)} {...stackProps}
            onActivate={({ seriesId }) => drill.enter('drillMotion', seriesId)} rowActions={rowActionsOf} /></PanelFill> },
        trendPanel,
      ];
    } else {
      persistKey = 'hw-compare-l1'; layout = PRESETS.l1;
      panels = [
        { id: 'stack', primary: true, title: { ko: 'Module별', en: 'By Module' }, render: () =>
          <PanelFill><StackPanel chartId="hw-compare-L1" title={stackTitle} block={data} visibleSeriesIds={visibleOf(data)} onVisibleSeriesChange={setVisible(data)} {...stackProps}
            onActivate={({ seriesId }) => drill.enter('drillModule', seriesId)} /></PanelFill> },
        trendPanel,
      ];
    }
    return <PanelWorkspace persistKey={persistKey} label={{ ko: 'HW Time 비교 영역', en: 'HW Time compare workspace' }} panels={panels}
      presets={[{ id: 'default', label: { ko: '기본', en: 'Default' }, layout }]} initialPreset="default" revealRequest={reveal} />;
  };

  return <PlatformPage layout="fill">
    <div className="flex h-full min-h-0 gap-3">
      <aside className="shrink-0 overflow-hidden rounded-lg border border-border-subtle bg-surface-card">
        <Inspector form="rail" persistKey="hw-time-compare" label={{ ko: '분석 보조', en: 'Analysis aids' }} sections={sections} />
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <DrillLayout fill summary={summary}>
          <QueryView fill query={levelQ} widgetName={ko ? 'HW Time 비교' : 'HW Time compare'} hideWidgetName skeletonRows={6}>
            {data => renderBody(data)}
          </QueryView>
        </DrillLayout>
      </div>
    </div>
  </PlatformPage>;
}
