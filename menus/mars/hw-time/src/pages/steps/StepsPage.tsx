/**
 * HW Time 단계별 (ADR-0078, 06 §12.7): Module → Motion drill where the body is replaced per level, a pinned summary line,
 * an Inspector `stack` (target / legend / options) and a collapsible daily trend under the detail hero. No PanelWorkspace.
 * The page owns the single level query; Inspector sections only render what it passes in (ADR-0080).
 */
import { ChevronDown, Inbox, ListTree, SlidersHorizontal, Target } from 'lucide-react';
import { useId, useState } from 'react';
import { useDrill, useI18n, usePlatform, type PageProps } from '@ap/kernel';
import { DrillLayout, Inspector, LegendTree, PageKeyWarning, PlatformPage, QueryView, SegmentedRadio, StateMessage, type InspectorSection } from '@ap/components';
import { Button, Checkbox, cn } from '@ap/ui';
import type { ThemeColorToken } from '@ap/ui/theme';
import { HW_TIME_UNIT, type HwTimeBlock, type HwTimeDrill, type HwTimeLevelData } from '../../endpoints';
import { useHwTimeLevel, useHwTimeTrend } from '../../shared/data';
import { formatSeconds, missingText } from '../../shared/format';
import { targetStateText } from '../../shared/targetState';
import { StackPanel } from '../../shared/panels/StackPanel';
import { TrendPanel } from '../../shared/panels/TrendPanel';
import { useHwTimeLevelState } from '../../shared/useHwTimeLevelState';

/** The block the body draws: the whole response at L1/L2, the selected Motion's detail at L3. */
function bodyBlock(data: HwTimeLevelData): HwTimeBlock {
  return data.level === 2 ? data.detail ?? { series: [], rows: [], totals: { values: {}, total: null } } : data;
}

export default function StepsPage(_props: PageProps) {
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
  // Keyed by Module and Motion on purpose: at L3 the series are that Motion's detail, so another Motion is another series set.
  const state = useHwTimeLevelState({ hiddenKey: `${module ?? ''}/${motion ?? ''}` });
  const { invalid, sort, sortText, trendRows, hidden, setHidden, notice } = state;
  const levelQ = useHwTimeLevel(params, drill.invalid === null && invalid === null);
  const trendQ = useHwTimeTrend(trendRows, trendRows.length > 0 && invalid === null);

  // Page keys, not reset keys: `align=1` is on, absent is off.
  const align = pageParam('align') === '1';
  const minmax = pageParam('minmax') === '1';

  const [trendOpen, setTrendOpen] = useState(trendRows.length > 0);
  const [lastCount, setLastCount] = useState(trendRows.length);
  if (lastCount !== trendRows.length) {
    setLastCount(trendRows.length);
    if (trendRows.length > lastCount) setTrendOpen(true);
    if (trendRows.length === 0) setTrendOpen(false);
  }
  const trendId = useId();

  const response = levelQ.response?.outcome === 'ok' ? levelQ.response.data : null;
  const block = response ? bodyBlock(response) : null;
  const counts = state.countsOf(block);

  const legendTotal = block?.series.length ?? 0;
  const legendShown = block ? block.series.filter(item => !hidden.includes(item.id)).length : 0;

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
        : <p className="t-caption text-text-muted">{targetStateText(lang, levelQ.response?.outcome)}</p>,
    },
    {
      id: 'legend', title: { ko: '계층 범례', en: 'Legend' }, icon: ListTree,
      summary: block ? { ko: `${legendTotal}개 중 ${legendShown}개 표시`, en: `${legendShown} of ${legendTotal} shown` } : undefined,
      render: () => {
        const series = block?.series ?? [];
        const visible = new Set(series.map(item => item.id).filter(id => !hidden.includes(id)));
        return <LegendTree label={ko ? '계층 범례' : 'Legend'}
          nodes={series.map(item => ({ id: item.id, label: item.name, color: item.color as ThemeColorToken }))}
          visible={visible}
          onVisibleChange={next => setHidden(series.map(item => item.id).filter(id => !next.has(id)))}
          onDrill={drillTo} canDrill={() => true} currentId={currentId}
          emptyText={ko ? '표시할 범례가 없습니다.' : 'No legend to show.'} />;
      },
    },
    {
      id: 'options', title: { ko: '옵션', en: 'Options' }, icon: SlidersHorizontal, summary: { ko: optionText, en: optionText },
      render: () => <div className="flex flex-col gap-3 text-xs">
        <div className="flex flex-col gap-1">
          <span id="hw-sort-label" className="font-medium text-text-secondary">{ko ? '정렬' : 'Sort'}</span>
          <SegmentedRadio labelledBy="hw-sort-label" label={ko ? '정렬' : 'Sort'} value={sort ?? 'none'}
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
    const values = shown.rows.filter(row => !row.auxiliary).flatMap(row => Object.values(row.values));
    if (shown.rows.length === 0) return ko ? '기록 없음' : 'No records';
    const measured = values.filter((value): value is number => value !== null);
    if (measured.length === 0) return missingText(lang);
    const sum = `${formatSeconds(measured.reduce((a, b) => a + b, 0))} ${unit}`;
    return measured.length < values.length ? `${sum} · ${ko ? '일부 미측정' : 'partly not measured'}` : sum;
  };
  const summary = !response || !module ? undefined
    : motion ? `Module ${module} · Motion ${motion} · ${totalText(bodyBlock(response))}`
      : `Module ${module} · ${totalText(response)}`;

  const renderBody = (data: HwTimeLevelData) => {
    const shown = bodyBlock(data);
    if (data.level === 2 && shown.rows.length === 0) return <StateMessage icon={<Inbox className="size-4" aria-hidden />} title={ko ? `${module} Module에는 ${motion} 동작 기록이 없습니다` : `No ${motion} records for Module ${module}`}
      body={ko ? 'Module의 다른 Motion은 한 단계 위에서 볼 수 있습니다.' : 'Other Motions of this Module are one level up.'} />;
    const chartTitle = data.level === 0 ? (ko ? 'Module별 동작시간' : 'Operation time by Module')
      : data.level === 1 ? (ko ? `Motion별 동작시간 — Module ${module}` : `Operation time by Motion — Module ${module}`)
        : (ko ? `Motion ${motion} 상세 — Module ${module}` : `Motion ${motion} detail — Module ${module}`);
    return <StackPanel chartId={`hw-time-steps-L${data.level + 1}`} title={chartTitle} block={shown}
      visibleSeriesIds={shown.series.map(item => item.id).filter(id => !hidden.includes(id))}
      onVisibleSeriesChange={ids => setHidden(shown.series.map(item => item.id).filter(id => !ids.includes(id)))}
      sort={sort} startAlign={align} minMax={minmax}
      onActivate={data.level === 0 ? ({ seriesId }) => drill.enter('drillModule', seriesId)
        : data.level === 1 ? ({ seriesId }) => drill.enter('drillMotion', seriesId) : undefined}
      rowActions={data.level === 0 ? undefined : state.rowActionsOf} />;
  };

  return <PlatformPage layout="fill" density="compact">
    <div className="flex h-full min-h-0 gap-3">
      <aside className="w-64 shrink-0 overflow-hidden rounded-lg border border-border-subtle bg-surface-card">
        <Inspector form="stack" persistKey="hw-time-steps" label={{ ko: '분석 보조', en: 'Analysis aids' }} sections={sections} />
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        {/* Clip as a guard: the detail's fill floor (fillMin) is low enough to fit, but the plot must never draw over the trend toggle. */}
        <div className="flex min-h-0 flex-[3] flex-col overflow-hidden">
          <DrillLayout fill summary={summary}>
            {invalid ? <PageKeyWarning sentences={invalid} onRecover={state.recover} />
              : <QueryView fill query={levelQ} widgetName={ko ? 'HW Time 단계별' : 'HW Time by level'} hideWidgetName skeletonRows={6}>
                {data => renderBody(data)}
              </QueryView>}
          </DrillLayout>
        </div>
        {invalid === null && <>
        {/* No min-h-0 on the trend: its least height is the Frame's chrome (legend, toolbar) plus the plot floor, so a legend that wraps
          pushes the detail's clipped box up instead of the trend plot out of its card. */}
        <section aria-label={ko ? '추세' : 'Trend'} className={cn('flex flex-col rounded-lg border border-border-subtle bg-surface-card', trendOpen ? 'flex-[2]' : 'shrink-0')}>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" aria-expanded={trendOpen} aria-controls={trendId} className="justify-start"
              onClick={() => setTrendOpen(open => !open)}>
              <ChevronDown aria-hidden className={cn('size-4 transition-transform', !trendOpen && '-rotate-90')} />
              {ko ? `추세 (${trendRows.length}행)` : `Trend (${trendRows.length} rows)`}
            </Button>
            {notice && <p role="status" className="t-caption text-text-warning-label">{notice}</p>}
          </div>
          <div id={trendId} hidden={!trendOpen} className="flex flex-1 flex-col gap-1 px-2 pb-2">
            <TrendPanel chartId="hw-time-steps-trend" title={ko ? '행별 일 추세' : 'Daily trend by row'} rowIds={trendRows} query={trendQ} level={drill.depth} />
          </div>
        </section>
        </>}
      </div>
    </div>
  </PlatformPage>;
}
